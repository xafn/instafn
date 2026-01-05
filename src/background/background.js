chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    blockStorySeen: true,
    confirmLike: true,
    confirmComment: true,
    confirmCall: true,
    confirmFollow: true,
    confirmStoryQuickReactions: true,
    confirmStoryReplies: true,
    activateFollowAnalyzer: true,
    enableVideoScrubber: false,
    hideRecentSearches: true,
    enableMessageEditShortcut: true,
    enableMessageReplyShortcut: true,
    enableMessageDoubleTapLike: true,
    enableMessageLogger: false,
    showExactTime: true,
    timeFormat: "default",
    enableCallTimer: true,
  };

  chrome.storage.sync.get(defaults, (current) => {
    const toSet = {};
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in current)) toSet[k] = v;
    }
    if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);
  });
});
