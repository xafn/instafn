/**
 * Download dispatch.
 *
 * Two paths:
 *  - http(s) CDN urls  → handed to the background worker's chrome.downloads
 *    bridge. That avoids CORS entirely (the browser fetches it, not the page),
 *    forces a real "Save", and lets us set a clean filename. fbcdn/cdninstagram
 *    are cross-origin and would otherwise be undownloadable from the page.
 *  - blob:/data: urls  → can't cross the content↔background boundary (the blob
 *    lives in the page), so those are saved with a same-document <a download>.
 */

import { DOWNLOAD_MSG, SETTINGS_KEYS } from "./config.js";
import { showToast, CHECK_ICON } from "../../ui/toast.js";
import {
  getAskQuality,
  chooseQuality,
  applyQualityTarget,
} from "./quality.js";
import { embedMetadataInJpeg, embedMetadataInOgg, isEmptyMetadata } from "./metadata.js";

function extFromUrl(url, type) {
  try {
    const path = new URL(url, location.href).pathname;
    const m = path.match(/\.([a-z0-9]{2,5})$/i);
    if (m) return m[1].toLowerCase();
  } catch (_) {}
  return type === "video" ? "mp4" : "jpg";
}

function sanitize(part) {
  return String(part || "")
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/**
 * Build the filename base (no extension):
 *   <username>_<code>[_NofM]   — e.g. affan_Cxyz123, affan_Cxyz123_2of5
 *   <username>_profile         — profile pictures
 * Falls back to "instagram" if neither username nor code is known.
 */
export function fileBase(media) {
  const bits = [];
  if (media.username) bits.push(sanitize(media.username));
  if (media.code === "profile") bits.push("profile");
  else if (media.code) bits.push(sanitize(media.code));
  if (media.total > 1) bits.push(`${media.index}of${media.total}`);
  return bits.join("_") || "instagram";
}

/** Build a stable, human-friendly filename: <username>_<code>[_NofM].<ext>. */
export function buildFilename(media) {
  const ext = extFromUrl(media.url, media.type);
  return `${fileBase(media)}.${ext}`;
}

function isInlineUrl(url) {
  return /^(blob:|data:)/i.test(url);
}

function anchorDownload(url, filename) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1000);
}

async function getAskLocation() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(
        { [SETTINGS_KEYS.askLocation]: false },
        (s) => resolve(!!s[SETTINGS_KEYS.askLocation])
      );
    } catch (_) {
      resolve(false);
    }
  });
}

/** Read the "Embed metadata" toggle (defaults true). */
export async function getEmbedMetadata() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(
        { [SETTINGS_KEYS.embedMetadata]: true },
        (s) => resolve(!!s[SETTINGS_KEYS.embedMetadata])
      );
    } catch (_) {
      resolve(false);
    }
  });
}

// Save raw bytes as a same-document blob download. Used for metadata-embedded
// images and video sidecar text — neither can cross to the background bridge
// (the blob lives in this page). Note: a blob <a download> can't honour the
// "Ask Where to Save" dialog, so embedded images always go to the default
// Downloads folder regardless of that toggle.
function saveBytes(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  anchorDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

// Cross-origin fetch of CDN bytes. cdninstagram/fbcdn are in host_permissions,
// so the content script reads them without tripping CORS (same path as zip.js).
async function fetchBytes(url) {
  const resp = await fetch(url, { credentials: "omit" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}


// Fire one message at the background bridge. Resolves {ok, error} — never
// rejects — so the caller can decide whether to retry.
function sendToBridge(url, filename, saveAs) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: DOWNLOAD_MSG, url, filename, saveAs },
        (resp) => {
          const err = chrome.runtime.lastError?.message;
          if (err) resolve({ ok: false, error: err });
          else if (!resp?.ok) resolve({ ok: false, error: resp?.error || "download failed" });
          else resolve({ ok: true });
        }
      );
    } catch (e) {
      resolve({ ok: false, error: String(e?.message || e) });
    }
  });
}

// Transient failures clear on a retry: an asleep MV3 service worker can drop the
// first wake-up message ("message port closed", "could not establish
// connection"), and chrome.downloads can momentarily report a network/connection
// blip. A second attempt wakes the worker and usually succeeds.
function isTransient(error) {
  return /message port closed|establish connection|network|connection|no response|worker/i.test(
    error || ""
  );
}

// The extension was reloaded/updated while this tab stayed open, orphaning the
// content script. Nothing will work until the page is refreshed.
function isContextGone(error) {
  return /context invalidated|receiving end does not exist/i.test(error || "");
}

