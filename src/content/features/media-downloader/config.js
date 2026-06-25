/**
 * Media Downloader — shared configuration & constants.
 *
 * One self-contained feature folder that adds "download" affordances all over
 * Instagram web: posts (incl. carousels), reels, stories, profile pictures and
 * DM voice messages. Everything resolves the *highest quality* source straight
 * from Instagram's own private web API (the same `X-IG-App-ID` credentialed
 * endpoints the rest of the extension already uses) and hands the final CDN URL
 * to the background service worker, which saves it via `chrome.downloads` — that
 * path is CORS-free and forces a real "Save" with a sensible filename.
 */

// Instagram's public web App-ID. Used by every other feature in this extension
// (follow-analyzer, profile-pic-popup, …) for credentialed private-API calls.
export const IG_APP_ID = "936619743392459";
export const IG_ASBD_ID = "129477";

// chrome.runtime message type the background worker listens for.
export const DOWNLOAD_MSG = "INSTAFN_DOWNLOAD";

// Settings keys owned by this feature. The master switch gates everything; the
// per-surface toggles decide where buttons appear.
export const SETTINGS_KEYS = {
  master: "enableMediaDownloader",
  posts: "downloadOnPosts",
  reels: "downloadOnReels",
  stories: "downloadOnStories",
  profilePics: "downloadProfilePictures",
  audio: "downloadAudioMessages",
  chatImages: "downloadChatImages",
  askLocation: "downloadAskLocation",
  askQuality: "downloadAskQuality",
  embedMetadata: "downloadEmbedMetadata",
};

// Defaults for the keys above. Mirrored into settings.js / content.js /
// background.js default blocks (kept in sync by hand, like every other feature).
export const DOWNLOAD_DEFAULTS = {
  [SETTINGS_KEYS.master]: false,
  [SETTINGS_KEYS.posts]: true,
  [SETTINGS_KEYS.reels]: true,
  [SETTINGS_KEYS.stories]: true,
  [SETTINGS_KEYS.profilePics]: true,
  [SETTINGS_KEYS.audio]: true,
  [SETTINGS_KEYS.chatImages]: true,
  [SETTINGS_KEYS.askLocation]: false,
  [SETTINGS_KEYS.askQuality]: false,
  [SETTINGS_KEYS.embedMetadata]: true,
};

// Attribute stamped on every element we've already processed so re-scans (from
// the MutationObserver / interval / url-change) are cheap idempotent no-ops.
export const PROCESSED_ATTR = "data-instafn-dl";

// Marker class on our injected buttons (used for cleanup when disabling).
export const BUTTON_CLASS = "instafn-dl-btn";
