const DEFAULTS = {
  blockStorySeen: false,
  enableManualMarkAsSeen: false,
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
  disableTabMoreFromMeta: false,
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
  const sidebarItems = document.querySelectorAll(".sidebar-item");
  const sectionContents = document.querySelectorAll(".section-content");
  const saveButton = document.getElementById("save");
  const splashScreen = document.getElementById("splashScreen");
  const settingsPage = document.getElementById("settingsPage");
  const continueButton = document.getElementById("continueButton");
  
  let originalSettings = {};

  // Show splash screen on first visit
  chrome.storage.sync.get(["splashScreenShown"], (result) => {
    if (!result.splashScreenShown) {
      splashScreen.classList.remove("hidden");
      settingsPage.classList.add("hidden");
    } else {
      splashScreen.classList.add("hidden");
      settingsPage.classList.remove("hidden");
    }
  });

  // Continue button handler
  if (continueButton) {
    continueButton.addEventListener("click", () => {
      splashScreen.classList.add("hidden");
      settingsPage.classList.remove("hidden");
      chrome.storage.sync.set({ splashScreenShown: true });
    });
  }

  // Load version number
  const versionElement = document.getElementById("versionNumber");
  if (versionElement) {
    try {
      const manifest = chrome.runtime.getManifest();
      versionElement.textContent = manifest.version || "Unknown";
    } catch (e) {
      versionElement.textContent = "Unknown";
    }
  }

  // Sidebar navigation
  sidebarItems.forEach((item) => {
    item.addEventListener("click", () => {
      const section = item.getAttribute("data-section");
      
      // Update active sidebar item
      sidebarItems.forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      
      // Show correct section content
      sectionContents.forEach((content) => {
        content.classList.remove("active");
        if (content.getAttribute("data-section") === section) {
          content.classList.add("active");
        }
      });
    });
  });

  // Set default active section
  const firstSidebarItem = sidebarItems[0];
  if (firstSidebarItem) {
    const firstSection = firstSidebarItem.getAttribute("data-section");
    sectionContents.forEach((content) => {
      if (content.getAttribute("data-section") === firstSection) {
        content.classList.add("active");
      }
    });
  }

  function checkForChanges() {
    for (const k of Object.keys(DEFAULTS)) {
      const el = document.getElementById(k);
      if (el) {
        let currentValue;
        if (el.type === "checkbox") {
          currentValue = !!el.checked;
        } else if (el.tagName === "SELECT") {
          currentValue = el.value;
        } else {
          continue;
        }
        
        if (currentValue !== originalSettings[k]) {
          saveButton.classList.add("active");
          return;
        }
      }
    }
    saveButton.classList.remove("active");
  }

  // Nested setting management
  const blockStorySeenCheckbox = document.getElementById("blockStorySeen");
  const enableManualMarkAsSeenCheckbox = document.getElementById("enableManualMarkAsSeen");
  const nestedContainer = document.getElementById("nestedStorySeen");
  const showExactTimeCheckbox = document.getElementById("showExactTime");
  const nestedTimeFormat = document.getElementById("nestedTimeFormat");
  const timeFormatSelect = document.getElementById("timeFormat");

  function updateNestedSettingState() {
    const isBlockStorySeenEnabled = blockStorySeenCheckbox.checked;

    if (isBlockStorySeenEnabled) {
      nestedContainer.classList.add("enabled");
      enableManualMarkAsSeenCheckbox.disabled = false;
    } else {
      nestedContainer.classList.remove("enabled");
      enableManualMarkAsSeenCheckbox.disabled = true;
      enableManualMarkAsSeenCheckbox.checked = false;
      originalSettings.enableManualMarkAsSeen = false;
    }
    checkForChanges();
  }

  function updateTimeFormatState() {
    const isShowExactTimeEnabled = showExactTimeCheckbox.checked;

    if (isShowExactTimeEnabled) {
      nestedTimeFormat.classList.add("enabled");
      timeFormatSelect.disabled = false;
    } else {
      nestedTimeFormat.classList.remove("enabled");
      timeFormatSelect.disabled = true;
    }
    checkForChanges();
  }

  if (blockStorySeenCheckbox) {
    blockStorySeenCheckbox.addEventListener("change", updateNestedSettingState);
  }
  if (showExactTimeCheckbox) {
    showExactTimeCheckbox.addEventListener("change", updateTimeFormatState);
  }

  // Load saved settings
  chrome.storage.sync.get(DEFAULTS, (cfg) => {
    for (const [k, v] of Object.entries(DEFAULTS)) {
      const el = document.getElementById(k);
      if (el) {
        if (el.type === "checkbox") {
          el.checked = !!cfg[k];
          originalSettings[k] = !!cfg[k];
        } else if (el.tagName === "SELECT") {
          el.value = cfg[k] || v;
          originalSettings[k] = cfg[k] || v;
        }
      }
    }

    updateNestedSettingState();
    updateTimeFormatState();
    checkForChanges();
  });

  // Listen for all changes
  document.addEventListener("change", checkForChanges);
  document.addEventListener("click", (e) => {
    if (e.target.type === "checkbox") {
      setTimeout(checkForChanges, 0);
    }
  });

  // Save button handler
  saveButton.addEventListener("click", () => {
    if (!saveButton.classList.contains("active")) return;
    
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

    if (!newCfg.blockStorySeen) {
      newCfg.enableManualMarkAsSeen = false;
    }

    chrome.storage.sync.set(newCfg, () => {
      originalSettings = { ...newCfg };
      saveButton.classList.remove("active");
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.includes("instagram.com")) {
          chrome.tabs.reload(tabs[0].id);
        } else {
          chrome.tabs.query({ currentWindow: true }, (allTabs) => {
            const instagramTab = allTabs.find(
              (tab) => tab.url && tab.url.includes("instagram.com")
            );
            if (instagramTab) {
              chrome.tabs.reload(instagramTab.id);
            }
          });
        }
      });
    });
  });
});

