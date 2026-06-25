// DM Background + bubble/reaction theming
//
// IG web never applies chat themes; we render them from the private mobile API
// (the only place the theme lives on web).
//
//   GET /api/v1/direct_v2/threads/{canonicalId}/  -> thread.theme_data
// theme_data ships BOTH colour modes:
//   - top level         = light / "NORMAL" (app_color_mode:"NORMAL")
//   - alternative_themes = the other mode(s), e.g. app_color_mode:"DARK"
// Each variant has: gradient_colors (outgoing bubble), incoming_message_bubble_color,
// thread_background_color + thread_background_asset (the real background image),
// inbound/outbound_message_text_color, reaction_pill_color, emphasized_action_color.
// We pick the variant matching IG's current mode (its own __fb-dark-mode toggle).
//
// The `/direct/t/<id>` URL id is a thread_key (REST 500s); we resolve the
// canonical id via the inbox once and cache it.
//
// Network discipline (privacy/efficiency): the theme is cached PER CHAT
// (themeCache, keyed by canonicalId, TTL 10 min). Switching between chats, the
// keep-alive poll, focus and dark/light flips all read the cache and do NOT ping
// IG. We only hit the network on a cache miss (first view of a chat), a TTL
// expiry, or a detected live theme change ("changed the theme to" admin message,
// which forces a refetch). Unresolved chats are negatively cached for 60s so the
// inbox isn't re-pinged every poll.

const IG_APP_ID = "936619743392459";
const DEFAULT_THEME_ID = "3259963564026002";
const STYLE_ID = "instafn-dm-theme-style";
const THREADLIST_STYLE_ID = "instafn-dm-threadlist-style";
const STATUS_ID = "instafn-dm-theme-status"; // header spinner / error indicator

let themeStatusState = "idle"; // "idle" | "loading" | "error"
let themeStatusError = "";
const BG_FLAG = "instafnDmBg";
const POLL_MS = 8000;
const OUTGOING_BUBBLE_SELECTOR = ".x5slmwz"; // IG outgoing (sent) bubble bg class

// CSS custom properties we set on the pane (so cleanup is exhaustive).
const THEME_VARS = [
  "--mwp-message-row-background",
  "--mwp-primary-theme-color",
  "--ig-incoming-message-bubble",
  "--ig-outgoing-message-bubble",
  "--chat-incoming-message-bubble-background-color",
  "--chat-outgoing-message-bubble-background-color",
  "--mwp-header-background-color",
  "--chat-composer-background-color",
  "--chat-composer-input-background-color",
];
const INCOMING_BUBBLE_SELECTOR = ".x88qbow"; // IG incoming bubble bg class
const PANE_FLAG = "instafnDmPane";

let navObserver = null;
let htmlObserver = null;
let pollTimer = null;
let currentUrlId = null;
let lastAppliedKey = null;
let resolving = false;
let lastDark = null;
const canonicalByUrlId = new Map();
// Per-chat theme cache so switching chats / polling / focus does NOT re-ping IG.
// canonicalId -> { theme, ts }. Only a cache miss, a TTL expiry, or a detected
// live theme change actually hits the network.
const themeCache = new Map();
const THEME_TTL_MS = 10 * 60 * 1000; // refetch a given chat's theme at most once / 10 min
// Negative cache for canonical-id resolution so we don't re-ping the inbox every
// poll for a chat that didn't resolve.
const canonicalMissAt = new Map();
const CANONICAL_MISS_TTL_MS = 60 * 1000;
// After a failed fetch, pause AUTOMATIC retries (poll/focus) for this long so a
// rate-limit / outage doesn't make us hammer IG. Explicit actions (chat switch,
// live theme change) still retry immediately.
const errorBackoffAt = new Map(); // urlId -> ts of last fetch error
const ERROR_BACKOFF_MS = 30 * 1000;

function parseThreadIdFromPath(pathname = window.location.pathname) {
  const m = pathname.match(/\/direct\/t\/(\d+)/);
  return m ? m[1] : null;
}

