/**
 * Shared placement for action-bar download buttons.
 *
 * The reliable way to add an action icon that lines up perfectly with IG's own
 * (and never breaks the flex row or disturbs the count numbers) is to CLONE the
 * send / paper-plane button and insert the clone right before it, in the send
 * button's own parent — exactly how story-blocking's "Mark as seen" button
 * clones the heart. The clone is a structurally identical sibling, so it
 * inherits IG's box model, sizing and spacing 1:1. cloneNode() does not copy
 * React's event wiring (no fiber on the clone), so it carries none of Share's
 * behaviour — we attach our own handler.
 */

export const ITEM_CLASS = "instafn-dl-item";

// The paper-plane "send" control across surfaces. Prefix matches cover the label
// variants IG ships ("Share", "Share Post", "Send message", "Direct").
export const SEND_SELECTOR =
  'svg[aria-label^="Share"], svg[aria-label^="Send"], svg[aria-label="Direct"]';

// Download glyph (tray + down arrow), stroked with currentColor to match IG's
// outline icons (Share / Save / More).
const DOWNLOAD_ICON_PATHS =
  '<path d="M12 3v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<path d="M7 11l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>' +
  '<path d="M4 20h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>';

// Modern single-arc spinner — the same one the voice-download button shows
// (ui.js SPINNER_SVG): a 3/4 ring (stroke-dasharray gap) that spins. viewBox
// 0 0 24 24 matches the download glyph, so swapping is a clean in-place change.
const SPINNER_ARC =
  '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="44" stroke-dashoffset="14"></circle>';

/**
 * Toggle a download button between its glyph and IG's loading spinner. Stashes
 * each svg's original viewBox / contents / inline styles on the way in and
 * restores them on the way out, so it works for any cloned button shape. The
 * `instafn-dl-spin` keyframes come from media-downloader.css (loaded with the
 * feature, before any click).
 */
export function setButtonLoading(item, on) {
  const svgs = item?.querySelectorAll?.("svg");
  if (!svgs || !svgs.length) return;
  svgs.forEach((svg) => {
    if (on) {
      if (svg.dataset.dlBusy === "1") return;
      svg.dataset.dlBusy = "1";
      svg.dataset.dlVb = svg.getAttribute("viewBox") || "";
      svg.dataset.dlInner = svg.innerHTML;
      svg.dataset.dlCss = svg.style.cssText;
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.style.fill = "none";
      svg.style.stroke = "currentColor";
      svg.style.transformOrigin = "center";
      svg.style.animation = "instafn-dl-spin 0.7s linear infinite";
      svg.innerHTML = SPINNER_ARC;
    } else if (svg.dataset.dlBusy === "1") {
      svg.setAttribute("viewBox", svg.dataset.dlVb);
      svg.innerHTML = svg.dataset.dlInner;
      svg.style.cssText = svg.dataset.dlCss;
      delete svg.dataset.dlBusy;
      delete svg.dataset.dlVb;
      delete svg.dataset.dlInner;
      delete svg.dataset.dlCss;
    }
  });
}

/** The send/paper-plane action button inside `container`, or null. */
export function findSendButton(container) {
  const svg = container?.querySelector?.(SEND_SELECTOR);
  return svg ? svg.closest('[role="button"], button') : null;
}

/** Lowest common ancestor of two nodes. */
export function commonAncestor(a, b) {
  if (!a || !b) return null;
  const seen = new Set();
  for (let n = a; n; n = n.parentElement) seen.add(n);
  for (let n = b; n; n = n.parentElement) if (seen.has(n)) return n;
  return null;
}

// The "row item" for `btn` within `row`: the ancestor of `btn` that sits as a
// direct child of `row`. On the reels rail each action is wrapped in its own
// spacing container (a direct child of the rail); on the post action bar the
// button itself is the direct child. Cloning at THIS level — not the bare
// button — is what makes the new item pick up the rail's gap/margins and line
// up with its neighbours.
export function rowItem(row, btn) {
  let node = btn;
  while (node && node.parentElement && node.parentElement !== row) {
    node = node.parentElement;
  }
  return node && node.parentElement === row ? node : btn;
}

// Turn a cloned send button into a download control: swap the glyph, relabel
// every aria-label so screen readers don't announce "Share", neutralise the
// liked/active colour, and wire our async handler with a busy state.
function makeDownloadFromClone(item, { label, onClick, surface }) {
  item.removeAttribute("id");
  item.classList.add(ITEM_CLASS);
  item.setAttribute("data-instafn-dl-injected", "1");
  if (surface) item.setAttribute("data-dl-surface", surface);
  item.setAttribute("aria-label", label);
  item.title = label;
  item.style.cursor = "pointer";

  // Swap EVERY svg in the clone, not just the first. Some action items (notably
  // the post-lightbox Share button) carry more than one svg — swapping only the
  // first left the visible paper-plane intact, so the download button rendered
  // as a Share icon even though it worked.
  item.querySelectorAll("svg").forEach((svg) => {
    svg.setAttribute("aria-label", label);
    svg.setAttribute("role", "img");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("height", "24");
    svg.setAttribute("width", "24");
    svg.innerHTML = DOWNLOAD_ICON_PATHS;
    svg.style.fill = "none";
    svg.style.stroke = "currentColor";
    svg.style.color = "currentColor";
  });
  // Relabel every aria-labelled node so nothing still reads as "Share"/"Direct"
  // (which would let a re-scan re-match and re-clone our own button).
  item
    .querySelectorAll("[aria-label]")
    .forEach((el) => el.setAttribute("aria-label", label));

  let busy = false;
  const handler = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    busy = true;
    setButtonLoading(item, true);
    try {
      await onClick();
    } finally {
      busy = false;
      setButtonLoading(item, false);
    }
  };
  // Capture so we beat any residual delegated handlers.
  item.addEventListener("click", handler, true);
  item.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") handler(e);
  });

  return item;
}

/** Clone `templateEl` (an action button / its row-item) into a download control. */
export function buildDownloadClone(templateEl, opts) {
  return makeDownloadFromClone(templateEl.cloneNode(true), opts);
}

/**
 * Clone the Send button's row-item into a download button and insert it right
 * before that item (second-to-last action), inside `row`.
 *
 * `row` is the action bar / rail container. When omitted we fall back to the
 * send button's own parent and clone the bare button (correct for layouts where
 * actions are direct children, e.g. the post action bar).
 *
 * Returns the inserted element, or null.
 */
export function injectDownloadBeforeSend(sendBtn, row, opts) {
  if (!sendBtn) return null;
  // Allow (sendBtn, opts) — when the second arg isn't a DOM node it's the opts.
  if (row && row.nodeType !== 1) {
    opts = row;
    row = null;
  }
  const container = row || sendBtn.parentNode;
  if (!container) return null;
  const template = row ? rowItem(row, sendBtn) : sendBtn;
  const item = makeDownloadFromClone(template.cloneNode(true), opts);
  container.insertBefore(item, template);
  return item;
}
