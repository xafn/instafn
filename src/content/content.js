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
import { initReelSpeedHold } from "./features/reel-speed-hold/index.js";
import { initCarouselDotDrag } from "./features/carousel-dot-drag/index.js";
import { injectProfilePicPopupOverlay } from "./features/profile-pic-popup/index.js";
import { initHideRecentSearches } from "./features/search-cleaner/index.js";
import { initHideSuggested } from "./features/hide-suggested/index.js";
import {
  initTabDisabler,
  initTabDisablerEarly,
} from "./features/tab-disabler/index.js";
import { enableDMDebug } from "./features/dm-popup-hider/index.js";
import { initBranding } from "./features/branding/index.js";
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
import {
  initPostHoverInfo,
  setupPostHoverInfoEarly,
} from "./features/post-hover-info/index.js";
import {
  initProfileGridColumns,
  refreshProfileGridColumns,
} from "./features/profile-grid-columns/index.js";
import {
  initMediaDownloader,
  updateMediaDownloaderSettings,
} from "./features/media-downloader/index.js";
import { DOWNLOAD_DEFAULTS } from "./features/media-downloader/config.js";
import { initChangelog } from "./features/changelog/index.js";

// Inject the WebSocket sniffer as early as possible (this content script runs at
// document_start) so window.WebSocket is wrapped before Instagram opens its
// realtime sockets. This MUST be a src-based <script> — Instagram's page CSP
// forbids inline scripts — which injectScript() does, and chrome-extension:// is
// allowed by their script-src. The sniffer is idempotent, so the later
// settings-gated injection is a harmless no-op.
injectScript("content/features/message-logger/socket-sniffer.js");