function csrfToken() {
  const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

async function igGetJson(path) {
  // Throws on network/HTTP failure (callers run inside refresh()'s try/catch,
  // which surfaces it as the header "theme failed" status). A successful response
  // with no theme is NOT an error — that's handled upstream as "no theme".
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
  if (!res.ok) throw new Error("HTTP " + res.status + " " + res.statusText + " — GET " + path);
  return await res.json();
}

function threadContainer() {
  return (
    document.querySelector('[data-pagelet="IGDMessagesList"]') ||
    document.querySelector('[data-pagelet="IGDOpenMessageList"]') ||
    document.querySelector('[aria-label*="Messages in conversation"]') ||
    null
  );
}

// The whole conversation pane (header + message list + composer): the nearest
// ancestor of the message list that also contains the DM header. We theme this
// so the background + colours span the entire chat, not just the scroll area.
function paneRoot() {
  const list = threadContainer();
  if (!list) return null;
  let el = list.parentElement;
  for (let i = 0; i < 8 && el; i++) {
    if (el.querySelector('[data-pagelet="IGDInboxHeaderOffMsys"]')) return el;
    el = el.parentElement;
  }
  return list;
}

// IG's own dark/light toggle (more accurate than the OS setting alone).
function isDarkMode() {
  const el = document.documentElement;
  if (el.classList.contains("__fb-dark-mode")) return true;
  if (el.classList.contains("__fb-light-mode")) return false;
  if (document.querySelector(".__fb-dark-mode")) return true;
  if (document.querySelector(".__fb-light-mode")) return false;
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

// ---- colour helpers (theme colours are ARGB hex, alpha-first) ----
function argbToRgba(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.replace(/^#/, "").trim();
  let a = 1;
  if (h.length === 8) {
    a = parseInt(h.slice(0, 2), 16) / 255;
    h = h.slice(2);
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a,
  };
}
const rgbaStr = (c) => "rgba(" + c.r + ", " + c.g + ", " + c.b + ", " + c.a + ")";
const tripleStr = (c) => c.r + " " + c.g + " " + c.b; // for rgb(var(--…)) style vars

function gradientCss(colors) {
  const rgbs = (colors || []).map(argbToRgba).filter(Boolean);
  if (!rgbs.length) return null;
  let stops;
  if (rgbs.length === 1) {
    const c = rgbs[0];
    const light = { r: Math.round(c.r + (255 - c.r) * 0.16), g: Math.round(c.g + (255 - c.g) * 0.16), b: Math.round(c.b + (255 - c.b) * 0.16), a: c.a };
    const dark = { r: Math.round(c.r * 0.88), g: Math.round(c.g * 0.88), b: Math.round(c.b * 0.88), a: c.a };
    stops = [rgbaStr(light), rgbaStr(dark)];
  } else {
    stops = rgbs.map(rgbaStr);
  }
  return "linear-gradient(160deg, " + stops.join(", ") + ")";
}

function largestAsset(asset) {
  if (!asset || typeof asset !== "object") return null;
  const order = [
    "two_thousand_forty_eight", "one_thousand_twenty_four", "seven_hundred_twenty",
    "four_hundred_eighty", "two_hundred", "one_hundred", "seventy_five", "fifty",
  ];
  for (const k of order) if (typeof asset[k] === "string" && /^https?:/.test(asset[k])) return asset[k];
  for (const k of Object.keys(asset)) if (typeof asset[k] === "string" && /^https?:/.test(asset[k])) return asset[k];
  return null;
}

// Pick the theme variant for the current mode. Top-level theme_data is one mode;
// alternative_themes holds the other(s); each carries app_color_mode.
function pickVariant(td, dark) {
  const all = [td].concat(Array.isArray(td.alternative_themes) ? td.alternative_themes : []);
  const usable = all.filter(
    (v) => v && ((Array.isArray(v.gradient_colors) && v.gradient_colors.length) || v.thread_background_color)
  );
  const want = dark ? "DARK" : "NORMAL";
  return (
    usable.find((v) => v.app_color_mode === want) ||
    usable.find((v) => (dark ? v.app_color_mode === "DARK" : v.app_color_mode !== "DARK")) ||
    usable[0] ||
    td
  );
}

function extractTheme(thread) {
  if (!thread) return null;
  const td = thread.theme_data;
  const themeId = (thread.theme && thread.theme.id) || (td && td.theme_id) || null;
  return { themeId, name: (td && td.name) || null, data: td || null };
}

async function fetchTheme(canonicalId) {
  const json = await igGetJson(
    "/api/v1/direct_v2/threads/" + canonicalId +
      "/?visual_message_return_type=unseen&limit=1"
  );
  return extractTheme(json && json.thread);
}

// Cached theme fetch. Returns the cached theme unless it's stale, forceFetch is
// set, or the cached entry is "partial" (colors only, derived from the inbox
// response — it lacks the background image, so we must do the full thread fetch).
async function fetchThemeCached(canonicalId, forceFetch) {
  const cached = themeCache.get(canonicalId);
  if (!forceFetch && cached && !cached.partial && Date.now() - cached.ts < THEME_TTL_MS) {
    return cached.theme;
  }
  const theme = await fetchTheme(canonicalId);
  themeCache.set(canonicalId, { theme, ts: Date.now(), partial: false });
  return theme;
}

function clearTheme() {
  const pane = document.querySelector("[data-instafn-dm-pane]");
  if (pane) {
    pane.style.backgroundImage = "";
    pane.style.backgroundColor = "";
    pane.style.backgroundSize = "";
    pane.style.backgroundPosition = "";
    pane.style.backgroundRepeat = "";
    THEME_VARS.forEach((p) => pane.style.removeProperty(p));
    delete pane.dataset[PANE_FLAG];
  }
  const list = document.querySelector("[data-instafn-dm-bg]");
  if (list) {
    list.style.backgroundColor = "";
    list.style.backgroundImage = "";
    delete list.dataset[BG_FLAG];
  }
  const s = document.getElementById(STYLE_ID);
  if (s) s.textContent = "";
}

function ensureStyleEl() {
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    (document.head || document.documentElement).appendChild(el);
  }
  return el;
}

// Persistent styles (installed once, only when the DM Background setting is on —
// initDMThemeDebug only runs in that case).
//  - Inset EVERY chat row in the thread list a touch from the right edge, so the
//    selected AND hover highlight pills don't run into the edge. Applied to all
//    rows (not just :hover) so hovering never shifts the left-aligned content.
//  - Spinner keyframes for the header theme-status indicator.
function installPersistentStyles() {
  if (document.getElementById(THREADLIST_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = THREADLIST_STYLE_ID;
  el.textContent =
    '[data-pagelet="IGDInboxThreadListScrollableAreaPagelet"] div[role="button"].x1mg3h75' +
    "{margin-right:16px !important;}" +
    "@keyframes instafn-dm-spin{to{transform:rotate(360deg);}}" +
    ".instafn-dm-spinner{animation:instafn-dm-spin 1s linear infinite;transform-origin:center;}";
  (document.head || document.documentElement).appendChild(el);
}

// The header action bar (the row holding the call / video / info icons).
function statusBar() {
  const header = document.querySelector('[data-pagelet="IGDInboxHeaderOffMsys"]');
  if (!header) return null;
  const svg = header.querySelector(
    'svg[aria-label="Audio call"], svg[aria-label="Video call"], svg[aria-label="Conversation information"]'
  );
  const btn = svg ? svg.closest('[role="button"]') : null;
  return btn ? btn.parentElement : null;
}

// Spinner while the theme is fetching, an error glyph (click to copy) if it fails,
// nothing when idle. Rendered as the FIRST child of the header action bar so it
// sits to the left of the call icon. Idempotent; re-runs survive header rerenders.
function ensureStatusIcon() {
  const bar = statusBar();
  let el = document.getElementById(STATUS_ID);
  if (themeStatusState === "idle") {
    if (el) el.remove();
    return;
  }
  if (!bar) return;
  if (!el) {
    el = document.createElement("div");
    el.id = STATUS_ID;
    el.style.cssText =
      "display:flex;align-items:center;justify-content:center;width:24px;height:24px;margin-right:8px;flex:0 0 auto;";
  }
  if (bar.firstChild !== el) bar.insertBefore(el, bar.firstChild);
  if (el.dataset.state !== themeStatusState) {
    el.dataset.state = themeStatusState;
    if (themeStatusState === "loading") {
      // Match the sibling header icons exactly: read a call/video/info icon's
      // computed colour (white in dark, dark in light, or the themed nav colour)
      // and use it for the spinner. Inline !important so it sticks.
      const sib = bar.querySelector(
        'svg[aria-label="Audio call"], svg[aria-label="Video call"], svg[aria-label="Conversation information"]'
      );
      const col = sib
        ? getComputedStyle(sib).color
        : isDarkMode()
        ? "#ffffff"
        : "#000000";
      el.style.setProperty("color", col, "important");
      el.style.cursor = "default";
      el.title = "Theme is loading…";
      el.onclick = null;
      // Same geometry as the info icon (24 viewBox, r=10.5, stroke-width 2, round
      // caps), drawn as a 3/4 arc (gap via dash) and rotated, so it matches the
      // sibling header icons exactly. circumference 2π·10.5 ≈ 65.97 → 49.5 on / 16.5 off.
      el.innerHTML =
        '<svg class="instafn-dm-spinner" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Theme is loading" role="img">' +
        '<circle cx="12" cy="12" r="10.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="49.5 16.5"/>' +
        "</svg>";
    } else if (themeStatusState === "error") {
      // inline !important beats the header navText color rule (also !important).
      el.style.setProperty("color", "#ed4956", "important"); // IG error red
      el.style.cursor = "pointer";
      el.title = "Theme failed to load — click to copy error";
      el.innerHTML =
        '<svg height="20" width="20" viewBox="0 0 24 24" fill="currentColor" aria-label="Theme error" role="img">' +
        '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 5a1 1 0 0 1 2 0v6a1 1 0 0 1-2 0Zm1 12.2a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z"/></svg>';
      el.onclick = () => {
        const msg = themeStatusError || "Unknown error";
        // Keep dataset.state === "error" so the throttled re-ensure doesn't clobber
        // the "Copied!" tooltip; it persists until the next real state change.
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(msg).then(() => {
            el.title = "Copied!";
          }).catch(() => {});
        }
      };
    }
  }
}

function setThemeStatus(state, err) {
  themeStatusState = state;
  if (state === "error") themeStatusError = err || "Unknown error";
  ensureStatusIcon();
}

function applyTheme(themeData, dark) {
  const pane = paneRoot();
  const list = threadContainer();
  if (!pane) return false;
  const v = pickVariant(themeData, dark);
  if (!v) return false;

  const colors = Array.isArray(v.gradient_colors) ? v.gradient_colors : [];
  const grad = gradientCss(colors);
  const bgImg = largestAsset(v.thread_background_asset);
  const bgColor = argbToRgba(v.thread_background_color);
  const inc = argbToRgba(v.incoming_message_bubble_color);
  const outSolid = argbToRgba(colors[0] || v.fallback_color);
  const accent = argbToRgba(v.emphasized_action_color || v.fallback_color || colors[0]);
  const outText = argbToRgba(v.outbound_message_text_color);
  const incText = argbToRgba(v.inbound_message_text_color);
  const navText = argbToRgba(v.navigation_bar_title_color || v.navigation_bar_icon_color);
  const composerBtn = argbToRgba(v.composer_secondary_button_color) || navText;
  const composerBg = argbToRgba(v.solid_composer_background_color || v.thread_background_color);
  const composerInput = argbToRgba(v.composer_input_background_color) || composerBg;
  // The message-bar (input pill) colour — also reused for reaction pills so they
  // match. AI themes ship a near-black composer_input_background_color, so for them
  // derive from the lavender accent (darker in dark mode, lighter in light mode).
  const isAITheme = /ai theme/i.test((themeData.name || "").trim());
  const lavBase = outSolid || inc || bgColor;
  let pillColor = composerInput;
  if (isAITheme && lavBase) {
    pillColor = dark
      ? { r: Math.round(lavBase.r * 0.5), g: Math.round(lavBase.g * 0.5), b: Math.round(lavBase.b * 0.5), a: 1 }
      : {
          r: Math.round(lavBase.r + (255 - lavBase.r) * 0.55),
          g: Math.round(lavBase.g + (255 - lavBase.g) * 0.55),
          b: Math.round(lavBase.b + (255 - lavBase.b) * 0.55),
          a: 1,
        };
  }

  pane.dataset[PANE_FLAG] = "1";

  // Background image spans the WHOLE pane (header + messages + composer), lightly
  // scrimmed in the theme's base colour for legibility.
  if (bgColor) pane.style.backgroundColor = rgbaStr(bgColor);
  if (bgImg) {
    const s = bgColor
      ? "rgba(" + bgColor.r + ", " + bgColor.g + ", " + bgColor.b + ", 0.4)"
      : "rgba(0, 0, 0, 0.4)";
    pane.style.backgroundImage =
      "linear-gradient(" + s + ", " + s + '), url("' + bgImg + '")';
    pane.style.backgroundSize = "cover";
    pane.style.backgroundPosition = "center";
    pane.style.backgroundRepeat = "no-repeat";
  } else if (grad) {
    pane.style.backgroundImage = grad;
  }
  // Let the pane background show through the scroll list, header and composer.
  if (list) {
    list.style.backgroundColor = "transparent";
    list.style.backgroundImage = "none";
    list.dataset[BG_FLAG] = "1";
  }

  const set = (k, val) => {
    if (val != null) pane.style.setProperty(k, val);
  };
  if (accent) set("--mwp-primary-theme-color", rgbaStr(accent));
  if (inc) {
    set("--ig-incoming-message-bubble", tripleStr(inc));
    set("--chat-incoming-message-bubble-background-color", rgbaStr(inc));
  }
  if (outSolid) {
    set("--ig-outgoing-message-bubble", tripleStr(outSolid));
    set("--chat-outgoing-message-bubble-background-color", rgbaStr(outSolid));
  }
  // Header: transparent so the pane image shows behind it. Composer (message
  // bar) outer area: the theme's solid composer colour.
  set("--mwp-header-background-color", "transparent");
  // Composer surround = thread background (blends with the chat); the pill itself
  // gets the solid composer colour below so it stands out.
  if (bgColor) set("--chat-composer-background-color", rgbaStr(bgColor));

  // Forced colours (the var chains IG uses for text are unreliable to override):
  //   - outgoing bubble: theme gradient + outbound text colour
  //   - incoming bubble text: inbound text colour
  //   - header + composer icons/text: nav / composer button colours
  const P = "[data-instafn-dm-pane] ";
  const rules = [];
  // Sent bubble = solid theme colour (matches the mobile app; no gradient).
  if (outSolid)
    rules.push(
      P + OUTGOING_BUBBLE_SELECTOR +
        "{background-image:none !important;background-color:" + rgbaStr(outSolid) + " !important;}"
    );
  if (outText) rules.push(P + OUTGOING_BUBBLE_SELECTOR + ", " + P + OUTGOING_BUBBLE_SELECTOR + " *{color:" + rgbaStr(outText) + " !important;}");
  if (incText) rules.push(P + INCOMING_BUBBLE_SELECTOR + ", " + P + INCOMING_BUBBLE_SELECTOR + " *{color:" + rgbaStr(incText) + " !important;}");
  // Corner mask: IG fakes grouped-bubble corners with a 10px outline/box-shadow
  // (class .x1k4qllp) painted in --mwp-message-row-background, sitting over a dark
  // message-row background. A solid carve covers that dark layer; making the carve
  // transparent just exposes it (black notches over the image). The true fix is to
  // remove the outline/box-shadow on the bubbles so the rounded bubble floats
  // directly on the themed background — corners show the real image through.
  rules.push("[data-instafn-dm-bg] *{--mwp-message-row-background:transparent !important;}");
  rules.push(
    "[data-instafn-dm-bg] " + INCOMING_BUBBLE_SELECTOR + ", " +
      "[data-instafn-dm-bg] " + OUTGOING_BUBBLE_SELECTOR +
      "{outline:none !important;box-shadow:none !important;}"
  );
  // Shared posts/reels sent in chat are rich cards whose dark surfaces are
  // card-specific elements (NOT --card-background): the rounded body (.xlp1x4z /
  // .x1pczhz8) AND the author header strip + caption strip (.xz9dl7a.xpdmqnj
  // .xsag5q8.x1g0dm76). Colour those so the whole card reads as a chat surface.
  // EXCLUDE absolute OVERLAY elements that share those 4 classes — the reel "Clip"
  // badge (bottom-left) and a reel's header overlay (over the video) — via the
  // overlay classes x1ey2m1c / x10l6tqk / x1vjfegm, so the badge keeps its native
  // look and the reel header stays transparent.
  if (inc) {
    const card = rgbaStr(inc);
    rules.push(
      "[data-instafn-dm-bg] .xlp1x4z, " +
        "[data-instafn-dm-bg] .x1pczhz8, " +
        "[data-instafn-dm-bg] .xz9dl7a.xpdmqnj.xsag5q8.x1g0dm76:not(.x1ey2m1c):not(.x10l6tqk):not(.x1vjfegm)" +
        "{background-color:" + card + " !important;background-image:none !important;}"
    );
  }
  // Reaction pill (e.g. "❤️ 2" under a message) = the SAME colour as the message
  // bar (input pill). Target the pill container by its distinctive class combo.
  if (pillColor) {
    rules.push(
      "[data-instafn-dm-bg] .xu2v3tx.x1rpy9zp.x1iajtwn" +
        "{background-color:" + rgbaStr(pillColor) + " !important;}"
    );
  }
  // Remove the header's bottom separator line. IG draws it on the header pagelet's
  // own wrapper chain (it has moved between class names — currently a child div of
  // the pagelet), so cover the pagelet, its descendants, its parent and grandparent,
  // plus any ::after, with border-bottom:none + box-shadow:none.
  const HDR = '[data-pagelet="IGDInboxHeaderOffMsys"]';
  rules.push(
    P + HDR + ", " +
      P + HDR + " > *, " +
      P + HDR + " > * > *, " +
      P + ":has(> " + HDR + "), " +
      P + ":has(> * > " + HDR + ")" +
      "{border-bottom:none !important;box-shadow:none !important;}"
  );
  rules.push(
    P + HDR + "::after, " +
      P + HDR + " > *::after, " +
      P + ":has(> " + HDR + ")::after" +
      "{display:none !important;}"
  );
  if (navText) rules.push(P + '[data-pagelet="IGDInboxHeaderOffMsys"], ' + P + '[data-pagelet="IGDInboxHeaderOffMsys"] *{color:' + rgbaStr(navText) + " !important;}");
  if (composerBtn) rules.push(P + '[data-pagelet^="IGDComposer"] svg, ' + P + '[data-pagelet^="IGDComposer"] [contenteditable]{color:' + rgbaStr(composerBtn) + " !important;}");
  // The input pill + "Replying to…" bar render black: IG derives their surfaces
  // from the base IG background TRIPLES. Map every composer surface to the thread
  // background (so the reply bar blends with the chat) and drop composer borders.
  // Emoji/sticker popups are in a portal, untouched.
  if (bgColor || composerInput) {
    const baseC = rgbaStr(bgColor || composerInput);
    const baseTri = tripleStr(bgColor || composerInput);
    rules.push(
      P + '[data-pagelet^="IGDComposer"] *{' +
        "--ig-primary-background:" + baseTri + " !important;" +
        "--ig-secondary-background:" + baseTri + " !important;" +
        "--ig-elevated-background:" + baseTri + " !important;" +
        "--ig-highlight-background:" + baseTri + " !important;" +
        "--ig-banner-background:" + baseTri + " !important;" +
        "--comment-background:" + baseC + " !important;" +
        "--card-background:" + baseC + " !important;" +
        "--messenger-card-background:" + baseC + " !important;" +
        "border-color:transparent !important;box-shadow:none !important;}"
    );
    // Kill the drop shadow / scroll-shadow that sits above the composer bar (on the
    // composer pagelet and the wrapper around it).
    rules.push(
      P + '[data-pagelet^="IGDComposer"], ' +
        P + ':has(> [data-pagelet^="IGDComposer"])' +
        "{box-shadow:none !important;}"
    );
    // Input pill = pillColor (hoisted above; composer_input_background_color, or a
    // mode-aware lavender for AI themes). Target the rounded container holding the
    // text input (not the round icon buttons / reply bar).
    if (pillColor) {
      rules.push(
        P + '[data-pagelet^="IGDComposer"] .x1ua1ujl.xksyday:has([contenteditable])' +
          "{background-color:" + rgbaStr(pillColor) + " !important;}"
      );
    }
  }
  ensureStyleEl().textContent = rules.join("\n");
  return true;
}

// One inbox call returns ~20 threads. Cache the canonical-id resolution for ALL
// of them (keyed by every id form IG might put in the URL) AND a PARTIAL theme
// (colors from the inbox; no background image) per thread. So after the first
// inbox fetch, switching to any recent chat needs no inbox call, and its colours
// can paint instantly while the full thread (with the bg image) loads.
function ingestInboxThreads(threads) {
  const now = Date.now();
  for (const t of threads) {
    const cid = String(t.thread_id || t.thread_v2_id || "");
    if (!cid) continue;
    [t.thread_id, t.thread_v2_id, t.thread_fbid].forEach((k) => {
      if (k != null) canonicalByUrlId.set(String(k), cid);
    });
    if (!t.is_group) {
      (t.users || []).forEach((u) => {
        [u.pk, u.fbid, u.id, u.interop_messaging_user_fbid].forEach((k) => {
          if (k != null) canonicalByUrlId.set(String(k), cid);
        });
      });
    }
    const existing = themeCache.get(cid);
    if (!existing || existing.partial) {
      themeCache.set(cid, { theme: extractTheme(t), ts: now, partial: true });
    }
  }
}

async function resolveCanonicalId(urlId) {
  if (canonicalByUrlId.has(urlId)) return canonicalByUrlId.get(urlId);
  // Don't hammer the inbox for a chat we just failed to resolve (e.g. not in the
  // top-20 inbox). Retry at most once a minute.
  const missTs = canonicalMissAt.get(urlId);
  if (missTs && Date.now() - missTs < CANONICAL_MISS_TTL_MS) return null;
  const inbox = await igGetJson(
    "/api/v1/direct_v2/inbox/?visual_message_return_type=unseen&thread_message_limit=1&persistentBadging=true&limit=20"
  );
  const threads = (inbox && inbox.inbox && inbox.inbox.threads) || [];
  ingestInboxThreads(threads);
  if (canonicalByUrlId.has(urlId)) {
    canonicalMissAt.delete(urlId);
    return canonicalByUrlId.get(urlId);
  }
  // Fuzzy fallback for a urlId form ingest didn't key directly.
  const pick = threads.find((t) => JSON.stringify(t).indexOf(urlId) !== -1);
  const id = pick && String(pick.thread_id || pick.thread_v2_id || "");
  if (id) {
    canonicalByUrlId.set(urlId, id);
    canonicalMissAt.delete(urlId);
    return id;
  }
  canonicalMissAt.set(urlId, Date.now());
  return null;
}

// The current chat's already-resolved theme, kept in memory so we can re-apply it
// instantly (switching back to a chat, or after IG re-renders the pane) with no
// await and no network.
let current = null; // { urlId, theme }

// Apply current.theme to the DOM. Synchronous + network-free → instant. Safe to
// call repeatedly: no-ops when the theme is already applied and the pane is still
// present, and otherwise (re)applies — so it themes the pane the moment it renders
// and restores styling if IG re-rendered over it.
function applyCurrent(forceApply) {
  if (!current) return;
  const urlId = parseThreadIdFromPath();
  if (!urlId || urlId !== current.urlId) return;
  const theme = current.theme;
  const dark = isDarkMode();
  lastDark = dark;
  const hasTheme = theme && theme.data && theme.themeId !== DEFAULT_THEME_ID;
  const key = urlId + "|" + (hasTheme ? theme.themeId + ":" + (dark ? "D" : "L") : "default");
  // Consider it applied only if BOTH the pane and the message-list flags are still
  // present. IG re-renders the message list when the reply bar opens/closes; if we
  // only checked the pane we'd skip re-applying and the list-scoped rules (corner
  // mask, etc.) would be lost on the fresh list — re-apply when either is missing.
  const themed =
    !!document.querySelector("[data-instafn-dm-pane]") &&
    !!document.querySelector("[data-instafn-dm-bg]");
  if (!forceApply && key === lastAppliedKey && (!hasTheme || themed)) return;
  if (hasTheme) {
    if (applyTheme(theme.data, dark)) lastAppliedKey = key;
  } else {
    clearTheme();
    lastAppliedKey = key;
  }
}

// Resolve the current chat's theme (canonical id + theme, both cached) into
// `current`, then apply. Network only on cache miss / TTL expiry / forceFetch.
async function refresh(forceApply, forceFetch) {
  const urlId = parseThreadIdFromPath();
  if (!urlId) {
    clearTheme();
    lastAppliedKey = null;
    current = null;
    setThemeStatus("idle");
    return;
  }
  // After a fetch error, let only EXPLICIT actions (chat switch / live theme change)
  // retry within the backoff window; suppress the poll/focus auto-retries so we
  // don't hammer IG (e.g. during a rate-limit) and risk a block.
  const auto = !forceApply && !forceFetch;
  if (auto) {
    const eb = errorBackoffAt.get(urlId);
    if (eb && Date.now() - eb < ERROR_BACKOFF_MS) return;
  }
  if (resolving) return;
  resolving = true;
  // Show the spinner only when this will actually touch the network (a cache miss,
  // a stale/partial entry, or a forced refetch) — fully-cached chats apply instantly.
  const cid0 = canonicalByUrlId.get(urlId);
  const cached0 = cid0 ? themeCache.get(cid0) : null;
  const willFetch =
    forceFetch || !cid0 || !cached0 || cached0.partial || Date.now() - cached0.ts >= THEME_TTL_MS;
  // Spinner only on a COLD load (nothing to show yet). If colours are already
  // cached (partial from the inbox, or a full revisit), paint them and let the
  // background-image upgrade fetch silently — no spinner.
  const havePaint = !!(cached0 && cached0.theme && cached0.theme.data);
  if (willFetch && !havePaint) setThemeStatus("loading");
  try {
    const canonicalId = await resolveCanonicalId(urlId);
    if (parseThreadIdFromPath() !== urlId) return;
    if (!canonicalId) {
      // Couldn't resolve the thread (not in inbox) — not a fetch error; just no theme.
      setThemeStatus("idle");
      return;
    }
    // Phase 1: paint colours immediately from the inbox-derived partial theme (no
    // extra network) so the chat isn't blank while the full theme loads.
    if (willFetch) {
      const partial = themeCache.get(canonicalId);
      if (partial && partial.theme && partial.theme.data) {
        current = { urlId, theme: partial.theme };
        applyCurrent(forceApply);
      }
    }
    // Phase 2: full theme (adds the background image). No-ops the network if a
    // fresh full entry already exists (e.g. a cached revisit).
    const theme = await fetchThemeCached(canonicalId, forceFetch);
    if (parseThreadIdFromPath() !== urlId) return;
    current = { urlId, theme };
    errorBackoffAt.delete(urlId);
    setThemeStatus("idle");
    applyCurrent(willFetch ? true : forceApply);
  } catch (e) {
    errorBackoffAt.set(urlId, Date.now());
    setThemeStatus("error", (e && (e.stack || e.message)) || String(e));
  } finally {
    resolving = false;
  }
}

function handleNavigation() {
  const urlId = parseThreadIdFromPath();
  if (urlId !== currentUrlId) {
    currentUrlId = urlId;
    lastAppliedKey = null;
    current = null;
    clearTheme();
    // Switch: resolve from cache (no ping for seen chats); applyCurrent then runs
    // on each render mutation below, so a cached theme paints as soon as the pane
    // exists — no 250ms debounce, no waiting on the poll.
    if (urlId) refresh(true, false);
  }
}

let lastThemeMsgRefresh = 0;
let lastApplyTick = 0;
function onMutation(mutations) {
  // Detect chat switches immediately (guarded by URL change — no debounce).
  if (parseThreadIdFromPath() !== currentUrlId) handleNavigation();
  // Paint from the in-memory cache as soon as the new pane renders, and restore
  // styling if IG re-rendered over it. Sync + network-free; throttled lightly.
  const now = Date.now();
  if (now - lastApplyTick > 50) {
    lastApplyTick = now;
    applyCurrent(false);
    ensureStatusIcon(); // re-insert spinner/error glyph if IG re-rendered the header
  }
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === 1 && /changed the theme to/i.test(node.textContent || "")) {
        if (now - lastThemeMsgRefresh > 3000) {
          lastThemeMsgRefresh = now;
          // Live theme change: bypass the cache and refetch this chat's theme.
          refresh(true, true);
        }
        return;
      }
    }
  }
}

