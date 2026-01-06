import { injectStylesheet } from "../../utils/styleLoader.js";

let observer = null;
let isEnabled = false;

function isReelContext(element) {
  if (!element) return false;

  // Check URL path for reels
  const pathname = window.location.pathname;
  if (pathname.includes("/reels/") || pathname.includes("/reel/")) {
    return true;
  }

  // Check for reel-specific DOM structures
  if (
    element.closest('[data-testid="reel"]') ||
    element.closest('a[href*="/reels/"]') ||
    element.closest('a[href*="/reels/audio/"]')
  ) {
    return true;
  }

  // Check if parent container has reel-like structure
  let container = element.parentElement;
  let depth = 0;
  while (container && depth < 10) {
    const containerClasses = container.className || "";
    // Check for reel-specific class patterns
    if (
      containerClasses.includes("xyamay9") ||
      containerClasses.includes("x1l90r2v") ||
      container.querySelector('a[href*="/reels/"]') ||
      container.querySelector('a[href*="/reels/audio/"]')
    ) {
      return true;
    }
    container = container.parentElement;
    depth++;
  }

  return false;
}

function isCallContext() {
  // Check if we're on a call page
  return window.location.pathname.includes("/call/");
}

function isDMChatVideo(element) {
  if (!element) return false;

  // Check if we're on a DM page
  const pathname = window.location.pathname;
  if (pathname.includes("/direct/") || pathname.includes("/direct")) {
    return true;
  }

  // Check if video is within a DM chat container
  // DM chats have specific aria-labels and structures
  let container = element.parentElement;
  let depth = 0;
  while (container && depth < 15) {
    // Check for DM-specific indicators
    const ariaLabel = container.getAttribute("aria-label") || "";
    if (
      ariaLabel.includes("Conversation") ||
      ariaLabel.includes("conversation") ||
      ariaLabel.includes("Message") ||
      ariaLabel.includes("message")
    ) {
      // Check if it's actually a DM chat (not just any conversation)
      // DM chat containers often have specific class patterns or data attributes
      const containerClasses = container.className || "";
      if (
        container.closest('div[role="dialog"]') ||
        container.closest('div[aria-label*="Conversation"]') ||
        container.closest('div[aria-label*="conversation"]')
      ) {
        // Additional check: look for DM-specific URL patterns in links
        const hasDMLink = container.querySelector('a[href*="/direct/"]');
        if (hasDMLink) {
          return true;
        }
      }
    }

    // Check for direct message thread indicators
    if (container.querySelector && container.querySelector('a[href*="/direct/t/"]')) {
      return true;
    }

    container = container.parentElement;
    depth++;
  }

  return false;
}

function isExploreGridVideo(element) {
  if (!element) return false;

  // Check if we're on the explore page
  const pathname = window.location.pathname;
  if (!pathname.includes("/explore/") && pathname !== "/explore/") {
    return false;
  }

  // Check if video is in a modal/dialog/popup (these should get scrubbers)
  // Modals typically have specific attributes or are in specific containers
  if (
    element.closest('[role="dialog"]') ||
    element.closest('[role="presentation"]') ||
    element.closest('div[style*="position: fixed"]') ||
    element.closest('div[style*="z-index"]') ||
    element.closest('div[aria-modal="true"]')
  ) {
    return false; // In a modal, so allow scrubber
  }

  // Check if video is in a grid container (explore grid)
  // Explore grid has specific class patterns like x121lspk (grid template columns)
  let container = element.parentElement;
  let depth = 0;
  while (container && depth < 15) {
    const containerClasses = container.className || "";
    // Check for explore grid patterns
    if (
      containerClasses.includes("x121lspk") || // grid template columns
      containerClasses.includes("xrvj5dj") || // grid related
      containerClasses.includes("xqketvx") // grid related
    ) {
      // Make sure it's not in a modal
      const hasModalParent =
        container.closest('[role="dialog"]') ||
        container.closest('[role="presentation"]') ||
        container.closest('div[aria-modal="true"]');
      if (!hasModalParent) {
        return true; // In explore grid, skip scrubber
      }
    }
    container = container.parentElement;
    depth++;
  }

  return false;
}

