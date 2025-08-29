(function() {
  "use strict";

  console.log("Instafn: Story blocking script loaded");

  // pattern i stole online
  const blockPattern = /PolarisAPIReelSeenMutation|PolarisStoriesV3SeenMutation/i;

  // one-off bypass flag
  let allowSeenUntil = 0;
  function isBypassActive() {
    return Date.now() < allowSeenUntil;
  }
  function allowSeenFor(ms) {
    allowSeenUntil = Date.now() + Math.max(0, ms || 1500);
  }

  // Expose a minimal API on window for page context
  try {
    window.InstafnStory = window.InstafnStory || {};
    window.InstafnStory.allowSeenFor = allowSeenFor;
    window.InstafnStory.markCurrentAsSeen = async function markCurrentAsSeen() {
      // allow outbound seen mutation briefly, then nudge navigation so IG fires it
      allowSeenFor(2000);
      try {
        // Nudge to next story then back to trigger IG's native seen send
        const sendKey = (key) => {
          const evt = new KeyboardEvent("keydown", {
            key,
            code: key,
            bubbles: true,
            cancelable: true,
          });
          document.dispatchEvent(evt);
        };
        sendKey("ArrowRight");
        setTimeout(() => sendKey("ArrowLeft"), 150);
      } catch (err) {
        console.warn("Instafn: Failed to nudge stories for seen:", err);
      } finally {
        // shrink bypass window shortly after
        setTimeout(() => {
          allowSeenUntil = 0;
        }, 2200);
      }
    };
  } catch (_) {}

  // listen for bridge messages from content script
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data || {};
    if (data.source !== "instafn") return;
    if (data.type === "ALLOW_STORY_SEEN") {
      allowSeenFor(typeof data.ms === "number" ? data.ms : 1500);
    }
    if (data.type === "MARK_STORY_SEEN") {
      if (window.InstafnStory?.markCurrentAsSeen) {
        window.InstafnStory.markCurrentAsSeen();
      } else {
        allowSeenFor(2000);
      }
    }
  });

  // block xhr requests for stories
  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    if (
      !isBypassActive() &&
      typeof body === "string" &&
      blockPattern.test(body)
    ) {
      console.log("Instafn: Blocked XHR story seen mutation:", body);
      return;
    }
    return originalXHRSend.apply(this, arguments);
  };

  // block fetch requests by returning empty promise like my ex
  const originalFetch = window.fetch;
  window.fetch = function() {
    const args = arguments;
    let bodyToCheck = "";

    try {
      const options = args[1] || {};
      bodyToCheck = options.body || "";

      if (
        !isBypassActive() &&
        typeof bodyToCheck === "string" &&
        blockPattern.test(bodyToCheck)
      ) {
        console.log("Instafn: Blocked fetch story seen mutation:", bodyToCheck);
        return new Promise(() => {});
      }
    } catch (err) {
      console.warn("Instafn: Error checking fetch body", err);
    }

    return originalFetch.apply(this, args);
  };

  // prevent instagram from tracking stories through other apis
  if (window.ig && window.ig.api) {
    const originalIGFetch = window.ig.api.fetch;
    if (originalIGFetch) {
      window.ig.api.fetch = function(url, options) {
        if (
          !isBypassActive() &&
          typeof url === "string" &&
          (url.includes("story_seen") ||
            url.includes("reel_seen") ||
            url.includes("story_view") ||
            url.includes("reel_view"))
        ) {
          console.log("Instafn: Blocked Instagram API fetch:", url);
          return new Promise(() => {});
        }
        return originalIGFetch(url, options);
      };
    }
  }
})();
