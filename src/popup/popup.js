const DEFAULTS = {
  blockStorySeen: true,
  blockDMSeen: true,
  confirmLike: true,
  confirmComment: true,
  confirmCall: true,
  confirmFollow: true,
  confirmReposts: true,
  confirmStoryQuickReactions: true,
  confirmStoryReplies: true,
  activateFollowAnalyzer: true,
  enableVideoScrubber: false,
  enableProfilePicPopup: true,
  enableHighlightPopup: true,
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
};

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(DEFAULTS, (cfg) => {
    for (const [k, v] of Object.entries(DEFAULTS)) {
      const el = document.getElementById(k);
      if (el) {
        if (el.type === "checkbox") {
          el.checked = !!cfg[k];
        } else if (el.tagName === "SELECT") {
          el.value = cfg[k] || v;
        }
      }
    }
  });

  document.getElementById("save").addEventListener("click", () => {
    const newCfg = {};
    for (const k of Object.keys(DEFAULTS)) {
      const el = document.getElementById(k);
      if (el) {
        if (el.type === "checkbox") {
          newCfg[k] = !!el.checked;
        } else if (el.tagName === "SELECT") {
          newCfg[k] = el.value;
        }
      }
    }

    chrome.storage.sync.set(newCfg, () => {
      const saveBtn = document.getElementById("save");
      const originalText = saveBtn.textContent;
      saveBtn.textContent = "Saved!";
      saveBtn.style.background = "#4CAF50";
      saveBtn.style.color = "white";

      setTimeout(() => {
        window.close();
      }, 1000);
    });
  });
});