function ensureRelativePositioning(container) {
  const computed = window.getComputedStyle(container);
  if (computed.position === "static") {
    container.style.position = "relative";
  }
  // Create stacking context so z-index within works as intended
  if (computed.isolation !== "isolate") {
    container.style.isolation = "isolate";
  }
}

function disableBlockingOverlays(rootContainer) {
  // Common IG overlay masks that can intercept clicks
  const masks = rootContainer.querySelectorAll(
    [
      "div.x1ey2m1c.x9f619.xtijo5x.x1o0tod.x10l6tqk.x13vifvy.x1ypdohk",
      'div.x5yr21d.x10l6tqk.x13vifvy.xh8yej3[data-visualcompletion="ignore"]',
      'div[role="presentation"] .x1ey2m1c',
      'div[aria-hidden="true"], div[aria-hidden="true"] *',
      '[data-visualcompletion="ignore-late-mutation"]',
    ].join(",")
  );
  masks.forEach((el) => {
    el.style.pointerEvents = "none";
  });
}

function makeButtonClickable(button, rootContainer) {
  if (!button) return;

  button.style.pointerEvents = "auto";
  button.style.setProperty("pointer-events", "auto", "important");
  let parent = button.parentElement;
  let depth = 0;
  while (parent && parent !== rootContainer && depth < 10) {
    if (parent.style.pointerEvents === "none") {
      parent.style.pointerEvents = "auto";
      parent.style.setProperty("pointer-events", "auto", "important");
    }
    parent = parent.parentElement;
    depth++;
  }
}

function rearrangeVideoAfterInstanceKey(video) {
  const rootContainer = video.parentElement;
  if (!rootContainer) return;
  const instanceKeyContainer = rootContainer.querySelector(
    "[data-instancekey]"
  );
  if (!instanceKeyContainer) return;

  if (instanceKeyContainer.nextSibling !== video) {
    instanceKeyContainer.parentNode.insertBefore(
      video,
      instanceKeyContainer.nextSibling
    );
  }

  // After rearranging, ensure overlays/buttons are correctly layered and unblocked
  disableBlockingOverlays(rootContainer);
}

