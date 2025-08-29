const DEFAULTS = {
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
};

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.sync.get(DEFAULTS, (cfg) => {
    for (const [k, v] of Object.entries(DEFAULTS)) {
      const el = document.getElementById(k);
      if (el) el.checked = !!cfg[k];
    }
  });

  document.getElementById("save").addEventListener("click", () => {
    const newCfg = {};
    for (const k of Object.keys(DEFAULTS)) {
      const el = document.getElementById(k);
      if (el) newCfg[k] = !!el.checked;
    }

    chrome.storage.sync.set(newCfg, () => {
      // Provide specific feedback for follow analyzer setting
      if (newCfg.activateFollowAnalyzer) {
        console.log(
          "Instafn: Follow Analyzer enabled. Refresh Instagram pages to see the scan button."
        );
      } else {
        console.log(
          "Instafn: Follow Analyzer disabled. Scan buttons will be removed from Instagram pages."
        );
      }

      // Show success message briefly before closing
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
