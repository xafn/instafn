(function() {
  "use strict";

  const blockPattern = /PolarisAPIReelSeenMutation|PolarisStoriesV3SeenMutation/i;
  let allowSeenUntil = 0;

  function isBypassActive() {
    return Date.now() < allowSeenUntil;
  }

  function allowSeenFor(ms) {
    allowSeenUntil = Date.now() + Math.max(0, ms || 1500);
  }

  // Expose API on window
  try {
    window.InstafnStory = window.InstafnStory || {};
    window.InstafnStory.allowSeenFor = allowSeenFor;
    window.InstafnStory.markCurrentAsSeen = async function() {
      allowSeenFor(2000);
      try {
        const sendKey = (key) => {
          document.dispatchEvent(
            new KeyboardEvent("keydown", {
              key,
              code: key,
              bubbles: true,
              cancelable: true,
            })
          );
        };
        sendKey("ArrowRight");
        setTimeout(() => sendKey("ArrowLeft"), 150);
      } catch (err) {
        console.warn("Instafn: Failed to nudge stories:", err);
      } finally {
        setTimeout(() => {
          allowSeenUntil = 0;
        }, 2200);
      }
    };
  } catch (_) {}

  // Listen for bridge messages
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "instafn") return;
    const { type, ms } = event.data;
    if (type === "ALLOW_STORY_SEEN") {
      allowSeenFor(typeof ms === "number" ? ms : 1500);
    }
    if (type === "MARK_STORY_SEEN") {
      window.InstafnStory?.markCurrentAsSeen() || allowSeenFor(2000);
    }
  });

  // Block XHR requests
  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    if (
      !isBypassActive() &&
      typeof body === "string" &&
      blockPattern.test(body)
    ) {
      return;
    }
    return originalXHRSend.apply(this, arguments);
  };

  // Block fetch requests
  const originalFetch = window.fetch;
  window.fetch = function() {
    const args = arguments;
    try {
      const bodyToCheck = (args[1] || {}).body || "";
      if (
        !isBypassActive() &&
        typeof bodyToCheck === "string" &&
        blockPattern.test(bodyToCheck)
      ) {
        return new Promise(() => {});
      }
    } catch (err) {
      console.warn("Instafn: Error checking fetch body", err);
    }
    return originalFetch.apply(this, args);
  };

  // Block Instagram API calls
  if (window.ig?.api?.fetch) {
    const originalIGFetch = window.ig.api.fetch;
    window.ig.api.fetch = function(url, options) {
      if (
        !isBypassActive() &&
        typeof url === "string" &&
        (url.includes("story_seen") ||
          url.includes("reel_seen") ||
          url.includes("story_view") ||
          url.includes("reel_view"))
      ) {
        return new Promise(() => {});
      }
      return originalIGFetch(url, options);
    };
  }
})();
