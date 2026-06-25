/**
 * Reel 2× Speed (Hold to Fast-Forward)
 *
 * Press-and-hold a reel OR a regular feed-post video — or hold the spacebar
 * while a reel is on screen — to play it at 2× speed. Releasing restores normal
 * speed. A semantic pill with a fast-forward icon ("2× speed") appears at the
 * top of the video while active.
 *
 * The spacebar path stays reel-only: on the home feed, Space scrolls the page,
 * so only press-and-hold (not Space) fast-forwards feed videos.
 *
 * Reels use a native <video>, so this just drives `playbackRate`. The only
 * subtlety is Instagram toggles play/pause on a click: we distinguish a hold
 * from a tap with a short threshold and swallow the trailing click after a hold
 * so the video doesn't pause when the user lets go.
 */

const STYLE_ID = "instafn-reel-speed-style";
const OVERLAY_ID = "instafn-reel-speed-overlay";
const FAST_RATE = 2;
const HOLD_THRESHOLD_MS = 180; // below this, treat as a normal tap (play/pause)

let enabled = false;

// Active-hold state
let activeVideo = null;
let savedRate = 1;
let holdTimer = null;
let pointerHeld = false;
let spaceHeld = false;
let swallowNextClick = false;
let swallowResetTimer = null;
let positionRAF = null;

function isReelVideo(video) {
  if (!video || video.tagName !== "VIDEO") return false;

  const path = window.location.pathname;
  // Never touch DM chat or call videos.
  if (path.includes("/direct") || path.includes("/call/")) return false;

  if (path.includes("/reels/") || path.includes("/reel/")) return true;

  // Feed / explore reels: the video sits near a reels permalink or audio link.
  let el = video;
  let depth = 0;
  while (el && depth < 12) {
    if (
      el.querySelector?.(
        'a[href*="/reels/"], a[href*="/reel/"], a[href*="/reels/audio/"]'
      )
    ) {
      return true;
    }
    el = el.parentElement;
    depth++;
  }
  return false;
}

// The press-and-hold path also covers regular feed-post videos, not just
// reels. A feed post lives inside an <article>; that wrapper distinguishes a
// real post video from avatars, explore-grid thumbnails, and other stray
// <video>s. The spacebar path intentionally does NOT use this — it stays
// reel-only (see findActiveReelVideo) so Space keeps scrolling the feed.
function isHoldableVideo(video) {
  if (!video || video.tagName !== "VIDEO") return false;
  if (isReelVideo(video)) return true;

  const path = window.location.pathname;
  if (path.includes("/direct") || path.includes("/call/")) return false;

  return !!video.closest("article");
}

// The reel <video> currently on screen (largest visible one). Used for the
// spacebar path, where there's no pointer target to key off.
function findActiveReelVideo() {
  const videos = Array.from(document.querySelectorAll("video"));
  let best = null;
  let bestArea = 0;
  for (const video of videos) {
    if (!isReelVideo(video)) continue;
    const r = video.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const visW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const visH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    const area = visW * visH;
    if (area > bestArea) {
      bestArea = area;
      best = video;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // Identical declarations to the scrubber's timestamp pill
  // (.instafn-reel-time-pill), including !important on everything — that's what
  // makes it survive Instagram's global CSS and render as the same component.
  // Only the anchor (top vs bottom) and the inline icon differ.
  // `left`/`transform` are set inline per-frame (anchored to the reel), so they
  // are intentionally NOT in this rule — an `!important` here would override the
  // inline positioning and re-center the pill on the viewport instead.
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed !important;
      display: inline-flex !important;
      align-items: center !important;
      gap: 5px !important;
      background: rgba(0, 0, 0, 0.85) !important;
      color: white !important;
      padding: 6px 10px !important;
      border-radius: 16px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      white-space: nowrap !important;
      opacity: 0 !important;
      pointer-events: none !important;
      transition: opacity 0.15s ease !important;
      z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    }
    #${OVERLAY_ID}.instafn-visible { opacity: 1 !important; }
    #${OVERLAY_ID} svg { display: block !important; width: 13px !important; height: 13px !important; }
    body.instafn-reel-speeding :focus,
    body.instafn-reel-speeding :focus-visible {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

function getOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) return overlay;
  ensureStyle();
  overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 5.5a1 1 0 0 1 1.6-.8L12 10V6.3a1 1 0 0 1 1.6-.8l7.4 5.5a1 1 0 0 1 0 1.6L13.6 19a1 1 0 0 1-1.6-.8V14l-7.4 5.3A1 1 0 0 1 3 18.5z"/>
    </svg>
    <span>2x speed</span>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function positionOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay || !activeVideo) return;
  const r = activeVideo.getBoundingClientRect();
  overlay.style.left = `${r.left + r.width / 2}px`;
  overlay.style.top = `${r.top + 16}px`;
  overlay.style.transform = "translateX(-50%)";
}

function showOverlay() {
  const overlay = getOverlay();
  positionOverlay();
  // Keep it pinned to the reel while active (cheap; only runs during a hold).
  const loop = () => {
    if (!activeVideo) return;
    positionOverlay();
    positionRAF = requestAnimationFrame(loop);
  };
  cancelAnimationFrame(positionRAF);
  positionRAF = requestAnimationFrame(loop);
  requestAnimationFrame(() => overlay.classList.add("instafn-visible"));
}

