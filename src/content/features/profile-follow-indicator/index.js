import { getProfileUsernameFromPath } from "../follow-analyzer/logic.js";
import { injectStylesheet } from "../../utils/styleLoader.js";

const INDICATOR_ID = "instafn-follow-indicator";
let isEnabled = false;
let currentUsername = null;
let followStatusCache = new Map();
let retryCount = 0;
let urlObserver = null;
let domObserver = null;
let messageListenerSetup = false;
let messageListenerHandler = null;

const MAX_RETRIES = 10;
const POST_PAGE_REGEX = /^\/p\/[^\/]+\/?$/;
const REEL_PAGE_REGEX = /^\/reel\/[^\/]+\/?$/;

function createIndicator(text) {
  const indicator = document.createElement("div");
  indicator.id = INDICATOR_ID;
  indicator.textContent = text;
  return indicator;
}

function findStatsContainer() {
  for (const container of document.querySelectorAll("div.x40hh3e")) {
    const text = container.textContent || "";
    if (
      text.includes("post") &&
      text.includes("follower") &&
      text.includes("following") &&
      /\d+/.test(text) &&
      container.children.length >= 3
    ) {
      return container;
    }
  }
  return null;
}

function isOwnProfile() {
  return (
    document.querySelector('a[href*="/accounts/edit/"]') ||
    Array.from(document.querySelectorAll("*")).some(
      (el) =>
        el.textContent?.includes("Edit profile") ||
        el.textContent?.includes("Edit Profile")
    )
  );
}

function isPostOrReelPage() {
  return (
    POST_PAGE_REGEX.test(location.pathname) ||
    REEL_PAGE_REGEX.test(location.pathname)
  );
}

function extractFollowStatus(data) {
  if (!isEnabled) return;
  try {
    const username = data?.data?.user?.username;
    const followedBy = data?.data?.user?.friendship_status?.followed_by;
    if (username && followedBy !== undefined) {
      followStatusCache.set(username, followedBy);
      if (getProfileUsernameFromPath() === username) {
        setTimeout(() => injectFollowIndicator(), 100);
      }
    }
  } catch (e) {
    console.error("[Instafn] Error extracting follow status:", e);
  }
}

function setupGraphQLMessageListener() {
  // Remove existing listener if any
  if (messageListenerHandler) {
    window.removeEventListener("message", messageListenerHandler);
  }

  messageListenerHandler = (event) => {
    if (!isEnabled) return;
    if (
      event.source === window &&
      event.data?.source === "instafn-graphql" &&
      event.data.type === "graphql-response" &&
      event.data.isProfileRequest
    ) {
      try {
        extractFollowStatus(JSON.parse(event.data.data));
      } catch (e) {
        try {
          const match = event.data.data.match(/\{[\s\S]*"data"[\s\S]*\}/);
          if (match) extractFollowStatus(JSON.parse(match[0]));
        } catch {
          if (isEnabled) {
            setTimeout(() => injectFollowIndicator(), 2000);
          }
        }
      }
    }
  };

  window.addEventListener("message", messageListenerHandler);
}

function injectFollowIndicator() {
  if (!isEnabled) return;
  const username = getProfileUsernameFromPath();
  const existing = document.getElementById(INDICATOR_ID);

  // Not on profile page
  if (!username) {
    if (existing && currentUsername && !isPostOrReelPage()) {
      existing.remove();
      currentUsername = null;
    }
    return;
  }

  // Own profile
  if (isOwnProfile()) {
    if (existing) existing.remove();
    currentUsername = null;
    return;
  }

  // Same profile - just update text
  if (existing && (currentUsername === username || !currentUsername)) {
    currentUsername = username;
    const followsYou = followStatusCache.get(username);
    if (followsYou !== undefined) {
      existing.textContent = followsYou ? "FOLLOWS YOU" : "NOT FOLLOWING YOU";
    }
    return;
  }

  // Different profile or new injection
  if (currentUsername !== username) retryCount = 0;
  currentUsername = username;

  const statsContainer = findStatsContainer();
  if (!statsContainer) {
    if (existing) return; // Keep existing indicator
    if (++retryCount > MAX_RETRIES) {
      retryCount = 0;
      return;
    }
    setTimeout(injectFollowIndicator, 500);
    return;
  }

  retryCount = 0;
  if (existing && currentUsername !== username) existing.remove();

  const followsYou = followStatusCache.get(username);
  const indicator = createIndicator(
    followsYou === undefined
      ? "FETCHING..."
      : followsYou
      ? "FOLLOWS YOU"
      : "NOT FOLLOWING YOU"
  );

  if (statsContainer.parentElement) {
    statsContainer.parentElement.insertBefore(
      indicator,
      statsContainer.nextSibling
    );
  }

  if (followsYou === undefined) {
    setTimeout(() => {
      if (!isEnabled) return;
      const cachedStatus = followStatusCache.get(username);
      const existing = document.getElementById(INDICATOR_ID);
      if (existing) {
        existing.textContent =
          cachedStatus === undefined
            ? "FAILED TO FETCH"
            : cachedStatus
            ? "FOLLOWS YOU"
            : "NOT FOLLOWING YOU";
      }
    }, 3000);
  }
}

export function setupGraphQLMessageListenerEarly() {
  if (messageListenerSetup) return;
  messageListenerSetup = true;
  // Only set up the listener if the feature is enabled
  chrome.storage.sync.get(
    { enableProfileFollowIndicator: true },
    (settings) => {
      if (settings.enableProfileFollowIndicator) {
        isEnabled = true;
        setupGraphQLMessageListener();
      }
    }
  );
}

export function initProfileFollowIndicator() {
  isEnabled = true;

  injectStylesheet(
    "content/features/profile-follow-indicator/profile-follow-indicator.css"
  );

  // Set up message listener if not already set up or if it was removed
  if (!messageListenerHandler) {
    setupGraphQLMessageListener();
  }
  if (!messageListenerSetup) {
    messageListenerSetup = true;
  }

  injectFollowIndicator();
  setTimeout(injectFollowIndicator, 500);
  setTimeout(injectFollowIndicator, 1500);

  let lastUrl = location.href;
  let lastProfileUsername = getProfileUsernameFromPath();

  urlObserver = new MutationObserver(() => {
    if (!isEnabled) return;
    if (location.href !== lastUrl) {
      const newProfileUsername = getProfileUsernameFromPath();
      lastUrl = location.href;

      if (isPostOrReelPage()) return;

      if (newProfileUsername !== lastProfileUsername) {
        lastProfileUsername = newProfileUsername;
        currentUsername = null;
        retryCount = 0;

        const existing = document.getElementById(INDICATOR_ID);
        if (!newProfileUsername) {
          if (existing) existing.remove();
        } else {
          setTimeout(injectFollowIndicator, 300);
        }
      }
    }
  });
  urlObserver.observe(document, { subtree: true, childList: true });

  domObserver = new MutationObserver(() => {
    if (!isEnabled) return;
    const username = getProfileUsernameFromPath();
    if (
      username &&
      !document.getElementById(INDICATOR_ID) &&
      !isOwnProfile() &&
      !isPostOrReelPage()
    ) {
      injectFollowIndicator();
    }
  });
  domObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export function disableProfileFollowIndicator() {
  isEnabled = false;

  const existing = document.getElementById(INDICATOR_ID);
  if (existing) existing.remove();

  if (urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  // Remove message listener when disabled
  if (messageListenerHandler) {
    window.removeEventListener("message", messageListenerHandler);
    messageListenerHandler = null;
  }

  currentUsername = null;
  retryCount = 0;
}
