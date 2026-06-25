/**
 * Download photo attachments sent in DMs.
 *
 * Adds a download button to Instagram's own on-hover message action row (the
 * React / Reply / More cluster) — but only for plain photo attachments, never
 * for shared posts/reels, link previews, videos or avatars.
 *
 * To match the row's spacing/sizing exactly, we CLONE one of IG's existing
 * button spans (same obfuscated classes → same layout), swap its glyph for the
 * download icon, strip its aria wiring, and wire our own click handler. A cloned
 * node carries no React listeners, so clicking it runs only our code; and it
 * uses a distinct aria-label, so the quick react/reply/edit pipelines (which key
 * off the React/Reply/More aria-labels) are untouched. Appended as the row's
 * LAST child → it lands on the outer edge in both the normal and reversed
 * (messages-you-sent) layouts.
 *
 * Photo URL = the bubble's rendered <img> (IG serves a full-size image there),
 * resolved at CLICK time so a recycled row always targets the current image.
 */

import { downloadMedia, maybePromptQuality } from "./downloader.js";
import { showToast, CHECK_ICON } from "../../ui/toast.js";
import { resolveFullImage } from "./image-source.js";
import { setButtonLoading } from "./inject-common.js";

const VARIANT = "instafn-dl-chatimg";
const REACT_SVG = 'svg[aria-label^="React to message"]';

// DM photo bubbles render a *resized* rendition: the fbcdn/cdninstagram URL
// carries an `stp=` transform token (e.g. dst-jpg_e35_s640x640) that caps the
// image at the bubble's display size. The same URL WITHOUT `stp` returns the
// stored original (full resolution). The signature (oh/oe) covers the resource,
// not the transform, so dropping `stp` keeps the URL valid.
function fullResUrl(rawUrl) {
  try {
    const u = new URL(rawUrl, location.href);
    if (!/cdninstagram|fbcdn/i.test(u.hostname)) return rawUrl;
    if (!u.searchParams.has("stp")) return rawUrl;
    u.searchParams.delete("stp");
    return u.toString();
  } catch (_) {
    return rawUrl;
  }
}

// Confirm a candidate URL actually serves before we commit to it — a 1-byte
// range request is cheap and tells us the CDN accepts the un-transformed URL
// (it returns 206/200) without pulling the whole image. cdninstagram/fbcdn are
// in host_permissions and CORS-enabled for images, so this fetch is allowed.
async function urlServes(url) {
  try {
    const resp = await fetch(url, {
      credentials: "omit",
      headers: { Range: "bytes=0-0" },
    });
    return resp.ok; // 200 or 206
  } catch (_) {
    return false;
  }
}

const DL_PATHS =
  '<path d="M12 3v12"></path><path d="M7 11l5 5 5-5"></path><path d="M4 20h16"></path>';

// The downloadable photo for an action row, or null when this message isn't a
// plain photo attachment. A real photo attachment is a CDN <img> that:
//  - sits in the same message-content wrapper as the action bar,
//  - is NOT inside a link (shared posts/reels, link previews and avatars wrap
//    their thumbnail in an <a href>; a plain photo opens a lightbox via
//    role=button, no navigation), and
//  - isn't the poster frame of a video attachment.
function attachmentImageNear(barWrapper) {
  const scope = barWrapper?.parentElement;
  if (!scope) return null;
  if (scope.querySelector("video")) return null; // video attachment, not a photo
  for (const img of scope.querySelectorAll("img")) {
    if (img.closest("a[href]")) continue; // shared post/reel/link/avatar
    const src = img.currentSrc || img.src || "";
    if (!/fbcdn|cdninstagram|fbsbx/i.test(src)) continue;
    const w = img.naturalWidth || parseInt(img.getAttribute("width"), 10) || 0;
    if (w && w < 80) continue; // skip tiny inline glyphs
    return img;
  }
  return null;
}

// Clone an existing action-row button span into our download button (identical
// spacing), swap the glyph, strip aria wiring, and attach our handler.
function buildClone(templateSpan, onClick) {
  const clone = templateSpan.cloneNode(true);
  clone.classList.add(VARIANT);
  clone.removeAttribute("aria-describedby");

  const svg = clone.querySelector("svg");
  if (svg) {
    svg.setAttribute("aria-label", "Download image");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = `<title>Download image</title>${DL_PATHS}`;
  }

  const roleBtn = clone.querySelector('[role="button"]') || clone;
  roleBtn.removeAttribute("aria-haspopup");
  roleBtn.removeAttribute("aria-expanded");
  roleBtn.setAttribute("aria-label", "Download image");
  roleBtn.title = "Download image";

  let busy = false;
  roleBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    busy = true;
    setButtonLoading(clone, true);
    try {
      await onClick();
    } finally {
      busy = false;
      setButtonLoading(clone, false);
    }
  });
  // Keep IG's message handlers (open lightbox, etc.) from firing on our button.
  ["mousedown", "pointerdown"].forEach((t) =>
    roleBtn.addEventListener(t, (e) => e.stopPropagation())
  );

  return clone;
}

function injectForRow(reactSvg) {
  const templateSpan = reactSvg.closest("span");
  const innerRow = templateSpan?.parentElement;
  if (!innerRow) return;
  if (innerRow.querySelector(`.${VARIANT}`)) return; // already added

  const barWrapper = innerRow.parentElement; // div[style*="--x-width: 96px"]
  const img = attachmentImageNear(barWrapper);
  if (!img) return; // not a plain photo attachment — leave the row alone

  const clone = buildClone(templateSpan, async () => {
    const live = attachmentImageNear(barWrapper) || img;
    const rendered = live.currentSrc || live.src || "";
    if (!rendered) {
      showToast("Couldn't find this image.", { duration: 2000 });
      return;
    }
    // Highest quality, in order of reliability:
    //  1) Instagram's DM API (image_versions2 — full ladder; also feeds the
    //     quality picker),
    //  2) the rendered URL with its `stp=` resize transform stripped,
    //  3) the rendered URL as-is.
    const base = {
      type: "image",
      username: "instagram",
      code: "dm_image",
      index: 1,
      total: 1,
    };
    let media = null;
    try {
      const full = await resolveFullImage(rendered);
      if (full?.candidates?.length) {
        media = { ...base, url: full.url, candidates: full.candidates };
      }
    } catch (_) {
      /* fall through to URL heuristics */
    }
    if (!media) {
      const upgraded = fullResUrl(rendered);
      const url =
        upgraded !== rendered && (await urlServes(upgraded))
          ? upgraded
          : rendered;
      media = { ...base, url };
    }

    const picked = await maybePromptQuality([media]);
    if (picked === null) return; // cancelled at the quality prompt
    const ok = await downloadMedia(picked[0]);
    if (ok) showToast("Saved", { duration: 1500, icon: CHECK_ICON });
    else showToast("Couldn't save this image.", { duration: 1500 });
  });

  innerRow.appendChild(clone); // last child → outer edge in both layouts
}

export function injectChatImageButtons() {
  if (!location.pathname.startsWith("/direct/")) return;
  document.querySelectorAll(REACT_SVG).forEach(injectForRow);
}

export function removeChatImageButtons() {
  document.querySelectorAll(`.${VARIANT}`).forEach((el) => el.remove());
}
