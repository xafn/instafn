/**
 * Shared private-API access for DM threads.
 *
 * Both the voice-note and the photo-attachment downloaders need to read the
 * current thread's items from Instagram's private REST API to recover the
 * original media (the rendered DOM only carries downscaled/transformed URLs, and
 * voice .ogg urls aren't in the DOM at all). The content script shares the
 * instagram.com origin, so a credentialed same-origin fetch to /api/v1/* is
 * authenticated by cookies and isn't blocked by CORS.
 *
 * This module owns the generic plumbing: CSRF, the JSON GET, mapping the URL's
 * thread id to the canonical thread id (via the inbox), and pulling thread items.
 */

import { IG_APP_ID } from "./config.js";

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export async function igGetJson(path) {
  const res = await fetch("https://www.instagram.com" + path, {
    method: "GET",
    credentials: "include",
    headers: {
      "X-IG-App-ID": IG_APP_ID,
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRFToken": csrfToken(),
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " — GET " + path);
  return res.json();
}

// --- thread id resolution (URL id -> canonical thread id, via the inbox) ------

const canonicalByUrlId = new Map();

export function currentThreadUrlId() {
  const m = location.pathname.match(/\/direct\/t\/([^/?#]+)/);
  return m ? m[1] : null;
}

export async function resolveCanonicalId(urlId) {
  if (!urlId) return null;
  if (canonicalByUrlId.has(urlId)) return canonicalByUrlId.get(urlId);
  try {
    const inbox = await igGetJson(
      "/api/v1/direct_v2/inbox/?visual_message_return_type=unseen&thread_message_limit=1&persistentBadging=true&limit=20"
    );
    const threads = (inbox && inbox.inbox && inbox.inbox.threads) || [];
    for (const t of threads) {
      const cid = String(t.thread_id || t.thread_v2_id || "");
      if (!cid) continue;
      [t.thread_id, t.thread_v2_id, t.thread_fbid].forEach((k) => {
        if (k != null) canonicalByUrlId.set(String(k), cid);
      });
      (t.users || []).forEach((u) => {
        [u.pk, u.fbid, u.id, u.interop_messaging_user_fbid].forEach((k) => {
          if (k != null) canonicalByUrlId.set(String(k), cid);
        });
      });
    }
    if (canonicalByUrlId.has(urlId)) return canonicalByUrlId.get(urlId);
    const pick = threads.find((t) => JSON.stringify(t).indexOf(urlId) !== -1);
    const id = pick && String(pick.thread_id || pick.thread_v2_id || "");
    if (id) {
      canonicalByUrlId.set(urlId, id);
      return id;
    }
  } catch (_) {
    /* fall through */
  }
  // Last resort: many threads' URL id already IS the canonical id.
  return urlId;
}

/**
 * Fetch up to `maxPages` pages of the current thread's items (newest first,
 * paginating older). Returns a flat array of thread items, or [] on failure.
 */
export async function fetchThreadItems(maxPages = 1) {
  const urlId = currentThreadUrlId();
  if (!urlId) return [];
  const canonicalId = await resolveCanonicalId(urlId);
  if (!canonicalId) return [];

  const out = [];
  let cursor = null;
  let pages = 0;
  do {
    const q =
      "/api/v1/direct_v2/threads/" +
      canonicalId +
      "/?visual_message_return_type=unseen&limit=50" +
      (cursor
        ? "&cursor=" + encodeURIComponent(cursor) + "&direction=older"
        : "");
    let json;
    try {
      json = await igGetJson(q);
    } catch (_) {
      break;
    }
    const thread = json && json.thread;
    const items = (thread && thread.items) || [];
    out.push(...items);
    cursor =
      thread && thread.has_older
        ? thread.oldest_cursor || thread.prev_cursor
        : null;
    pages++;
  } while (cursor && pages < maxPages);

  return out;
}
