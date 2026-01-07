import {
  loadPreviousSnapshot,
  extractUsernames,
  computeFollowAnalysis,
  getProfilePicData,
  fetchUserInfo,
  updateFriendship,
  getMeCached,
  isOwnProfile,
  getProfileUsernameFromPath,
} from "./logic.js";
import { injectStylesheet } from "../../utils/styleLoader.js";
import { createModal, confirmModal } from "../../ui/modal.js";
import { BUTTON_ID as COMMENTS_BUTTON_ID } from "../profile-comments/config.js";
import { findReferenceButton } from "../profile-comments/ui/button.js";

const ensureStyles = () =>
  injectStylesheet(
    "content/features/follow-analyzer/follow-analyzer.css",
    "instafn-follow-analyzer"
  );

const INLINE_SCAN_BUTTON_SELECTOR = ".instafn-scan-btn:not(.instafn-scan-fab)";
const SCAN_BUTTON_ID = "instafn-scan-button";

let currentUsername = null;
let isInjecting = false;
let retryCount = 0;
const MAX_RETRIES = 5;

/**
 * Check if we're on the user's own profile by looking for "Edit profile" or "View archive" buttons
 * This is synchronous and doesn't require async API calls
 */
function isOwnProfileSync() {
  const buttonTexts = ["Edit profile", "Edit Profile", "View archive"];
  const allButtons = Array.from(
    document.querySelectorAll("button, [role='button'], a[role='link']")
  );

  return buttonTexts.some((buttonText) => {
    return allButtons.some((el) => {
      const text = el.textContent?.trim();
      return text === buttonText;
    });
  });
}

/**
 * Create the Follow Analyzer button wrapper
 * Clones the structure of a reference button to match Instagram's styling
 */
function createScanButtonWrapper(referenceWrapper) {
  // Clone the reference wrapper's structure
  const buttonWrapper = document.createElement("div");
  buttonWrapper.className = referenceWrapper?.className || "html-div";
  buttonWrapper.id = SCAN_BUTTON_ID;

  // Create the button element - match Instagram's button structure
  const button = document.createElement("div");
  button.setAttribute("role", "button");
  button.setAttribute("tabindex", "0");
  button.setAttribute("aria-label", "Analyze");
  button.style.cursor = "pointer";
  button.className = "instafn-scan-btn";
  button.innerHTML = `
    <div class="x6s0dn4 x78zum5 xdt5ytf xl56j7k">
      <svg aria-label="Analyze" class="x1lliihq x1n2onr6 x5n08af" fill="currentColor" height="16" role="img" viewBox="0 0 24 24" width="16">
        <title>Analyze</title>
        <path d="M12 8.252a3.5 3.5 0 1 1-3.499-3.5 3.5 3.5 0 0 1 3.5 3.5Z" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="2"></path>
        <path d="M15 19.5v-.447a4.05 4.05 0 0 0-4.05-4.049H6.044a4.05 4.05 0 0 0-4.049 4.049v.447" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>
      </svg>
    </div>
    <div class="_ap3a _aaco _aacw _aad6 _aade" dir="auto">Analyze</div>
  `;

  buttonWrapper.appendChild(button);
  return buttonWrapper;
}

