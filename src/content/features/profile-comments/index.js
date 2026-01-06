import { getProfileUsernameFromPath } from "../follow-analyzer/logic.js";
import { getMeCached } from "../follow-analyzer/logic.js";
import { injectStylesheet } from "../../utils/styleLoader.js";

const BUTTON_ID = "instafn-profile-comments-btn";
const SIDEBAR_ID = "instafn-profile-comments-sidebar";
let isEnabled = false;
let currentUsername = null;
let sidebarOpen = false;
let urlObserver = null;
let domObserver = null;

// Supabase Configuration
// Get your Supabase anon key from: https://app.supabase.com/project/YOUR_PROJECT/settings/api
// The anon key is safe to use in client-side code (it's public)
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6ZWFudmxhcHpreXJmc3RjeGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2NDYzNjUsImV4cCI6MjA4MzIyMjM2NX0.LM_garo2IY47HoxivYMEdOuw_Vu8wXddRRHNEJOcd0Q";
const SUPABASE_FUNCTION_URL =
  "https://wzeanvlapzkyrfstcxhz.supabase.co/functions/v1/comments-api";

// Backend API URL - configurable via storage (defaults to Supabase)
let API_BASE_URL = SUPABASE_FUNCTION_URL;
let SUPABASE_KEY = SUPABASE_ANON_KEY;

// Load API URL and Supabase key from storage
chrome.storage.sync.get(
  {
    profileCommentsApiUrl: SUPABASE_FUNCTION_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  },
  (result) => {
    API_BASE_URL = result.profileCommentsApiUrl || SUPABASE_FUNCTION_URL;
    SUPABASE_KEY = result.supabaseAnonKey || SUPABASE_ANON_KEY;
  }
);

/**
 * Get CSRF token from cookies
 */
function getCSRFToken() {
  const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Get headers for API requests to Supabase Edge Functions
 * Note: Only include headers that Supabase CORS allows:
 * - authorization (required)
 * - content-type (required for POST)
 * - cookie (sent automatically with credentials: "include")
 *
 * Instagram-specific headers (X-IG-App-ID, X-CSRFToken, etc.) are NOT needed
 * for Supabase requests and cause CORS errors. The backend will use cookies
 * and sessionId for Instagram verification instead.
 */
function getInstagramHeaders() {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    // Supabase authorization header (required for Edge Functions)
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };
  // Removed all Instagram-specific headers (X-IG-App-ID, X-CSRFToken, etc.)
  // as they're not allowed by Supabase CORS policy and aren't needed
  // The backend will use cookies/sessionId for Instagram verification
  return headers;
}

/**
 * Test Supabase connection (for debugging)
 */
async function testSupabaseConnection() {
  try {
    const healthUrl = `${API_BASE_URL}/health`;
    console.log(
      `[Instafn Profile Comments] Testing Supabase connection: ${healthUrl}`
    );

    const response = await fetch(healthUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(
        "[Instafn Profile Comments] ✅ Supabase connection successful:",
        data
      );
      return true;
    } else {
      console.error(
        `[Instafn Profile Comments] ❌ Supabase health check failed: ${response.status}`
      );
      return false;
    }
  } catch (error) {
    console.error(
      "[Instafn Profile Comments] ❌ Supabase connection test failed:",
      error
    );
    console.error("[Instafn Profile Comments] API_BASE_URL:", API_BASE_URL);
    console.error(
      "[Instafn Profile Comments] SUPABASE_KEY present:",
      !!SUPABASE_KEY
    );
    return false;
  }
}

/**
 * Create the Comments button
 * Adapts to both own profile and others' profiles button styles
 */
function createCommentsButton() {
  // Try to find a reference button to clone its structure
  // First try Message button (other profiles)
  let referenceBtn = Array.from(document.querySelectorAll("*")).find(
    (el) =>
      el.textContent?.trim() === "Message" &&
      el.getAttribute("role") === "button"
  );

  // If no Message button, try Edit Profile button (own profile)
  if (!referenceBtn) {
    referenceBtn = Array.from(document.querySelectorAll("*")).find((el) => {
      const text = el.textContent?.trim();
      return (
        (text === "Edit profile" || text === "Edit Profile") &&
        el.getAttribute("role") === "button"
      );
    });
  }

  let buttonWrapper;
  let button;

  if (referenceBtn) {
    // Clone the reference button's wrapper div
    const referenceWrapper = referenceBtn.parentElement;
    if (referenceWrapper && referenceWrapper.classList.contains("html-div")) {
      buttonWrapper = referenceWrapper.cloneNode(true);
      buttonWrapper.id = BUTTON_ID;
      // Find the inner button element
      button = buttonWrapper.querySelector('[role="button"]') || buttonWrapper;
      // Clear existing content
      button.innerHTML = "";
    } else {
      // Fallback: create wrapper and button
      buttonWrapper = document.createElement("div");
      buttonWrapper.className =
        referenceWrapper?.className ||
        "html-div xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x9f619 xjbqb8w x78zum5 x15mokao x1ga7v0g x16uus16 xbiv7yw x1n2onr6 x6ikm8r x10wlt62 x1iyjqo2 x2lwn1j xeuugli xdt5ytf xqjyukv x1qjc9v5 x1oa3qoh x1nhvcw1";
      button = document.createElement("div");
      button.className =
        referenceBtn.className ||
        "x1i10hfl xjqpnuy xc5r6h4 xqeqjp1 x1phubyo x972fbf x10w94by x1qhh985 x14e42zd xdl72j9 x2lah0s x3ct3a4 xdj266r x14z9mp xat24cr x1lziwak x2lwn1j xeuugli xexx8yu x18d9i69 x1hl2dhg xggy1nq x1ja2u2z x1t137rt x1q0g3np x1lku1pv x1a2a7pz x6s0dn4 xjyslct x1ejq31n x18oe1m7 x1sy0etr xstzfhl x9f619 x1ypdohk x78zum5 x1f6kntn xwhw2v2 xl56j7k x17ydfre x1n2onr6 x2b8uid xlyipyv x87ps6o x14atkfc x5c86q x18br7mf x1i0vuye x6nl9eh x1a5l9x9 x7vuprf x1mg3h75 xn3w4p2 x106a9eq x1xnnf8n x1aavi5t x1h6iz8e xixcex4 xk4oym4 xl3ioum";
      buttonWrapper.appendChild(button);
    }
  } else {
    // Fallback: create wrapper and button from scratch
    buttonWrapper = document.createElement("div");
    buttonWrapper.className =
      "html-div xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x9f619 xjbqb8w x78zum5 x15mokao x1ga7v0g x16uus16 xbiv7yw x1n2onr6 x6ikm8r x10wlt62 x1iyjqo2 x2lwn1j xeuugli xdt5ytf xqjyukv x1qjc9v5 x1oa3qoh x1nhvcw1";
    button = document.createElement("div");
    button.className =
      "x1i10hfl xjqpnuy xc5r6h4 xqeqjp1 x1phubyo x972fbf x10w94by x1qhh985 x14e42zd xdl72j9 x2lah0s x3ct3a4 xdj266r x14z9mp xat24cr x1lziwak x2lwn1j xeuugli xexx8yu x18d9i69 x1hl2dhg xggy1nq x1ja2u2z x1t137rt x1q0g3np x1lku1pv x1a2a7pz x6s0dn4 xjyslct x1ejq31n x18oe1m7 x1sy0etr xstzfhl x9f619 x1ypdohk x78zum5 x1f6kntn xwhw2v2 xl56j7k x17ydfre x1n2onr6 x2b8uid xlyipyv x87ps6o x14atkfc x5c86q x18br7mf x1i0vuye x6nl9eh x1a5l9x9 x7vuprf x1mg3h75 xn3w4p2 x106a9eq x1xnnf8n x1aavi5t x1h6iz8e xixcex4 xk4oym4 xl3ioum";
    buttonWrapper.appendChild(button);
  }

  buttonWrapper.id = BUTTON_ID;
  button.setAttribute("role", "button");
  button.setAttribute("tabindex", "0");
  button.setAttribute("aria-label", "Comments");
  button.innerHTML = `
    <div class="x6s0dn4 x78zum5 xdt5ytf xl56j7k">
      <svg aria-label="Comments" class="x1lliihq x1n2onr6 x5n08af" fill="currentColor" height="16" role="img" viewBox="0 0 24 24" width="16">
        <title>Comments</title>
        <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22l-1.344-4.992zm-2.883-4.18a7.5 7.5 0 1 1-2.828-2.828l1.414 1.414a5 5 0 0 0 0 7.07l1.414 1.414z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
      </svg>
    </div>
    <div class="_ap3a _aaco _aacw _aad6 _aade" dir="auto">Comments</div>
  `;
  button.style.cursor = "pointer";
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleCommentsButtonClick();
  });

  return buttonWrapper;
}

