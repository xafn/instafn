// Video scrubber functionality for Instagram videos and reels

let isVideoScrubberEnabled = false;
let observer = null;

// Function to enable video scrubbers on all video elements
function enableVideoScrubbers() {
  const videos = document.querySelectorAll("video");
  videos.forEach((video) => enableScrubberForVideo(video));
}

// Function to enable scrubber for a specific video element
function enableScrubberForVideo(video) {
  if (!video || video.hasAttribute("data-instafn-scrubber-enabled")) return;

  video.setAttribute("data-instafn-scrubber-enabled", "true");
  video.controls = true;
  video.style.setProperty("--ig-video-controls-opacity", "1", "important");
  document.body.classList.add("instafn-video-scrubber-enabled");

  // Special handling for reels
  const isReel =
    video.closest('div[data-testid="reel"]') ||
    video.closest('div[role="presentation"]') ||
    video.closest('div[data-visualcompletion="ignore"]');

  if (isReel) {
    video.controls = true;
    setTimeout(() => {
      if (isVideoScrubberEnabled) video.controls = true;
    }, 200);
  }

  // Handle Instagram's audio control button
  const audioButton = video
    .closest("div[data-instancekey]")
    ?.querySelector('button[aria-label="Toggle audio"]');
  if (audioButton) {
    audioButton.addEventListener("click", (e) => e.stopPropagation(), true);
  }

  // Ensure controls stay visible when video is playing
  video.addEventListener("play", () => {
    if (isVideoScrubberEnabled) {
      video.controls = true;
      video.style.setProperty("--ig-video-controls-opacity", "1", "important");
    }
  });

  // Override Instagram's control hiding
  const originalAddEventListener = video.addEventListener;
  video.addEventListener = function(type, listener, options) {
    if (type === "loadedmetadata" || type === "loadeddata") {
      setTimeout(() => {
        if (isVideoScrubberEnabled) {
          video.controls = true;
          video.style.setProperty(
            "--ig-video-controls-opacity",
            "1",
            "important"
          );
        }
      }, 100);
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // Prevent Instagram from disabling controls
  Object.defineProperty(video, "controls", {
    get: function() {
      return this.hasAttribute("controls");
    },
    set: function(value) {
      if (isVideoScrubberEnabled && value === false) return;
      if (value) this.setAttribute("controls", "");
      else this.removeAttribute("controls");
    },
  });
}

// Function to disable video scrubbers
function disableVideoScrubbers() {
  const videos = document.querySelectorAll(
    "video[data-instafn-scrubber-enabled]"
  );
  videos.forEach((video) => {
    video.removeAttribute("data-instafn-scrubber-enabled");
    video.controls = false;
    video.style.removeProperty("--ig-video-controls-opacity");
  });

  document.body.classList.remove("instafn-video-scrubber-enabled");

  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// Function to initialize video scrubber functionality
export function initVideoScrubber(enabled = false) {
  isVideoScrubberEnabled = enabled;

  if (enabled) {
    enableVideoScrubbers();

    // Set up mutation observer to handle dynamically loaded videos
    if (!observer) {
      observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === "VIDEO") {
                enableScrubberForVideo(node);
              }
              const videos = node.querySelectorAll
                ? node.querySelectorAll("video")
                : [];
              videos.forEach((video) => enableScrubberForVideo(video));
            }
          });
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    }
  } else {
    disableVideoScrubbers();
  }
}

// Function to update video scrubber state
export function updateVideoScrubber(enabled) {
  if (enabled !== isVideoScrubberEnabled) {
    initVideoScrubber(enabled);
  }
}

// Export current state for checking
export function isVideoScrubberActive() {
  return isVideoScrubberEnabled;
}
