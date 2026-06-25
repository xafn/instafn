/**
 * Private-API media resolution.
 *
 * All of these run from the content script's isolated world, which shares the
 * instagram.com origin — so a credentialed same-origin `fetch` to /api/v1/* is
 * authenticated automatically (cookies) and not blocked by CORS. This is the
 * exact pattern follow-analyzer/logic.js and profile-pic-popup use.
 *
 * The endpoints used here return the FULL candidate ladder for every piece of
 * media, so we can always pick the largest rendition (true "highest quality"),
 * rather than the downscaled version Instagram happens to render in the DOM.
 */

import { IG_APP_ID, IG_ASBD_ID } from "./config.js";
import { extractMetadata, profileMetadata } from "./metadata.js";

// IG shortcodes are base64url-encoded media ids over this exact alphabet.
// (Same table used by post-hover-info to derive post dates from shortcodes.)
const SHORTCODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// A media pk is a 64-bit integer, so its canonical shortcode is at most 11
// base64 chars (ceil(64/6)). Instagram's newer "extended" share links
// (/p/<code>/ where <code> is much longer) append a share/tracking token after
// the real shortcode — decoding the whole string overflows into a nonexistent
// id and the info endpoint 400s. Only the leading 11 chars carry the pk.
const MAX_SHORTCODE_LEN = 11;

/** Decode an Instagram shortcode (e.g. from /p/<code>/) to its numeric media id. */
export function shortcodeToMediaId(shortcode) {
  if (!shortcode) return null;
  const code = shortcode.slice(0, MAX_SHORTCODE_LEN);
  let id = 0n;
  for (let i = 0; i < code.length; i++) {
    const v = SHORTCODE_ALPHABET.indexOf(code[i]);
    if (v === -1) return null;
    id = id * 64n + BigInt(v);
  }
  return id.toString();
}