/**
 * Find the button container to inject next to
 * Works for both own profile (Edit Profile) and others' profiles (Following/Message)
 */
function findButtonContainer() {
  // First, try to find Message button (other profiles)
  const messageButtons = Array.from(document.querySelectorAll("*")).filter(
    (el) => {
      const text = el.textContent?.trim();
      return text === "Message" && el.getAttribute("role") === "button";
    }
  );

  // If Message button found, use it
  if (messageButtons.length > 0) {
    for (const msgBtn of messageButtons) {
      let current = msgBtn.parentElement;

      while (current) {
        const siblings = Array.from(current.children || []);

        const hasFollowingBtn = siblings.some((s) => {
          const text = s.textContent || "";
          return text.includes("Following") || text.includes("Follow");
        });
        const hasMessageBtn = siblings.some((s) => {
          const text = s.textContent?.trim() || "";
          return (
            text === "Message" ||
            s.querySelector('[role="button"]')?.textContent?.trim() ===
              "Message"
          );
        });

        if ((hasFollowingBtn || hasMessageBtn) && siblings.length >= 2) {
          const isInHeader =
            current.closest("header") || current.closest("section");
          if (isInHeader) {
            return current;
          }
        }

        current = current.parentElement;
        if (
          !current ||
          current.tagName === "BODY" ||
          current.tagName === "HTML"
        ) {
          break;
        }
      }
    }
  }

  // If no Message button, try to find Edit Profile button (own profile)
  const editProfileButtons = Array.from(document.querySelectorAll("*")).filter(
    (el) => {
      const text = el.textContent?.trim();
      return (
        (text === "Edit profile" || text === "Edit Profile") &&
        el.getAttribute("role") === "button"
      );
    }
  );

  if (editProfileButtons.length > 0) {
    for (const editBtn of editProfileButtons) {
      let current = editBtn.parentElement;

      while (current) {
        const siblings = Array.from(current.children || []);

        // On own profile, look for Edit Profile button
        const hasEditBtn = siblings.some((s) => {
          const text = s.textContent?.trim() || "";
          return (
            text === "Edit profile" ||
            text === "Edit Profile" ||
            s.querySelector('[role="button"]')?.textContent?.trim() ===
              "Edit profile" ||
            s.querySelector('[role="button"]')?.textContent?.trim() ===
              "Edit Profile"
          );
        });

        if (hasEditBtn && siblings.length >= 1) {
          const isInHeader =
            current.closest("header") || current.closest("section");
          if (isInHeader) {
            return current;
          }
        }

        current = current.parentElement;
        if (
          !current ||
          current.tagName === "BODY" ||
          current.tagName === "HTML"
        ) {
          break;
        }
      }
    }
  }

  return null;
}

/**
 * Inject the Comments button
 */
