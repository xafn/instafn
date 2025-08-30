// Main content script - orchestrates all Instafn functionality

import {
  interceptStoryQuickReactions,
  interceptStoryReplies,
  interceptLikes,
  interceptComments,
  interceptCalls,
  interceptFollows,
} from "./modules/interceptors.js";

import {
  scanFollowersAndFollowing,
  fetchUserInfo,
} from "./modules/followAnalyzer.js";

import {
  injectScanButton,
  openModal,
  createFollowButton,
  renderScanButton,
  confirmWithModal,
} from "./modules/ui.js";

import { initVideoScrubber } from "./modules/videoScrubber.js";

// Initialize user info cache
window.userInfoCache = new Map();

// Inject the story blocking script into the page context
function injectStoryBlocking() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content/storyblocking.js");
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.error("Instafn: Error injecting story blocking script:", err);
  }
}

// Inject CSS styles
function injectPageStyles() {
  try {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.type = "text/css";
    link.href = chrome.runtime.getURL("styles/styles.css");
    (document.head || document.documentElement).appendChild(link);
  } catch (err) {
    console.error("Instafn: Error injecting styles:", err);
  }
}

// Wait until the DOM is ready for other features
document.addEventListener("DOMContentLoaded", () => {
  // Load user settings
  chrome.storage.sync.get(
    {
      blockStorySeen: true,
      confirmLikes: true,
      confirmComments: true,
      confirmCalls: true,
      confirmFollow: true,
      confirmStoryQuickReactions: true,
      confirmStoryReplies: true,
      activateFollowAnalyzer: true,
      enableVideoScrubber: false,
    },
    (settings) => {
      if (settings.confirmLikes) interceptLikes();
      if (settings.confirmComments) interceptComments();
      if (settings.confirmCalls) interceptCalls();
      if (settings.confirmFollow) interceptFollows();
      if (settings.confirmStoryQuickReactions) interceptStoryQuickReactions();
      if (settings.confirmStoryReplies) interceptStoryReplies();

      // Initialize video scrubber
      initVideoScrubber(settings.enableVideoScrubber);

      // If this is a fresh install, enable follow analyzer by default
      chrome.storage.sync.get(null, (allSettings) => {
        if (Object.keys(allSettings).length === 0) {
          chrome.storage.sync.set({ activateFollowAnalyzer: true });
        }
      });
    }
  );
});

// Inject story blocking immediately
injectStoryBlocking();

// Inject styles immediately
injectPageStyles();

// Listen for messages from the bridge script
window.addEventListener("message", async (event) => {
  if (event.source !== window || event.data?.source !== "instafn") return;

  if (event.data.type === "SCAN_FOLLOWERS") {
    try {
      await scanFollowersAndFollowing();
    } catch (err) {
      console.error("Instafn: Scan failed:", err);
      alert("Scan failed: " + err.message);
    }
  }
});

// Inject scan button when on profile pages
function checkAndInjectScanButton() {
  const path = window.location.pathname;
  const isProfilePage = path.match(/^\/([^\/]+)\/?$/);

  if (isProfilePage) {
    setTimeout(() => injectScanButton(), 500);
    setTimeout(() => injectScanButton(), 1500);
    setTimeout(() => injectScanButton(), 3000);
  }
}

// Check for profile pages on navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    checkAndInjectScanButton();
  }
}).observe(document, { subtree: true, childList: true });

// Initial check
checkAndInjectScanButton();

// Listen for storage changes to update video scrubber
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.enableVideoScrubber) {
    initVideoScrubber(changes.enableVideoScrubber.newValue);
  }
});

// Export functions for global access
window.Instafn = {
  scanFollowers: scanFollowersAndFollowing,
  injectScanButton,
  openModal,
  createFollowButton,
  fetchUserInfo,
  renderScanButton,
  confirmWithModal,
};