function setupFeedVideoScrubber(video, rootContainer, scrubberContainer) {
  // Get references to scrubber elements
  const scrubberTrack = scrubberContainer.querySelector(
    ".instafn-reel-scrubber-track"
  );
  const scrubberProgress = scrubberContainer.querySelector(
    ".instafn-reel-scrubber-progress"
  );
  const scrubberHandle = scrubberContainer.querySelector(
    ".instafn-reel-scrubber-handle"
  );
  const timePill = scrubberContainer.querySelector(".instafn-reel-time-pill");

  if (!scrubberTrack || !scrubberProgress || !scrubberHandle || !timePill) {
    return; // Elements not found
  }

  // Handle scrubbing state
  let isScrubbing = false;
  let wasPlaying = false;

  const formatTime = (seconds) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTimeRange = (current, total) => {
    return `${formatTime(current)} / ${formatTime(total)}`;
  };

  // Update progress on timeupdate (only when not scrubbing)
  const updateProgress = () => {
    if (
      !isScrubbing &&
      video.duration &&
      isFinite(video.duration) &&
      video.duration > 0
    ) {
      const progress = Math.max(
        0,
        Math.min(100, (video.currentTime / video.duration) * 100)
      );
      // Update progress bar - use setProperty to ensure it works
      scrubberProgress.style.setProperty("width", `${progress}%`, "important");
      // Update handle position
      scrubberHandle.style.left = `${progress}%`;
    }
  };

  // Set up video event listeners
  const setupVideoListeners = () => {
    video.addEventListener("timeupdate", updateProgress);
    video.addEventListener("loadedmetadata", () => {
      updateProgress();
    });
    video.addEventListener("loadeddata", () => {
      updateProgress();
    });
    video.addEventListener("canplay", () => {
      updateProgress();
    });
    video.addEventListener("progress", () => {
      updateProgress();
    });

    // Initial update if video is already ready
    if (video.readyState >= 2) {
      updateProgress();
    }
  };

  setupVideoListeners();

  // Also use requestAnimationFrame for smooth updates
  let rafId = null;
  const rafUpdate = () => {
    if (!isScrubbing && video.readyState >= 2) {
      updateProgress();
    }
    rafId = requestAnimationFrame(rafUpdate);
  };
  rafId = requestAnimationFrame(rafUpdate);

  // Get mouse/touch position relative to track
  const getPositionFromEvent = (e) => {
    const rect = scrubberTrack.getBoundingClientRect();
    const clientX =
      e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX;
    if (clientX === undefined) return null;
    const x = clientX - rect.left;
    return Math.max(0, Math.min(rect.width, x));
  };

  const updateTimePill = (percent) => {
    if (!video.duration || !isFinite(video.duration)) return;
    const time = (percent / 100) * video.duration;
    timePill.textContent = formatTimeRange(time, video.duration);
    // Time pill stays centered - don't set left position
    timePill.classList.add("visible");
  };

  const startScrubbing = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isScrubbing = true;
    wasPlaying = !video.paused;
    video.pause();
    scrubberContainer.style.opacity = "1";
    // Remove transition delay when scrubbing
    scrubberHandle.classList.add("scrubbing");

    const pos = getPositionFromEvent(e);
    if (pos !== null) {
      const rect = scrubberTrack.getBoundingClientRect();
      const percent = (pos / rect.width) * 100;
      updateTimePill(percent);
      scrub(e);
    }
  };

  const scrub = (e) => {
    if (!isScrubbing) return;
    const pos = getPositionFromEvent(e);
    if (pos === null) return;

    const rect = scrubberTrack.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, (pos / rect.width) * 100));

    if (video.duration && isFinite(video.duration) && video.duration > 0) {
      const time = (percent / 100) * video.duration;
      video.currentTime = time;
      // Update instantly without transition
      scrubberProgress.style.transition = "none";
      scrubberProgress.style.setProperty("width", `${percent}%`, "important");
      scrubberHandle.style.left = `${percent}%`;
      scrubberHandle.style.transition = "opacity 0.2s, left 0s !important";
      updateTimePill(percent);
    }
  };

  const stopScrubbing = (e) => {
    if (!isScrubbing) return;
    isScrubbing = false;
    timePill.classList.remove("visible");
    // Restore transition for smooth playback
    scrubberHandle.classList.remove("scrubbing");
    scrubberHandle.style.transition = "";
    scrubberProgress.style.transition = "";

    // Don't auto-hide if hovering
    if (!rootContainer.matches(":hover")) {
      scrubberContainer.style.opacity = "";
    }

    // Resume playing if it was playing before
    if (wasPlaying) {
      video.play().catch(() => {
        // Ignore play errors
      });
    }
  };

  // Mouse events
  scrubberTrack.addEventListener("mousedown", startScrubbing);

  const handleMouseMove = (e) => {
    if (isScrubbing) {
      scrub(e);
    }
  };

  const handleMouseUp = (e) => {
    stopScrubbing(e);
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);

  // Touch events
  scrubberTrack.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      startScrubbing(e);
    },
    { passive: false }
  );

  const handleTouchMove = (e) => {
    if (isScrubbing) {
      e.preventDefault();
      scrub(e);
    }
  };

  const handleTouchEnd = (e) => {
    if (isScrubbing) {
      stopScrubbing(e);
    }
  };

  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd);

  // Also allow clicking on track to jump
  scrubberTrack.addEventListener("click", (e) => {
    if (!isScrubbing) {
      const pos = getPositionFromEvent(e);
      if (pos !== null && video.duration && isFinite(video.duration)) {
        const rect = scrubberTrack.getBoundingClientRect();
        const percent = (pos / rect.width) * 100;
        const time = (percent / 100) * video.duration;
        video.currentTime = time;
      }
    }
  });
}

