import {
  interceptStoryQuickReactions,
  interceptStoryReplies,
  interceptLikes,
  interceptComments,
  interceptCalls,
  interceptFollows,
  interceptReposts,
  interceptTypingReceipts,
} from "./features/action-interceptors/index.js";

import {
  scanFollowersAndFollowing,
  fetchUserInfo,
  injectScanButton,
  openModal,
  createFollowButton,
  renderScanButton,
  confirmWithModal,
} from "./features/follow-analyzer/index.js";

import { initVideoScrubber } from "./features/video-scrubber/videoScrubber.js";
import { injectProfilePicPopupOverlay } from "./features/profile-pic-popup/index.js";
import { initHideRecentSearches } from "./features/search-cleaner/index.js";
import { initTabDisabler } from "./features/tab-disabler/index.js";
import {
  initDMPopupHider,
  enableDMDebug,
} from "./features/dm-popup-hider/index.js";
import { injectBrandingStyles } from "./features/branding/index.js";

// Initialize user info cache
window.userInfoCache = new Map();

// Initialize global Instafn object immediately (before DOMContentLoaded)
window.Instafn = window.Instafn || {};

// Add enableDMDebug placeholder (will be replaced when module loads)
window.Instafn.enableDMDebug = function() {
  console.log(
    "[Instafn] DM debug function not yet loaded. Please wait a moment and try again, or reload the page."
  );
};

// Inject the story blocking script into the page context
function injectStoryBlocking() {
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(
      "content/features/story-blocking/storyblocking.js"
    );
    const target =
      document.head || document.documentElement || document.body || null;
    if (target) {
      target.appendChild(script);
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          const readyTarget =
            document.head || document.documentElement || document.body;
          if (readyTarget) {
            readyTarget.appendChild(script);
          }
        },
        { once: true }
      );
    }
  } catch (err) {
    console.error("Instafn: Error injecting story blocking script:", err);
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
      confirmReposts: true,
      confirmStoryQuickReactions: true,
      confirmStoryReplies: true,
      activateFollowAnalyzer: true,
      enableVideoScrubber: false,
      enableProfilePicPopup: true,
      enableHighlightPopup: true, // ADD THIS default
      blockTypingReceipts: true,
      hideRecentSearches: true,
      disableTabSearch: false,
      disableTabExplore: false,
      disableTabReels: false,
      disableTabMessages: false,
      disableTabNotifications: false,
      disableTabCreate: false,
      disableTabProfile: false,
      disableTabMoreFromMeta: false,
      hideDMPopup: false,
    },
    (settings) => {
      if (settings.confirmLikes) interceptLikes();
      if (settings.confirmComments) interceptComments();
      if (settings.confirmCalls) interceptCalls();
      if (settings.confirmFollow) interceptFollows();
      if (settings.confirmReposts) interceptReposts();
      if (settings.confirmStoryQuickReactions) interceptStoryQuickReactions();
      if (settings.confirmStoryReplies) interceptStoryReplies();
      if (settings.blockTypingReceipts) interceptTypingReceipts();

      // Initialize video scrubber
      initVideoScrubber(settings.enableVideoScrubber);
      // Enable profile pic popup and highlight popup
      injectProfilePicPopupOverlay(
        settings.enableProfilePicPopup,
        settings.enableHighlightPopup
      );

      // Hide recent searches in the search overlay if enabled
      initHideRecentSearches(settings.hideRecentSearches);

      // Initialize tab disabler
      initTabDisabler(settings);

      // Initialize DM popup hider
      initDMPopupHider(settings);

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

// Inject branding styles immediately
injectBrandingStyles();

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
let scanButtonTimeout = null;
function checkAndInjectScanButton() {
  const path = window.location.pathname;
  const isProfilePage = path.match(/^\/([^\/]+)\/?$/);

  if (isProfilePage) {
    // Clear any pending timeout to avoid multiple calls
    if (scanButtonTimeout) {
      clearTimeout(scanButtonTimeout);
    }
    // Try immediately first
    injectScanButton();
    // Then try again after a delay if the button wasn't placed (e.g., DOM not ready)
    scanButtonTimeout = setTimeout(() => {
      if (!document.querySelector(".instafn-scan-btn")) {
        injectScanButton();
      }
    }, 1000);
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

// Listen for storage changes to update video scrubber and search cleaner
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.enableVideoScrubber) {
    initVideoScrubber(changes.enableVideoScrubber.newValue);
  }
  if (namespace === "sync" && changes.hideRecentSearches) {
    initHideRecentSearches(changes.hideRecentSearches.newValue);
  }
  // Handle tab disabler settings changes
  if (namespace === "sync") {
    const tabDisablerKeys = [
      "disableTabSearch",
      "disableTabExplore",
      "disableTabReels",
      "disableTabMessages",
      "disableTabNotifications",
      "disableTabCreate",
      "disableTabProfile",
      "disableTabMoreFromMeta",
    ];
    if (tabDisablerKeys.some((key) => key in changes)) {
      chrome.storage.sync.get(
        {
          disableTabSearch: false,
          disableTabExplore: false,
          disableTabReels: false,
          disableTabMessages: false,
          disableTabNotifications: false,
          disableTabCreate: false,
          disableTabProfile: false,
          disableTabMoreFromMeta: false,
        },
        (settings) => {
          initTabDisabler(settings);
        }
      );
    }
    // Handle DM popup hider settings changes
    if (changes.hideDMPopup) {
      chrome.storage.sync.get({ hideDMPopup: false }, (settings) => {
        initDMPopupHider(settings);
      });
    }
  }
});

// Export functions for global access (add to existing object)
Object.assign(window.Instafn, {
  scanFollowers: scanFollowersAndFollowing,
  injectScanButton,
  openModal,
  createFollowButton,
  fetchUserInfo,
  renderScanButton,
  confirmWithModal,
  enableDMDebug, // Debug function for DM popup hider
});
