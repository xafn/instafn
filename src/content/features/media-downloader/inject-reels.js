/**
 * Reel download button — the /reels/ feed and /reel/<code>/ permalink.
 *
 * Same clone-the-send-button approach as posts: we locate the reel's action rail
 * (the ancestor of the Like button that also holds the Share button), clone the
 * Share button, and insert the clone right before it. Cloning a count-less rail
 * item (Share) means our button matches Share/Save/More exactly and never
 * disturbs the Like/Comment/Repost counts.
 */

import { extractShortcode, resolveByShortcode } from "./ig-api.js";
import { runDownload } from "./downloader.js";
import {
  findSendButton,
  injectDownloadBeforeSend,
  ITEM_CLASS,
  SEND_SELECTOR,
} from "./inject-common.js";

const FLAG = "data-instafn-dl-reel";

// Resolve the shortcode of the reel that owns `refEl` (the like button / rail).
//
// The reels feed stacks reels vertically and keeps neighbours mounted, so a
// naive "first /reel/ link under some ancestor" grabs the PREVIOUS reel (it's
// earlier in DOM order) — the classic off-by-one. Instead we pick the reel link
// whose vertical centre is in the viewport and closest to the rail: the active
// reel fills the screen (its link is on-screen, near the rail) while neighbours
// are scrolled off-screen. Resolved at CLICK time so it's always the reel the
// user is actually looking at, even after IG recycles DOM nodes.
function resolveReelShortcode(refEl) {
  const links = document.querySelectorAll(
    'a[href*="/reel/"], a[href*="/p/"], a[href*="/tv/"]'
  );
  if (links.length) {
    const r0 = refEl.getBoundingClientRect();
    const cy0 = (r0.top + r0.bottom) / 2;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    let best = null;
    let bestScore = Infinity;
    for (const l of links) {
      const code = extractShortcode(l.getAttribute("href"));
      if (!code) continue;
      const r = l.getBoundingClientRect();
      if (!r.width && !r.height) continue; // hidden / detached
      const cy = (r.top + r.bottom) / 2;
      const inView = cy >= 0 && cy <= vh;
      // On-screen links win decisively; among them, nearest to the rail wins.
      const score = (inView ? 0 : 1e7) + Math.abs(cy - cy0);
      if (score < bestScore) {
        bestScore = score;
        best = code;
      }
    }
    if (best) return best;
  }
  return extractShortcode(location.pathname);
}

// Climb from the like button to the nearest ancestor that also contains the
// share/send control — that's this reel's action rail.
function railContaining(likeWrap) {
  let node = likeWrap;
  for (let i = 0; i < 10 && node; i++) {
    if (node.querySelector?.(SEND_SELECTOR)) return node;
    node = node.parentElement;
  }
  return null;
}

function onReelSurface() {
  return (
    location.pathname.startsWith("/reels/") ||
    location.pathname.startsWith("/reel/")
  );
}

function injectForLike(likeWrap) {
  if (!likeWrap || likeWrap.getAttribute(FLAG) === "1") return;
  // Article-based layouts (feed/permalink) are owned by inject-posts; reels only
  // handles the full-screen player rail, which has no enclosing <article>.
  if (likeWrap.closest("article")) return;

  const rail = railContaining(likeWrap);
  if (!rail) return;
  if (rail.querySelector(`.${ITEM_CLASS}`)) {
    likeWrap.setAttribute(FLAG, "1");
    return;
  }

  const sendBtn = findSendButton(rail);
  if (!sendBtn) return;

  // Presence check only — the real shortcode is recomputed at click time from
  // the rail's live position so it never binds a stale/neighbouring reel.
  if (!resolveReelShortcode(likeWrap)) return;

  // Clone at rail-item level so the new item gets the rail's gap and lines up
  // with Share / Save / More (cloning the bare button stuffs it inside Share's
  // wrapper with no spacing).
  injectDownloadBeforeSend(sendBtn, rail, {
    label: "Download reel",
    surface: "reel",
    onClick: () =>
      runDownload(
        () => resolveByShortcode(resolveReelShortcode(likeWrap)),
        "reel"
      ),
  });

  likeWrap.setAttribute(FLAG, "1");
}

export function injectReelButtons() {
  if (!onReelSurface()) return;
  document
    .querySelectorAll('svg[aria-label="Like"], svg[aria-label="Unlike"]')
    .forEach((svg) => {
      const wrap = svg.closest('[role="button"]');
      if (wrap) injectForLike(wrap);
    });
}

export function removeReelButtons() {
  document
    .querySelectorAll(`[${FLAG}="1"]`)
    .forEach((el) => el.removeAttribute(FLAG));
  document
    .querySelectorAll(`.${ITEM_CLASS}[data-dl-surface="reel"]`)
    .forEach((el) => el.remove());
}
