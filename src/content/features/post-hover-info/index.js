/**
 * Post Hover Info
 *
 * Instagram shows a like + comment count overlay when you hover a post card on a
 * profile grid. This feature adds the post's date (formatted using the feature's
 * own Date Format setting, default dd/mm/yy) with a calendar icon as another item
 * in that same counts list, cloning a count <li> so the date matches IG's exact
 * text styling.
 *
 * The date is derived directly from the post's shortcode in the card's link.
 * Instagram shortcodes are base64url-encoded media IDs, and a media ID embeds its
 * creation time (Snowflake-style: the high bits are milliseconds since IG's
 * epoch). Decoding the shortcode therefore yields the date with no API call, and
 * works uniformly on every grid — Posts, Reels, Tagged and Reposts. This matters
 * because only the Posts feed carries a `taken_at`; the Reels/Tagged/Reposts
 * GraphQL payloads omit any date field entirely, so there is nothing to read from
 * the network there. (Verified: shortcode-derived time matches the feed's
 * taken_at/created_at to within ~1s.)
 */

import { injectStylesheet } from "../../utils/styleLoader.js";
import { formatExactTime } from "../exact-time-display/index.js";

const DATE_ITEM_CLASS = "instafn-post-hover-date-item";
const UL_FLAG_CLASS = "instafn-post-hover-ul";
const PROCESSED_ATTR = "data-instafn-hover-date";

// Solid calendar glyph (a filled body + two legs — no hollow areas, matching the
// filled-heart look). Uses currentColor; the CSS forces that to white since the
// <li>'s inherited color is IG's link-blue.
const CALENDAR_PATHS =
  '<rect x="3" y="5" width="18" height="16" rx="3"></rect><rect x="6.5" y="2" width="2.5" height="5" rx="1.25"></rect><rect x="15" y="2" width="2.5" height="5" rx="1.25"></rect>';
const CALENDAR_SVG =
  '<svg class="instafn-post-hover-cal" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  CALENDAR_PATHS +
  "</svg>";

let isEnabled = false;
let currentFormat = "dd/mm/yy";
let listenersWired = false;

// Reuses the Exact Time formatter so date AND date+time formats are available,
// and the same format keys are editable in either feature's settings.
function formatDate(takenAt, format) {
  return formatExactTime(new Date(takenAt * 1000).toISOString(), format);
}

// ---------------------------------------------------------------------------
// Shortcode → date
// ---------------------------------------------------------------------------

// IG shortcodes are base64url over this alphabet; decoding gives the media id.
const SHORTCODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
// Media ids are Snowflake-like: (id >> 23) ms since this epoch is the post time.
const IG_EPOCH_MS = 1314220021721n;

// Decode the shortcode to its media id and pull the embedded creation time.
// Returns unix seconds, or null if the code isn't a decodable shortcode or the
// derived time is implausible (guards against ad/long/opaque codes).
function takenAtFromShortcode(code) {
  if (!code) return null;
  let id = 0n;
  for (let i = 0; i < code.length; i++) {
    const v = SHORTCODE_ALPHABET.indexOf(code[i]);
    if (v === -1) return null;
    id = id * 64n + BigInt(v);
  }
  const seconds = Number(((id >> 23n) + IG_EPOCH_MS) / 1000n);
  // Sane range: 2010-01-01 .. 2035-01-01.
  if (seconds < 1262304000 || seconds > 2051222400) return null;
  return seconds;
}