export function createFollowButton(
  username,
  isFollowing,
  cachedUserData = null
) {
  ensureStyles();
  const btn = document.createElement("button");
  btn.className = `instafn-follow-btn ${isFollowing ? "following" : ""}`;
  btn.textContent = isFollowing ? "Following" : "Follow";
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    btn.disabled = true;
    const originalText = btn.textContent;
    try {
      const userInfo = cachedUserData || (await fetchUserInfo(username));
      if (!userInfo) {
        btn.disabled = false;
        return;
      }
      const action = isFollowing ? "unfollow" : "follow";
      if (!confirm(`Do you want to ${action} @${username}?`)) {
        btn.disabled = false;
        return;
      }
      const userId = userInfo.id || userInfo.pk;
      if (!userId) {
        alert("Could not get user ID for this action");
        btn.disabled = false;
        return;
      }
      await updateFriendship(userId, !isFollowing);
      btn.classList.toggle("following");
      btn.textContent = btn.classList.contains("following")
        ? "Following"
        : "Follow";
    } catch (err) {
      alert(
        `Failed to ${isFollowing ? "unfollow" : "follow"} @${username}: ${
          err.message
        }`
      );
      btn.classList.toggle("following", isFollowing);
      btn.textContent = originalText;
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

let scanBtnObserver = null;

function injectEarlyHideCSS() {
  if (document.getElementById("instafn-follow-analyzer-early")) return;
  const style = document.createElement("style");
  style.id = "instafn-follow-analyzer-early";
  style.textContent = `
    .instafn-scan-btn:not(.instafn-scan-fab):not(.instafn-visible),
    .instafn-scan-fab:not(.instafn-visible) { display: none !important; }
    .instafn-scan-btn.instafn-visible,
    .instafn-scan-fab.instafn-visible { display: flex !important; }
  `;
  const target = document.head || document.documentElement || document.body;
  if (target) {
    target.appendChild(style);
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      () => target?.appendChild(style),
      { once: true }
    );
  }
}

let isEnabled = false;

/**
 * Inject the Follow Analyzer button
 * Only works on own profile (when "Edit profile" or "View archive" buttons are present)
 */
export function injectScanButton() {
  if (!isEnabled) return;
  ensureStyles();
  if (isInjecting) return;

  // Only inject on own profile by looking for "Edit profile" or "View archive" buttons
  if (!isOwnProfileSync()) {
    removeScanButton();
    retryCount = 0;
    return;
  }

  const username = getProfileUsernameFromPath();
  if (!username) {
    const existing = document.getElementById(SCAN_BUTTON_ID);
    if (existing) existing.remove();
    currentUsername = null;
    retryCount = 0;
    return;
  }

  // Check if button already exists for this profile
  const existing = document.getElementById(SCAN_BUTTON_ID);
  if (existing && currentUsername === username) {
    return; // Already injected for this profile
  }

  // Remove button if it's for a different profile
  if (existing && currentUsername !== username) {
    existing.remove();
  }

  currentUsername = username;

  // Find reference button (Edit profile or View archive)
  const reference = findReferenceButton();
  if (!reference) {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(
        `[Instafn Follow Analyzer] Reference button not found, retrying... (${retryCount}/${MAX_RETRIES})`
      );
      setTimeout(() => injectScanButton(), 500);
    } else {
      console.warn(
        "[Instafn Follow Analyzer] Max retries reached, giving up on button injection"
      );
      retryCount = 0;
    }
    return;
  }

  // Check if button already exists in this container
  if (reference.container.querySelector(`#${SCAN_BUTTON_ID}`)) {
    retryCount = 0;
    return;
  }

  isInjecting = true;
  try {
    // Add instafn-button-container class to ensure equal flex distribution
    reference.container.classList.add("instafn-button-container");

    // Create button wrapper matching the reference wrapper's style
    const buttonWrapper = createScanButtonWrapper(reference.wrapper);

    // Attach click handler
    const button = buttonWrapper.querySelector('[role="button"]');
    if (button) {
      button.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const overlay = await openModal("Follow analysis");
          await renderScanButton(
            overlay.querySelector(".instafn-content"),
            overlay
          );
        } catch (err) {
          alert("Failed to open modal: " + (err?.message || String(err)));
        }
      });
    }

    // Insert after comments button if it exists, otherwise after reference wrapper
    const commentsButton = reference.container.querySelector(
      `#${COMMENTS_BUTTON_ID}`
    );
    const insertAfter = commentsButton || reference.wrapper;
    if (insertAfter.nextSibling) {
      reference.container.insertBefore(buttonWrapper, insertAfter.nextSibling);
    } else {
      reference.container.appendChild(buttonWrapper);
    }

    console.log("[Instafn Follow Analyzer] Button injected successfully");
    retryCount = 0;
  } finally {
    isInjecting = false;
  }
}

export function setScanButtonEnabled(enabled) {
  isEnabled = enabled;
  if (!enabled) {
    removeScanButton();
    currentUsername = null;
    retryCount = 0;
  }
}

/**
 * Set up DOM observer to watch for button container changes
 * Should be called once during initialization
 */
