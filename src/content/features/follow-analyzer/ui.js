import {
  loadPreviousSnapshot,
  extractUsernames,
  computeFollowAnalysis,
  getProfilePicData,
  fetchUserInfo,
  updateFriendship,
  getMeCached,
  isOwnProfile,
} from "./logic.js";
import { injectStylesheet } from "../../utils/styleLoader.js";

const ensureStyles = () =>
  injectStylesheet(
    "content/features/follow-analyzer/follow-analyzer.css",
    "instafn-follow-analyzer"
  );

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
      if (isFollowing) await updateFriendship(userId, false);
      else await updateFriendship(userId, true);

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

function createScanButton() {
  const btn = document.createElement("button");
  btn.className = "instafn-scan-btn";
  btn.title = "Scan followers/following";
  btn.innerHTML = `Follow analyzer`;
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

  const existingBtn = document.querySelector(".instafn-scan-btn");
  if (existingBtn) {
    const editProfileLink = document.querySelector('a[href="/accounts/edit/"]');
    if (editProfileLink) {
      return true;
    }
    existingBtn.closest(".html-div")?.remove();
    return false;
  }

  const editProfileLink = document.querySelector('a[href="/accounts/edit/"]');
  if (!editProfileLink) return false;

  let actionContainer = editProfileLink.closest(".html-div");
  if (!actionContainer) return false;
  actionContainer = actionContainer.parentElement;
  if (!actionContainer) return false;

  let currentContainer = actionContainer;
  let depth = 0;
  while (currentContainer && depth < 5) {
    if (currentContainer.querySelector('a[href="/archive/stories/"]')) {
      actionContainer = currentContainer;
      break;
    }
    currentContainer = currentContainer.parentElement;
    depth++;
  }

  if (!actionContainer) {
    actionContainer = editProfileLink.closest("section");
    if (!actionContainer) {
      actionContainer = editProfileLink.parentElement;
      while (actionContainer && actionContainer.children.length < 2) {
        actionContainer = actionContainer.parentElement;
      }
    }
  }

  if (!actionContainer) return false;
  if (actionContainer.querySelector(".instafn-scan-btn")) return true;

  const existingWrappers = Array.from(
    actionContainer.querySelectorAll(".html-div")
  ).filter((wrapper) => wrapper.querySelector(".instafn-scan-btn"));
  existingWrappers.forEach((wrapper) => wrapper.remove());

  actionContainer.classList.add("instafn-button-container");

  const btnWrapper = document.createElement("div");
  btnWrapper.className =
    "html-div xdj266r x14z9mp xat24cr x1lziwak xexx8yu xyri2b x18d9i69 x1c1uobl x9f619 xjbqb8w x78zum5 x15mokao x1ga7v0g x16uus16 xbiv7yw x1n2onr6 x1plvlek xryxfnj x1iyjqo2 x2lwn1j xeuugli xdt5ytf xqjyukv x1qjc9v5 x1oa3qoh x1nhvcw1";

  const btn = createScanButton();
  btnWrapper.appendChild(btn);
  actionContainer.appendChild(btnWrapper);
  return true;
}

function ensureFloatingScanFab() {
  ensureStyles();
  if (document.querySelector(".instafn-scan-fab")) return;

  const fab = document.createElement("button");
  fab.className = "instafn-scan-btn instafn-scan-fab";
  fab.style.position = "fixed";
  fab.style.bottom = "16px";
  fab.style.right = "16px";
  fab.style.zIndex = "100000";
  fab.style.boxShadow = "0 8px 24px rgba(0,0,0,0.24)";
  fab.style.padding = "0 16px";
  fab.style.height = "40px";
  fab.textContent = "Follow analyzer";

  fab.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const overlay = await openModal("Follow analysis");
      const content = overlay.querySelector(".instafn-content");
      await renderScanButton(content, overlay);
    } catch (err) {
      alert("Failed to open modal: " + (err?.message || String(err)));
    }
  });

  document.body.appendChild(fab);
}

function clearFloatingScanFab() {
  document.querySelectorAll(".instafn-scan-fab").forEach((el) => el.remove());
}

let scanBtnObserver = null;
let isInjecting = false;

export async function injectScanButton() {
  ensureStyles();
  if (isInjecting) return;
  if (document.querySelector(".instafn-scan-btn")) return;

  const pathOk = /^\/[A-Za-z0-9._]+\/?$/.test(window.location.pathname);
  if (!pathOk) return;

  isInjecting = true;
  try {
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

    if (document.querySelector(".instafn-scan-btn")) {
      return;
    }

    const placed = placeScanButton();
    if (placed) {
      clearFloatingScanFab();
      return;
    }

    // Fallback: inject a floating button if the in-feed placement fails
    ensureFloatingScanFab();

    if (scanBtnObserver) return;
    scanBtnObserver = new MutationObserver(() => {
      if (!document.querySelector(".instafn-scan-btn")) {
        const ok = placeScanButton();
        if (ok) {
          clearFloatingScanFab();
        } else {
          ensureFloatingScanFab();
        }
      }
    });
    scanBtnObserver.observe(document.body, { childList: true, subtree: true });
  } finally {
    isInjecting = false;
  }
}

export async function openModal(titleText) {
  ensureStyles();
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
  title.textContent = titleText || "Follow analyzer";
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

export function confirmWithModal({
  title = "Confirm",
  message = "Are you sure?",
  confirmText = "Confirm",
  cancelText = "Cancel",
} = {}) {
  ensureStyles();
  return new Promise(async (resolve) => {
    try {
      const overlay = await openModal(title);
      const modal = overlay.querySelector(".instafn-modal");
      modal.classList.add("instafn-modal--narrow");
      const tabs = modal.querySelector(".instafn-tabs");
      const content = modal.querySelector(".instafn-content");
      tabs.style.display = "none";

      content.innerHTML = `
        <div style="text-align: center; padding: 20px 20px 28px 20px;">
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

export async function renderScanButton(content, overlay) {
  ensureStyles();
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

export async function renderAnalysisInto(container, data) {
  ensureStyles();
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
        let cachedData = getProfilePicData(username, data.cachedSnapshot);
        if (!cachedData) {
          const follower = data.followers?.find((u) => u.username === username);
          const following = data.following?.find(
            (u) => u.username === username
          );
          cachedData = follower || following;
        }

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
        if (info?.profilePic) {
          img.src = info.profilePic;
        } else {
          img.src =
            "data:image/jpeg;base64,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";
        }
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