function extractCode(href) {
  if (!href) return null;
  // Grid links look like /<user>/p/<code>/ or /<user>/reel/<code>/ (and /tv/).
  const m = href.match(/\/(?:p|reel|tv)\/([^/?#]+)/);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------------------
// Listeners
// ---------------------------------------------------------------------------

// Listeners are attached once and gated on `isEnabled`, so the feature toggles
// live without ever running while disabled. There is intentionally no standing
// page-wide MutationObserver: the date is computed from the card's own link on
// hover, so the DOM work only runs on hover — never as a constant poll.
function wireListeners() {
  if (listenersWired) return;
  listenersWired = true;
  document.addEventListener("mouseover", onMouseOver, true);
}

// ---------------------------------------------------------------------------
// Overlay injection
// ---------------------------------------------------------------------------

// Inject only when a card is actually hovered. IG builds the count overlay a
// frame or two after the pointer enters, so we look now and again shortly after;
// injectForCountsList is idempotent, so the repeats are free.
function onMouseOver(e) {
  if (!isEnabled) return;
  const link = e.target.closest?.(
    'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]'
  );
  if (!link) return;
  injectIntoCard(link);
  requestAnimationFrame(() => injectIntoCard(link));
  setTimeout(() => injectIntoCard(link), 60);
  setTimeout(() => injectIntoCard(link), 160);
}

function injectIntoCard(link) {
  if (!isEnabled || !link.isConnected) return;
  // Every profile grid (Posts, Reels, Tagged, Reposts) builds the same <ul> of
  // count <li>s in the card's hover overlay, so one path covers them all.
  const ul = link.querySelector("ul");
  if (ul) injectForCountsList(ul);
}

// Build the date as a sibling <li> of the like/comment counts by cloning one of
// them — that's the most reliable way to inherit IG's exact text styling (font,
// size, weight, color). We then swap the cloned item's masked icon glyph for our
// own calendar SVG and reorder it to sit before the date text.
function buildDateListItem(templateLi, takenAt) {
  const li = templateLi.cloneNode(true);
  li.classList.add(DATE_ITEM_CLASS);
  li.removeAttribute(PROCESSED_ATTR);

  const textNode = li.querySelector(".html-span");
  if (textNode) textNode.textContent = formatDate(takenAt, currentFormat);

  // Each count <li> is [textWrapperSpan, iconSpan]; the icon is rendered via IG
  // mask classes (a heart/comment). Repurpose it as our calendar and move it
  // ahead of the text so the row reads [icon] [date].
  const iconSpan = li.lastElementChild;
  if (iconSpan && iconSpan !== li.firstElementChild) {
    iconSpan.removeAttribute("style");
    iconSpan.className = "instafn-post-hover-cal-wrap";
    iconSpan.innerHTML = CALENDAR_SVG;
    li.insertBefore(iconSpan, li.firstElementChild);
  }
  return li;
}

// The hover overlay is a <ul> of count <li>s sitting inside the card's <a>.
// We append the date as another <li> in that same list.
function injectForCountsList(ul) {
  if (!ul || ul.getAttribute(PROCESSED_ATTR) === "1") return;

  const link = ul.closest('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]');
  if (!link) return;
  // Guard against matching unrelated lists: the counts overlay always has <li>s.
  const templateLi = ul.querySelector(":scope > li");
  if (!templateLi) return;

  const takenAt = takenAtFromShortcode(extractCode(link.getAttribute("href")));
  if (takenAt == null) return;

  ul.classList.add(UL_FLAG_CLASS);
  ul.appendChild(buildDateListItem(templateLi, takenAt));
  ul.setAttribute(PROCESSED_ATTR, "1");
}

// Re-scan overlays currently in the DOM (used on init and after a live format
// change so any already-open overlay re-renders immediately).
function refreshExistingOverlays() {
  document
    .querySelectorAll(
      'a[href*="/p/"] ul, a[href*="/reel/"] ul, a[href*="/tv/"] ul'
    )
    .forEach(injectForCountsList);
}

function removeInjectedDates() {
  document.querySelectorAll(`.${DATE_ITEM_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`ul[${PROCESSED_ATTR}="1"]`).forEach((ul) => {
    ul.removeAttribute(PROCESSED_ATTR);
    ul.classList.remove(UL_FLAG_CLASS);
  });
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// Wire the hover listener as early as possible (gated on the setting) so dates
// appear on the very first card the user hovers after load.
export function setupPostHoverInfoEarly() {
  chrome.storage.sync.get({ enablePostHoverInfo: false }, (settings) => {
    if (settings.enablePostHoverInfo) {
      isEnabled = true;
      wireListeners();
    }
  });
}

export function initPostHoverInfo(enabled, format = "dd/mm/yy") {
  isEnabled = !!enabled;
  currentFormat = format || "dd/mm/yy";

  if (!isEnabled) {
    removeInjectedDates();
    return;
  }

  injectStylesheet(
    "content/features/post-hover-info/post-hover-info.css",
    "instafn-post-hover-info"
  );
  wireListeners();

  // Re-render existing dates so a live format change is reflected immediately.
  removeInjectedDates();
  refreshExistingOverlays();
}
