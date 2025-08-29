(function () {
  "use strict";

  console.log("Instafn: Story blocking script loaded");

  // pattern i stole online
  const blockPattern =
    /PolarisAPIReelSeenMutation|PolarisStoriesV3SeenMutation/i;

  // block xhr requests for stories
  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    if (typeof body === "string" && blockPattern.test(body)) {
      console.log("Instafn: Blocked XHR story seen mutation:", body);
      return;
    }
    return originalXHRSend.apply(this, arguments);
  };

  // block fetch requests by returning empty promise like my ex
  const originalFetch = window.fetch;
  window.fetch = function () {
    const args = arguments;
    let bodyToCheck = "";

    try {
      const options = args[1] || {};
      bodyToCheck = options.body || "";

      if (typeof bodyToCheck === "string" && blockPattern.test(bodyToCheck)) {
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
      window.ig.api.fetch = function (url, options) {
        if (
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

  // test
  setTimeout(() => {
    try {
      const testXHR = new XMLHttpRequest();
      testXHR.open("POST", "https://test.com");
      testXHR.send("PolarisAPIReelSeenMutation");
      console.log("Instafn: XHR blocking test completed");
    } catch (err) {
      console.log("Instafn: XHR blocking test error (expected):", err.message);
    }
  }, 1000);

  console.log("Instafn: Story blocking enabled (DM-safe)");
})();