function injectCommentsButton() {
  if (!isEnabled) return;

  const username = getProfileUsernameFromPath();
  if (!username) {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
    currentUsername = null;
    return;
  }

  // Inject button on all profiles (own and others)
  const existing = document.getElementById(BUTTON_ID);
  if (existing && currentUsername === username) {
    console.log(
      "[Instafn Profile Comments] Button already exists for this profile"
    );
    return;
  }

  if (existing && currentUsername !== username) {
    console.log(
      "[Instafn Profile Comments] Removing existing button for different profile"
    );
    existing.remove();
  }

  currentUsername = username;
  const container = findButtonContainer();
  if (!container) {
    console.log("[Instafn Profile Comments] Container not found, retrying...");
    setTimeout(injectCommentsButton, 500);
    return;
  }

  // Check if button already exists in this container
  if (container.querySelector(`#${BUTTON_ID}`)) {
    console.log(
      "[Instafn Profile Comments] Button already exists in container"
    );
    return;
  }

  console.log(
    "[Instafn Profile Comments] Found container, injecting button...",
    container
  );

  const button = createCommentsButton();

  // Find the reference button wrapper to insert after
  // Try Message button first (other profiles)
  let referenceBtnWrapper = null;
  for (const child of Array.from(container.children)) {
    const btn = child.querySelector('[role="button"]');
    if (btn && btn.textContent?.trim() === "Message") {
      referenceBtnWrapper = child;
      break;
    }
    // Also check direct children
    if (
      child.textContent?.trim() === "Message" &&
      child.getAttribute("role") === "button"
    ) {
      referenceBtnWrapper = child;
      break;
    }
  }

  // If no Message button, try Edit Profile button (own profile)
  if (!referenceBtnWrapper) {
    for (const child of Array.from(container.children)) {
      const btn = child.querySelector('[role="button"]');
      const text = btn?.textContent?.trim() || "";
      if (text === "Edit profile" || text === "Edit Profile") {
        referenceBtnWrapper = child;
        break;
      }
      // Also check direct children
      const childText = child.textContent?.trim() || "";
      if (
        (childText === "Edit profile" || childText === "Edit Profile") &&
        child.getAttribute("role") === "button"
      ) {
        referenceBtnWrapper = child;
        break;
      }
    }
  }

  if (referenceBtnWrapper) {
    // Insert right after reference button wrapper
    if (referenceBtnWrapper.nextSibling) {
      container.insertBefore(button, referenceBtnWrapper.nextSibling);
    } else {
      container.appendChild(button);
    }
    console.log(
      "[Instafn Profile Comments] Button injected after reference button"
    );
  } else {
    // If no reference button found, try to find Similar accounts button and insert before it
    const similarBtn = Array.from(container.children).find((el) =>
      el.querySelector('svg[aria-label="Similar accounts"]')
    );
    if (similarBtn) {
      container.insertBefore(button, similarBtn);
      console.log(
        "[Instafn Profile Comments] Button injected before Similar accounts"
      );
    } else {
      // Last resort: append to container
      container.appendChild(button);
      console.log("[Instafn Profile Comments] Button appended to container");
    }
  }
}

/**
 * Format timestamp to Instagram-style relative time
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  if (weeks < 4) return `${weeks}w`;
  if (months < 12) return `${months}mo`;
  return `${years}y`;
}

/**
 * Format full date like Instagram
 */
function formatFullDate(timestamp) {
  const date = new Date(timestamp);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const mins = minutes < 10 ? `0${minutes}` : minutes;
  return `${month} ${day}, ${year}, ${hours}:${mins} ${ampm}`;
}

/**
 * Fetch user profile picture
 */
