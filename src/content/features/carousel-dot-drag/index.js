/**
 * Carousel Dot Drag-to-Scrub
 *
 * Mimics the mobile gesture where dragging across a post's dot indicator scrubs
 * through the carousel. Drag right → advance to the next image; drag left → go
 * back. Each ~step of horizontal movement snaps one image in that direction.
 *
 * Implementation note: instead of fighting React by mutating the slide
 * transforms directly, we drive Instagram's own "Next" / "Go back" carousel
 * buttons. Clicking them triggers IG's native snap-scroll animation and gives us
 * free bounds-clamping — at the first slide there's no back button, at the last
 * there's no next button, so an out-of-range step is a harmless no-op.
 *
 * The dots strip is tiny, so we setPointerCapture on it: the user will almost
 * always drag their cursor off the dots, and capture keeps the move/up events
 * flowing to us anyway.
 */

const STYLE_ID = "instafn-carousel-dot-drag-style";
const BODY_ENABLED_CLASS = "instafn-cdd-enabled";
const BODY_DRAGGING_CLASS = "instafn-cdd-dragging";
// Applied while the bare cursor is hovering a carousel's dots region. The dots
// strip is usually pointer-events:none, so a `cursor` on ._acnc never wins — the
// element behind it does. We hit-test the pointer instead and force the cursor
// globally (same !important trick as the dragging state).
const BODY_HOVER_CLASS = "instafn-cdd-hover";
// Applied to the carousel root during a drag to kill IG's slide transition, so
// each step jumps instantly instead of animating.
const SNAP_CLASS = "instafn-cdd-snap";

// Fallback px-per-slide when the strip geometry is unusable. Normally the step
// is derived from the dots strip itself (see dragStepPx) so that dragging across
// the width of the dots traverses the whole carousel — a natural 1:1 feel
// instead of a fixed distance that overshoots on long posts.
const DRAG_STEP_PX = 22;
// Don't let a tiny/cramped strip make the scrub hair-trigger sensitive.
const MIN_DRAG_STEP_PX = 10;
// Pivot-style precision: the per-slide travel grows with how far the cursor is
// (vertically) from the dots. At the dots it's the base step (strip-width 1:1);
// roughly every PRECISION_FALLOFF_PX of vertical offset adds one base-step of
// travel per slide, so pulling away gives finer scrubbing.
const PRECISION_FALLOFF_PX = 90;

// The dots strip is only a few px tall and the dots themselves are typically
// pointer-events:none, so we can't rely on the event target. Hit-test the
// pointer against the strip's box, padded so the tiny target is grabbable.
const HIT_PAD_X = 10;
const HIT_PAD_Y = 14;

let enabled = false;

// Active-drag state
let dragging = false;
let dotsEl = null;
let carouselRoot = null;
let activePointerId = null;
let lastX = 0;
let accum = 0; // signed drag distance not yet consumed by a step
// Base px of horizontal drag per one-slide step at the dots' own scale: strip
// width / gaps between dots, so a full strip-width drag spans the carousel. Set
// in onPointerDown; scaled up by vertical distance in onPointerMove.
let baseStepPx = DRAG_STEP_PX;
// The dots strip's vertical centre, captured at grab time, for the precision
// falloff measured from the cursor's distance to the dots.
let stripCenterY = 0;
// Live per-slide step (base scaled by vertical distance), updated each move and
// read by the frame pump.
let dragStepPx = DRAG_STEP_PX;
// Frame pump: drains banked drag one step per frame so a fast flick traverses
// many slides reliably (one click per frame → IG re-renders between each).
let pumpScheduled = false;

// Hover state: whether the bare cursor is currently over a dots region.
let hovering = false;
let hoverRafPending = false;
let lastHoverX = 0;
let lastHoverY = 0;

