(function() {
  "use strict";

  const blockPattern = /PolarisAPIReelSeenMutation|PolarisStoriesV3SeenMutation/i;
  let allowSeenUntil = 0;
  let pendingSeenRequests = []; // Store blocked seen requests
  const MAX_PENDING_REQUESTS = 10; // Keep last 10 requests
  let lastStoryUrl = window.location.href; // Track story changes

  function isBypassActive() {
    return Date.now() < allowSeenUntil;
  }

  function allowSeenFor(ms) {
    allowSeenUntil = Date.now() + Math.max(0, ms || 1500);
  }

  function storeSeenRequest(requestData) {
    // Store the request data for later replay
    pendingSeenRequests.push({
      ...requestData,
      timestamp: Date.now(),
      storyUrl: window.location.href, // Store the URL when request was captured
    });
    // Keep only the most recent requests
    if (pendingSeenRequests.length > MAX_PENDING_REQUESTS) {
      pendingSeenRequests.shift();
    }
  }

  function clearOldRequests() {
    // Clear requests that are from a different story or too old
    const currentUrl = window.location.href;
    const now = Date.now();
    pendingSeenRequests = pendingSeenRequests.filter((req) => {
      // Keep only requests from current story that are recent (within 5 seconds)
      // and haven't been used yet
      return (
        req.storyUrl === currentUrl && now - req.timestamp < 5000 && !req.used
      );
    });
  }

  function replayLatestSeenRequest() {
    // Clear old requests first
    clearOldRequests();

    // Replay the most recent seen request for the CURRENT story only
    if (pendingSeenRequests.length === 0) return false;

    const currentUrl = window.location.href;
    const now = Date.now();

    // Find the most recent unused request for the current story
    // Requests are stored in chronological order, so check from the end
    let latestRequest = null;
    for (let i = pendingSeenRequests.length - 1; i >= 0; i--) {
      const req = pendingSeenRequests[i];
      // Only consider requests from current story that are recent (within 5 seconds)
      // and haven't been used yet
      if (
        req.storyUrl === currentUrl &&
        now - req.timestamp < 5000 &&
        !req.used
      ) {
        latestRequest = req;
        break;
      }
    }

    if (!latestRequest) return false;

    // Final safety check: verify URL hasn't changed since we found the request
    // This prevents replaying if user navigated to next story between finding and replaying
    if (window.location.href !== currentUrl) {
      return false; // Story changed, don't replay
    }

    try {
      // Replay the request for the current story
      if (latestRequest.type === "xhr") {
        // Replay XHR request with captured headers
        const xhr = new XMLHttpRequest();
        xhr.open(latestRequest.method || "POST", latestRequest.url, true);
        // Set all captured headers
        if (latestRequest.headers) {
          Object.keys(latestRequest.headers).forEach((key) => {
            try {
              xhr.setRequestHeader(key, latestRequest.headers[key]);
            } catch (err) {
              // Some headers might not be settable, ignore
            }
          });
        }
        xhr.send(latestRequest.body);
      } else if (latestRequest.type === "fetch") {
        fetch(latestRequest.url, {
          method: latestRequest.method || "POST",
          headers: latestRequest.headers || {},
          body: latestRequest.body,
          credentials: "include",
          mode: "cors",
        }).catch(() => {}); // Ignore errors
      } else if (latestRequest.type === "ig-api") {
        if (window.ig?.api?.fetch) {
          window.ig.api
            .fetch(latestRequest.url, {
              method: latestRequest.method || "POST",
              headers: latestRequest.headers || {},
              body: latestRequest.body,
            })
            .catch(() => {}); // Ignore errors
        }
      }
    } catch (err) {
      console.warn("Instafn: Failed to replay seen request:", err);
      return false;
    }

    // Mark this request as used so it won't be replayed again
    latestRequest.used = true;
    return true;
  }

  // Expose API on window
  try {
    window.InstafnStory = window.InstafnStory || {};
    window.InstafnStory.allowSeenFor = allowSeenFor;
    window.InstafnStory.markCurrentAsSeen = async function() {
      // Allow seen requests to go through for longer to catch any requests Instagram sends
      allowSeenFor(5000);

      // Try multiple approaches to mark the story as seen
      const tryMarkAsSeen = () => {
        // First, try to replay a stored request
        const hadRequest = replayLatestSeenRequest();

        if (hadRequest) {
          return true;
        }

        // If no stored request, try to trigger Instagram to send one
        try {
          const storyContainer =
            document.querySelector('[role="dialog"]') ||
            document.querySelector('article[role="presentation"]') ||
            document.body;
          if (storyContainer) {
            // Trigger multiple events to encourage Instagram to send seen request
            storyContainer.dispatchEvent(
              new Event("focus", { bubbles: true, cancelable: true })
            );
            storyContainer.dispatchEvent(
              new Event("visibilitychange", { bubbles: true, cancelable: true })
            );
            storyContainer.dispatchEvent(
              new Event("mouseenter", { bubbles: true, cancelable: true })
            );

            // Try a subtle click that won't navigate
            const clickEvent = new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1,
              button: 0,
            });
            storyContainer.dispatchEvent(clickEvent);
          }
        } catch (err) {
          // Ignore errors
        }

        return false;
      };

      // Try immediately
      tryMarkAsSeen();

      // Try again after a short delay in case Instagram needs time to send the request
      setTimeout(() => {
        tryMarkAsSeen();
      }, 100);

      // Try one more time after a longer delay
      setTimeout(() => {
        tryMarkAsSeen();
      }, 300);

      // Disable seen requests after 500ms to prevent marking next story
      // This gives enough time for the request to go through
      setTimeout(() => {
        allowSeenUntil = 0;
      }, 500);
    };
  } catch (_) {}

  // Track story changes to clear old requests
  function checkStoryChange() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastStoryUrl) {
      // Story changed - immediately clear ALL old requests to prevent cross-story marking
      pendingSeenRequests = [];
      lastStoryUrl = currentUrl;
    }
  }

  // Monitor for story changes more frequently to catch changes quickly
  let urlCheckInterval = setInterval(checkStoryChange, 200);

  // Also listen to popstate events
  window.addEventListener("popstate", checkStoryChange);
  window.addEventListener("hashchange", checkStoryChange);

  // Listen for bridge messages
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== "instafn") return;
    const { type, ms } = event.data;
    if (type === "ALLOW_STORY_SEEN") {
      allowSeenFor(typeof ms === "number" ? ms : 1500);
    }
    if (type === "MARK_STORY_SEEN") {
      checkStoryChange(); // Check for story change before marking
      window.InstafnStory?.markCurrentAsSeen() || allowSeenFor(2000);
    }
  });

  // Intercept XHR open to capture URL and method
  const originalXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    this._method = method;
    this._url = url;
    this._headers = {}; // Store headers for this request
    return originalXHROpen.apply(this, arguments);
  };

  // Intercept setRequestHeader to capture headers
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (!this._headers) this._headers = {};
    this._headers[header] = value;
    return originalSetRequestHeader.apply(this, arguments);
  };

  // Block XHR requests
  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    if (
      !isBypassActive() &&
      typeof body === "string" &&
      blockPattern.test(body)
    ) {
      // Store the request for potential replay
      try {
        storeSeenRequest({
          type: "xhr",
          url: this._url || this.responseURL || "",
          method: this._method || "POST",
          body: body,
          headers: this._headers || {},
        });
      } catch (err) {
        // Ignore storage errors
      }
      return;
    }
    return originalXHRSend.apply(this, arguments);
  };

  // Block fetch requests
  const originalFetch = window.fetch;
  window.fetch = function() {
    const args = arguments;
    try {
      const url = args[0];
      const options = args[1] || {};
      const bodyToCheck = options.body || "";
      if (
        !isBypassActive() &&
        typeof bodyToCheck === "string" &&
        blockPattern.test(bodyToCheck)
      ) {
        // Store the request for potential replay
        try {
          storeSeenRequest({
            type: "fetch",
            url: url,
            method: options.method || "POST",
            body: bodyToCheck,
            headers: options.headers || {},
          });
        } catch (err) {
          // Ignore storage errors
        }
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
        // Store the request for potential replay
        try {
          const body = options?.body || "";
          storeSeenRequest({
            type: "ig-api",
            url: url,
            method: options?.method || "POST",
            body: typeof body === "string" ? body : JSON.stringify(body),
            headers: options?.headers || {},
          });
        } catch (err) {
          // Ignore storage errors
        }
        return new Promise(() => {});
      }
      return originalIGFetch(url, options);
    };
  }
})();
