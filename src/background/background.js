chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    blockStorySeen: false,
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

  chrome.storage.sync.get(defaults, (current) => {
    const toSet = {};
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in current)) toSet[k] = v;
    }
    if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);
  });
});