// ---------------------------------------------------------------------------
// Style (cursor affordance + drag UX)
// ---------------------------------------------------------------------------

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    body.${BODY_HOVER_CLASS},
    body.${BODY_HOVER_CLASS} * { cursor: col-resize !important; }
    body.${BODY_DRAGGING_CLASS},
    body.${BODY_DRAGGING_CLASS} * {
      cursor: col-resize !important;
      user-select: none !important;
    }
    .${SNAP_CLASS}, .${SNAP_CLASS} * {
      transition: none !important;
      transition-duration: 0s !important;
    }
  `;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Carousel detection
// ---------------------------------------------------------------------------

function countDots(strip) {
  return strip.querySelectorAll(":scope > ._acnb").length;
}

// Measure the real dot cluster (not the post-wide ._acnc box): the pitch between
// adjacent dots, and the dots' vertical centre. pitch = centre-to-centre span of
// the first→last dot divided by the gaps, i.e. how far one slide is on screen.
function measureDots(strip) {
  const dots = strip.querySelectorAll(":scope > ._acnb");
  if (dots.length < 2) return { pitch: 0, centerY: 0 };
  const first = dots[0].getBoundingClientRect();
  const last = dots[dots.length - 1].getBoundingClientRect();
  const firstCx = first.left + first.width / 2;
  const lastCx = last.left + last.width / 2;
  const pitch = (lastCx - firstCx) / (dots.length - 1);
  const centerY = first.top + first.height / 2;
  return { pitch, centerY };
}

// Resolve the dots strip for a pointerdown event. A carousel strip must have ≥2
// dot children so we don't mistake some other underscore-classed element for a
// carousel.
function getDotsContainer(e) {
  // Fast path: pointer landed directly on the strip or a dot.
  const direct = e.target?.closest?.("._acnc");
  if (direct && countDots(direct) >= 2) return direct;

  // Fallback: the dots are usually pointer-events:none, so the real event
  // target is whatever sits behind them. Hit-test the pointer coordinates
  // against each strip's (padded) box instead.
  const { clientX: x, clientY: y } = e;
  for (const strip of document.querySelectorAll("._acnc")) {
    if (countDots(strip) < 2) continue;
    const r = strip.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (
      x >= r.left - HIT_PAD_X &&
      x <= r.right + HIT_PAD_X &&
      y >= r.top - HIT_PAD_Y &&
      y <= r.bottom + HIT_PAD_Y
    ) {
      return strip;
    }
  }
  return null;
}

// Walk up from the dots strip to the first ancestor that also contains this
// carousel's nav button. That ancestor is the post/carousel root, which scopes
// our button queries to the correct carousel even with many posts on screen.
function findCarouselRoot(strip) {
  let el = strip.parentElement;
  let depth = 0;
  while (el && depth < 10) {
    if (
      el.querySelector(
        'button[aria-label="Next"], button[aria-label="Go back"], button._afxw, button._afxv'
      )
    ) {
      return el;
    }
    el = el.parentElement;
    depth++;
  }
  return null;
}

// Re-queried live on every step: the back button is absent on the first slide
// and the next button is absent on the last, which is how we get clamping.
function resolveButton(root, dir) {
  if (!root) return null;
  const sel =
    dir > 0
      ? '[aria-label="Next"], button._afxw'
      : '[aria-label="Go back"], [aria-label="Previous"], button._afxv';
  const el = root.querySelector(sel);
  if (!el) return null;
  return el.closest("button") || (el.tagName === "BUTTON" ? el : null);
}

// Returns true if a slide actually changed. At a bound the direction's button
// is absent (no Next on the last slide, no Back on the first), so we report
// false and the caller drops any banked drag instead of letting it pile up.
function step(dir) {
  const btn = resolveButton(carouselRoot, dir);
  if (!btn) return false;
  btn.click();
  return true;
}

// ---------------------------------------------------------------------------
// Drag handling
// ---------------------------------------------------------------------------

function onPointerDown(e) {
  if (!enabled || e.button !== 0 || dragging) return;

  const strip = getDotsContainer(e);
  if (!strip) return;

  const root = findCarouselRoot(strip);
  if (!root) return; // dots without a navigable carousel — leave alone

  dragging = true;
  dotsEl = strip;
  carouselRoot = root;
  activePointerId = e.pointerId;
  lastX = e.clientX;
  accum = 0;

  // Map drag distance to the dots' own scale. The ._acnc strip is as wide as the
  // post, but the dots are a small centred cluster — so measure the dots
  // themselves (first dot centre → last dot centre) and use the inter-dot pitch
  // as the per-slide step. Dragging across the actual dots then spans the
  // carousel, regardless of where in the strip you grab.
  const { pitch, centerY } = measureDots(strip);
  baseStepPx = pitch > 0 ? Math.max(MIN_DRAG_STEP_PX, pitch) : DRAG_STEP_PX;
  stripCenterY = centerY;

  // Disable the carousel's slide transition for the duration of the drag so
  // every step jumps instantly. Restored on release.
  root.classList.add(SNAP_CLASS);

  // Keep move/up events coming even as the cursor leaves the tiny dots strip.
  try {
    strip.setPointerCapture(e.pointerId);
  } catch (_) {
    /* not all pointer types support capture */
  }

  document.body.classList.add(BODY_DRAGGING_CLASS);

  // Prevent the browser's native image-drag / text selection from starting.
  e.preventDefault();
  e.stopPropagation();

  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
}

function onPointerMove(e) {
  if (!dragging || e.pointerId !== activePointerId) return;

  const dx = e.clientX - lastX;
  if (dx === 0) return;
  lastX = e.clientX;

  // Pivot/lever precision: scale the per-slide travel by how far the cursor is
  // (vertically) from the dots. Right at the dots it's the base step (one
  // strip-width spans the carousel); pull away and each slide needs more drag,
  // giving fine control. Recomputed each move so drifting in Y adjusts live.
  const dy = Math.abs(e.clientY - stripCenterY);
  dragStepPx = baseStepPx * (1 + dy / PRECISION_FALLOFF_PX);

  // Reversing direction clears any banked distance from the previous direction,
  // so a change of direction registers after one fresh step's worth of drag
  // rather than first having to pay off the old leftover (which felt sticky,
  // especially when reversing off the last/first slide).
  if ((dx > 0) !== (accum >= 0)) accum = 0;
  accum += dx;

  // Apply one step now for immediate response, then let the frame pump drain any
  // remaining banked distance one step per frame. Firing every banked step here
  // (synchronously) would be swallowed: IG advances via a React state update, so
  // multiple clicks in one tick all read the same pre-render index and collapse
  // into a single slide — which is why a fast flick used to move only one.
  applyStep();
  schedulePump();

  e.preventDefault();
  e.stopPropagation();
}

// Consume one slide's worth of banked drag, if any. At a bound the button is
// absent, so we drop the banked distance instead of letting it pile up (keeps a
// reverse drag responsive). At most one click per call → never collapses.
function applyStep() {
  if (accum >= dragStepPx) {
    if (step(1)) accum -= dragStepPx;
    else accum = 0;
  } else if (accum <= -dragStepPx) {
    if (step(-1)) accum += dragStepPx;
    else accum = 0;
  }
}

function pumpStep() {
  pumpScheduled = false;
  if (!dragging) return;
  applyStep();
  schedulePump();
}

// Schedule a pump frame only while a whole step is still banked.
function schedulePump() {
  if (pumpScheduled || !dragging) return;
  if (accum < dragStepPx && accum > -dragStepPx) return;
  pumpScheduled = true;
  requestAnimationFrame(pumpStep);
}

function onPointerUp(e) {
  if (!dragging) return;
  if (e && activePointerId !== null && e.pointerId !== activePointerId) return;

  if (dotsEl && activePointerId !== null) {
    try {
      dotsEl.releasePointerCapture(activePointerId);
    } catch (_) {
      /* ignore */
    }
  }

  if (carouselRoot) carouselRoot.classList.remove(SNAP_CLASS);

  dragging = false;
  dotsEl = null;
  carouselRoot = null;
  activePointerId = null;
  accum = 0;

  document.body.classList.remove(BODY_DRAGGING_CLASS);

  window.removeEventListener("pointermove", onPointerMove, true);
  window.removeEventListener("pointerup", onPointerUp, true);
  window.removeEventListener("pointercancel", onPointerUp, true);
}

// ---------------------------------------------------------------------------
// Hover cursor
// ---------------------------------------------------------------------------

// True if (x, y) falls within any navigable carousel's padded dots box. Same
// coordinate hit-test as the drag fallback, used to drive the hover cursor
// because the dots strip itself is pointer-events:none.
function isOverDots(x, y) {
  for (const strip of document.querySelectorAll("._acnc")) {
    if (countDots(strip) < 2) continue;
    const r = strip.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (
      x >= r.left - HIT_PAD_X &&
      x <= r.right + HIT_PAD_X &&
      y >= r.top - HIT_PAD_Y &&
      y <= r.bottom + HIT_PAD_Y
    ) {
      return true;
    }
  }
  return false;
}

function setHovering(next) {
  if (next === hovering) return;
  hovering = next;
  document.body.classList.toggle(BODY_HOVER_CLASS, next);
}

// Throttled to one querySelectorAll per animation frame so the global
// pointermove listener stays cheap.
function evaluateHover() {
  hoverRafPending = false;
  if (!enabled || dragging) {
    setHovering(false);
    return;
  }
  setHovering(isOverDots(lastHoverX, lastHoverY));
}

function onHoverMove(e) {
  if (!enabled || dragging) return;
  lastHoverX = e.clientX;
  lastHoverY = e.clientY;
  if (hoverRafPending) return;
  hoverRafPending = true;
  requestAnimationFrame(evaluateHover);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function initCarouselDotDrag(isEnabled) {
  enabled = !!isEnabled;

  if (enabled) {
    ensureStyle();
    document.body?.classList.add(BODY_ENABLED_CLASS);
  } else {
    document.body?.classList.remove(BODY_ENABLED_CLASS);
    // Tear down any in-flight drag if toggled off mid-gesture.
    if (dragging) onPointerUp();
    setHovering(false);
  }

  // Listeners are attached once; the `enabled` flag gates behavior so the
  // feature can be toggled live without leaking handlers.
  if (initCarouselDotDrag._wired) return;
  initCarouselDotDrag._wired = true;

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointermove", onHoverMove, { passive: true });
}