export function initDMThemeDebug() {
  installPersistentStyles();
  handleNavigation();
  if (!navObserver) {
    navObserver = new MutationObserver(onMutation);
    navObserver.observe(document.body, { childList: true, subtree: true });
  }
  // Re-apply when IG's light/dark mode flips (its own toggle changes the root
  // class; the OS setting can also change).
  if (!htmlObserver) {
    lastDark = isDarkMode();
    htmlObserver = new MutationObserver(() => {
      const d = isDarkMode();
      if (d !== lastDark) {
        lastDark = d;
        // Mode flip: re-apply the other variant straight from the cached theme
        // (instant, no ping — theme_data carries both light and dark palettes).
        applyCurrent(true);
      }
    });
    htmlObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    if (window.matchMedia) {
      try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
          applyCurrent(true);
        });
      } catch (_) {}
    }
  }
  if (!pollTimer) {
    // Light keep-alive: re-apply if IG re-rendered the pane. Uses the cache, so it
    // only touches the network when a chat's cached theme has gone stale (TTL).
    pollTimer = setInterval(() => {
      if (parseThreadIdFromPath()) refresh(false, false);
    }, POLL_MS);
  }
  window.addEventListener("focus", () => {
    if (parseThreadIdFromPath()) refresh(false, false);
  });
  console.log("[Instafn DM-bg] active — theme (mode-aware) applied to bubbles, background & reactions.");
}