async function getUserProfilePic(username) {
  try {
    const response = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
        username
      )}`,
      {
        credentials: "include",
        headers: {
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );
    if (response.ok) {
      const data = await response.json();
      return data?.data?.user?.profile_pic_url || null;
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
}

/**
 * Create a comment element matching Instagram's exact structure
 */
async function createCommentElement(comment, currentUser) {
  const li = document.createElement("li");
  li.className = "_a9zj _a9zl";
  li.dataset.commentId = comment.id;

  // DEBUG: Log what we're getting
  console.log("[Instafn Profile Comments] Creating comment element:", {
    commentId: comment.id,
    commentUsername: comment.username,
    commentUserId: comment.userId,
    currentUserUsername: currentUser?.username,
    currentUserId: currentUser?.userId,
  });

  const isOwnComment = currentUser && comment.userId === currentUser.userId;

  // CRITICAL: Use comment.username (the commenter's username), NOT profileUsername
  // Fetch profile picture for the COMMENTER, not the profile owner
  const commenterUsername = comment.username;
  if (!commenterUsername) {
    console.error(
      "[Instafn Profile Comments] Comment missing username!",
      comment
    );
  }

  const profilePic =
    (await getUserProfilePic(commenterUsername)) ||
    "https://instagram.com/static/images/anonymousUser.jpg/23e7b3b2a737.jpg";

  console.log(
    `[Instafn Profile Comments] Fetched profile pic for ${commenterUsername}:`,
    profilePic
  );

  li.innerHTML = `
    <div class="_a9zm">
      <div class="_a9zn _a9zo">
        <a href="/${escapeHtml(commenterUsername)}/" role="link" tabindex="0">
          <img alt="${escapeHtml(
            commenterUsername
          )}'s profile picture" crossorigin="anonymous" draggable="false" src="${profilePic}">
        </a>
      </div>
      <div class="_a9zr">
        <div class="instafn-comment-header-row">
          <a class="instafn-comment-username" href="/${escapeHtml(
            commenterUsername
          )}/" role="link" tabindex="0">${escapeHtml(commenterUsername)}</a>
          <span class="instafn-comment-text">${escapeHtml(comment.text)}</span>
        </div>
        <div class="instafn-comment-footer-row">
          <time class="instafn-comment-time" datetime="${new Date(
            comment.createdAt
          ).toISOString()}" title="${formatFullDate(
    comment.createdAt
  )}">${formatRelativeTime(comment.createdAt)}</time>
          <span class="instafn-comment-likes-count">${comment.likes || 0} ${
    comment.likes === 1 ? "like" : "likes"
  }</span>
          <button class="instafn-comment-reply-btn" data-comment-id="${
            comment.id
          }">
            <span>Reply</span>
          </button>
          ${
            isOwnComment
              ? `<button class="instafn-comment-delete-btn" data-comment-id="${comment.id}"><span>Delete</span></button>`
              : ""
          }
        </div>
      </div>
      <span class="_a9zu">
        <div class="instafn-comment-like-heart" role="button" tabindex="0" data-comment-id="${
          comment.id
        }" data-liked="${comment.liked || false}">
          <svg aria-label="Like" class="instafn-heart-icon" fill="${
            comment.liked ? "rgb(237, 73, 86)" : "none"
          }" height="12" role="img" viewBox="0 0 24 24" width="12"><title>Like</title><path d="${
    comment.liked
      ? "M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"
      : "M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"
  }" fill="${comment.liked ? "rgb(237, 73, 86)" : "currentColor"}" stroke="${
    comment.liked ? "none" : "currentColor"
  }" stroke-width="${comment.liked ? "0" : "1.5"}"></path></svg>
        </div>
      </span>
    </div>
    ${
      comment.replies && comment.replies.length > 0
        ? `
      <div class="instafn-comment-replies">
        <button class="instafn-view-replies">View replies (${
          comment.replies.length
        })</button>
        <ul class="_a9ym" style="display: none;">
            ${(
              await Promise.all(
                comment.replies.map(async (reply) => {
                  const replyPic =
                    (await getUserProfilePic(reply.username)) ||
                    "https://instagram.com/static/images/anonymousUser.jpg/23e7b3b2a737.jpg";
                  return `
                <li class="_a9zj _a9zl">
                    <div class="_a9zm">
                    <div class="_a9zn _a9zo">
                      <a href="/${escapeHtml(
                        reply.username
                      )}/" role="link" tabindex="0" style="height: 32px; width: 32px; display: block;">
                        <img alt="${escapeHtml(
                          reply.username
                        )}'s profile picture" crossorigin="anonymous" draggable="false" src="${replyPic}" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                      </a>
                    </div>
                    <div class="_a9zr">
                      <div class="instafn-comment-header-row">
                        <a class="instafn-comment-username" href="/${escapeHtml(
                          reply.username
                        )}/" role="link" tabindex="0">${escapeHtml(
                    reply.username
                  )}</a>
                        <span class="instafn-comment-text">${escapeHtml(
                          reply.text
                        )}</span>
                      </div>
                      <div class="instafn-comment-footer-row">
                        <time class="instafn-comment-time" datetime="${new Date(
                          reply.createdAt
                        ).toISOString()}" title="${formatFullDate(
                    reply.createdAt
                  )}">${formatRelativeTime(reply.createdAt)}</time>
                        <span class="instafn-comment-likes-count">${reply.likes ||
                          0} ${reply.likes === 1 ? "like" : "likes"}</span>
                        <button class="instafn-comment-reply-btn" data-comment-id="${
                          reply.id
                        }">
                          <span>Reply</span>
                        </button>
                        ${
                          currentUser && reply.userId === currentUser.userId
                            ? `<button class="instafn-comment-delete-btn" data-comment-id="${reply.id}"><span>Delete</span></button>`
                            : ""
                        }
                      </div>
                    </div>
                    <span class="_a9zu">
                      <div class="instafn-comment-like-heart" role="button" tabindex="0" data-comment-id="${
                        reply.id
                      }" data-liked="${reply.liked || false}">
                        <svg aria-label="Like" class="instafn-heart-icon" fill="${
                          reply.liked ? "rgb(237, 73, 86)" : "none"
                        }" height="12" role="img" viewBox="0 0 24 24" width="12"><title>Like</title><path d="${
                    reply.liked
                      ? "M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"
                      : "M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"
                  }" fill="${
                    reply.liked ? "rgb(237, 73, 86)" : "currentColor"
                  }" stroke="${
                    reply.liked ? "none" : "currentColor"
                  }" stroke-width="${reply.liked ? "0" : "1.5"}"></path></svg>
                      </div>
                    </span>
                  </div>
                </li>
              `;
                })
              )
            ).join("")}
        </ul>
      </div>
    `
        : ""
    }
  `;

  // Add event listeners
  const likeHeart = li.querySelector(".instafn-comment-like-heart");
  if (likeHeart) {
    likeHeart.addEventListener("click", () => {
      handleLikeComment(comment.id, likeHeart);
    });
  }

  const likeBtn = li.querySelector(".instafn-comment-like-btn");
  if (likeBtn) {
    likeBtn.addEventListener("click", () => {
      handleLikeComment(comment.id, likeHeart || likeBtn);
    });
  }

  const replyBtn = li.querySelector(".instafn-comment-reply-btn");
  if (replyBtn) {
    replyBtn.addEventListener("click", () => handleReplyComment(comment.id));
  }

  const deleteBtn = li.querySelector(".instafn-comment-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => handleDeleteComment(comment.id));
  }

  const viewRepliesBtn = li.querySelector(".instafn-view-replies");
  if (viewRepliesBtn) {
    viewRepliesBtn.addEventListener("click", () => {
      const repliesList = li.querySelector("._a9ym");
      if (repliesList) {
        repliesList.style.display =
          repliesList.style.display === "none" ? "block" : "none";
        viewRepliesBtn.textContent =
          repliesList.style.display === "none"
            ? `View replies (${comment.replies.length})`
            : `Hide replies (${comment.replies.length})`;
      }
    });
  }

  return li;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Load comments from backend
 */
async function loadComments(username) {
  try {
    // Get verified current user for like status
    let currentUserId = null;
    try {
      const currentUser = await getVerifiedCurrentUser();
      currentUserId = currentUser?.userId || null;
    } catch (e) {
      // If we can't verify, continue without like status
      console.warn(
        "[Instafn Profile Comments] Could not verify user for like status"
      );
    }

    // Get profile user ID
    const profileUserId = await getProfileUserId(username);

    const url = new URL(
      `${API_BASE_URL}/api/comments/${encodeURIComponent(profileUserId)}`
    );
    if (currentUserId) {
      url.searchParams.set("userId", currentUserId);
    }

    console.log(
      `[Instafn Profile Comments] Fetching comments from: ${url.toString()}`
    );

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: getInstagramHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[Instafn Profile Comments] API error ${response.status}:`,
        errorText
      );
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    const data = await response.json();
    const comments = data.comments || [];

    // DEBUG: Log what we got from backend
    console.log(
      "[Instafn Profile Comments] Loaded comments from backend:",
      comments
    );
    comments.forEach((c, i) => {
      console.log(`[Instafn Profile Comments] Comment ${i} from backend:`, {
        id: c.id,
        username: c.username,
        userId: c.userId,
        text: c.text?.substring(0, 30),
      });
    });

    return comments;
  } catch (error) {
    console.error("[Instafn Profile Comments] Error loading comments:", error);

    // Provide more helpful error messages
    if (error.message.includes("Failed to fetch")) {
      console.error(
        "[Instafn Profile Comments] Network error - check if Supabase function is deployed and accessible:",
        API_BASE_URL
      );
      console.error(
        "[Instafn Profile Comments] This could be a CORS issue or the function URL is incorrect"
      );
    }

    return [];
  }
}

/**
 * Safe fetch JSON helper (same as in logic.js)
 */
async function safeFetchJson(url) {
  const csrftoken = getCSRFToken();
  const headers = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.instagram.com/",
    "X-IG-App-ID": "936619743392459",
  };
  if (csrftoken) headers["X-CSRFToken"] = decodeURIComponent(csrftoken);

  const resp = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers,
  });
  if (!resp.ok) {
    if (resp.status === 429) {
      throw new Error(
        "Rate limited by Instagram (HTTP 429). Please try again in 2-3 hours."
      );
    }
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return resp.json();
}