/** Download a single resolved media descriptor. Returns a Promise<boolean>. */
export async function downloadMedia(media) {
  if (!media?.url) return false;
  const filename = buildFilename(media);

  if (isInlineUrl(media.url)) {
    anchorDownload(media.url, filename);
    return true;
  }

  const embed =
    media.metadata &&
    !isEmptyMetadata(media.metadata) &&
    (await getEmbedMetadata());

  // Photos: fetch the bytes, bake the metadata in as an XMP packet and save the
  // rewritten JPEG. Non-JPEG (e.g. webp) can't be embedded → fall through to the
  // normal bridge path. Any fetch/embed failure also falls through, so the media
  // is never lost just because metadata couldn't be attached.
  if (embed && media.type === "image") {
    try {
      const bytes = await fetchBytes(media.url);
      const injected = embedMetadataInJpeg(bytes, media.metadata);
      if (injected) {
        saveBytes(injected, filename, "image/jpeg");
        return true;
      }
    } catch (e) {
      console.warn("[instafn] metadata embed failed, saving without:", e);
    }
  }

  // Voice notes (.ogg): bake the metadata in as native Opus/Vorbis comment tags
  // and save the rewritten file. Same fall-through guarantee — if the fetch or
  // the embed can't be done cleanly, the clip still downloads via the bridge.
  if (embed && media.type === "audio") {
    try {
      const bytes = await fetchBytes(media.url);
      const tagged = embedMetadataInOgg(bytes, media.metadata);
      if (tagged) {
        saveBytes(tagged, filename, "audio/ogg");
        return true;
      }
    } catch (e) {
      console.warn("[instafn] voice metadata embed failed, saving without:", e);
    }
  }

  const saveAs = await getAskLocation();

  let result = await sendToBridge(media.url, filename, saveAs);
  if (!result.ok && isTransient(result.error)) {
    await new Promise((r) => setTimeout(r, 350)); // give the worker time to wake
    result = await sendToBridge(media.url, filename, saveAs);
  }
  if (result.ok) return true;

  // Still failing. Surface the real reason instead of silently opening a tab.
  console.warn("[instafn] download bridge failed:", result.error, media.url);
  if (isContextGone(result.error)) {
    showToast("Refresh Instagram to re-enable downloads.", { duration: 3000 });
    return false;
  }
  // Last resort so the media is never wholly lost — but the user is told why.
  showToast("Couldn't save directly; opened it in a new tab.", { duration: 3000 });
  window.open(media.url, "_blank", "noopener");
  return false;
}

/**
 * Optional quality prompt for a resolved media list. Off by default → returns
 * the list untouched (highest-quality urls). When "Ask for Quality" is on and a
 * representative item has more than one rung, asks once and maps that choice
 * across every item. Returns null if the user cancelled. Shared by every surface
 * so the prompt behaves identically for posts, reels, stories, attachments, etc.
 */
export async function maybePromptQuality(list) {
  if (!(await getAskQuality())) return list;
  const repr = list.find((m) => m.candidates && m.candidates.length > 1);
  if (!repr) return list;
  const target = await chooseQuality(repr.candidates, {
    isVideo: repr.type === "video",
    count: list.length,
  });
  if (target === null) return null; // cancelled
  return list.map((m) => applyQualityTarget(m, target));
}

/**
 * Resolve (via the supplied async resolver) then download everything it returns,
 * with toast feedback. `resolver` is a function returning Promise<media[]>.
 */
export async function runDownload(resolver, label = "media") {
  let list;
  try {
    list = await resolver();
  } catch (err) {
    showToast(`Download failed: ${err.message || err}`, { duration: 2600 });
    return;
  }
  if (!list || !list.length) {
    showToast("Couldn't find anything to download here.", { duration: 2600 });
    return;
  }

  const picked = await maybePromptQuality(list);
  if (picked === null) return; // cancelled
  list = picked;

  if (list.length > 1) {
    showToast(`Downloading ${list.length} items…`, { duration: 2000 });
  }

  let ok = 0;
  for (const media of list) {
    // Small stagger so the browser's download manager doesn't drop concurrent
    // requests for big carousels.
    // eslint-disable-next-line no-await-in-loop
    const done = await downloadMedia(media);
    if (done) ok++;
    if (list.length > 1) await new Promise((r) => setTimeout(r, 350));
  }

  if (ok > 0 && list.length === 1) {
    showToast("Saved", { duration: 1400, icon: CHECK_ICON });
  } else if (ok > 0) {
    showToast(`Saved ${ok}/${list.length}`, { duration: 1800, icon: CHECK_ICON });
  }
}
