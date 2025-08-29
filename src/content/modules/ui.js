import {
  getCurrentUser,
  loadPreviousSnapshot,
  extractUsernames,
  computeFollowAnalysis,
  getProfilePicData,
} from "./followAnalyzer.js";

// Inject styles onto page
export function injectStyles() {
  if (document.getElementById("instafn-scan-styles")) return;
  const marker = document.createElement("div");
  marker.id = "instafn-scan-styles";
  marker.style.display = "none";
  document.head.appendChild(marker);
}

// Fetch user info from Instagram API
export async function fetchUserInfo(username) {
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
      if (response.status === 429) {
        throw new Error(
          "Rate limited by Instagram (HTTP 429). Please try again in 15–60 minutes."
        );
      }
      throw new Error(`HTTP ${response.status}`);
    }
    const info = await response.json();
    const user = info?.data?.user;
    if (user) {
      return {
        username: user.username,
        fullName: user.full_name,
        profilePic: user.profile_pic_url_hd || user.profile_pic_url,
        isPrivate: user.is_private,
        isVerified: user.is_verified,
        isFollowed: user.followed_by_viewer,
        isFollowing: user.follows_viewer,
        id: user.id || user.pk,
      };
    }
  } catch (_) {}
  return null;
}

// Follow/unfollow user helpers
export async function followUser(userId) {
  const csrftoken = (document.cookie.match(/(?:^|; )csrftoken=([^;]+)/) ||
    [])[1];
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.instagram.com/",
    "X-IG-App-ID": "936619743392459",
    "X-ASBD-ID": "129477",
    "X-IG-WWW-Claim": "0",
  };
  if (csrftoken) headers["X-CSRFToken"] = decodeURIComponent(csrftoken);

  const response = await fetch(
    `https://www.instagram.com/api/v1/friendships/create/${userId}/`,
    {
      method: "POST",
      credentials: "include",
      headers,
      body: "target_user_id=" + userId,
    }
  );
  if (!response.ok) throw new Error(`Follow failed: ${response.status}`);
  return response.json();
}

export async function unfollowUser(userId) {
  const csrftoken = (document.cookie.match(/(?:^|; )csrftoken=([^;]+)/) ||
    [])[1];
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.instagram.com/",
    "X-IG-App-ID": "936619743392459",
    "X-ASBD-ID": "129477",
    "X-IG-WWW-Claim": "0",
  };
  if (csrftoken) headers["X-CSRFToken"] = decodeURIComponent(csrftoken);

  const response = await fetch(
    `https://www.instagram.com/api/v1/friendships/destroy/${userId}/`,
    {
      method: "POST",
      credentials: "include",
      headers,
      body: "target_user_id=" + userId,
    }
  );
  if (!response.ok) throw new Error(`Unfollow failed: ${response.status}`);
  return response.json();
}

// Create follow button component
export function createFollowButton(
  username,
  isFollowing,
  cachedUserData = null
) {
  const btn = document.createElement("button");
  btn.className = `instafn-follow-btn ${isFollowing ? "following" : ""}`;
  btn.textContent = isFollowing ? "Following" : "Follow";
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    btn.disabled = true;
    const originalText = btn.textContent;
    try {
      let userInfo = cachedUserData;
      if (!userInfo) userInfo = await fetchUserInfo(username);
      if (!userInfo) {
        btn.disabled = false;
        return;
      }
      const action = isFollowing ? "unfollow" : "follow";
      const confirmed = confirm(`Do you want to ${action} @${username}?`);
      if (!confirmed) {
        btn.disabled = false;
        return;
      }
      const userId = userInfo.id || userInfo.pk;
      if (!userId) {
        alert("Could not get user ID for this action");
        btn.disabled = false;
        return;
      }
      if (isFollowing) await unfollowUser(userId);
      else await followUser(userId);

      const wasFollowing = btn.classList.contains("following");
      btn.classList.toggle("following", !wasFollowing);
      btn.textContent = wasFollowing ? "Follow" : "Following";
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

// Helper functions
function getProfileUsernameFromPath() {
  const m = location.pathname.match(/^\/([^\/]+)\/?$/);
  return m ? m[1] : null;
}

let cachedMe = null;
let meCacheTime = 0;
const ME_CACHE_DURATION = 5 * 60 * 1000;

async function getMeCached() {
  const now = Date.now();
  if (cachedMe && now - meCacheTime < ME_CACHE_DURATION) return cachedMe;
  try {
    cachedMe = await getCurrentUser();
    meCacheTime = now;
  } catch (_) {}
  return cachedMe;
}

async function isOwnProfile() {
  const username = getProfileUsernameFromPath();
  if (!username) return false;
  const me = await getMeCached();
  if (!me) return false;
  return username.toLowerCase() === me.username.toLowerCase();
}

// Create and inject scan button
function createScanButton() {
  const btn = document.createElement("button");
  btn.className = "instafn-scan-btn";
  btn.title = "Scan followers/following";
  btn.innerHTML = `Follow analysis`;
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    try {
      const overlay = await openModal("Follow analysis");
      const content = overlay.querySelector(".instafn-content");
      await renderScanButton(content, overlay);
    } catch (err) {
      alert("Failed to open modal: " + (err?.message || String(err)));
    }
  });
  return btn;
}

