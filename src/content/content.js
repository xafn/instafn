import {
  interceptStoryQuickReactions,
  interceptStoryReplies,
  interceptLikes,
  interceptComments,
  interceptCalls,
  interceptFollows,
  interceptReposts,
  interceptTypingReceipts,
  interceptJavaScriptExecution,
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
      enableMessageEditShortcut: true,
      enableMessageDoubleTapLike: true,
      showExactTime: true,
      timeFormat: "default",
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

      // Initialize message edit shortcut
      if (settings.enableMessageEditShortcut) {
        initMessageEditShortcut();
      }

      // Initialize message double-tap to like
      if (settings.enableMessageDoubleTapLike) {
        initMessageDoubleTapLike();
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

// Initialize follow analyzer early to prevent flash (before DOMContentLoaded)
initFollowAnalyzerEarly();

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

// Inject JavaScript execution interceptor into page context
function injectJSInterceptor() {
  try {
    const script = document.createElement("script");
    script.textContent = `
      (function() {
        console.log("🚀 Starting JavaScript execution interceptor in page context...");
        
        const getStack = () => {
          try {
            return new Error().stack;
          } catch (e) {
            return "Stack trace unavailable";
          }
        };
        
        const logExecution = (type, data) => {
          const stack = getStack();
          console.log("🔍 [JS EXEC] " + type + ":", {
            ...data,
            source: stack,
            timestamp: new Date().toISOString(),
          });
        };
        
        // Intercept eval()
        try {
          const originalEval = window.eval;
          window.eval = function(code) {
            logExecution("eval", {
              code: typeof code === "string" ? code : String(code),
              codeLength: typeof code === "string" ? code.length : 0,
            });
            return originalEval.apply(this, arguments);
          };
          console.log("✅ Intercepted eval()");
        } catch (e) {
          console.error("❌ Failed to intercept eval:", e);
        }
        
        // Intercept Function constructor
        try {
          const originalFunction = window.Function;
          window.Function = function(...args) {
            const code = args[args.length - 1];
            const params = args.slice(0, -1);
            logExecution("Function", {
              code: typeof code === "string" ? code : String(code),
              params: params,
              codeLength: typeof code === "string" ? code.length : 0,
            });
            return originalFunction.apply(this, args);
          };
          console.log("✅ Intercepted Function()");
        } catch (e) {
          console.error("❌ Failed to intercept Function:", e);
        }
        
        // Intercept setTimeout with string code
        try {
          const originalSetTimeout = window.setTimeout;
          window.setTimeout = function(fn, delay, ...args) {
            if (typeof fn === "string") {
              logExecution("setTimeout", {
                code: fn,
                delay: delay,
                codeLength: fn.length,
              });
            }
            return originalSetTimeout.apply(this, arguments);
          };
          console.log("✅ Intercepted setTimeout()");
        } catch (e) {
          console.error("❌ Failed to intercept setTimeout:", e);
        }
        
        // Intercept setInterval with string code
        try {
          const originalSetInterval = window.setInterval;
          window.setInterval = function(fn, delay, ...args) {
            if (typeof fn === "string") {
              logExecution("setInterval", {
                code: fn,
                delay: delay,
                codeLength: fn.length,
              });
            }
            return originalSetInterval.apply(this, arguments);
          };
          console.log("✅ Intercepted setInterval()");
        } catch (e) {
          console.error("❌ Failed to intercept setInterval:", e);
        }
        
        // Intercept script tag creation
        try {
          const originalCreateElement = document.createElement;
          document.createElement = function(tagName, options) {
            const element = originalCreateElement.call(this, tagName, options);
            if (tagName && tagName.toLowerCase() === "script") {
              const originalSetAttribute = element.setAttribute;
              element.setAttribute = function(name, value) {
                if (name === "src" && value) {
                  logExecution("script-src", {
                    src: value,
                  });
                }
                return originalSetAttribute.apply(this, arguments);
              };
              
              const originalTextContentSetter = Object.getOwnPropertyDescriptor(
                HTMLScriptElement.prototype,
                "textContent"
              );
              if (originalTextContentSetter && originalTextContentSetter.set) {
                Object.defineProperty(element, "textContent", {
                  set: function(value) {
                    if (value && typeof value === "string" && value.trim()) {
                      logExecution("script-inline-textContent", {
                        code: value,
                        codeLength: value.length,
                      });
                    }
                    originalTextContentSetter.set.call(this, value);
                  },
                  get: originalTextContentSetter.get,
                  configurable: true,
                });
              }
            }
            return element;
          };
          console.log("✅ Intercepted createElement()");
        } catch (e) {
          console.error("❌ Failed to intercept createElement:", e);
        }
        
        // MutationObserver for script additions
        try {
          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && node.tagName === "SCRIPT") {
                  if (node.src) {
                    logExecution("script-dom-added-src", {
                      src: node.src,
                      fullURL: node.src.startsWith("http") ? node.src : new URL(node.src, window.location.href).href,
                    });
                  } else if (node.textContent && node.textContent.trim()) {
                    logExecution("script-dom-added-inline", {
                      code: node.textContent,
                      codeLength: node.textContent.length,
                    });
                  }
                }
              });
            });
          });
          
          if (document.documentElement) {
            observer.observe(document.documentElement, {
              childList: true,
              subtree: true,
            });
            console.log("✅ MutationObserver watching for scripts");
          } else {
            const checkDOM = setInterval(() => {
              if (document.documentElement) {
                observer.observe(document.documentElement, {
                  childList: true,
                  subtree: true,
                });
                clearInterval(checkDOM);
                console.log("✅ MutationObserver watching for scripts (delayed)");
              }
            }, 100);
          }
        } catch (e) {
          console.error("❌ Failed to set up MutationObserver:", e);
        }
        
        // Intercept innerHTML/outerHTML
        try {
          const interceptInnerHTML = (proto, property) => {
            try {
              const descriptor = Object.getOwnPropertyDescriptor(proto, property);
              if (descriptor && descriptor.set) {
                Object.defineProperty(proto, property, {
                  set: function(value) {
                    if (typeof value === "string") {
                      const scriptMatch = value.match(/<script[^>]*>([\\s\\S]*?)<\\/script>/gi);
                      if (scriptMatch) {
                        scriptMatch.forEach((scriptTag) => {
                          const srcMatch = scriptTag.match(/src\\s*=\\s*["']([^"']+)["']/i);
                          if (srcMatch) {
                            logExecution(property + "-script-src", {
                              src: srcMatch[1],
                              html: scriptTag.substring(0, 200),
                            });
                          } else {
                            const codeMatch = scriptTag.match(/<script[^>]*>([\\s\\S]*?)<\\/script>/i);
                            if (codeMatch && codeMatch[1].trim()) {
                              logExecution(property + "-script-inline", {
                                code: codeMatch[1],
                                codeLength: codeMatch[1].length,
                              });
                            }
                          }
                        });
                      }
                    }
                    descriptor.set.call(this, value);
                  },
                  get: descriptor.get,
                  configurable: true,
                });
              }
            } catch (e) {
              // Silently fail
            }
          };
          
          [HTMLElement.prototype, Element.prototype].forEach((proto) => {
            interceptInnerHTML(proto, "innerHTML");
            interceptInnerHTML(proto, "outerHTML");
          });
          console.log("✅ Intercepted innerHTML/outerHTML");
        } catch (e) {
          console.error("❌ Failed to intercept innerHTML/outerHTML:", e);
        }
        
        console.log("✅ JavaScript execution interceptor fully enabled in page context!");
        console.log("📝 Watch the console for 🔍 [JS EXEC] messages");
      })();
    `;
    (document.head || document.documentElement || document.body).appendChild(
      script
    );
    script.remove(); // Remove script tag after execution
    console.log(
      "✅ Injected JavaScript execution interceptor into page context"
    );
  } catch (err) {
    console.error("Instafn: Error injecting JS interceptor:", err);
  }
}

// Inject JS interceptor immediately
injectJSInterceptor();

// Also enable in content script context (for content script execution)
interceptJavaScriptExecution();

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
