import {
  interceptStoryQuickReactions,
  interceptStoryReplies,
  interceptLikes,
  interceptComments,
  interceptCalls,
  interceptFollows,
  interceptReposts,
  interceptTypingReceipts,
  forceHoverOnElement,
  keepElementClicked,
  releaseElementClick,
} from "./features/action-interceptors/index.js";

import {
  scanFollowersAndFollowing,
  fetchUserInfo,
  injectScanButton,
  removeScanButton,
  openModal,
  createFollowButton,
  renderScanButton,
  confirmWithModal,
  initFollowAnalyzerEarly,
} from "./features/follow-analyzer/index.js";
import { isOwnProfile, getMeCached } from "./features/follow-analyzer/logic.js";

import { initVideoScrubber } from "./features/video-scrubber/videoScrubber.js";
import { injectProfilePicPopupOverlay } from "./features/profile-pic-popup/index.js";
import { initHideRecentSearches } from "./features/search-cleaner/index.js";
import {
  initTabDisabler,
  initTabDisablerEarly,
} from "./features/tab-disabler/index.js";
import {
  initDMPopupHider,
  enableDMDebug,
} from "./features/dm-popup-hider/index.js";
import { injectBrandingStyles } from "./features/branding/index.js";
import { initDMThemeDebug } from "./features/dm-theme-debug/index.js";
import { initManualStorySeenButton } from "./features/story-blocking/manualSeenButton.js";
import { initExactTimeDisplay } from "./features/exact-time-display/index.js";
import { initMessageEditShortcut } from "./features/message-edit-shortcut/index.js";
import { initMessageDoubleTapLike } from "./features/message-double-tap-like/index.js";
import { initMessageLogger } from "./features/message-logger/index.js";
import { setupMessageViewer } from "./features/message-logger/message-viewer.js";
import { initTypingReceiptBlocker } from "./features/typing-receipt-blocker/index.js";
import {
  initProfileFollowIndicator,
  disableProfileFollowIndicator,
  setupGraphQLMessageListenerEarly,
} from "./features/profile-follow-indicator/index.js";
import { initCallTimer } from "./features/call-timer/index.js";
import {
  initProfileComments,
  disableProfileComments,
} from "./features/profile-comments/index.js";

// Initialize user info cache
window.userInfoCache = new Map();

// Initialize global Instafn object immediately (before DOMContentLoaded)
window.Instafn = window.Instafn || {};

// Expose getCurrentUser for message logger
window.Instafn.getCurrentUser = async () => {
  const me = await getMeCached();
  return me ? { username: me.username, userId: me.userId } : null;
};

// Expose getCurrentUser for message logger
window.Instafn.getCurrentUser = async () => {
  const me = await getMeCached();
  return me ? { username: me.username, userId: me.userId } : null;
};

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
      enableHighlightPopup: true,
      enableProfileFollowIndicator: true,
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
      enableMessageEditShortcut: true,
      enableMessageReplyShortcut: true,
      enableMessageDoubleTapLike: true,
      enableMessageLogger: false,
      showExactTime: true,
      timeFormat: "default",
      enableCallTimer: true,
      enableProfileComments: true,
    },
    (settings) => {
      if (settings.confirmLikes) interceptLikes();
      if (settings.confirmComments) interceptComments();
      if (settings.confirmCalls) interceptCalls();
      if (settings.confirmFollow) interceptFollows();
      if (settings.confirmReposts) interceptReposts();
      if (settings.confirmStoryQuickReactions) interceptStoryQuickReactions();
      if (settings.confirmStoryReplies) interceptStoryReplies();
      if (settings.blockTypingReceipts) initTypingReceiptBlocker(true);
      if (settings.blockStorySeen) initManualStorySeenButton(true);

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

      // Initialize DM theme debug overlay
      initDMThemeDebug();

      // Initialize exact time display
      initExactTimeDisplay(
        settings.showExactTime,
        settings.timeFormat || "default"
      );

      // Initialize message edit and reply shortcuts (checks settings internally)
      if (
        settings.enableMessageEditShortcut ||
        settings.enableMessageReplyShortcut
      ) {
        initMessageEditShortcut();
      }

      // Initialize message double-tap to like
      if (settings.enableMessageDoubleTapLike) {
        initMessageDoubleTapLike();
      }

      // Initialize message logger
      if (settings.enableMessageLogger) {
        initMessageLogger();
        setupMessageViewer();
      }

      // Initialize profile follow indicator
      if (settings.enableProfileFollowIndicator) {
        initProfileFollowIndicator();
      }

      // Initialize call timer
      if (settings.enableCallTimer) {
        try {
          initCallTimer(true);
        } catch (err) {
          console.error("Instafn: Error initializing call timer:", err);
        }
      }

      // Initialize profile comments
      if (settings.enableProfileComments) {
        try {
          initProfileComments();
        } catch (err) {
          console.error("Instafn: Error initializing profile comments:", err);
        }
      }

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

// Inject WebSocket sniffer into page context (must be done early)
function injectWebSocketSniffer() {
  function injectScript(src) {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(src);
      script.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement || document.body).appendChild(
        script
      );
    } catch (err) {
      console.error(`Instafn: Error injecting ${src}:`, err);
    }
  }

  // Inject WebSocket sniffer
  injectScript("content/features/message-logger/socket-sniffer.js");

  // Inject GraphQL sniffer
  injectScript("content/features/message-logger/graphql-sniffer.js");
}

