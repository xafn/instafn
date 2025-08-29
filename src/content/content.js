// Main content script - orchestrates all Instafn functionality

import {
  interceptStoryQuickReactions,
  interceptStoryReplies,
  interceptLikes,
  interceptComments,
  interceptCalls,
  interceptFollows,
} from "./modules/interceptors.js";

import { scanFollowersAndFollowing } from "./modules/followAnalyzer.js";

import {
  injectStyles,
  injectScanButton,
  openModal,
  createFollowButton,
  fetchUserInfo,
  renderScanButton,
  confirmWithModal,
} from "./modules/ui.js";

import { initVideoScrubber } from "./modules/videoScrubber.js";

// Initialize user info cache
window.userInfoCache = new Map();

console.log("Instafn: Content script loaded");

// Inject the story blocking script into the page context
function injectStoryBlocking() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content/storyblocking.js");
    script.onload = function() {
      console.log("Instafn: Story blocking script loaded successfully");
    };
    script.onerror = function() {
      console.error("Instafn: Failed to load story blocking script");
    };
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
    link.onload = function() {
      console.log("Instafn: Styles loaded successfully");
    };
    link.onerror = function() {
      console.error("Instafn: Failed to load styles");
    };
    (document.head || document.documentElement).appendChild(link);
  } catch (err) {
    console.error("Instafn: Error injecting styles:", err);
  }
}

// Wait until the DOM is ready for other features
document.addEventListener("DOMContentLoaded", () => {
  console.log("Instafn: DOM loaded, initializing other features...");

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
      console.log("Instafn: Settings loaded:", settings);
      if (settings.blockStorySeen) {
        console.log("Instafn: Story blocking enabled via settings");
      }
      if (settings.confirmLikes) interceptLikes();
      if (settings.confirmComments) interceptComments();
      if (settings.confirmCalls) interceptCalls();
      if (settings.confirmFollow) interceptFollows();
      if (settings.confirmStoryQuickReactions) interceptStoryQuickReactions();
      if (settings.confirmStoryReplies) interceptStoryReplies();

      // Initialize video scrubber
      if (settings.enableVideoScrubber) {
        console.log("Instafn: Video scrubber enabled");
        initVideoScrubber(true);
      } else {
        console.log("Instafn: Video scrubber disabled");
        initVideoScrubber(false);
      }

      // Follow analyzer is now always available since we're using Vite
      if (settings.activateFollowAnalyzer) {
        console.log("Instafn: Follow analyzer enabled");
      } else {
        console.log("Instafn: Follow analyzer disabled");
      }

      // If this is a fresh install (no settings saved yet), enable follow analyzer by default
      chrome.storage.sync.get(null, (allSettings) => {
        if (Object.keys(allSettings).length === 0) {
          console.log(
            "Instafn: Fresh install detected, enabling follow analyzer by default"
          );
          chrome.storage.sync.set({ activateFollowAnalyzer: true }, () => {
            console.log("Instafn: Follow analyzer enabled for fresh install");
          });
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
  if (event.source !== window) return;
  if (event.data.source !== "instafn") return;

  if (event.data.type === "SCAN_FOLLOWERS") {
    try {
      console.log("Instafn: Received scan request from bridge");
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
  console.log("Instafn: Checking path for scan button injection:", path);

  // Check if we're on a profile page (any single username path)
  const isProfilePage = path.match(/^\/([^\/]+)\/?$/);

  if (isProfilePage) {
    console.log(
      "Instafn: Profile page detected, attempting to inject scan button"
    );
    // Try multiple times with increasing delays
    setTimeout(() => injectScanButton(), 500);
    setTimeout(() => injectScanButton(), 1500);
    setTimeout(() => injectScanButton(), 3000);
  } else {
    console.log("Instafn: Not a profile page, skipping scan button injection");
  }
}

// Check for profile pages on navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    console.log("Instafn: URL changed, checking for scan button injection");
    checkAndInjectScanButton();
  }
}).observe(document, { subtree: true, childList: true });

// Initial check
checkAndInjectScanButton();

// Listen for storage changes to update video scrubber
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.enableVideoScrubber) {
    const newValue = changes.enableVideoScrubber.newValue;
    console.log("Instafn: Video scrubber setting changed to:", newValue);
    initVideoScrubber(newValue);
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

// Log available functions to console
console.log("Instafn: Available functions:", Object.keys(window.Instafn));
console.log(
  "Instafn: Use 'Instafn.scanFollowers()' in console to analyze followers"
);
