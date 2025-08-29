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

// Inject a small page-bridge so `window.Instafn.scanFollowers()` works from the page console
function injectInstafnBridge() {
  try {
    const bridge = document.createElement("script");
    bridge.src = chrome.runtime.getURL("content/bridge.js");
    bridge.async = false;
    bridge.onload = function() {
      console.log("Instafn: Bridge script loaded successfully");
    };
    bridge.onerror = function() {
      console.error("Instafn: Failed to load bridge.js");
    };
    (document.head || document.documentElement).appendChild(bridge);
  } catch (err) {
    console.error("Instafn: Error injecting Instafn bridge:", err);
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

// Add an eye icon to story UI to manually mark seen
function initStoryEyeInjector() {
  const EYE_BUTTON_CLASS = "instafn-story-eye";

  function createEyeButton() {
    const btn = document.createElement("div");
    btn.className = EYE_BUTTON_CLASS;
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.style.cursor = "pointer";
    btn.style.display = "flex";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.width = "40px";
    btn.style.height = "40px";

    btn.innerHTML =
      '<svg aria-label="Mark seen" class="x1lliihq x1n2onr6 xq3z1fi" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><title>Mark seen</title><path d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>';

    const onActivate = () => {
      try {
        window.postMessage({ source: "instafn", type: "MARK_STORY_SEEN" }, "*");
      } catch (err) {
        console.warn("Instafn: Failed to request story seen:", err);
      }
    };
    btn.addEventListener("click", onActivate, true);
    btn.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      },
      true
    );
    return btn;
  }

  function isInStoryContext(fromEl) {
    if (!fromEl) return false;
    const container = fromEl.closest("div, section, article") || document;
    return !!container.querySelector(
      'textarea[placeholder*="Reply to"], textarea[placeholder^="Reply to "]'
    );
  }

  function injectNearLikeIcon(likeSvg) {
    try {
      if (!likeSvg) return false;
      if (!isInStoryContext(likeSvg)) return false;
      const clickable =
        likeSvg.closest('button, [role="button"], a, div[role="button"]') ||
        likeSvg.closest("div, button, a") ||
        likeSvg;
      const parent = clickable.parentElement || clickable.closest("div");
      if (!parent) return false;
      if (parent.querySelector("." + EYE_BUTTON_CLASS)) return true;
      const btn = createEyeButton();
      parent.insertBefore(btn, clickable);
      return true;
    } catch (_) {
      return false;
    }
  }

  function scanOnce() {
    const likeSvgs = document.querySelectorAll(
      'svg[aria-label="Like"], svg[aria-label="Unlike"]'
    );
    for (const svg of likeSvgs) {
      injectNearLikeIcon(svg);
    }
  }

  const observer = new MutationObserver(() => scanOnce());
  observer.observe(document.body, { childList: true, subtree: true });
  scanOnce();
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

      // Conditionally inject the follow analyzer bridge based on settings
      if (settings.activateFollowAnalyzer) {
        console.log("Instafn: Follow analyzer enabled, injecting bridge");
        injectInstafnBridge();
      } else {
        console.log("Instafn: Follow analyzer disabled, bridge not injected");
      }

      // If this is a fresh install (no settings saved yet), enable follow analyzer by default
      chrome.storage.sync.get(null, (allSettings) => {
        if (Object.keys(allSettings).length === 0) {
          console.log(
            "Instafn: Fresh install detected, enabling follow analyzer by default"
          );
          chrome.storage.sync.set({ activateFollowAnalyzer: true }, () => {
            console.log("Instafn: Follow analyzer enabled for fresh install");
            injectInstafnBridge();
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

// Initialize the story eye injector shortly after load
setTimeout(initStoryEyeInjector, 800);

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