function placeScanButton() {
  if (window.top !== window.self) return false;
  const editProfileLink = document.querySelector('a[href="/accounts/edit/"]');
  if (!editProfileLink) return false;
  const editProfileWrapper = editProfileLink.closest(".html-div");
  if (!editProfileWrapper) return false;
  const actionContainer = editProfileWrapper.parentElement;
  if (!actionContainer) return false;
  if (actionContainer.querySelector(".instafn-scan-btn")) return true;
  const btn = createScanButton();
  actionContainer.appendChild(btn);
  return true;
}

let scanBtnObserver = null;

export async function injectScanButton() {
  const pathOk = /^\/[A-Za-z0-9._]+\/?$/.test(window.location.pathname);
  if (!pathOk) return;
  const me = await getMeCached();
  if (me && !(await isOwnProfile())) {
    document
      .querySelectorAll(".instafn-scan-btn, .instafn-scan-fab")
      .forEach((el) => el.remove());
    return;
  }

  const settings = await new Promise((resolve) => {
    chrome.storage.sync.get({ activateFollowAnalyzer: true }, resolve);
  });
  if (!settings.activateFollowAnalyzer) {
    document
      .querySelectorAll(".instafn-scan-btn, .instafn-scan-fab")
      .forEach((el) => el.remove());
    return;
  }
  injectStyles();
  const placed = placeScanButton();
  if (placed) return;
  if (scanBtnObserver) return;
  scanBtnObserver = new MutationObserver(() => {
    placeScanButton();
  });
  scanBtnObserver.observe(document.body, { childList: true, subtree: true });
}

// Modal functionality
export async function openModal(titleText) {
  injectStyles();
  const overlay = document.createElement("div");
  overlay.className = "instafn-modal-overlay";
  const modal = document.createElement("div");
  modal.className = "instafn-modal";
  const header = document.createElement("div");
  header.className = "instafn-modal-header";
  const headerLeft = document.createElement("div");
  headerLeft.className = "instafn-header-left";
  const title = document.createElement("div");
  title.className = "instafn-modal-title";
  title.textContent = titleText || "Follow analysis";
  headerLeft.appendChild(title);
  const close = document.createElement("button");
  close.className = "instafn-close";
  close.innerHTML = `<svg aria-label="Close" class="x1lliihq x1n2onr6 x5n08af" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
    <title>Close</title>
    <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="3" y2="21"></line>
    <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="21" y2="3"></line>
  </svg>`;
  close.addEventListener("click", () => overlay.remove());
  header.appendChild(headerLeft);
  header.appendChild(close);
  const tabs = document.createElement("div");
  tabs.className = "instafn-tabs";
  const content = document.createElement("div");
  content.className = "instafn-content";
  content.innerHTML = '<div class="instafn-empty">Preparing analysis...</div>';
  modal.appendChild(header);
  modal.appendChild(tabs);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return overlay;
}

// Confirmation modal
export function confirmWithModal({
  title = "Confirm",
  message = "Are you sure?",
  confirmText = "Confirm",
  cancelText = "Cancel",
} = {}) {
  return new Promise(async (resolve) => {
    try {
      const overlay = await openModal(title);
      const modal = overlay.querySelector(".instafn-modal");
      modal.classList.add("instafn-modal--narrow");
      const tabs = modal.querySelector(".instafn-tabs");
      const content = modal.querySelector(".instafn-content");
      tabs.style.display = "none";

      content.innerHTML = `
        <div style="text-align: center; padding: 28px 20px;">
          <p class="instafn-modal-description">${message}</p>
          <div class="instafn-button-container">
            <button class="instafn-secondary-button" data-instafn-cancel>${cancelText}</button>
            <button class="instafn-primary-button" data-instafn-confirm>${confirmText}</button>
          </div>
        </div>
      `;

      const cleanupAndResolve = (value) => {
        overlay.remove();
        resolve(value);
      };

      content
        .querySelector("[data-instafn-cancel]")
        .addEventListener("click", () => cleanupAndResolve(false));
      content
        .querySelector("[data-instafn-confirm]")
        .addEventListener("click", () => cleanupAndResolve(true));

      const closeBtn = modal.querySelector(".instafn-close");
      if (closeBtn) closeBtn.onclick = () => cleanupAndResolve(false);

      const onKey = (e) => {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", onKey, true);
          cleanupAndResolve(false);
        }
      };
      document.addEventListener("keydown", onKey, true);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) cleanupAndResolve(false);
      });
    } catch (_) {
      resolve(confirm(message));
    }
  });
}

