// Feed video controls: enable native controls on home feed videos
// and keep IG's mute and tags buttons as top overlays via positioning.
// Reels are skipped.

let observer = null;
let injectedStyle = null;
let isEnabled = false;

function ensureHoverControlsCSS() {
  const css = `
    /* Native controls hidden until hover, unified fade timing */
    .instafn-feed-controls video::-webkit-media-controls,
    .instafn-feed-controls video::-webkit-media-controls-panel,
    .instafn-feed-controls video::-webkit-media-controls-play-button,
    .instafn-feed-controls video::-webkit-media-controls-timeline,
    .instafn-feed-controls video::-webkit-media-controls-current-time-display,
    .instafn-feed-controls video::-webkit-media-controls-time-remaining-display {
      opacity: 0 !important;
      display: flex !important;
      transition: opacity 100ms ease !important;
      pointer-events: auto !important;
    }
    .instafn-feed-controls:hover video::-webkit-media-controls,
    .instafn-feed-controls:hover video::-webkit-media-controls-panel,
    .instafn-feed-controls:hover video::-webkit-media-controls-play-button,
    .instafn-feed-controls:hover video::-webkit-media-controls-timeline,
    .instafn-feed-controls:hover video::-webkit-media-controls-current-time-display,
    .instafn-feed-controls:hover video::-webkit-media-controls-time-remaining-display {
      opacity: 1 !important;
    }
    /* Overlay buttons (mute/tags) should always be visible; no fades applied */
    .instafn-feed-controls button[aria-label="Toggle audio"] {
      z-index: 100001 !important;
      position: relative !important;
    }
    .instafn-feed-controls button svg[aria-label="Tags"],
    .instafn-feed-controls button[aria-label="Tags"] {
      z-index: 100001 !important;
      position: relative !important;
    }
    .instafn-mute-parent {
      top: 0px !important;
      position: absolute !important;
    }
    /* For reels, move the video controls down so the scrubber lines up with the bottom and set z-index below reels UI */
    .instafn-feed-controls[data-testid="reel"] video::-webkit-media-controls-panel {
      z-index: 1 !important;
      transform: translateY(24px) !important; /* Adjust this value for perfect alignment */
    }
  `;

  if (injectedStyle) {
    injectedStyle.textContent = css;
    return;
  }

  const style = document.createElement("style");
  style.id = "instafn-feed-controls-css";
  style.textContent = css;
  document.head.appendChild(style);
  injectedStyle = style;
}

function isReelContext(element) {
  if (!element) return false;
  return (
    element.closest('[data-testid="reel"]') ||
    element.closest('div[role="presentation"]') ||
    element.closest('div[data-visualcompletion="ignore"]')
  );
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
  // Find the mute button to avoid disabling its pointer events
  const muteButton = rootContainer.querySelector(
    'button[aria-label="Toggle audio"]'
  );
  masks.forEach((el) => {
    if (muteButton && (el === muteButton || el.contains(muteButton))) return; // skip mute button wrappers
    el.style.pointerEvents = "none";
  });
}

function positionWrapper(wrapper, rootContainer, { top, left, right }) {
  ensureRelativePositioning(rootContainer);
  disableBlockingOverlays(rootContainer);

  // Avoid flex stretch and ensure natural size
  wrapper.style.position = "absolute";
  wrapper.style.bottom = "auto";
  wrapper.style.height = "auto";
  wrapper.style.display = "inline-flex";
  wrapper.style.alignSelf = "flex-start";
  if (typeof top === "string") wrapper.style.top = top;
  if (typeof left === "string") wrapper.style.left = left;
  if (typeof right === "string") wrapper.style.right = right;
  wrapper.style.zIndex = "100000";
  wrapper.style.pointerEvents = "auto";

  // Ensure wrapper itself can receive clicks above siblings
  wrapper.style.transform = "translateZ(0)";
}

function positionIgMuteButton(video) {
  const rootContainer = video.parentElement;
  if (!rootContainer) return;

  const instanceKeyContainer = rootContainer.querySelector(
    "[data-instancekey]"
  );
  const igMuteButton = instanceKeyContainer
    ? instanceKeyContainer.querySelector('button[aria-label="Toggle audio"]')
    : rootContainer.querySelector('button[aria-label="Toggle audio"]');

  if (!igMuteButton) return;

  // Move mute button back to its original DOM position (before the video)
  if (video.previousSibling !== igMuteButton) {
    rootContainer.insertBefore(igMuteButton, video);
  }

  // Ensure mute button and its wrapper are clickable
  const wrapper = igMuteButton.closest("div");
  if (wrapper) wrapper.style.pointerEvents = "auto";
  igMuteButton.style.pointerEvents = "auto";

  // Remove any test alert handler if present
  igMuteButton.removeEventListener("click", testMuteClickAlert);

  // Prevent card-level handlers; also forward click as fallback
  const forwardClick = (e) => {
    e.stopPropagation();
    const path = e.composedPath ? e.composedPath() : [];
    const btn = path.find((n) => n && n.tagName === "BUTTON") || igMuteButton;
    if (btn && typeof btn.click === "function") btn.click();
  };
  if (wrapper) wrapper.addEventListener("click", forwardClick, true);
  igMuteButton.addEventListener("click", (e) => e.stopPropagation(), true);
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

function processFeedVideo(video) {
  if (!isEnabled) return; // Don't process if disabled
  if (!video || video.dataset.instafnFeedControls === "true") return;
  if (isReelContext(video)) return; // skip reels and similar contexts

  // Mark processed
  video.dataset.instafnFeedControls = "true";

  // Ensure CSS is present once
  ensureHoverControlsCSS();

  // Enable native controls; visibility handled by hover CSS only
  video.setAttribute("controls", "");
  video.style.pointerEvents = "auto";

  // Find the mute button and add a class to its parent
  const rootContainer = video.parentElement;
  if (rootContainer) {
    const muteButton = rootContainer.querySelector(
      'button[aria-label="Toggle audio"]'
    );
    if (muteButton && muteButton.parentElement) {
      muteButton.parentElement.classList.add("instafn-mute-parent");
    }
    rootContainer.classList.add("instafn-feed-controls");
  }

  // Re-arrange structure to match desired order
  rearrangeVideoAfterInstanceKey(video);

  // Do NOT move or reposition the mute button!
  // positionIgMuteButton(video); // Removed to preserve Instagram's mute button functionality
  disableBlockingOverlays(rootContainer);

  // Prevent flicker on loop/play by not toggling controls visibility programmatically
  video.addEventListener(
    "play",
    () => {
      /* no-op */
    },
    true
  );
  video.addEventListener(
    "ended",
    () => {
      /* no-op */
    },
    true
  );
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

  // Remove injected CSS
  if (injectedStyle && injectedStyle.parentNode) {
    injectedStyle.parentNode.removeChild(injectedStyle);
    injectedStyle = null;
  }

  // Remove controls from all videos that were processed
  const processedVideos = document.querySelectorAll(
    'video[data-instafnFeedControls="true"]'
  );
  processedVideos.forEach((video) => {
    video.removeAttribute("controls");
    video.removeAttribute("data-instafnFeedControls");
    const rootContainer = video.parentElement;
    if (rootContainer) {
      rootContainer.classList.remove("instafn-feed-controls");
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