// Inject WebSocket sniffer immediately (before DOMContentLoaded)
// This needs to happen early to catch WebSocket connections, but logger initialization
// is conditional based on settings (done in DOMContentLoaded)
injectWebSocketSniffer();

// Also try injecting after a short delay in case DOM isn't ready
setTimeout(injectWebSocketSniffer, 0);

// Initialize typing receipt blocker early (before DOMContentLoaded)
// This needs to happen early to catch WebSocket connections
// Always inject the script first, then set the flag from storage
chrome.storage.sync.get({ blockTypingReceipts: true }, (settings) => {
  initTypingReceiptBlocker(settings.blockTypingReceipts);
});

// Message logger initialization is done in DOMContentLoaded based on settings

// Initialize follow analyzer early to prevent flash (before DOMContentLoaded)
initFollowAnalyzerEarly();

// Set up profile follow indicator message listener early (before DOMContentLoaded)
// This ensures we catch GraphQL responses even on fast refreshes
setupGraphQLMessageListenerEarly();

// Message logger initialization is done in DOMContentLoaded based on settings

// Initialize tab disabler early to prevent flash (before DOMContentLoaded)
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
    initTabDisablerEarly(settings);
  }
);

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

// Inject scan button ONLY when on user's own profile page
let scanButtonTimeout = null;
async function checkAndInjectScanButton() {
  const path = window.location.pathname;
  const isProfilePage = path.match(/^\/([^\/]+)\/?$/);

  if (!isProfilePage) {
    removeScanButton();
    return;
  }

  // Check if it's the user's own profile BEFORE injecting
  try {
    const me = await getMeCached();
    if (!me || !(await isOwnProfile())) {
      removeScanButton();
      return;
    }
  } catch (err) {
    // If we can't determine, don't inject
    removeScanButton();
    return;
  }

  // Clear any pending timeout to avoid multiple calls
  if (scanButtonTimeout) {
    clearTimeout(scanButtonTimeout);
  }
  // Try immediately first
  injectScanButton();
  // Then try again after a delay if the button wasn't placed (e.g., DOM not ready)
  scanButtonTimeout = setTimeout(async () => {
    // Double-check it's still the user's own profile
    try {
      const me = await getMeCached();
      if (me && (await isOwnProfile())) {
        if (!document.querySelector(".instafn-scan-btn")) {
          injectScanButton();
        }
      } else {
        removeScanButton();
      }
    } catch (err) {
      removeScanButton();
    }
  }, 1000);
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
  if (namespace === "sync" && changes.blockStorySeen) {
    initManualStorySeenButton(changes.blockStorySeen.newValue);
  }
  if (namespace === "sync" && changes.blockTypingReceipts) {
    initTypingReceiptBlocker(changes.blockTypingReceipts.newValue);
  }
  // Handle exact time display settings changes
  if (namespace === "sync" && (changes.showExactTime || changes.timeFormat)) {
    chrome.storage.sync.get(
      { showExactTime: true, timeFormat: "default" },
      (settings) => {
        initExactTimeDisplay(
          settings.showExactTime,
          settings.timeFormat || "default"
        );
      }
    );
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
          initTabDisablerEarly(settings);
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
    // Handle message logger settings changes
    if (changes.enableMessageLogger) {
      if (changes.enableMessageLogger.newValue) {
        initMessageLogger();
        setupMessageViewer();
      } else {
        // Disable message logger - remove button and stop logging
        const button = document.querySelector(
          '[data-instafn-message-viewer-btn="true"]'
        );
        if (button) button.remove();
        // Note: We don't stop the logger itself, just hide the UI
        // The logger will continue to run but won't be visible
      }
    }
    // Handle profile follow indicator settings changes
    if (changes.enableProfileFollowIndicator) {
      if (changes.enableProfileFollowIndicator.newValue) {
        initProfileFollowIndicator();
      } else {
        disableProfileFollowIndicator();
      }
    }
    // Handle call timer settings changes
    if (changes.enableCallTimer) {
      try {
        initCallTimer(changes.enableCallTimer.newValue);
      } catch (err) {
        console.error("Instafn: Error updating call timer:", err);
      }
    }
    // Handle profile comments settings changes
    if (changes.enableProfileComments) {
      if (changes.enableProfileComments.newValue) {
        try {
          initProfileComments();
        } catch (err) {
          console.error("Instafn: Error initializing profile comments:", err);
        }
      } else {
        disableProfileComments();
      }
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
  forceHover: forceHoverOnElement, // Force hover on element
  keepClicked: keepElementClicked, // Keep element in clicked state
  releaseClick: releaseElementClick, // Release clicked element
});