// Render scan button interface
export async function renderScanButton(content, overlay) {
  const prevData = await loadPreviousSnapshot();
  const hasPreviousScan =
    prevData.current &&
    prevData.current.username &&
    prevData.current.followers &&
    prevData.current.following;

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
      };
      await renderAnalysisInto(content, mockData);
    });
  }

  scanBtn.addEventListener("click", async () => {
    try {
      const titleEl = overlay.querySelector(".instafn-modal-title");
      titleEl.textContent = "Scanning...";
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
      const title = isRateLimited ? "Rate Limited" : "Scan Failed";
      const message = isRateLimited
        ? "Instagram is rate limiting requests right now. Please try again in 15–60 minutes and avoid running scans repeatedly."
        : err.message;
      content.innerHTML = `
        <div style="text-align: center; padding: 40px 20px;">
          <div class="instafn-error-icon">⚠️</div>
          <h3 class="instafn-error-title">${title}</h3>
          <p class="instafn-error-message">${message}</p>
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

// Render analysis results
export async function renderAnalysisInto(container, data) {
  const tabDefs = [
    { key: "dontFollowYouBack", label: "Don't follow you back" },
    { key: "youDontFollowBack", label: "You don't follow back" },
    { key: "lostFollowers", label: "Since last: Unfollowed you" },
    { key: "newFollowers", label: "Since last: Followed you" },
    { key: "peopleYouFollowed", label: "Since last: You followed" },
    { key: "peopleYouUnfollowed", label: "Since last: You unfollowed" },
    { key: "mutuals", label: "Mutual followers" },
  ];

  const modal = container.closest(".instafn-modal");
  const tabsBar = modal.querySelector(".instafn-tabs");
  tabsBar.innerHTML = "";
  const views = new Map();

  for (const def of tabDefs) {
    const btn = document.createElement("button");
    btn.className = "instafn-tab";
    const items = data[def.key] || [];
    btn.textContent = `${def.label} (${items.length})`;
    tabsBar.appendChild(btn);

    const view = document.createElement("div");
    view.style.display = "none";
    if (!items.length) {
      view.innerHTML = '<div class="instafn-empty">None</div>';
    } else {
      const list = document.createElement("div");
      list.className = "instafn-list";
      const userInfos = items.map((username) => {
        const cachedData = getProfilePicData(username, data.cachedSnapshot);
        const info = cachedData
          ? {
              username: cachedData.username,
              fullName: cachedData.fullName || username,
              profilePic:
                cachedData.profilePicBase64 || cachedData.profilePicUrl || null,
              isPrivate: cachedData.isPrivate || false,
              isVerified: cachedData.isVerified || false,
              isFollowed: cachedData.isFollowed || false,
              isFollowing: cachedData.isFollowing || false,
              id: cachedData.id,
            }
          : {
              username,
              fullName: username,
              profilePic: null,
              isPrivate: false,
              isVerified: false,
              isFollowed: false,
              isFollowing: false,
              id: null,
            };
        return { username, info };
      });

      for (const { username, info } of userInfos) {
        const item = document.createElement("div");
        item.className = "instafn-item";
        const itemLeft = document.createElement("div");
        itemLeft.className = "instafn-item-left";
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        if (info?.profilePic) img.src = info.profilePic;
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
        const nameEl = document.createElement("div");
        nameEl.className = "instafn-item-name";
        nameEl.textContent = info?.fullName || "";
        itemInfo.appendChild(usernameEl);
        itemInfo.appendChild(nameEl);
        itemLeft.appendChild(img);
        itemLeft.appendChild(itemInfo);

        let itemIsFollowing = false;
        switch (def.key) {
          case "dontFollowYouBack":
          case "mutuals":
          case "peopleYouFollowed":
            itemIsFollowing = true;
            break;
          default:
            itemIsFollowing = info?.isFollowed || false;
        }
        const followBtn = createFollowButton(username, itemIsFollowing, info);
        item.appendChild(itemLeft);
        item.appendChild(followBtn);
        list.appendChild(item);
      }
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
      const tabsBarRect = tabsBar.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
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
