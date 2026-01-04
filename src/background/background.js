chrome.runtime.onInstalled.addListener(async () => {
  const defaults = {
    blockStorySeen: true,
    blockDMSeen: true,
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
    enableMessageDoubleTapLike: true,
    showExactTime: true,
    timeFormat: "default",
  };

  chrome.storage.sync.get(defaults, (current) => {
    const toSet = {};
    for (const [k, v] of Object.entries(defaults)) {
      if (!(k in current)) toSet[k] = v;
    }
    if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);
  });
});
