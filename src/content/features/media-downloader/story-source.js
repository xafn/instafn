/**
 * Robust story-media resolution.
 *
 * The story download button used to derive the media id purely from the URL's
 * trailing number. That breaks on the FIRST story of a tray: Instagram often
 * shows it at `/stories/{username}/` before it has written the media pk into the
 * URL, so there's no id to resolve until you navigate to another story and back.
 *
 * This resolver doesn't depend on the URL carrying a pk. It pulls the user's (or
 * highlight's) reel tray from the private API — which returns every story item
 * with its full media — and matches the item that's actually on screen by the
 * CDN media token of the visible <img>/<video> (the same token trick used for DM
 * images and post carousels). Used as a fallback when the URL has no usable id.
 */

import { igGetJson, itemToMediaList } from "./ig-api.js";

// The long numeric id in a CDN media filename, shared across renditions.
function mediaToken(url) {
  try {
    const file = new URL(url, location.href).pathname.split("/").pop() || "";
    const m = file.match(/\d{10,}/);
    return m ? m[0] : "";
  } catch (_) {
    return "";
  }
}

// What kind of story page we're on: a user tray (needs the user's id) or a
// highlight reel (the URL already carries the reel id).
function storyUrlInfo() {
  const hl = location.pathname.match(/^\/stories\/highlights\/(\d+)/);
  if (hl) return { reelId: `highlight:${hl[1]}` };
  const u = location.pathname.match(/^\/stories\/([^/?#]+)/);
  if (u && u[1] !== "highlights") return { username: u[1] };
  return {};
}

const userIdByName = new Map();
async function userIdFor(username) {
  if (userIdByName.has(username)) return userIdByName.get(username);
  try {
    const d = await igGetJson(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
        username
      )}`
    );
    const id = d?.data?.user?.id || d?.data?.user?.pk || null;
    const sid = id ? String(id) : null;
    userIdByName.set(username, sid);
    return sid;
  } catch (_) {
    return null;
  }
}

// reels_media responses come in two shapes: an array (`reels_media`) or a map
// keyed by reel id (`reels`). Return the first reel's items from whichever.
function reelItems(json, reelId) {
  const arr = json?.reels_media;
  if (Array.isArray(arr)) {
    for (const r of arr) if (Array.isArray(r?.items) && r.items.length) return r.items;
  }
  const map = json?.reels;
  if (map) {
    const r = map[reelId] || Object.values(map)[0];
    if (Array.isArray(r?.items)) return r.items;
  }
  return [];
}

// CDN media tokens present anywhere on the page, ordered by the on-screen size
// of the element they came from (largest first). VIDEO stories are the hard
// case: the <video> src is a blob: URL with no token, and its cover image may be
// hidden/small/off-centre — so we scan EVERY <img>/<video> source (src,
// currentSrc, poster, srcset, <source> children), no size/position filter, and
// just rank by area so the active story's media wins the match. Matching stays
// exact (token must appear in the item's own URLs), so a wider net can't pick
// the wrong story — only find one we'd otherwise have missed.
function urlToken(s) {
  return mediaToken(s || "");
}

function rankedStoryTokens() {
  const found = []; // { token, area }
  const add = (url, area) => {
    const t = urlToken(url);
    if (t) found.push({ token: t, area });
  };
  for (const el of document.querySelectorAll("img, video")) {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    add(el.currentSrc, area);
    add(el.src, area);
    add(el.poster, area);
    if (el.srcset) {
      for (const part of el.srcset.split(",")) {
        add(part.trim().split(/\s+/)[0], area);
      }
    }
    if (el.tagName === "VIDEO") {
      el.querySelectorAll("source").forEach((s) =>
        add(s.src || s.getAttribute("src"), area)
      );
    }
  }
  found.sort((a, b) => b.area - a.area);
  const seen = new Set();
  const out = [];
  for (const f of found) {
    if (!seen.has(f.token)) {
      seen.add(f.token);
      out.push(f.token);
    }
  }
  return out;
}

/**
 * Resolve the story currently on screen to a download list, independent of the
 * URL. Returns [] when the tray can't be fetched or the visible item can't be
 * identified (caller falls back / reports nothing found).
 */
export async function resolveVisibleStory() {
  const { username, reelId } = storyUrlInfo();
  let rid = reelId;
  if (!rid && username) rid = await userIdFor(username);
  if (!rid) return [];

  let json;
  try {
    json = await igGetJson(
      `https://www.instagram.com/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(
        rid
      )}`
    );
  } catch (_) {
    return [];
  }

  const items = reelItems(json, rid);
  if (!items.length) return [];

  // Match the on-screen story by its media token; tokens are ranked by element
  // size so the largest (active) story's token is tried first. Exact match only,
  // so we never silently grab the wrong story.
  const tokens = rankedStoryTokens();
  let item = null;
  for (const t of tokens) {
    item = items.find((it) => JSON.stringify(it).includes(t));
    if (item) break;
  }
  if (!item) {
    // Leave a breadcrumb so a miss is diagnosable instead of silent.
    console.debug(
      `[instafn] story media match failed — ${tokens.length} page tokens vs ${items.length} tray items`,
      tokens
    );
    return [];
  }
  return itemToMediaList(item);
}