// Inject the DM voice-note sniffer at document_start too, so its fetch/XHR
// wrappers are in place before Instagram loads a conversation (a thread's
// message fetch can fire before the media-downloader feature initializes). It
// only captures voice .ogg urls and is idempotent + harmless when the downloader
// is off.
injectScript("content/features/media-downloader/voice-sniffer.js");

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
  // Show the "What's New" changelog if the extension just updated. Always runs
  // (not gated on a feature toggle) so users see release notes after an update.
  try {
    initChangelog();
  } catch (err) {
    console.error("Instafn: Error initializing changelog:", err);
  }

  // Load user settings
  chrome.storage.sync.get(
    {
      blockStorySeen: false,
      enableManualMarkAsSeen: false,
      confirmLike: false,
      confirmComment: false,
      confirmCall: false,
      confirmFollow: false,
      confirmReposts: false,
      confirmStoryQuickReactions: false,
      confirmStoryReplies: false,
      activateFollowAnalyzer: false,
      enableVideoScrubber: false,
      enableReelSpeedHold: true,
      enableCarouselDotDrag: false,
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
      disableTabMoreFromMeta: false,
      enableMessageEditShortcut: false,
      enableMessageReplyShortcut: false,
      enableMessageDoubleTapLike: false,
      enableMessageLogger: false,
      enableDMBackground: false,
      showExactTime: false,
      timeFormat: "{M}/{D}/{YY}, {h}:{mm} {A}",
      enableCallTimer: false,
      enablePostHoverInfo: false,
      postHoverDateFormat: "{M}/{D}/{YY}",
      profileGridColumns: "default",
      ...DOWNLOAD_DEFAULTS,
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
      if (settings.enableManualMarkAsSeen) initManualStorySeenButton(true);

      // Initialize video scrubber
      initVideoScrubber(settings.enableVideoScrubber);
      // Initialize reel 2× hold-to-fast-forward
      initReelSpeedHold(settings.enableReelSpeedHold);
      // Initialize carousel dot drag-to-scrub
      initCarouselDotDrag(settings.enableCarouselDotDrag);
      // Enable profile pic popup and highlight popup
      injectProfilePicPopupOverlay(
        settings.enableProfilePicPopup,
        settings.enableHighlightPopup
      );

      // Hide recent searches in the search overlay if enabled
      initHideRecentSearches(settings.hideRecentSearches);

      // (Home sidebar declutter — suggestions, footer, full sidebar — is
      // initialized early, before DOMContentLoaded, to avoid any flash.)

      // Initialize tab disabler
      initTabDisabler(settings);

      // Initialize DM background. Reads the chat's theme straight from the
      // rendered sent-message bubbles (no sniffers needed) and paints it as a
      // subtle background behind the conversation.
      if (settings.enableDMBackground) {
        initDMThemeDebug();
      }

      // Initialize exact time display
      initExactTimeDisplay(
        settings.showExactTime,
        settings.timeFormat || "{M}/{D}/{YY}, {h}:{mm} {A}"
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

      // Initialize post hover info (date beside like/comment counts on the grid)
      if (settings.enablePostHoverInfo) {
        try {
          initPostHoverInfo(true, settings.postHoverDateFormat || "{M}/{D}/{YY}");
        } catch (err) {
          console.error("Instafn: Error initializing post hover info:", err);
        }
      }

      // Apply the profile grid column count (default 3 leaves IG untouched)
      try {
        initProfileGridColumns(settings.profileGridColumns);
      } catch (err) {
        console.error("Instafn: Error initializing profile grid columns:", err);
      }

      // Initialize media downloader (download buttons on posts, reels, stories,
      // profile pics and DM voice messages). Self-gates on its master toggle.
      try {
        initMediaDownloader(settings);
      } catch (err) {
        console.error("Instafn: Error initializing media downloader:", err);
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

// Initialize branding (always enabled)
initBranding();

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

// Inject GraphQL sniffer if follow indicator is enabled (it needs GraphQL interception)
// Check both message logger and follow indicator settings
chrome.storage.sync.get(
  { enableMessageLogger: false, enableProfileFollowIndicator: false },
  (settings) => {
    if (
      settings.enableProfileFollowIndicator &&
      !settings.enableMessageLogger
    ) {
      // Only inject GraphQL sniffer if follow indicator is enabled but message logger is not
      // (if message logger is enabled, it's already injected above)
      injectScript("content/features/message-logger/graphql-sniffer.js");
    }
  }
);

// Inject the GraphQL sniffer + attach the listener early if post hover info is
// enabled, so the feature works on its own (independent of message logger and
// the follow indicator). injectScript dedupes by path, so this is a harmless
// no-op when another feature already injected the sniffer.
chrome.storage.sync.get({ enablePostHoverInfo: false }, (settings) => {
  if (settings.enablePostHoverInfo) {
    injectScript("content/features/message-logger/graphql-sniffer.js");
    setupPostHoverInfoEarly();
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
    disableTabMoreFromMeta: false,
  },
  (settings) => {
    initTabDisablerEarly(settings);
  }
);

// Declutter the home sidebar early (before DOMContentLoaded) so suggestions,
// footer, or the whole right column never flash in or shift the layout.
chrome.storage.sync.get(
  {
    hideSuggestedProfiles: false,
    hideSuggestedAccountsOnProfile: false,
    hideHomeFooter: false,
    hideRightSidebar: false,
    hideStoriesTray: false,
    hideNotesTray: false,
  },
  (settings) => {
    initHideSuggested(
      settings.hideSuggestedProfiles,
      settings.hideSuggestedAccountsOnProfile,
      settings.hideHomeFooter,
      settings.hideRightSidebar,
      settings.hideStoriesTray,
      settings.hideNotesTray
    );
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
  // Re-evaluate the grid column override (engages on profile pages, disengages
  // elsewhere).
  try {
    refreshProfileGridColumns();
  } catch (err) {
    console.error("Instafn: Error refreshing profile grid columns:", err);
  }
});

// Initial check
checkAndInjectScanButton();

// Set up DOM observer to watch for button container changes (similar to profile
// comments). Enable + attach this as early as possible (at document_start, off
// the first async storage read) rather than waiting for DOMContentLoaded — so
// the moment Instagram paints the profile header the observer can inject the
// button synchronously in the same frame, instead of the button popping in late
// (via the setTimeout fallbacks) and shifting the button row.
chrome.storage.sync.get({ activateFollowAnalyzer: false }, (settings) => {
  if (settings.activateFollowAnalyzer) {
    setScanButtonEnabled(true);
    setupScanButtonObserver();
    injectScanButton();
  }
});

// Listen for storage changes to update video scrubber and search cleaner
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && changes.enableVideoScrubber) {
    initVideoScrubber(changes.enableVideoScrubber.newValue);
  }
  if (namespace === "sync" && changes.enableReelSpeedHold) {
    initReelSpeedHold(changes.enableReelSpeedHold.newValue);
  }
  if (namespace === "sync" && changes.enableCarouselDotDrag) {
    initCarouselDotDrag(changes.enableCarouselDotDrag.newValue);
  }
  if (namespace === "sync" && changes.hideRecentSearches) {
    initHideRecentSearches(changes.hideRecentSearches.newValue);
  }
  if (
    namespace === "sync" &&
    (changes.hideSuggestedProfiles ||
      changes.hideSuggestedAccountsOnProfile ||
      changes.hideHomeFooter ||
      changes.hideRightSidebar ||
      changes.hideStoriesTray ||
      changes.hideNotesTray)
  ) {
    chrome.storage.sync.get(
      {
        hideSuggestedProfiles: false,
        hideSuggestedAccountsOnProfile: false,
        hideHomeFooter: false,
        hideRightSidebar: false,
        hideStoriesTray: false,
        hideNotesTray: false,
      },
      (settings) => {
        initHideSuggested(
          settings.hideSuggestedProfiles,
          settings.hideSuggestedAccountsOnProfile,
          settings.hideHomeFooter,
          settings.hideRightSidebar,
          settings.hideStoriesTray,
          settings.hideNotesTray
        );
      }
    );
  }
  if (namespace === "sync" && changes.blockStorySeen) {
    if (changes.blockStorySeen.newValue) {
      // Inject story blocking script if enabling
      injectScript("content/features/story-blocking/storyblocking.js");
    }
  }
  if (namespace === "sync" && changes.enableManualMarkAsSeen) {
    initManualStorySeenButton(changes.enableManualMarkAsSeen.newValue);
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
      { showExactTime: true, timeFormat: "{M}/{D}/{YY}, {h}:{mm} {A}" },
      (settings) => {
        initExactTimeDisplay(
          settings.showExactTime,
          settings.timeFormat || "{M}/{D}/{YY}, {h}:{mm} {A}"
        );
      }
    );
  }
  // Handle post hover info toggle and re-render when its date format changes
  if (
    namespace === "sync" &&
    (changes.enablePostHoverInfo || changes.postHoverDateFormat)
  ) {
    chrome.storage.sync.get(
      { enablePostHoverInfo: false, postHoverDateFormat: "{M}/{D}/{YY}" },
      (settings) => {
        if (settings.enablePostHoverInfo) {
          injectScript("content/features/message-logger/graphql-sniffer.js");
          setupPostHoverInfoEarly();
        }
        initPostHoverInfo(
          settings.enablePostHoverInfo,
          settings.postHoverDateFormat || "{M}/{D}/{YY}"
        );
      }
    );
  }
  // Handle profile grid column count changes
  if (namespace === "sync" && changes.profileGridColumns) {
    try {
      initProfileGridColumns(changes.profileGridColumns.newValue);
    } catch (err) {
      console.error("Instafn: Error updating profile grid columns:", err);
    }
  }
  // Handle media downloader settings changes (master toggle + per-surface)
  if (namespace === "sync") {
    const downloaderKeys = Object.keys(DOWNLOAD_DEFAULTS);
    if (downloaderKeys.some((key) => key in changes)) {
      chrome.storage.sync.get(DOWNLOAD_DEFAULTS, (settings) => {
        try {
          updateMediaDownloaderSettings(settings);
        } catch (err) {
          console.error("Instafn: Error updating media downloader:", err);
        }
      });
    }
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
          disableTabMoreFromMeta: false,
        },
        (settings) => {
          initTabDisablerEarly(settings);
          initTabDisabler(settings);
        }
      );
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