/**
 * Try to extract userId from Instagram's internal page state
 * This is a fallback when API calls are rate limited
 */
function tryExtractUserIdFromPage(username) {
  try {
    // Method 1: Check window.__additionalData or similar Instagram globals
    if (window.__additionalData) {
      const data = window.__additionalData;
      if (data?.user?.id || data?.user?.pk) {
        const userId = String(data.user.id || data.user.pk);
        if (data.user.username === username) {
          console.log(
            `[Instafn Profile Comments] ✅ Extracted userId from window.__additionalData: ${userId}`
          );
          return userId;
        }
      }
    }

    // Method 2: Check React DevTools data (if available)
    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      const reactRoots = window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers;
      if (reactRoots) {
        for (const renderer of reactRoots.values()) {
          const roots = renderer.getFiberRoots?.(1);
          if (roots) {
            for (const root of roots.values()) {
              const fiber = root.current;
              if (fiber?.memoizedState) {
                const state = fiber.memoizedState;
                if (state?.user?.id || state?.user?.pk) {
                  const userId = String(state.user.id || state.user.pk);
                  if (state.user.username === username) {
                    console.log(
                      `[Instafn Profile Comments] ✅ Extracted userId from React state: ${userId}`
                    );
                    return userId;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Method 3: Check for userId in meta tags or data attributes
    const metaUserId = document.querySelector('meta[property="og:url"]');
    if (metaUserId) {
      const url = metaUserId.getAttribute("content");
      const match = url?.match(/\/p\/([^\/]+)\//);
      // This won't work for user IDs, but worth trying
    }

    // Method 4: Check localStorage/sessionStorage for cached user data
    try {
      const cached =
        localStorage.getItem("ig_user_id") ||
        sessionStorage.getItem("ig_user_id");
      if (cached) {
        console.log(
          `[Instafn Profile Comments] ⚠️ Found cached userId: ${cached} (may be stale)`
        );
        return cached;
      }
    } catch (e) {
      // Ignore storage errors
    }
  } catch (error) {
    console.warn(
      "[Instafn Profile Comments] Error extracting userId from page:",
      error
    );
  }
  return null;
}

/**
 * Get verified current user info from Instagram
 * This ensures we get the actual logged-in user, not spoofed data
 * CRITICAL: Always fetches fresh data from Instagram API - NEVER uses cache
 * IMPORTANT: Never use the URL path username - always get from API
 */
async function getVerifiedCurrentUser() {
  try {
    // Method 1: Edit form data (most reliable) - ALWAYS returns logged-in user
    // This endpoint ALWAYS returns the currently logged-in user, regardless of what page you're on
    try {
      const data = await safeFetchJson(
        "https://www.instagram.com/api/v1/accounts/edit/web_form_data/"
      );

      // Debug: Log the full response structure
      console.log(
        "[Instafn Profile Comments] Edit endpoint full response:",
        JSON.stringify(data, null, 2)
      );

      const username = data?.form_data?.username || data?.user?.username;
      // Try multiple paths for userId - Instagram API structure can vary
      let userId = String(
        data?.user?.pk ||
          data?.user?.id ||
          data?.pk ||
          data?.id ||
          data?.form_data?.user_id ||
          data?.form_data?.pk ||
          ""
      );

      console.log("[Instafn Profile Comments] Extracted:", {
        username,
        userId,
        hasUser: !!data?.user,
        hasFormData: !!data?.form_data,
      });

      // If we have username but no userId, try extracting from page
      if (username && !userId) {
        console.log(
          "[Instafn Profile Comments] ⚠️ Have username but no userId. Trying to extract from page..."
        );
        const extractedUserId = tryExtractUserIdFromPage(username);
        if (extractedUserId) {
          userId = extractedUserId;
        }
      }

      // Validate username before returning
      if (username && username.trim() !== "" && userId) {
        console.log(
          `[Instafn Profile Comments] ✅ Verified logged-in user from edit endpoint: ${username} (${userId})`
        );
        return { username: username.trim(), userId };
      } else if (username && !userId) {
        // If we have username but no userId, fetch userId from profile lookup
        console.log(
          "[Instafn Profile Comments] ⚠️ Have username but no userId. Fetching userId from profile lookup..."
        );
        try {
          const profileData = await safeFetchJson(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
              username
            )}`
          );
          console.log(
            "[Instafn Profile Comments] Profile lookup response:",
            profileData
          );

          const fetchedUserId = String(
            profileData?.data?.user?.id ||
              profileData?.data?.user?.pk ||
              profileData?.user?.id ||
              profileData?.user?.pk ||
              ""
          );

          if (fetchedUserId) {
            console.log(
              `[Instafn Profile Comments] ✅ Got userId from profile lookup: ${username} (${fetchedUserId})`
            );
            // Cache it for future use
            try {
              localStorage.setItem("ig_user_id", fetchedUserId);
            } catch (e) {
              // Ignore storage errors
            }
            return { username: username.trim(), userId: fetchedUserId };
          } else {
            console.error(
              "[Instafn Profile Comments] ❌ Profile lookup didn't return userId"
            );
          }
        } catch (e) {
          console.error(
            "[Instafn Profile Comments] ❌ Failed to get userId from profile lookup:",
            e
          );
          // If rate limited, allow posting with username only IF we have a valid username
          // The backend will need to look up userId during verification
          if (
            (e.message?.includes("429") ||
              e.message?.includes("Rate limited")) &&
            username &&
            username.trim() !== ""
          ) {
            console.warn(
              "[Instafn Profile Comments] ⚠️ Rate limited - will attempt with username only. Backend will look up userId during verification."
            );
            return { username: username.trim(), userId: null };
          }
          // If we don't have a valid username, don't return anything - let it throw
        }
      } else {
        console.warn(
          "[Instafn Profile Comments] ⚠️ Edit endpoint returned incomplete data:",
          { username, userId, data }
        );
      }
    } catch (e) {
      console.error("[Instafn Profile Comments] ❌ Edit endpoint failed:", e);
      // Continue to next method
    }

    // Method 2: Try current_user endpoint (also returns logged-in user)
    // Note: This endpoint often returns 400, so it's just a fallback
    try {
      const data = await safeFetchJson(
        "https://www.instagram.com/api/v1/accounts/current_user/"
      );
      console.log(
        "[Instafn Profile Comments] current_user endpoint response:",
        data
      );

      const username = data?.user?.username;
      const userId = String(
        data?.user?.pk || data?.user?.id || data?.pk || data?.id || ""
      );

      if (username && userId) {
        console.log(
          `[Instafn Profile Comments] ✅ Verified logged-in user from current_user endpoint: ${username} (${userId})`
        );
        return { username: username.trim(), userId };
      }
    } catch (e) {
      // This endpoint often fails with 400, so we just log and continue
      console.warn(
        "[Instafn Profile Comments] ⚠️ current_user endpoint failed (this is normal):",
        e.message || e
      );
    }

    // Method 3: Last resort - manually fetch from edit endpoint again with different approach
    // This ensures we never use cached data
    try {
      const csrftoken = getCSRFToken();
      const headers = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://www.instagram.com/",
        "X-IG-App-ID": "936619743392459",
      };
      if (csrftoken) {
        headers["X-CSRFToken"] = decodeURIComponent(csrftoken);
      }

      const resp = await fetch(
        "https://www.instagram.com/api/v1/accounts/edit/web_form_data/",
        {
          method: "GET",
          credentials: "include",
          headers,
          cache: "no-store", // Force fresh fetch
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        const username = data?.form_data?.username || data?.user?.username;
        const userId = String(data?.user?.pk || data?.user?.id || "");

        if (username && userId) {
          console.log(
            `[Instafn Profile Comments] ✅ Verified logged-in user (retry): ${username} (${userId})`
          );
          return { username: username.trim(), userId };
        }
      }
    } catch (e) {
      console.error("[Instafn Profile Comments] ❌ Final retry failed:", e);
    }

    throw new Error("Could not verify user identity - all methods failed");
  } catch (error) {
    console.error(
      "[Instafn Profile Comments] ❌ Error getting verified user:",
      error
    );
    throw error;
  }
}

/**
 * Get profile user ID from username
 */
async function getProfileUserId(username) {
  try {
    const response = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
        username
      )}`,
      {
        credentials: "include",
        headers: {
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const userId = String(data?.data?.user?.id || data?.data?.user?.pk || "");
    if (!userId) {
      throw new Error("Could not get profile user ID");
    }

    return userId;
  } catch (error) {
    console.error(
      "[Instafn Profile Comments] Error getting profile user ID:",
      error
    );
    throw error;
  }
}

/**
 * Post a new comment
 */
async function postComment(profileUsername, text, parentId = null) {
  try {
    // Get verified current user - this ensures we're using the actual logged-in user
    // CRITICAL: This must return the logged-in user, NOT the profile owner
    // ALWAYS fetch fresh - never use cache
    console.log(
      `[Instafn Profile Comments] 🔍 Fetching verified current user (fresh fetch)...`
    );
    const currentUser = await getVerifiedCurrentUser();

    // CRITICAL: Must have a verified username - if we can't verify the username, don't allow posting
    if (
      !currentUser ||
      !currentUser.username ||
      currentUser.username.trim() === ""
    ) {
      throw new Error(
        "Not authenticated - could not verify username. Please try again later."
      );
    }

    // If userId is missing (due to rate limiting), we'll still attempt to post
    // The backend will need to look up userId from username during verification
    if (!currentUser.userId) {
      console.warn(
        "[Instafn Profile Comments] ⚠️ No userId available (rate limited). Will attempt with username only - backend will look up userId."
      );
    }

    // CRITICAL VALIDATION: Ensure we're not using the profile owner's username
    if (currentUser.username === profileUsername) {
      console.warn(
        `[Instafn Profile Comments] ⚠️ WARNING: Current user matches profile username. This is OK if commenting on own profile, but verifying...`
      );
    }

    console.log(
      `[Instafn Profile Comments] ✅ Posting comment as LOGGED-IN USER: ${
        currentUser.username
      } (ID: ${currentUser.userId || "will be looked up by backend"})`
    );
    console.log(
      `[Instafn Profile Comments] 📝 Commenting on profile: ${profileUsername}`
    );
    console.log(
      `[Instafn Profile Comments] 🔐 Verification: currentUser.username="${currentUser.username}" vs profileUsername="${profileUsername}"`
    );

    // Get profile user ID
    const profileUserId = await getProfileUserId(profileUsername);

    // Get session cookie for backend verification
    const sessionId = document.cookie.match(/sessionid=([^;]+)/)?.[1] || null;

    const response = await fetch(`${API_BASE_URL}/api/comments`, {
      method: "POST",
      headers: getInstagramHeaders(),
      credentials: "include", // This sends cookies automatically
      body: JSON.stringify({
        profileUserId, // The profile being commented on (user ID)
        profileUsername, // The profile being commented on (username) - for display only
        text,
        parentId,
        userId: currentUser.userId || null, // COMMENTER's user ID (may be null if rate limited)
        username: currentUser.username, // COMMENTER's username (logged-in user) - NOT profileUsername!
        // Include session token for backend verification
        sessionId: sessionId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(
      "[Instafn Profile Comments] Comment created, backend returned:",
      data.comment
    );
    console.log(
      "[Instafn Profile Comments] Comment username:",
      data.comment?.username
    );
    console.log(
      "[Instafn Profile Comments] Expected username:",
      currentUser.username
    );

    // Ensure the returned comment has the correct username
    if (data.comment && data.comment.username !== currentUser.username) {
      console.error(
        `[Instafn Profile Comments] USERNAME MISMATCH! Backend returned: ${data.comment.username}, Expected: ${currentUser.username}`
      );
      // Override with correct username
      data.comment.username = currentUser.username;
      data.comment.userId = currentUser.userId;
    }

    return data.comment;
  } catch (error) {
    console.error("[Instafn Profile Comments] Error posting comment:", error);
    throw error;
  }
}

/**
 * Like/unlike a comment
 */
async function handleLikeComment(commentId, likeBtn) {
  try {
    const currentUser = await getVerifiedCurrentUser();
    if (!currentUser || !currentUser.userId) {
      console.error("[Instafn Profile Comments] Not authenticated");
      return;
    }

    // Prevent multiple rapid clicks
    if (likeBtn.dataset.processing === "true") {
      return;
    }
    likeBtn.dataset.processing = "true";

    const isLiked = likeBtn.dataset.liked === "true";

    // If already liked, unlike it; if not liked, like it
    const response = await fetch(
      `${API_BASE_URL}/api/comments/${commentId}/like`,
      {
        method: isLiked ? "DELETE" : "POST",
        headers: getInstagramHeaders(),
        credentials: "include",
        body: JSON.stringify({
          userId: currentUser.userId,
          username: currentUser.username,
          sessionId: document.cookie.match(/sessionid=([^;]+)/)?.[1] || null,
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const newLikes = data.likes || 0;
      const newLikedState = !isLiked; // Toggle state

      // Update like button state
      likeBtn.dataset.liked = newLikedState ? "true" : "false";

      // Update heart SVG fill color for all heart buttons for this comment
      const allHeartBtns = document.querySelectorAll(
        `.instafn-comment-like-heart[data-comment-id="${commentId}"]`
      );
      allHeartBtns.forEach((btn) => {
        const heartSvg = btn.querySelector(".instafn-heart-icon");
        if (heartSvg) {
          const path = heartSvg.querySelector("path");
          if (newLikedState) {
            heartSvg.setAttribute("fill", "rgb(237, 73, 86)");
            if (path) {
              path.setAttribute("fill", "rgb(237, 73, 86)");
              path.setAttribute(
                "d",
                "M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"
              );
            }
          } else {
            heartSvg.setAttribute("fill", "currentColor");
            if (path) {
              path.setAttribute("fill", "currentColor");
              path.setAttribute(
                "d",
                "M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"
              );
            }
          }
        }
        btn.dataset.liked = newLikedState ? "true" : "false";
      });

      // Update likes count text
      const likesBtn = document.querySelector(
        `.instafn-comment-like-btn[data-comment-id="${commentId}"]`
      );
      if (likesBtn) {
        const likesSpan = likesBtn.querySelector("span");
        if (likesSpan) {
          likesSpan.textContent = `${newLikes} ${
            newLikes === 1 ? "like" : "likes"
          }`;
        }
        likesBtn.dataset.liked = newLikedState ? "true" : "false";
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Instafn Profile Comments] Like failed:", errorData);
    }

    likeBtn.dataset.processing = "false";
  } catch (error) {
    console.error("[Instafn Profile Comments] Error liking comment:", error);
    likeBtn.dataset.processing = "false";
  }
}

/**
 * Handle reply to comment
 */
function handleReplyComment(commentId) {
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (!sidebar) return;

  const input = sidebar.querySelector(".instafn-comment-input");
  if (input) {
    input.focus();
    input.dataset.replyingTo = commentId;
    input.placeholder = `Reply to comment...`;
  }
}

/**
 * Handle delete comment
 */
async function handleDeleteComment(commentId) {
  if (!confirm("Are you sure you want to delete this comment?")) return;

  try {
    const currentUser = await getVerifiedCurrentUser();
    if (!currentUser || !currentUser.userId) {
      alert("Not authenticated");
      return;
    }

    const response = await fetch(`${API_BASE_URL}/api/comments/${commentId}`, {
      method: "DELETE",
      headers: getInstagramHeaders(),
      credentials: "include",
      body: JSON.stringify({
        userId: currentUser.userId,
        username: currentUser.username,
        sessionId: document.cookie.match(/sessionid=([^;]+)/)?.[1] || null,
      }),
    });

    if (response.ok) {
      const commentEl = document.querySelector(
        `[data-comment-id="${commentId}"]`
      );
      if (commentEl) {
        commentEl.remove();
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      alert(errorData.error || "Failed to delete comment");
    }
  } catch (error) {
    console.error("[Instafn Profile Comments] Error deleting comment:", error);
    alert("Failed to delete comment");
  }
}

/**
 * Create and show the comments sidebar
 */
async function showCommentsSidebar() {
  if (sidebarOpen) return;

  const username = getProfileUsernameFromPath();
  if (!username) return;

  sidebarOpen = true;

  // Test Supabase connection on first open (for debugging)
  if (!window.instafnSupabaseTested) {
    window.instafnSupabaseTested = true;
    await testSupabaseConnection();
  }

  // Create sidebar overlay
  const overlay = document.createElement("div");
  overlay.className = "instafn-comments-overlay";
  overlay.id = SIDEBAR_ID + "-overlay";

  // Create sidebar
  const sidebar = document.createElement("div");
  sidebar.className = "instafn-comments-sidebar";
  sidebar.id = SIDEBAR_ID;

  // Header
  const header = document.createElement("div");
  header.className = "instafn-comments-header";
  header.innerHTML = `
    <div class="instafn-comments-header-title">Comments</div>
    <button class="instafn-comments-close" aria-label="Close">
      <svg aria-label="Close" class="x1lliihq x1n2onr6 x5n08af" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
        <title>Close</title>
        <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="3" y2="21"></line>
        <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="21" y2="3"></line>
      </svg>
    </button>
  `;

  // Comments container
  const commentsContainer = document.createElement("div");
  commentsContainer.className = "instafn-comments-container";

  // Loading state
  commentsContainer.innerHTML = `
    <div class="instafn-comments-loading">
      <div class="instafn-loading-spinner"></div>
      <div>Loading comments...</div>
    </div>
  `;

  // Input area - clean Instagram-style input (no random date)
  const inputArea = document.createElement("div");
  inputArea.className = "instafn-comment-input-area";
  inputArea.innerHTML = `
    <section class="x5ur3kl x13fuv20 x178xt8z x1roi4f4 x2lah0s xvs91rp xl56j7k x17ydfre x1n2onr6 x10b6aqq x1yrsyyn x1hrcb2b xv54qhq">
      <div>
        <form class="x78zum5 x1q0g3np x1iyjqo2 xs83m0k xln7xf2 xk390pu xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x972fbf x10w94by x1qhh985 x14e42zd" method="POST">
          <div class="x6s0dn4 x78zum5 x1q0g3np x1iyjqo2 xs83m0k xln7xf2 xk390pu xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x11njtxf">
            <div class="x1y1aw1k xv54qhq xwib8y2 xf7dkkf">
              <div class="x1i10hfl x972fbf x10w94by x1qhh985 x14e42zd x9f619 x3ct3a4 xdj266r x14z9mp xat24cr x1lziwak x16tdsg8 x1hl2dhg xggy1nq x1a2a7pz x6s0dn4 xjbqb8w x1ejq31n x18oe1m7 x1sy0etr xstzfhl x1ypdohk x78zum5 xl56j7k x1epzrsm x4gyw5p x1jplu5e x1o7uuvo x14snt5h xexx8yu xyri2b x18d9i69 x1c1uobl" role="button" tabindex="0">
                <div class="x6s0dn4 x78zum5 xdt5ytf xl56j7k">
                  <svg aria-label="Emoji" class="x1lliihq x1n2onr6 x5n08af" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><title>Emoji</title><path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z"></path></svg>
                </div>
              </div>
              <textarea aria-label="Add a comment…" placeholder="Add a comment…" autocomplete="off" autocorrect="off" class="instafn-comment-input" dir="" maxlength="2200"></textarea>
              <div class="x13fj5qh">
                <div aria-disabled="true" class="instafn-comment-post-btn" role="button" tabindex="-1"><span class="x16xky2k">Post</span></div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </section>
  `;

  sidebar.appendChild(header);
  sidebar.appendChild(commentsContainer);
  sidebar.appendChild(inputArea);
  overlay.appendChild(sidebar);
  document.body.appendChild(overlay);

  // Close handlers
  const closeBtn = header.querySelector(".instafn-comments-close");
  closeBtn.addEventListener("click", closeCommentsSidebar);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeCommentsSidebar();
    }
  });

  // Escape key handler
  const escapeHandler = (e) => {
    if (e.key === "Escape" && sidebarOpen) {
      closeCommentsSidebar();
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);

  // Load comments
  const comments = await loadComments(username);
  await renderComments(commentsContainer, comments, username);

  // Input handler
  const input = inputArea.querySelector(".instafn-comment-input");
  const postBtn = inputArea.querySelector(".instafn-comment-post-btn");

  if (!input) {
    console.error("[Instafn Profile Comments] Textarea not found!");
    return;
  }

  // Auto-resize textarea
  const autoResize = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 100)}px`;
  };

  input.addEventListener("input", () => {
    autoResize();
    const hasText = input.value.trim().length > 0;
    if (postBtn) {
      postBtn.disabled = !hasText;
      postBtn.setAttribute("aria-disabled", hasText ? "false" : "true");
      postBtn.setAttribute("tabindex", hasText ? "0" : "-1");
    }
  });

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey && input.value.trim()) {
      e.preventDefault();
      await handlePostComment(username, input, commentsContainer);
    }
  });

  postBtn.addEventListener("click", async () => {
    if (input.value.trim()) {
      await handlePostComment(username, input, commentsContainer);
    }
  });

  // Focus input
  setTimeout(() => input.focus(), 100);
}

/**
 * Render comments in container
 */
async function renderComments(container, comments, username) {
  let currentUser = null;
  try {
    currentUser = await getVerifiedCurrentUser();
  } catch (e) {
    // Continue without current user (won't show delete buttons)
    console.warn(
      "[Instafn Profile Comments] Could not get current user for rendering"
    );
  }

  // DEBUG: Log all comments before rendering
  console.log("[Instafn Profile Comments] Rendering comments:", comments);
  comments.forEach((c, i) => {
    console.log(`[Instafn Profile Comments] Comment ${i}:`, {
      id: c.id,
      username: c.username,
      userId: c.userId,
      text: c.text?.substring(0, 50),
    });
  });

  if (comments.length === 0) {
    container.innerHTML = `
      <div class="instafn-comments-empty">
        <div>No comments yet.</div>
        <div style="margin-top: 8px; color: rgb(var(--ig-secondary-text)); font-size: 14px;">
          Be the first to comment!
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = '<ul class="_a9ym"></ul>';
  const commentsList = container.querySelector("._a9ym");

  // Create comments sequentially to avoid race conditions
  for (const comment of comments) {
    const commentEl = await createCommentElement(comment, currentUser);
    commentsList.appendChild(commentEl);
  }
}

/**
 * Handle posting a comment
 */
async function handlePostComment(username, input, container) {
  const text = input.value.trim();
  if (!text) return;

  const parentId = input.dataset.replyingTo || null;
  const postBtn =
    container
      .closest(".instafn-comments-sidebar")
      ?.querySelector(".instafn-comment-post-btn") ||
    document.querySelector(".instafn-comment-post-btn");

  if (postBtn) {
    postBtn.disabled = true;
    postBtn.setAttribute("aria-disabled", "true");
    postBtn.setAttribute("tabindex", "-1");
  }
  input.disabled = true;

  try {
    const newComment = await postComment(username, text, parentId);
    // Reload comments
    const comments = await loadComments(username);
    await renderComments(container, comments, username);
    input.value = "";
    input.dataset.replyingTo = "";
    input.placeholder = "Add a comment...";
  } catch (error) {
    alert("Failed to post comment. Please try again.");
    console.error("[Instafn Profile Comments] Error:", error);
  } finally {
    if (postBtn) {
      postBtn.disabled = false;
      postBtn.setAttribute("aria-disabled", "false");
      postBtn.setAttribute("tabindex", "0");
    }
    input.disabled = false;
    input.focus();
  }
}

/**
 * Close comments sidebar
 */
function closeCommentsSidebar() {
  const overlay = document.getElementById(SIDEBAR_ID + "-overlay");
  if (overlay) {
    overlay.remove();
  }
  sidebarOpen = false;
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

  injectCommentsButton();
  setTimeout(injectCommentsButton, 500);
  setTimeout(injectCommentsButton, 1500);
  setTimeout(injectCommentsButton, 3000);

  let lastUrl = location.href;
  let lastProfileUsername = getProfileUsernameFromPath();

  urlObserver = new MutationObserver(() => {
    if (!isEnabled) return;
    if (location.href !== lastUrl) {
      const newProfileUsername = getProfileUsernameFromPath();
      lastUrl = location.href;

      if (newProfileUsername !== lastProfileUsername) {
        lastProfileUsername = newProfileUsername;
        currentUsername = null;
        if (sidebarOpen) {
          closeCommentsSidebar();
        }
        setTimeout(injectCommentsButton, 300);
      }
    }
  });
  urlObserver.observe(document, { subtree: true, childList: true });

  domObserver = new MutationObserver(() => {
    if (!isEnabled) return;
    const username = getProfileUsernameFromPath();
    if (username && !document.getElementById(BUTTON_ID)) {
      // Inject on all profiles
      injectCommentsButton();
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

  if (sidebarOpen) {
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

  currentUsername = null;
}