function hideOverlay() {
  cancelAnimationFrame(positionRAF);
  positionRAF = null;
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) overlay.classList.remove("instafn-visible");
}

// ---------------------------------------------------------------------------
// Speed control
// ---------------------------------------------------------------------------

function startFast(video) {
  if (!video || activeVideo) return;
  activeVideo = video;
  savedRate = video.playbackRate || 1;
  try {
    video.playbackRate = FAST_RATE;
  } catch (e) {
    /* some videos disallow rate changes */
  }
  // A reel paused by a stray click should resume when fast-forwarding.
  if (video.paused) video.play?.().catch(() => {});
  // Suppress the focus ring that keyboard (space) activation would draw.
  document.body.classList.add("instafn-reel-speeding");
  showOverlay();
}

function stopFast() {
  if (!activeVideo) return;
  try {
    activeVideo.playbackRate = savedRate || 1;
  } catch (e) {
    /* ignore */
  }
  activeVideo = null;
  document.body.classList.remove("instafn-reel-speeding");
  hideOverlay();
}

// ---------------------------------------------------------------------------
// Pointer (press-and-hold) path
// ---------------------------------------------------------------------------

function onPointerDown(e) {
  if (!enabled || e.button !== 0) return;
  // Any leftover swallow flag is stale by the time a new press begins.
  swallowNextClick = false;
  clearTimeout(swallowResetTimer);

  // Don't hijack the reel's overlaid controls (username, Follow, like/comment/
  // share/save/more, audio, links) — only the bare video surface.
  if (isInteractiveControl(e.target)) return;

  const video = e.target.closest?.("video") || findVideoUnderPoint(e);
  if (!video || !isHoldableVideo(video)) return;

  pointerHeld = true;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    if (pointerHeld) {
      startFast(video);
      swallowNextClick = true; // don't let the release click toggle pause
    }
  }, HOLD_THRESHOLD_MS);
}

function onPointerUp() {
  if (!enabled) return;
  pointerHeld = false;
  clearTimeout(holdTimer);
  stopFast();
  // The trailing click fires right after release; if it never comes (pointer
  // dragged off the video), clear the swallow flag so a later click is safe.
  if (swallowNextClick) {
    clearTimeout(swallowResetTimer);
    swallowResetTimer = setTimeout(() => {
      swallowNextClick = false;
    }, 350);
  }
}

// The reel video is often covered by transparent overlays, so the pointerdown
// target may not be the <video>. Hit-test the exact point: elementsFromPoint
// only includes the <video> when the cursor is genuinely within its box, so we
// must NOT descend into subtrees (that would match the reel from anywhere on
// the page, since ancestors contain the video).
function findVideoUnderPoint(e) {
  const stack = document.elementsFromPoint?.(e.clientX, e.clientY) || [];
  for (const el of stack) {
    if (el.tagName === "VIDEO") return el;
  }
  return null;
}

// Overlaid, tappable reel chrome that should keep its normal behavior.
function isInteractiveControl(target) {
  if (!target?.closest) return false;
  // The scrubber (our own timeline) — dragging it must not start fast-forward.
  if (target.closest('[class*="instafn-reel-scrubber"]')) return true;
  if (target.closest('a, [role="link"], input, textarea, [contenteditable="true"]')) {
    return true;
  }
  const labeled = target.closest("[aria-label]");
  const label = labeled?.getAttribute("aria-label") || "";
  return /^(Like|Unlike|Comment|Repost|Share|Save|Remove|More|Follow|Following|Audio)\b/i.test(
    label
  );
}

function onClickCapture(e) {
  if (swallowNextClick) {
    swallowNextClick = false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
}

// ---------------------------------------------------------------------------
// Spacebar path
// ---------------------------------------------------------------------------

function isTypingTarget() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    el.isContentEditable ||
    el.getAttribute?.("role") === "textbox"
  );
}

function onKeyDown(e) {
  if (!enabled || e.code !== "Space") return;
  if (isTypingTarget()) return;

  // Already holding: the OS keeps firing keydown while the key is down — each
  // one has the default page-scroll action, so we must keep blocking it.
  if (spaceHeld) {
    e.preventDefault();
    return;
  }

  const video = findActiveReelVideo();
  if (!video) return; // no reel on screen → leave Space alone (normal scroll)
  e.preventDefault();
  spaceHeld = true;
  startFast(video);
}

function onKeyUp(e) {
  if (e.code !== "Space" || !spaceHeld) return;
  spaceHeld = false;
  e.preventDefault();
  stopFast();
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function initReelSpeedHold(isEnabled) {
  enabled = !!isEnabled;

  // Listeners are attached once; the `enabled` flag gates behavior so the
  // feature can be toggled live without leaking handlers.
  if (initReelSpeedHold._wired) return;
  initReelSpeedHold._wired = true;

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  // Releasing outside the video (or losing focus) must also stop.
  window.addEventListener("blur", onPointerUp);
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keyup", onKeyUp, true);
}
