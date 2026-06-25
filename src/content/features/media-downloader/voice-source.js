/**
 * Voice-message URL source.
 *
 * A DM voice clip's .ogg URL is NOT in the rendered DOM and there's no <audio>
 * element to read. On the current Messenger/MNet DM backend it arrives only in
 * the thread's `POST /api/graphql` response, as a `SlideMessageAudiosContent`
 * node pairing `attachment_fbid` (== the waveform clip-path id) with
 * `attachment_cdn_url` (the .ogg). voice-sniffer.js captures those pairs from
 * the page as the conversation loads and relays them here; resolveVoiceUrl maps
 * the bubble's clip-path id straight to the url — instant, no playback.
 *
 * Legacy fallback: some older threads still expose voice items through the
 * private REST endpoint
 *
 *   GET /api/v1/direct_v2/threads/{canonicalId}/   -> thread.items[]
 *
 * so that path is kept as a single best-effort lookup (no aggressive pagination,
 * which used to hang for ~seconds and then fail on new-backend threads where the
 * url simply isn't present).
 */

import {
  igGetJson,
  currentThreadUrlId,
  resolveCanonicalId,
} from "./dm-thread-api.js";

export { currentThreadUrlId };

// --- captured-from-page voice urls (the primary source) ----------------------

// attachment_fbid (string) -> .ogg url, filled by voice-sniffer.js via
// window.postMessage. Lives for the page's lifetime; the sniffer re-sends pairs
// whenever IG re-fetches a thread page, so this stays warm as you scroll.
const voiceUrlByFbid = new Map();
let listenerInstalled = false;

function ensureVoiceListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "instafn-voice-dl" || !Array.isArray(d.pairs)) return;
    for (const p of d.pairs) {
      if (p && p.fbid && p.url) voiceUrlByFbid.set(String(p.fbid), p.url);
    }
  });
}

// Install as soon as this module loads (well before any download click) so we
// don't miss pairs the sniffer relays during the initial thread load.
ensureVoiceListener();

// --- voice extraction ---------------------------------------------------------

// An Instagram voice clip: .ogg served from the t59.3654-21 CDN path as
// `audioclip-*.ogg`. Kept narrow so a photo/video URL is never mistaken for one.
function isVoiceUrl(s) {
  return (
    typeof s === "string" &&
    /^https?:/.test(s) &&
    (/audioclip/i.test(s) || /t59\.3654-21/.test(s) || /\.ogg(\?|#|$)/i.test(s))
  );
}

// Walk one thread item; return { url, ids:Set<string>, durationMs } or null.
// We collect every long numeric id in the item subtree as a candidate match for
// the bubble's clip-path id (whichever field IG happens to use), shape-agnostic.
function extractVoiceFromItem(item) {
  let url = null;
  let durationMs = null;
  const ids = new Set();
  const seen = new Set();
  (function walk(v) {
    if (v == null) return;
    if (typeof v === "string") {
      if (!url && isVoiceUrl(v)) url = v;
      if (/^\d{8,25}$/.test(v)) ids.add(v);
      return;
    }
    if (typeof v === "number") {
      if (Number.isInteger(v) && v >= 1e7) ids.add(String(v));
      return;
    }
    if (typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    for (const k in v) {
      const val = v[k];
      if (
        durationMs == null &&
        k.toLowerCase().indexOf("duration") !== -1 &&
        typeof val === "number" &&
        val > 0 &&
        val < 3600000
      ) {
        durationMs = val;
      }
      walk(val);
    }
  })(item);
  return url ? { url, ids, durationMs } : null;
}

// --- thread fetch + per-thread cache -----------------------------------------

const THREAD_TTL_MS = 20 * 1000;
const cache = new Map(); // canonicalId -> { ts, byId:Map, byDuration:Map }

async function buildVoiceMap(canonicalId) {
  const byId = new Map(); // id string -> url
  const byDuration = new Map(); // duration secs -> url[]
  let cursor = null;
  let pages = 0;
  do {
    const q =
      "/api/v1/direct_v2/threads/" +
      canonicalId +
      "/?visual_message_return_type=unseen&limit=50" +
      (cursor ? "&cursor=" + encodeURIComponent(cursor) + "&direction=older" : "");
    let json;
    try {
      json = await igGetJson(q);
    } catch (_) {
      break;
    }
    const thread = json && json.thread;
    const items = (thread && thread.items) || [];
    for (const it of items) {
      const v = extractVoiceFromItem(it);
      if (!v) continue;
      v.ids.forEach((id) => byId.set(id, v.url));
      if (v.durationMs != null) {
        const key = Math.round(v.durationMs / 1000);
        if (!byDuration.has(key)) byDuration.set(key, []);
        byDuration.get(key).push(v.url);
      }
    }
    cursor = thread && thread.has_older ? thread.oldest_cursor || thread.prev_cursor : null;
    pages++;
    // One page only: this is a best-effort legacy fallback. The primary path is
    // the page-captured graphql map; deep pagination here just added latency.
  } while (cursor && pages < 1);

  return { ts: Date.now(), byId, byDuration };
}

async function getVoiceMap(force) {
  const urlId = currentThreadUrlId();
  if (!urlId) return null;
  const canonicalId = await resolveCanonicalId(urlId);
  if (!canonicalId) return null;
  const hit = cache.get(canonicalId);
  if (!force && hit && Date.now() - hit.ts < THREAD_TTL_MS) return hit;
  const map = await buildVoiceMap(canonicalId);
  cache.set(canonicalId, map);
  return map;
}

/**
 * Resolve a bubble's voice-clip URL from the thread payload.
 * @param {Object} q
 * @param {string|null} q.clipId      digits from the waveform clip-path id
 * @param {number|null} q.durationSec clip length parsed from the bubble's timer
 * @returns {Promise<string|null>}
 */
export async function resolveVoiceUrl({ clipId, durationSec } = {}) {
  ensureVoiceListener();

  // Primary: the clip-path id (== attachment_fbid) captured from the page's
  // /api/graphql thread payload. This is where the url actually lives.
  if (clipId && voiceUrlByFbid.has(clipId)) return voiceUrlByFbid.get(clipId);

  // The graphql response may still be in flight when the button is clicked (or
  // IG may re-fetch the page on demand). Give the sniffer a brief window to
  // deliver the pair before falling back.
  if (clipId) {
    for (let i = 0; i < 6; i++) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 250));
      if (voiceUrlByFbid.has(clipId)) return voiceUrlByFbid.get(clipId);
    }
  }

  // Legacy fallback: a single best-effort REST lookup for old-backend threads.
  // One pass only — no force-refetch loop — so this never hangs.
  const map = await getVoiceMap(false);
  if (map) {
    if (clipId && map.byId.has(clipId)) return map.byId.get(clipId);
    if (durationSec != null) {
      const list = map.byDuration.get(durationSec);
      if (list && list.length === 1) return list[0];
    }
  }

  if (clipId) {
    console.debug(
      "[Instafn] voice clip not matched (graphql capture + REST);",
      "clipId:",
      clipId
    );
  }
  return null;
}
