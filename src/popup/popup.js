const DEFAULTS = {
  blockStorySeen: false,
  blockTypingReceipts: false,
  confirmLike: false,
  confirmComment: false,
  confirmCall: false,
  confirmFollow: false,
  confirmReposts: false,
  confirmStoryQuickReactions: false,
  confirmStoryReplies: false,
  activateFollowAnalyzer: false,
  enableVideoScrubber: false,
  enableProfilePicPopup: false,
  enableHighlightPopup: false,
  enableProfileFollowIndicator: false,
  hideRecentSearches: false,
  disableTabSearch: false,
  disableTabExplore: false,
  disableTabReels: false,
  disableTabMessages: false,
  disableTabNotifications: false,
  disableTabCreate: false,
  disableTabProfile: false,
  disableTabMoreFromMeta: false,
  hideDMPopup: false,
  enableMessageEditShortcut: false,
  enableMessageReplyShortcut: false,
  enableMessageDoubleTapLike: false,
  enableMessageLogger: false,
  showExactTime: false,
  timeFormat: "default",
  enableCallTimer: false,
  enableProfileComments: false,
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

      // Refresh the current window's active tab if it's Instagram
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes("instagram.com")) {
          chrome.tabs.reload(tabs[0].id);
        } else {
          // If active tab isn't Instagram, find and refresh any Instagram tab in current window
          chrome.tabs.query({ currentWindow: true }, (allTabs) => {
            const instagramTab = allTabs.find((tab) => tab.url && tab.url.includes("instagram.com"));
            if (instagramTab) {
              chrome.tabs.reload(instagramTab.id);
            }
          });
        }
      });

      setTimeout(() => {
        window.close();
      }, 1000);
    });
  });
});
