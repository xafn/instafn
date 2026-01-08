import { getProfileUsernameFromPath } from "../follow-analyzer/logic.js";
import { injectStylesheet } from "../../utils/styleLoader.js";
import { BUTTON_ID, SIDEBAR_ID } from "./config.js";
import { setupGraphQLVerificationListener } from "./auth.js";
import {
  injectCommentsButton,
  setButtonEnabled,
  getCurrentUsername,
  resetRetryCount,
} from "./ui/button.js";
import {
  showCommentsSidebar,
  closeCommentsSidebar,
  isSidebarOpen,
} from "./ui/sidebar.js";

let isEnabled = false;
let urlObserver = null;
let domObserver = null;

/**
 * Check if we're on an actual profile page (not reels, posts, stories, etc.)
 */
function isProfilePage() {
  const pathname = location.pathname;
  // Exclude common non-profile paths
  const excludedPaths = [
    "/reels/",
    "/p/",
    "/stories/",
    "/explore/",
    "/direct/",
    "/accounts/",
    "/emails/",
    "/help/",
    "/about/",
    "/developer/",
    "/legal/",
    "/privacy/",
    "/terms/",
    "/blog/",
    "/api/",
  ];
  
  // Check if path starts with any excluded path
  for (const excluded of excludedPaths) {
    if (pathname.startsWith(excluded)) {
      return false;
    }
  }
  
  // Profile pages are typically just /username/ or /username
  // They should match the pattern: /username/ (with optional trailing slash)
  const profilePattern = /^\/[^\/]+\/?$/;
  return profilePattern.test(pathname);
}

/**
 * Handle comments button click
 */
function handleCommentsButtonClick() {
  showCommentsSidebar();
}

/**
 * Initialize profile comments feature
 */
export function initProfileComments() {
  console.log("[Instafn Profile Comments] Initializing...");
  isEnabled = true;

  injectStylesheet("content/features/profile-comments/profile-comments.css");

  setupGraphQLVerificationListener();

  setButtonEnabled(true);
  // Only inject if we're on a profile page
  if (isProfilePage()) {
    injectCommentsButton(handleCommentsButtonClick);
    setTimeout(() => injectCommentsButton(handleCommentsButtonClick), 500);
    setTimeout(() => injectCommentsButton(handleCommentsButtonClick), 1500);
    setTimeout(() => injectCommentsButton(handleCommentsButtonClick), 3000);
  }

  let lastUrl = location.href;
  let lastProfileUsername = getProfileUsernameFromPath();

  urlObserver = new MutationObserver(() => {
    if (!isEnabled) return;
    if (location.href !== lastUrl) {
      // Only proceed if we're on a profile page
      if (!isProfilePage()) {
        lastUrl = location.href;
        const existing = document.getElementById(BUTTON_ID);
        if (existing) existing.remove();
        lastProfileUsername = null;
        return;
      }
      
      const newProfileUsername = getProfileUsernameFromPath();
      lastUrl = location.href;

      if (newProfileUsername !== lastProfileUsername) {
        lastProfileUsername = newProfileUsername;
        resetRetryCount();
        if (isSidebarOpen()) {
          closeCommentsSidebar();
        }
        setTimeout(() => injectCommentsButton(handleCommentsButtonClick), 300);
      }
    }
  });
  urlObserver.observe(document, { subtree: true, childList: true });

  domObserver = new MutationObserver(() => {
    if (!isEnabled) return;
    // Only inject on actual profile pages
    if (!isProfilePage()) {
      const existing = document.getElementById(BUTTON_ID);
      if (existing) existing.remove();
      return;
    }
    
    const username = getProfileUsernameFromPath();
    if (username && !document.getElementById(BUTTON_ID)) {
      // Inject on all profiles
      injectCommentsButton(handleCommentsButtonClick);
    }
  });
  domObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}