function processReelVideo(video) {
  if (!video || video.dataset.instafnReelScrubber === "true") return;

  // Skip videos on call pages
  if (isCallContext()) {
    return;
  }

  // Skip videos in DM chat
  if (isDMChatVideo(video)) {
    return;
  }

  // Skip videos in explore grid - only add scrubbers when clicked and in popup
  if (isExploreGridVideo(video)) {
    return;
  }

  // Mark as processed
  video.dataset.instafnReelScrubber = "true";

  // Remove native controls
  video.removeAttribute("controls");

  // Ensure CSS is injected
  ensureReelScrubberCSS();

  const rootContainer = video.parentElement;
  if (!rootContainer) return;

  // Ensure container has relative positioning
  ensureRelativePositioning(rootContainer);
  rootContainer.classList.add("instafn-reel-container");

  // Create scrubber container
  let scrubberContainer = rootContainer.querySelector(".instafn-reel-scrubber");
  if (!scrubberContainer) {
    scrubberContainer = document.createElement("div");
    scrubberContainer.className = "instafn-reel-scrubber";

    // Create scrubber track
    const scrubberTrack = document.createElement("div");
    scrubberTrack.className = "instafn-reel-scrubber-track";

    // Create scrubber progress
    const scrubberProgress = document.createElement("div");
    scrubberProgress.className = "instafn-reel-scrubber-progress";

    // Create scrubber handle
    const scrubberHandle = document.createElement("div");
    scrubberHandle.className = "instafn-reel-scrubber-handle";

    // Create time pill
    const timePill = document.createElement("div");
    timePill.className = "instafn-reel-time-pill";
    timePill.textContent = "0:00 / 0:00";

    scrubberTrack.appendChild(scrubberProgress);
    scrubberTrack.appendChild(scrubberHandle);
    scrubberContainer.appendChild(scrubberTrack);
    scrubberContainer.appendChild(timePill);
    rootContainer.appendChild(scrubberContainer);
  }

  // Get references to scrubber elements
  const scrubberTrack = scrubberContainer.querySelector(
    ".instafn-reel-scrubber-track"
  );
  const scrubberProgress = scrubberContainer.querySelector(
    ".instafn-reel-scrubber-progress"
  );
  const scrubberHandle = scrubberContainer.querySelector(
    ".instafn-reel-scrubber-handle"
  );
  const timePill = scrubberContainer.querySelector(".instafn-reel-time-pill");

  if (!scrubberTrack || !scrubberProgress || !scrubberHandle || !timePill) {
    return; // Elements not found
  }

  // Handle scrubbing state
  let isScrubbing = false;
  let wasPlaying = false;

  const formatTime = (seconds) => {
    if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTimeRange = (current, total) => {
    return `${formatTime(current)} / ${formatTime(total)}`;
  };

  // Update progress on timeupdate (only when not scrubbing)
  const updateProgress = () => {
    if (
      !isScrubbing &&
      video.duration &&
      isFinite(video.duration) &&
      video.duration > 0
    ) {
      const progress = Math.max(
        0,
        Math.min(100, (video.currentTime / video.duration) * 100)
      );
      // Update progress bar
      scrubberProgress.style.width = `${progress}%`;
      // Update handle position
      scrubberHandle.style.left = `${progress}%`;
    }
  };

  // Set up video event listeners
  const setupVideoListeners = () => {
    video.addEventListener("timeupdate", updateProgress);
    video.addEventListener("loadedmetadata", () => {
      updateProgress();
    });
    video.addEventListener("loadeddata", () => {
      updateProgress();
    });
    video.addEventListener("canplay", () => {
      updateProgress();
    });
    video.addEventListener("progress", () => {
      updateProgress();
    });

    // Initial update if video is already ready
    if (video.readyState >= 2) {
      updateProgress();
    }
  };

  setupVideoListeners();

  // Also use requestAnimationFrame for smooth updates
  let rafId = null;
  const rafUpdate = () => {
    if (!isScrubbing && video.readyState >= 2) {
      updateProgress();
    }
    rafId = requestAnimationFrame(rafUpdate);
  };
  rafId = requestAnimationFrame(rafUpdate);

  // Clean up on video removal
  const observer = new MutationObserver(() => {
    if (!document.contains(video)) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Get mouse/touch position relative to track
  const getPositionFromEvent = (e) => {
    const rect = scrubberTrack.getBoundingClientRect();
    const clientX =
      e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX;
    if (clientX === undefined) return null;
    const x = clientX - rect.left;
    return Math.max(0, Math.min(rect.width, x));
  };

  const updateTimePill = (percent) => {
    if (!video.duration || !isFinite(video.duration)) return;
    const time = (percent / 100) * video.duration;
    timePill.textContent = formatTimeRange(time, video.duration);
    // Time pill stays centered - don't set left position
    timePill.classList.add("visible");
  };

  const startScrubbing = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isScrubbing = true;
    wasPlaying = !video.paused;
    video.pause();
    scrubberContainer.style.opacity = "1";
    // Remove transition delay when scrubbing
    scrubberHandle.classList.add("scrubbing");

    const pos = getPositionFromEvent(e);
    if (pos !== null) {
      const rect = scrubberTrack.getBoundingClientRect();
      const percent = (pos / rect.width) * 100;
      updateTimePill(percent);
      scrub(e);
    }
  };

  const scrub = (e) => {
    if (!isScrubbing) return;
    const pos = getPositionFromEvent(e);
    if (pos === null) return;

    const rect = scrubberTrack.getBoundingClientRect();
    const percent = Math.max(0, Math.min(100, (pos / rect.width) * 100));

    if (video.duration && isFinite(video.duration) && video.duration > 0) {
      const time = (percent / 100) * video.duration;
      video.currentTime = time;
      // Update instantly without transition
      scrubberProgress.style.transition = "none";
      scrubberProgress.style.width = `${percent}%`;
      scrubberHandle.style.left = `${percent}%`;
      scrubberHandle.style.transition = "opacity 0.2s, left 0s !important";
      updateTimePill(percent);
    }
  };

  const stopScrubbing = (e) => {
    if (!isScrubbing) return;
    isScrubbing = false;
    timePill.classList.remove("visible");
    // Restore transition for smooth playback
    scrubberHandle.classList.remove("scrubbing");
    scrubberHandle.style.transition = "";
    scrubberProgress.style.transition = "";

    // Don't auto-hide if hovering
    if (!rootContainer.matches(":hover")) {
      scrubberContainer.style.opacity = "";
    }

    // Resume playing if it was playing before
    if (wasPlaying) {
      video.play().catch(() => {
        // Ignore play errors
      });
    }
  };

  // Mouse events
  scrubberTrack.addEventListener("mousedown", startScrubbing);

  const handleMouseMove = (e) => {
    if (isScrubbing) {
      scrub(e);
    }
  };

  const handleMouseUp = (e) => {
    stopScrubbing(e);
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);

  // Touch events
  scrubberTrack.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      startScrubbing(e);
    },
    { passive: false }
  );

  const handleTouchMove = (e) => {
    if (isScrubbing) {
      e.preventDefault();
      scrub(e);
    }
  };

  const handleTouchEnd = (e) => {
    if (isScrubbing) {
      stopScrubbing(e);
    }
  };

  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd);

  // Also allow clicking on track to jump
  scrubberTrack.addEventListener("click", (e) => {
    if (!isScrubbing) {
      const pos = getPositionFromEvent(e);
      if (pos !== null && video.duration && isFinite(video.duration)) {
        const rect = scrubberTrack.getBoundingClientRect();
        const percent = (pos / rect.width) * 100;
        const time = (percent / 100) * video.duration;
        video.currentTime = time;
      }
    }
  });
}

