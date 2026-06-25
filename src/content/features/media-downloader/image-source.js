/**
 * Full-resolution source for DM photo attachments.
 *
 * The rendered bubble <img> is a downscaled rendition — its fbcdn URL carries an
 * `stp=` transform that caps it at the bubble's display size, so saving that URL
 * yields e.g. a 720p copy of a 2K photo. The ORIGINAL lives in Instagram's
 * private DM API: each thread item exposes `image_versions2.candidates`, the full
 * resolution ladder. We fetch the thread (see dm-thread-api.js), index every
 * image by its CDN media token, and map a rendered bubble to the largest
 * candidate by that token.
 *
 * Every rung of one image shares the same long numeric id in its filename, so the
 * rendered (small) URL and the API's (large) URL match on that token — the same
 * trick the post carousel uses to line a slide up with its API entry.
 */

import { fetchThreadItems } from "./dm-thread-api.js";

// The long numeric id in a CDN media filename, shared across every rendition of
// the same image. Position-independent, so it survives IG's URL transforms.
function mediaToken(url) {
  try {
    const file = new URL(url, location.href).pathname.split("/").pop() || "";
    const m = file.match(/\d{10,}/);
    return m ? m[0] : "";
  } catch (_) {
    return "";
  }
}

// Normalize an image_versions2 candidate list into sorted {url,width,height}
// rungs (largest first), dropping urlless entries.
function normCandidates(cands) {
  return [...cands]
    .filter((c) => c && c.url)
    .map((c) => ({ url: c.url, width: c.width || 0, height: c.height || 0 }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
}

// Walk a thread item, mapping every image's token(s) -> its full candidate
// ladder. Shape-agnostic: photo messages nest the media differently across
// backends, so we recurse and key off any image_versions2 we find.
function indexItem(item, byToken) {
  const seen = new Set();
  (function walk(v) {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    const cands = v.image_versions2?.candidates;
    if (Array.isArray(cands) && cands.length) {
      const ladder = normCandidates(cands);
      if (ladder.length) {
        // Key by EVERY rung's token (they're identical in practice, but a few
        // backends differ) so the rendered URL always finds the ladder.
        for (const c of cands) {
          const t = mediaToken(c.url);
          if (t && !byToken.has(t)) byToken.set(t, ladder);
        }
      }
    }
    for (const k in v) walk(v[k]);
  })(item);
}

const TTL_MS = 30 * 1000;
let cache = null; // { ts, byToken:Map<token, candidates[]> }

async function getImageMap(force) {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache;
  const items = await fetchThreadItems(2); // best-effort: two newest pages
  const byToken = new Map();
  for (const it of items) indexItem(it, byToken);
  cache = { ts: Date.now(), byToken };
  return cache;
}

/**
 * Resolve a rendered DM image URL to its full-resolution original via the thread
 * API. Returns { url, candidates } (largest first), or null when it can't be
 * matched (caller should then fall back to the rendered URL).
 */
export async function resolveFullImage(renderedUrl) {
  const token = mediaToken(renderedUrl);
  if (!token) return null;

  let map = await getImageMap(false);
  let ladder = map.byToken.get(token);
  if (!ladder) {
    // Cache miss (e.g. an image loaded after our last fetch) — refresh once.
    map = await getImageMap(true);
    ladder = map.byToken.get(token);
  }
  if (!ladder || !ladder.length) return null;
  return { url: ladder[0].url, candidates: ladder };
}
