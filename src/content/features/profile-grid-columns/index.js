/**
 * Profile Grid Columns
 *
 * Lets the user choose how many columns the profile grid uses for Posts, Reels,
 * Reposts and Tagged. Instagram hardcodes three cells per row in the DOM, so the
 * actual reflow is done in CSS (see profile-grid-columns.css) by dissolving each
 * row and re-gridding its parent. This module just drives that CSS: it injects
 * the stylesheet and toggles a `data-instafn-grid-cols` attribute plus a
 * `--instafn-grid-cols` custom property on <html>.
 *
 * The override is applied only while the user is on a profile page and only when
 * they've picked a fixed column count. The "default" option (and any unset value)
 * removes the attribute entirely so Instagram's native, responsive layout is left
 * untouched; a chosen number — including 3 — forces a fixed grid of that many
 * columns. Off profile pages (explore, search, hashtag grids, etc.) it never
 * engages.
 */

import { injectStylesheet } from "../../utils/styleLoader.js";

const STYLE_PATH = "content/features/profile-grid-columns/profile-grid-columns.css";
const STYLE_KEY = "instafn-profile-grid-columns";
const ROOT_ATTR = "data-instafn-grid-cols";
const COL_VAR = "--instafn-grid-cols";

// "default" means: don't override anything, leave Instagram's native (responsive)
// layout alone. Any number — including 3 — forces a fixed grid of that many
// columns.
const NATIVE = "default";
const MIN_COLUMNS = 1;
const MAX_COLUMNS = 8;

let currentColumns = NATIVE; // NATIVE or a clamped integer.

function normalizeColumns(value) {
  if (value === NATIVE || value == null) return NATIVE;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return NATIVE;
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, n));
}

// Instagram profile tabs all live under /<user>/ (Posts) or /<user>/<tab>/. We
// only want to touch those grids, never the visually similar explore/search/
// hashtag grids, so we whitelist profile-tab shapes and skip reserved routes.
const RESERVED_FIRST_SEGMENTS = new Set([
  "explore", "reels", "direct", "stories", "accounts", "p", "reel", "tv",
  "about", "settings", "emails", "challenge", "oauth", "ads", "legal",
  "privacy", "terms", "developer", "directory", "web", "your_activity",
  "lite", "notifications", "api",
]);
const PROFILE_TAB_SEGMENTS = new Set([
  "reels", "tagged", "reposts", "saved", "feed",
]);

function isProfileGridPage(pathname = window.location.pathname) {
  const segs = pathname.split("/").filter(Boolean);
  if (segs.length === 0) return false; // home feed
  if (RESERVED_FIRST_SEGMENTS.has(segs[0].toLowerCase())) return false;
  if (segs.length === 1) return true; // /<user>/ — Posts tab
  if (segs.length === 2 && PROFILE_TAB_SEGMENTS.has(segs[1].toLowerCase())) {
    return true; // /<user>/reels, /tagged, /reposts, ...
  }
  return false;
}

function applyState() {
  const root = document.documentElement;
  const shouldApply = currentColumns !== NATIVE && isProfileGridPage();

  if (!shouldApply) {
    root.removeAttribute(ROOT_ATTR);
    root.style.removeProperty(COL_VAR);
    return;
  }

  injectStylesheet(STYLE_PATH, STYLE_KEY);
  root.style.setProperty(COL_VAR, String(currentColumns));
  root.setAttribute(ROOT_ATTR, String(currentColumns));
}

// Called on load and whenever the setting changes.
export function initProfileGridColumns(columns) {
  currentColumns = normalizeColumns(columns);
  applyState();
}

// Called on SPA navigation so the override engages/disengages as the user moves
// between profile pages and the rest of Instagram.
export function refreshProfileGridColumns() {
  applyState();
}