function ensureReelScrubberCSS() {
  injectStylesheet(
    "content/features/video-scrubber/videoScrubber.css",
    "instafn-reel-scrubber"
  );
}

function processFeedVideo(video) {
  if (!isEnabled) return; // Don't process if disabled
  if (!video) return;

  // Skip videos on call pages
  if (isCallContext()) {
    return;
  }

  // Skip videos in DM chat
  if (isDMChatVideo(video)) {
    return;
  }

  // Skip videos in explore grid - only add scrubbers when clicked and in popup
  if (isExploreGridVideo(video)) {
    return;
  }

  // Check if this is a reel - if so, add custom scrubber
  if (isReelContext(video)) {
    processReelVideo(video);
    return;
  }

  if (video.dataset.instafnFeedControls === "true") return;

  // Mark processed
  video.dataset.instafnFeedControls = "true";

  // Remove native controls - we'll use custom scrubber
  video.removeAttribute("controls");

  // Ensure CSS is present once
  ensureReelScrubberCSS(); // Reuse the same scrubber CSS

  // Ensure video can receive clicks for play/pause
  video.style.pointerEvents = "auto";
  video.style.cursor = "pointer";
  video.style.zIndex = "1";

  const rootContainer = video.parentElement;
  if (rootContainer) {
    // Ensure the root container has relative positioning for absolute children
    ensureRelativePositioning(rootContainer);

    rootContainer.classList.add("instafn-feed-controls");
    rootContainer.classList.add("instafn-reel-container"); // Reuse reel container class for scrubber

    // Create scrubber for feed videos (same as reels)
    let scrubberContainer = rootContainer.querySelector(
      ".instafn-reel-scrubber"
    );
    if (!scrubberContainer) {
      scrubberContainer = document.createElement("div");
      scrubberContainer.className = "instafn-reel-scrubber";

      // Create scrubber track
      const scrubberTrack = document.createElement("div");
      scrubberTrack.className = "instafn-reel-scrubber-track";

      // Create scrubber progress
      const scrubberProgress = document.createElement("div");
      scrubberProgress.className = "instafn-reel-scrubber-progress";

      // Create scrubber handle
      const scrubberHandle = document.createElement("div");
      scrubberHandle.className = "instafn-reel-scrubber-handle";

      // Create time pill
      const timePill = document.createElement("div");
      timePill.className = "instafn-reel-time-pill";
      timePill.textContent = "0:00 / 0:00";

      scrubberTrack.appendChild(scrubberProgress);
      scrubberTrack.appendChild(scrubberHandle);
      scrubberContainer.appendChild(scrubberTrack);
      scrubberContainer.appendChild(timePill);
      rootContainer.appendChild(scrubberContainer);
    }

    // Set up scrubber functionality (same as reels)
    setupFeedVideoScrubber(video, rootContainer, scrubberContainer);

    // Add click-to-pause functionality directly on video
    const handleVideoClick = (e) => {
      // Don't pause if clicking through to scrubber or buttons
      const path = e.composedPath ? e.composedPath() : [];
      const hasScrubber = path.some(
        (el) =>
          el && el.classList && el.classList.contains("instafn-reel-scrubber")
      );
      const hasButton = path.some(
        (el) =>
          el &&
          (el.tagName === "BUTTON" ||
            (el.closest &&
              el.closest(
                'button[aria-label="Toggle audio"], button[aria-label="Tags"]'
              )))
      );

      if (hasScrubber || hasButton) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    };

    // Add both click and mousedown handlers for reliability
    video.addEventListener("click", handleVideoClick, true);
    video.addEventListener(
      "mousedown",
      (e) => {
        // Only handle if it's a simple click (not drag)
        const startY = e.clientY;
        const startX = e.clientX;
        const handleMouseUp = (upE) => {
          const deltaY = Math.abs(upE.clientY - startY);
          const deltaX = Math.abs(upE.clientX - startX);
          // If it's a small movement (click, not drag), toggle play/pause
          if (deltaY < 5 && deltaX < 5) {
            handleVideoClick(e);
          }
          document.removeEventListener("mouseup", handleMouseUp);
        };
        document.addEventListener("mouseup", handleMouseUp);
      },
      true
    );

    // Also handle clicks on the container area (above scrubber)
    rootContainer.addEventListener(
      "click",
      (e) => {
        // Skip if clicking on interactive elements
        if (
          e.target.closest(".instafn-reel-scrubber") ||
          e.target.closest('button[aria-label="Toggle audio"]') ||
          e.target.closest('button[aria-label="Tags"]') ||
          e.target.closest("a") ||
          e.target.closest("button") ||
          e.target.tagName === "BUTTON" ||
          e.target.tagName === "A" ||
          e.target === video // Video click is handled above
        ) {
          return;
        }

        // If clicking on container area, check if it's above the scrubber
        const scrubberRect = scrubberContainer.getBoundingClientRect();
        const clickY = e.clientY;

        // Only handle if click is above the scrubber area
        if (clickY < scrubberRect.top - 10) {
          e.preventDefault();
          e.stopPropagation();
          if (video.paused) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      true
    );

    // Ensure mute and tags buttons are clickable
    const muteButton = rootContainer.querySelector(
      'button[aria-label="Toggle audio"]'
    );
    const tagsButton =
      rootContainer.querySelector('button[aria-label="Tags"]') ||
      rootContainer.querySelector('svg[aria-label="Tags"]')?.closest("button");

    makeButtonClickable(muteButton, rootContainer);
    makeButtonClickable(tagsButton, rootContainer);

    // Disable blocking overlays after setting up both buttons
    disableBlockingOverlays(rootContainer);
  }

  // Re-arrange structure to match desired order
  rearrangeVideoAfterInstanceKey(video);

  // Ensure overlays don't block buttons after rearrangement
  if (rootContainer) {
    disableBlockingOverlays(rootContainer);

    // Re-enable pointer events on buttons after disabling overlays
    const muteButton = rootContainer.querySelector(
      'button[aria-label="Toggle audio"]'
    );
    const tagsButton =
      rootContainer.querySelector('button[aria-label="Tags"]') ||
      rootContainer.querySelector('svg[aria-label="Tags"]')?.closest("button");

    makeButtonClickable(muteButton, rootContainer);
    makeButtonClickable(tagsButton, rootContainer);
  }
}

function scanExistingVideos() {
  const videos = document.querySelectorAll("video");
  videos.forEach((video) => processFeedVideo(video));
}

function disableVideoScrubber() {
  // Stop observer
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  // Remove controls from all videos that were processed
  const processedVideos = document.querySelectorAll(
    'video[data-instafn-feed-controls="true"], video[data-instafn-reel-scrubber="true"]'
  );
  processedVideos.forEach((video) => {
    video.removeAttribute("controls");
    video.removeAttribute("data-instafn-feed-controls");
    video.removeAttribute("data-instafn-reel-scrubber");
    const rootContainer = video.parentElement;
    if (rootContainer) {
      rootContainer.classList.remove("instafn-feed-controls");
      rootContainer.classList.remove("instafn-reel-container");
      // Remove scrubber if present
      const scrubber = rootContainer.querySelector(".instafn-reel-scrubber");
      if (scrubber) scrubber.remove();
    }
  });
}

export function initVideoScrubber(enabled = false) {
  isEnabled = enabled;

  if (!isEnabled) {
    // Disable the feature
    disableVideoScrubber();
    return;
  }

  // Initial scan
  scanExistingVideos();

  // Observe dynamic content
  if (!observer) {
    observer = new MutationObserver((mutations) => {
      if (!isEnabled) return; // Don't process if disabled

      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;

          if (node.tagName === "VIDEO") {
            processFeedVideo(node);
          } else if (node.querySelectorAll) {
            const videos = node.querySelectorAll("video");
            videos.forEach((v) => processFeedVideo(v));
          }
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }
}

export function updateVideoScrubber() {
  // For compatibility; re-run scan when called
  scanExistingVideos();
}

export function isVideoScrubberActive() {
  return isEnabled;
}
