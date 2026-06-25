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
    enablePostHoverInfo: false,
    postHoverDateFormat: "dd/mm/yy",
    enableMediaDownloader: false,
    downloadOnPosts: true,
    downloadOnReels: true,
    downloadOnStories: true,
    downloadProfilePictures: true,
    downloadAudioMessages: true,
    downloadChatImages: true,
    downloadAskLocation: false,
    downloadAskQuality: false,
    downloadEmbedMetadata: true,
  };

  const currentVersion = chrome.runtime.getManifest().version;

  chrome.storage.sync.get(
    [...Object.keys(defaults), "welcomeModalShown", "lastSeenChangelogVersion"],
    (current) => {
      const toSet = {};
      for (const [k, v] of Object.entries(defaults)) {
        if (!(k in current)) toSet[k] = v;
      }

      // Seed the changelog baseline so the "What's New" modal shows the right
      // range of release notes (see content/features/changelog/index.js):
      //   - Fresh install: mark the current version as already seen (new users
      //     are greeted by the welcome page, not a changelog).
      //   - Update from an older build that predates this field: baseline at the
      //     previous version so the user sees notes for what actually changed.
      if (details.reason === "install") {
        toSet.lastSeenChangelogVersion = currentVersion;
      } else if (
        details.reason === "update" &&
        current.lastSeenChangelogVersion == null
      ) {
        toSet.lastSeenChangelogVersion =
          details.previousVersion || currentVersion;
      }

      if (Object.keys(toSet).length) chrome.storage.sync.set(toSet);

      // Open welcome page on first install
      if (details.reason === "install") {
        chrome.tabs.create({
          url: chrome.runtime.getURL("settings/settings.html"),
        });
      }
    }
  );
});

// ---------------------------------------------------------------------------
// Media Downloader bridge.
//
// Content scripts can't reliably save cross-origin CDN media (fbcdn /
// cdninstagram are a different origin, so a page fetch hits CORS and an
// <a download> on a cross-origin http url is ignored by the browser). The
// downloads API has no such restriction — it fetches the url through the
// browser itself — so the content script hands us the resolved url + filename
// and we save it here. Requires the "downloads" permission.
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "INSTAFN_DOWNLOAD") return;

  try {
    chrome.downloads.download(
      {
        url: message.url,
        filename: message.filename || undefined,
        saveAs: !!message.saveAs,
      },
      (downloadId) => {
        if (chrome.runtime.lastError || downloadId === undefined) {
          sendResponse({
            ok: false,
            error: chrome.runtime.lastError?.message || "download failed",
          });
        } else {
          sendResponse({ ok: true, downloadId });
        }
      }
    );
  } catch (err) {
    sendResponse({ ok: false, error: String(err) });
  }

  // Keep the message channel open for the async sendResponse above.
  return true;
});