/** Pull a /p/<code>/, /reel/<code>/ or /tv/<code>/ shortcode out of any href/url. */
export function extractShortcode(href) {
  if (!href) return null;
  const m = href.match(/\/(?:p|reel|reels|tv)\/([^/?#]+)/);
  return m ? m[1] : null;
}

function csrfToken() {
  const m = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

function igHeaders() {
  const headers = {
    Accept: "application/json",
    "X-IG-App-ID": IG_APP_ID,
    "X-ASBD-ID": IG_ASBD_ID,
    "X-IG-WWW-Claim": "0",
    "X-Requested-With": "XMLHttpRequest",
  };
  const token = csrfToken();
  if (token) headers["X-CSRFToken"] = token;
  return headers;
}

export async function igGetJson(url) {
  const resp = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: igHeaders(),
  });
  if (!resp.ok) {
    if (resp.status === 429) {
      throw new Error("Rate limited by Instagram (HTTP 429). Try again later.");
    }
    throw new Error(`HTTP ${resp.status}`);
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// Rendition picking.
//
// Each media node ships a *ladder* of renditions (the same photo/video at
// several resolutions). We always expose the full ladder, sorted largest-first,
// as `candidates: [{url, width, height}]`. The descriptor's own `url` is set to
// the largest — so the default path (no quality prompt) saves highest quality.
// The "Ask for Quality" flow lets the user pick a different rung off `candidates`.
// ---------------------------------------------------------------------------

// Sort a list of {url, width, height}-ish entries by pixel area, largest first.
function byAreaDesc(list) {
  return [...list].sort(
    (a, b) => (b.width || 0) * (b.height || 0) - (a.width || 0) * (a.height || 0)
  );
}

// Normalize a raw rendition list (video_versions / image candidates / profile
// pic versions) into sorted {url, width, height} entries, dropping urlless ones.
function toCandidates(list) {
  if (!Array.isArray(list) || !list.length) return [];
  return byAreaDesc(list)
    .filter((v) => v && v.url)
    .map((v) => ({ url: v.url, width: v.width || 0, height: v.height || 0 }));
}

function videoCandidates(node) {
  return toCandidates(node?.video_versions);
}

function imageCandidates(node) {
  return toCandidates(
    node?.image_versions2?.candidates || node?.image_versions?.candidates || []
  );
}

// Turn a single media "node" (a post item, a carousel child, or a story item)
// into a normalized download descriptor. Videos win over images when both
// exist (a video post still ships a poster image we don't want).
function nodeToMedia(node, meta) {
  const videos = videoCandidates(node);
  if (videos.length) {
    return { type: "video", url: videos[0].url, candidates: videos, ...meta };
  }
  const images = imageCandidates(node);
  if (images.length) {
    return { type: "image", url: images[0].url, candidates: images, ...meta };
  }
  return null;
}

// Expand a top-level media item into one-or-many download descriptors,
// flattening carousels (sidecars) into one entry per child.
export function itemToMediaList(item) {
  if (!item) return [];
  const username = item.user?.username || item.owner?.username || "instagram";
  const code = item.code || "";
  const children = item.carousel_media;

  if (Array.isArray(children) && children.length) {
    const total = children.length;
    return children
      .map((child, i) =>
        nodeToMedia(child, {
          username,
          code,
          id: child.pk || child.id || item.pk,
          index: i + 1,
          total,
          // Carousel slides carry their own alt text; caption/user/location/date
          // live on the parent item. extractMetadata merges both.
          metadata: extractMetadata(item, child, { code, username }),
        })
      )
      .filter(Boolean);
  }

  const media = nodeToMedia(item, {
    username,
    code,
    id: item.pk || item.id,
    index: 1,
    total: 1,
    metadata: extractMetadata(item, null, { code, username }),
  });
  return media ? [media] : [];
}

// ---------------------------------------------------------------------------
// Public resolvers
// ---------------------------------------------------------------------------

/**
 * Fetch the full media object for a numeric media id and return a flat list of
 * downloadable renditions (1 entry, or N for a carousel). Works for feed posts,
 * reels AND stories — they all share the /media/<id>/info/ shape.
 */
export async function resolveMediaById(mediaId) {
  if (!mediaId) return [];
  const data = await igGetJson(
    `https://www.instagram.com/api/v1/media/${mediaId}/info/`
  );
  const item = data?.items?.[0];
  return itemToMediaList(item);
}

/** Resolve a post/reel by its shortcode (the common feed/permalink/grid case). */
export async function resolveByShortcode(shortcode) {
  const mediaId = shortcodeToMediaId(shortcode);
  if (!mediaId) return [];
  const list = await resolveMediaById(mediaId);
  // Ensure the shortcode is on every entry for nice filenames even if the API
  // omitted `code` (it usually doesn't).
  return list.map((m) => ({ ...m, code: m.code || shortcode }));
}

/**
 * Resolve the highest-resolution profile picture for a username.
 * Tries the user-info endpoint first (it exposes `hd_profile_pic_url_info`,
 * the largest square IG stores), then falls back to web_profile_info's
 * `profile_pic_url_hd`.
 */
export async function resolveProfilePicture(username) {
  if (!username) return null;
  // 1) web_profile_info gives us the user id + a solid HD url.
  let userId = null;
  let hdUrl = null;
  let fullName = "";
  let candidates = [];
  try {
    const data = await igGetJson(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
        username
      )}`
    );
    const user = data?.data?.user;
    if (user) {
      userId = user.id || user.pk;
      hdUrl = user.profile_pic_url_hd || user.profile_pic_url || null;
      fullName = user.full_name || "";
    }
  } catch (_) {}

  // 2) users/<id>/info/ exposes the full square ladder (hd_profile_pic_versions)
  // and often an even larger square (hd_profile_pic_url_info). Best effort.
  if (userId) {
    try {
      const info = await igGetJson(
        `https://www.instagram.com/api/v1/users/${userId}/info/`
      );
      const u = info?.user;
      const ladder = [...(u?.hd_profile_pic_versions || [])];
      if (u?.hd_profile_pic_url_info?.url) {
        ladder.push(u.hd_profile_pic_url_info);
      }
      candidates = toCandidates(ladder);
      if (candidates.length) hdUrl = candidates[0].url;
    } catch (_) {}
  }

  if (!hdUrl) return null;
  // Always carry the largest as a candidate so the quality flow has at least the
  // single HD rung when the info endpoint didn't return a ladder.
  if (!candidates.length) candidates = [{ url: hdUrl, width: 0, height: 0 }];
  return {
    type: "image",
    url: hdUrl,
    candidates,
    username,
    code: "profile",
    index: 1,
    total: 1,
    metadata: profileMetadata(username, fullName),
  };
}
