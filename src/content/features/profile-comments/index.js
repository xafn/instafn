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
  injectCommentsButton(handleCommentsButtonClick);
  setTimeout(() => injectCommentsButton(handleCommentsButtonClick), 500);
  setTimeout(() => injectCommentsButton(handleCommentsButtonClick), 1500);
  setTimeout(() => injectCommentsButton(handleCommentsButtonClick), 3000);

  let lastUrl = location.href;
  let lastProfileUsername = getProfileUsernameFromPath();

  urlObserver = new MutationObserver(() => {
    if (!isEnabled) return;
    if (location.href !== lastUrl) {
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

/**
 * Disable profile comments feature
 */
export function disableProfileComments() {
  isEnabled = false;

  const existing = document.getElementById(BUTTON_ID);
  if (existing) existing.remove();

  if (isSidebarOpen()) {
    closeCommentsSidebar();
  }

  if (urlObserver) {
    urlObserver.disconnect();
    urlObserver = null;
  }
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  setButtonEnabled(false);
  resetRetryCount();
}
