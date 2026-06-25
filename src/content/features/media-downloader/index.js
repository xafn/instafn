/**
 * Media Downloader — orchestrator.
 *
 * Owns lifecycle for all the per-surface injectors: reads the settings, wires a
 * single debounced MutationObserver + a light interval + url-change re-scan
 * (Instagram is a heavily virtualized SPA, so buttons must be re-applied as the
 * DOM recycles), and tears everything down when disabled. Every injector is
 * idempotent, so re-scanning is cheap.
 */

import { injectStylesheet } from "../../utils/styleLoader.js";
import { injectScript } from "../../utils/scriptInjector.js";
import { watchUrlChanges } from "../../utils/domObserver.js";
import { SETTINGS_KEYS, DOWNLOAD_DEFAULTS } from "./config.js";
import { injectPostButtons, removePostButtons } from "./inject-posts.js";
import { injectReelButtons, removeReelButtons } from "./inject-reels.js";
import { injectStoryButton, removeStoryButton } from "./inject-stories.js";
import {
  injectProfilePicButton,
  removeProfilePicButton,
} from "./inject-profile-pic.js";
import { injectAudioButtons, removeAudioButtons } from "./inject-audio.js";
import {
  injectChatImageButtons,
  removeChatImageButtons,
} from "./inject-chat-images.js";

let started = false;
let opts = { ...DOWNLOAD_DEFAULTS };
let observer = null;
let intervalId = null;
let urlCleanup = null;
let scanQueued = false;

function ensureStyles() {
  injectStylesheet(
    "content/features/media-downloader/media-downloader.css",
    "instafn-media-downloader"
  );
}

// Run the enabled injectors. Cheap + idempotent, safe to call often.
function scan() {
  scanQueued = false;
  try {
    if (opts[SETTINGS_KEYS.posts]) injectPostButtons();
    if (opts[SETTINGS_KEYS.reels]) injectReelButtons();
    if (opts[SETTINGS_KEYS.stories]) injectStoryButton();
    if (opts[SETTINGS_KEYS.profilePics]) injectProfilePicButton();
    if (opts[SETTINGS_KEYS.audio]) injectAudioButtons();
    // DM in-chat image downloads (the injector self-limits to /direct/ and image
    // messages).
    if (opts[SETTINGS_KEYS.chatImages]) injectChatImageButtons();
  } catch (err) {
    console.error("[Instafn] media-downloader scan error:", err);
  }
}

function queueScan() {
  if (scanQueued) return;
  scanQueued = true;
  requestAnimationFrame(scan);
}

function start() {
  if (started) return;
  started = true;
  ensureStyles();

  // Page-context sniffer that captures DM voice-note .ogg urls from the
  // /api/graphql thread payload (the only place they appear). Injected early so
  // it's wrapping fetch/XHR before the conversation loads. Idempotent + harmless
  // when audio downloads are off, but only needed for that path.
  if (opts[SETTINGS_KEYS.audio]) {
    injectScript("content/features/media-downloader/voice-sniffer.js");
  }

  observer = new MutationObserver(() => queueScan());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Safety net for surfaces that mutate without bubbling childList changes we
  // catch (e.g. story tap-through swapping content in place).
  intervalId = setInterval(scan, 1500);

  urlCleanup = watchUrlChanges(() => {
    // Story/reel/profile context changed — clear stale per-context flags so the
    // new context gets its button immediately.
    queueScan();
    setTimeout(scan, 300);
    setTimeout(scan, 900);
  });

  scan();
  setTimeout(scan, 500);
  setTimeout(scan, 1500);
}

function stop() {
  started = false;
  observer?.disconnect();
  observer = null;
  if (intervalId) clearInterval(intervalId);
  intervalId = null;
  urlCleanup?.();
  urlCleanup = null;
  removePostButtons();
  removeReelButtons();
  removeStoryButton();
  removeProfilePicButton();
  removeAudioButtons();
  removeChatImageButtons();
}

/**
 * Initialize from a settings object (the content-script DOMContentLoaded block
 * passes the resolved chrome.storage values straight in).
 */
export function initMediaDownloader(settings = {}) {
  opts = { ...DOWNLOAD_DEFAULTS, ...settings };
  const masterOn = !!opts[SETTINGS_KEYS.master];
  if (masterOn) start();
  else stop();
}

/** React to live settings changes from chrome.storage.onChanged. */
export function updateMediaDownloaderSettings(settings = {}) {
  initMediaDownloader(settings);
}
