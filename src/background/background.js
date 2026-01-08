chrome.runtime.onInstalled.addListener(async (details) => {
  const defaults = {
    blockStorySeen: false,
    enableManualMarkAsSeen: false,
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
    blockTypingReceipts: false,
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

  chrome.storage.sync.get([...Object.keys(defaults), "welcomeModalShown"], (current) => {
    const toSet = {};
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in current)) toSet[k] = v;
    }
    if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);
    
    // Open welcome page on first install
    if (details.reason === "install") {
      chrome.tabs.create({
        url: chrome.runtime.getURL("settings/settings.html")
      });
    }
  });
});
