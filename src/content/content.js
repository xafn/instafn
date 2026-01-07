import {
  interceptStoryQuickReactions,
  interceptStoryReplies,
  interceptLikes,
  interceptComments,
  interceptCalls,
  interceptFollows,
  interceptReposts,
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
  setupScanButtonObserver,
  setScanButtonEnabled,
} from "./features/follow-analyzer/index.js";
import { isOwnProfile, getMeCached } from "./features/follow-analyzer/logic.js";
import { injectScript } from "./utils/scriptInjector.js";
import { watchUrlChanges } from "./utils/domObserver.js";
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
  setupGraphQLMessageListenerEarly,
} from "./features/profile-follow-indicator/index.js";
import { initCallTimer } from "./features/call-timer/index.js";
import { initProfileComments } from "./features/profile-comments/index.js";

// Initialize user info cache
window.userInfoCache = new Map();

// Initialize global Instafn object immediately (before DOMContentLoaded)
window.Instafn = window.Instafn || {};

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

// Wait until the DOM is ready for other features
document.addEventListener("DOMContentLoaded", () => {
  // Load user settings
  chrome.storage.sync.get(
    {
      blockStorySeen: false,
      confirmLike: false,
      confirmComment: false,
      confirmCall: false,
      confirmFollow: false,
      confirmReposts: false,
      confirmStoryQuickReactions: false,
      confirmStoryReplies: false,
      activateFollowAnalyzer: false,
      enableVideoScrubber: false,
      enableProfilePicPopup: false,
      enableHighlightPopup: false,
      enableProfileFollowIndicator: false,
      blockTypingReceipts: false,
      hideRecentSearches: false,
      disableTabSearch: false,
      disableTabExplore: false,
      disableTabReels: false,
      disableTabMessages: false,
      disableTabNotifications: false,
      disableTabCreate: false,
      disableTabProfile: false,
      disableTabMoreFromMeta: false,
      hideDMPopup: false,
      enableMessageEditShortcut: false,
      enableMessageReplyShortcut: false,
      enableMessageDoubleTapLike: false,
      enableMessageLogger: false,
      showExactTime: false,
      timeFormat: "default",
      enableCallTimer: false,
      enableProfileComments: false,
    },
    (settings) => {
      if (settings.confirmLike) interceptLikes();
      if (settings.confirmComment) interceptComments();
      if (settings.confirmCall) interceptCalls();
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

      // Initialize follow analyzer button injection (same pattern as profile comments)
      if (settings.activateFollowAnalyzer) {
        try {
          setScanButtonEnabled(true);
          injectScanButton();
          setTimeout(() => injectScanButton(), 500);
          setTimeout(() => injectScanButton(), 1500);
          setTimeout(() => injectScanButton(), 3000);
        } catch (err) {
          console.error("Instafn: Error initializing follow analyzer:", err);
        }
      }
    }
  );
});

// Inject branding styles immediately (always enabled for branding)
injectBrandingStyles();

// Inject story blocking script only if feature is enabled
chrome.storage.sync.get({ blockStorySeen: false }, (settings) => {
  if (settings.blockStorySeen) {
    injectScript("content/features/story-blocking/storyblocking.js");
  }
});

// Inject WebSocket sniffer into page context only if message logger is enabled
// This needs to happen early to catch WebSocket connections
chrome.storage.sync.get({ enableMessageLogger: false }, (settings) => {
  if (settings.enableMessageLogger) {
    injectScript("content/features/message-logger/socket-sniffer.js");
    injectScript("content/features/message-logger/graphql-sniffer.js");
  }
});

// Initialize typing receipt blocker early (before DOMContentLoaded)
// This needs to happen early to catch WebSocket connections
// Only initialize if enabled
chrome.storage.sync.get({ blockTypingReceipts: false }, (settings) => {
  if (settings.blockTypingReceipts) {
    initTypingReceiptBlocker(settings.blockTypingReceipts);
  }
});

// Message logger initialization is done in DOMContentLoaded based on settings

// Initialize follow analyzer early to prevent flash (before DOMContentLoaded)
// Only initialize if enabled
chrome.storage.sync.get({ activateFollowAnalyzer: false }, (settings) => {
  if (settings.activateFollowAnalyzer) {
    initFollowAnalyzerEarly();
  }
});

// Set up profile follow indicator message listener early (before DOMContentLoaded)
// This ensures we catch GraphQL responses even on fast refreshes
// Only set up if the feature is enabled
chrome.storage.sync.get({ enableProfileFollowIndicator: false }, (settings) => {
  if (settings.enableProfileFollowIndicator) {
    setupGraphQLMessageListenerEarly();
  }
});

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

// Inject scan button on navigation (same pattern as profile comments)
// Only if feature is enabled
function checkAndInjectScanButton() {
  chrome.storage.sync.get({ activateFollowAnalyzer: false }, (settings) => {
    if (!settings.activateFollowAnalyzer) {
      removeScanButton();
      return;
    }

    const path = window.location.pathname;
    const isProfilePage = path.match(/^\/([^\/]+)\/?$/);

    if (!isProfilePage) {
      removeScanButton();
      return;
    }

    // injectScanButton() will check if it's own profile synchronously
    injectScanButton();
    setTimeout(injectScanButton, 500);
    setTimeout(injectScanButton, 1500);
    setTimeout(injectScanButton, 3000);
  });
}

// Check for profile pages on navigation
watchUrlChanges(() => {
  checkAndInjectScanButton();
});

// Initial check
checkAndInjectScanButton();

// Set up DOM observer to watch for button container changes (similar to profile comments)
chrome.storage.sync.get({ activateFollowAnalyzer: false }, (settings) => {
  if (settings.activateFollowAnalyzer) {
    setupScanButtonObserver();
  }
});

// Listen for storage changes to update video scrubber and search cleaner
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.enableVideoScrubber) {
    initVideoScrubber(changes.enableVideoScrubber.newValue);
  }
  if (namespace === "sync" && changes.hideRecentSearches) {
    initHideRecentSearches(changes.hideRecentSearches.newValue);
  }
  if (namespace === "sync" && changes.blockStorySeen) {
    if (changes.blockStorySeen.newValue) {
      // Inject story blocking script if enabling
      injectScript("content/features/story-blocking/storyblocking.js");
      initManualStorySeenButton(true);
    } else {
      initManualStorySeenButton(false);
    }
  }
  if (namespace === "sync" && changes.blockTypingReceipts) {
    initTypingReceiptBlocker(changes.blockTypingReceipts.newValue);
  }
  // Handle follow analyzer settings changes
  if (namespace === "sync" && changes.activateFollowAnalyzer) {
    setScanButtonEnabled(changes.activateFollowAnalyzer.newValue);
    if (changes.activateFollowAnalyzer.newValue) {
      injectScanButton();
      setTimeout(() => injectScanButton(), 500);
      setTimeout(() => injectScanButton(), 1500);
      setTimeout(() => injectScanButton(), 3000);
    }
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
        // Inject scripts if enabling
        injectScript("content/features/message-logger/socket-sniffer.js");
        injectScript("content/features/message-logger/graphql-sniffer.js");
        initMessageLogger();
        setupMessageViewer();
      }
    }
    // Handle profile follow indicator settings changes
    if (changes.enableProfileFollowIndicator) {
      if (changes.enableProfileFollowIndicator.newValue) {
        initProfileFollowIndicator();
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