export function setupScanButtonObserver() {
  if (scanBtnObserver) return; // Already set up

  scanBtnObserver = new MutationObserver(() => {
    // Only inject on own profile
    if (!isOwnProfileSync()) {
      removeScanButton();
      return;
    }
    const username = getProfileUsernameFromPath();
    if (username && !document.getElementById(SCAN_BUTTON_ID)) {
      // Button doesn't exist but we're on own profile - try to inject
      injectScanButton();
    }
  });
  scanBtnObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export function removeScanButton() {
  const existing = document.getElementById(SCAN_BUTTON_ID);
  if (existing) existing.remove();
  // Also remove any FAB buttons
  document.querySelectorAll(".instafn-scan-fab").forEach((el) => el.remove());
  currentUsername = null;
  retryCount = 0;
  if (scanBtnObserver) {
    scanBtnObserver.disconnect();
    scanBtnObserver = null;
  }
}

export function resetRetryCount() {
  retryCount = 0;
}

export function getCurrentUsername() {
  return currentUsername;
}

export function initFollowAnalyzerEarly() {
  injectEarlyHideCSS();
}

export async function openModal(titleText) {
  ensureStyles();
  const overlay = await createModal(titleText || "Follow analyzer", {
    showTabs: true,
  });
  overlay.querySelector(".instafn-content").innerHTML =
    '<div class="instafn-empty">Preparing analysis...</div>';
  return overlay;
}

export function confirmWithModal({
  title = "Confirm",
  message = "Are you sure?",
  confirmText = "Confirm",
  cancelText = "Cancel",
} = {}) {
  ensureStyles();
  return confirmModal({ title, message, confirmText, cancelText });
}

export async function renderScanButton(content, overlay) {
  ensureStyles();
  const prevData = await loadPreviousSnapshot();
  const hasPreviousScan =
    prevData.current?.username &&
    prevData.current?.followers &&
    prevData.current?.following;

  content.innerHTML = `
    <div style="text-align: center; padding: 40px 20px; padding-top: 30px">
      <p class="instafn-modal-description">
        ${
          hasPreviousScan
            ? 'This will update your follow analysis, populating any "Since last:" tabs if applicable.<br/><br/><strong>Try not to use this more than once a day. Instafn is not liable for any rate limiting or account bans. Do not use this if you have a combined following and follower count of ≥13,000. USE AT YOUR OWN RISK!</strong>'
            : "This analyzes your followers and following to show who doesn't follow you back, who you don't follow back, mutual followers, and changes since your last scan.<br/><br/><strong>Try not to use this more than once a day. Do not use this if you have a combined following and follower count of ≥13,000. Instafn is not liable for account bans. USE AT YOUR OWN RISK!</strong>"
        }
      </p>
      <div class="instafn-button-container">
        ${
          hasPreviousScan
            ? `<button id="instafn-view-previous" class="instafn-secondary-button">View Last Scan</button>`
            : ""
        }
        <button id="instafn-start-scan" class="instafn-primary-button">${
          hasPreviousScan ? "New Scan" : "Start Scan"
        }</button>
      </div>
    </div>
  `;

  const scanBtn = content.querySelector("#instafn-start-scan");
  const viewPreviousBtn = content.querySelector("#instafn-view-previous");

  if (viewPreviousBtn) {
    viewPreviousBtn.addEventListener("click", async () => {
      const titleEl = overlay.querySelector(".instafn-modal-title");
      const scanDate = new Date(prevData.current.ts).toLocaleDateString();
      titleEl.textContent = `Previous Results for @${prevData.current.username} (${scanDate})`;
      const followerSet = new Set(
        extractUsernames(prevData.current.followers || [])
      );
      const followingSet = new Set(
        extractUsernames(prevData.current.following || [])
      );
      const mockData = {
        me: {
          username: prevData.current.username,
          userId: prevData.current.userId,
        },
        dontFollowYouBack: Array.from(followingSet).filter(
          (u) => !followerSet.has(u)
        ),
        youDontFollowBack: Array.from(followerSet).filter(
          (u) => !followingSet.has(u)
        ),
        mutuals: Array.from(followerSet).filter((u) => followingSet.has(u)),
        peopleYouFollowed: prevData.current.peopleYouFollowed || [],
        peopleYouUnfollowed: prevData.current.peopleYouUnfollowed || [],
        newFollowers: prevData.current.newFollowers || [],
        lostFollowers: prevData.current.lostFollowers || [],
        hasPrev: true,
        cachedSnapshot: prevData.current,
        previousSnapshot: prevData.previous || prevData.current || null,
        followers: prevData.current.followers || [],
        following: prevData.current.following || [],
      };
      await renderAnalysisInto(content, mockData);
    });
  }

  scanBtn.addEventListener("click", async () => {
    try {
      overlay.querySelector(".instafn-modal-title").textContent = "Scanning...";
      content.innerHTML = `
        <div class="instafn-loading-container">
          <div class="instafn-loading-spinner">
            <svg aria-label="Loading..." class="xemfg65 xa4qsjk x1ka1v4i xbv57ra" role="img" viewBox="0 0 100 100" style="width: 32px; height: 32px; margin: 0 auto;">
              <rect class="x1i210e2" height="6" opacity="0" rx="3" ry="3" transform="rotate(-90 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.08333333333333333" rx="3" ry="3" transform="rotate(-60 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.16666666666666666" rx="3" ry="3" transform="rotate(-30 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.25" rx="3" ry="3" transform="rotate(0 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.3333333333333333" rx="3" ry="3" transform="rotate(30 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.4166666666666667" rx="3" ry="3" transform="rotate(60 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.5" rx="3" ry="3" transform="rotate(90 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.5833333333333334" rx="3" ry="3" transform="rotate(120 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.6666666666666666" rx="3" ry="3" transform="rotate(150 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.75" rx="3" ry="3" transform="rotate(180 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.8333333333333334" rx="3" ry="3" transform="rotate(210 50 50)" width="25" x="72" y="47"></rect>
              <rect class="x1i210e2" height="6" opacity="0.9166666666666666" rx="3" ry="3" transform="rotate(240 50 50)" width="25" x="72" y="47"></rect>
            </svg>
          </div>
          <p class="instafn-loading-text">Scanning followers and following...</p>
        </div>
      `;
      const data = await computeFollowAnalysis();
      await renderAnalysisInto(content, data);
    } catch (err) {
      const isRateLimited = /429|Rate limited/i.test(err?.message || "");
      content.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <div class="instafn-error-icon">⚠️</div>
          <h3 class="instafn-error-title">${
            isRateLimited ? "Rate Limited" : "Scan Failed"
          }</h3>
          <p class="instafn-error-message">${
            isRateLimited
              ? "Instagram is rate limiting requests right now. Please try again in 15–60 minutes and avoid running scans repeatedly."
              : err.message
          }</p>
          ${
            isRateLimited
              ? '<div class="instafn-error-hint">Tips: keep one Instagram tab open, disable ad blockers for instagram.com, and wait before retrying.</div>'
              : ""
          }
          <button onclick="this.closest('.instafn-modal-overlay').remove()" class="instafn-primary-button">Close</button>
        </div>
      `;
    }
  });
}

async function getUserInfo(
  username,
  data,
  currentFollowerSet,
  currentFollowingSet,
  prevFollowerSet,
  prevFollowingSet
) {
  let cachedData =
    getProfilePicData(username, data.cachedSnapshot) ||
    getProfilePicData(username, data.previousSnapshot);
  if (!cachedData) {
    cachedData =
      data.followers?.find((u) => u.username === username) ||
      data.following?.find((u) => u.username === username);
  }

  let info =
    cachedData &&
    (cachedData.profilePicBase64 ||
      cachedData.profilePicUrl ||
      cachedData.profilePic ||
      cachedData.isDeactivated !== undefined)
      ? {
          username: cachedData.username,
          fullName: cachedData.fullName || username,
          profilePic:
            cachedData.profilePicBase64 ||
            cachedData.profilePic ||
            cachedData.profilePicUrl ||
            null,
          isPrivate: cachedData.isPrivate || false,
          isVerified: cachedData.isVerified || false,
          isFollowed: !!cachedData.isFollowed,
          isFollowing: !!cachedData.isFollowing,
          id: cachedData.id,
          isDeactivated: !!cachedData.isDeactivated,
        }
      : null;

  const shouldProbe = !info || (!info.profilePic && !info.isDeactivated);
  if (shouldProbe) {
    try {
      const fetched = await fetchUserInfo(username);
      if (fetched) {
        info = {
          username: fetched.username,
          fullName: fetched.fullName || username,
          profilePic: fetched.profilePic || info?.profilePic || null,
          isPrivate: fetched.isPrivate ?? info?.isPrivate ?? false,
          isVerified: fetched.isVerified ?? info?.isVerified ?? false,
          isFollowed:
            fetched.isFollowed ??
            info?.isFollowed ??
            currentFollowerSet.has(username),
          isFollowing:
            fetched.isFollowing ??
            info?.isFollowing ??
            currentFollowingSet.has(username),
          id: fetched.id || info?.id || null,
          isDeactivated: !!fetched.isDeactivated,
        };
      }
    } catch (_) {}
  }

  if (!info) {
    info = {
      username,
      fullName: username,
      profilePic: null,
      isPrivate: false,
      isVerified: false,
      isFollowed:
        currentFollowerSet.has(username) || prevFollowerSet.has(username),
      isFollowing:
        currentFollowingSet.has(username) || prevFollowingSet.has(username),
      id: null,
      isDeactivated: false,
    };
  }

  info.isFollowed =
    info.isFollowed ||
    currentFollowerSet.has(username) ||
    prevFollowerSet.has(username) ||
    false;
  info.isFollowing =
    info.isFollowing ||
    currentFollowingSet.has(username) ||
    prevFollowingSet.has(username) ||
    false;
  return info;
}

function createUserItem(username, info, itemIsFollowing) {
  const item = document.createElement("div");
  item.className = "instafn-item";
  const itemLeft = document.createElement("div");
  itemLeft.className = "instafn-item-left";
  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.src =
    info?.profilePic ||
    "data:image/jpeg;base64,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";
  const itemInfo = document.createElement("div");
  itemInfo.className = "instafn-item-info";
  const usernameEl = document.createElement("div");
  usernameEl.className = "instafn-item-username";
  const usernameLink = document.createElement("a");
  usernameLink.href = `https://www.instagram.com/${username}/`;
  usernameLink.target = "_blank";
  usernameLink.rel = "noopener noreferrer";
  usernameLink.textContent = username;
  usernameEl.appendChild(usernameLink);
  if (info.isDeactivated) {
    const deactivatedTag = document.createElement("span");
    deactivatedTag.className = "instafn-deactivated-tag";
    deactivatedTag.title = "This account appears deactivated/unavailable.";
    deactivatedTag.textContent = "⚠️";
    usernameEl.appendChild(deactivatedTag);
  }
  const nameEl = document.createElement("div");
  nameEl.className = "instafn-item-name";
  nameEl.textContent = info?.fullName || "";
  itemInfo.appendChild(usernameEl);
  itemInfo.appendChild(nameEl);
  itemLeft.appendChild(img);
  itemLeft.appendChild(itemInfo);
  item.appendChild(itemLeft);
  item.appendChild(createFollowButton(username, itemIsFollowing, info));
  return item;
}

export async function renderAnalysisInto(container, data) {
  ensureStyles();
  const currentFollowerSet = new Set(extractUsernames(data.followers || []));
  const currentFollowingSet = new Set(extractUsernames(data.following || []));
  const prevFollowerSet = new Set(
    extractUsernames(data.previousSnapshot?.followers || [])
  );
  const prevFollowingSet = new Set(
    extractUsernames(data.previousSnapshot?.following || [])
  );

  const tabDefs = [
    {
      key: "dontFollowYouBack",
      label: "Don't follow you back",
      isFollowing: true,
    },
    {
      key: "youDontFollowBack",
      label: "You don't follow back",
      isFollowing: false,
    },
    {
      key: "lostFollowers",
      label: "Since last: Unfollowed you",
      isFollowing: false,
    },
    {
      key: "newFollowers",
      label: "Since last: Followed you",
      isFollowing: false,
    },
    {
      key: "peopleYouFollowed",
      label: "Since last: You followed",
      isFollowing: true,
    },
    {
      key: "peopleYouUnfollowed",
      label: "Since last: You unfollowed",
      isFollowing: false,
    },
    { key: "mutuals", label: "Mutual followers", isFollowing: true },
  ];

  const modal = container.closest(".instafn-modal");
  const tabsBar = modal.querySelector(".instafn-tabs");
  tabsBar.innerHTML = "";
  const views = new Map();

  for (const def of tabDefs) {
    const items = data[def.key] || [];
    const btn = document.createElement("button");
    btn.className = "instafn-tab";
    btn.textContent = `${def.label} (${items.length})`;
    tabsBar.appendChild(btn);

    const view = document.createElement("div");
    view.style.display = "none";
    if (!items.length) {
      view.innerHTML = '<div class="instafn-empty">None</div>';
    } else {
      const list = document.createElement("div");
      list.className = "instafn-list";
      const userInfos = await Promise.all(
        items.map((username) =>
          getUserInfo(
            username,
            data,
            currentFollowerSet,
            currentFollowingSet,
            prevFollowerSet,
            prevFollowingSet
          )
        )
      );
      userInfos.forEach((info, i) => {
        list.appendChild(createUserItem(items[i], info, def.isFollowing));
      });
      view.appendChild(list);
    }
    views.set(btn, view);
  }

  function activate(btn) {
    for (const [b, v] of views.entries()) {
      b.classList.toggle("active", b === btn);
      v.style.display = b === btn ? "block" : "none";
    }
    const tabsBar = btn.closest(".instafn-tabs");
    if (tabsBar) {
      const btnRect = btn.getBoundingClientRect();
      const tabsBarRect = tabsBar.getBoundingClientRect();
      if (
        btnRect.left < tabsBarRect.left ||
        btnRect.right > tabsBarRect.right
      ) {
        btn.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
    container.innerHTML = "";
    container.appendChild(views.get(btn));
  }

  for (const [btn] of views.entries())
    btn.addEventListener("click", () => activate(btn));
  const firstBtn = tabsBar.querySelector(".instafn-tab");
  if (firstBtn) activate(firstBtn);
  const titleEl = modal.querySelector(".instafn-modal-title");
  if (!titleEl.textContent.includes("Previous Results")) {
    titleEl.textContent = `Follow analysis for @${data.me.username}`;
  }
}
