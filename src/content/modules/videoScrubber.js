// Video scrubber functionality for Instagram videos and reels

let isVideoScrubberEnabled = false;
let observer = null;

// Function to enable video scrubbers on all video elements
function enableVideoScrubbers() {
  console.log("Instafn: Enabling video scrubbers");

  // Find all video elements
  const videos = document.querySelectorAll("video");

  videos.forEach((video) => {
    enableScrubberForVideo(video);
  });
}

// Function to enable scrubber for a specific video element
function enableScrubberForVideo(video) {
  if (!video || video.hasAttribute("data-instafn-scrubber-enabled")) {
    return;
  }

  // Mark as processed
  video.setAttribute("data-instafn-scrubber-enabled", "true");

  // Ensure controls are visible
  video.controls = true;

  // Add custom styles to make controls more visible
  video.style.setProperty("--ig-video-controls-opacity", "1", "important");

  // Add class to body for CSS targeting
  document.body.classList.add("instafn-video-scrubber-enabled");

  // Video controls are now handled purely with CSS hover states
  // No need for JavaScript hover events

  // Special handling for reels - ensure controls are properly set
  const isReel =
    video.closest('div[data-testid="reel"]') ||
    video.closest('div[role="presentation"]') ||
    video.closest('div[data-visualcompletion="ignore"]');

  if (isReel) {
    console.log("Instafn: Reel detected, ensuring controls are enabled");
    // Force controls to be enabled for reels
    video.controls = true;
    // Add a small delay to ensure Instagram doesn't override
    setTimeout(() => {
      if (isVideoScrubberEnabled) {
        video.controls = true;
        console.log("Instafn: Reel controls confirmed enabled");
      }
    }, 200);
  }

  // Handle Instagram's audio control button that might interfere with video controls
  const audioButton = video
    .closest("div[data-instancekey]")
    ?.querySelector('button[aria-label="Toggle audio"]');
  if (audioButton) {
    // Ensure the audio button doesn't block video control clicks
    audioButton.addEventListener(
      "click",
      (e) => {
        // Allow the audio button to work normally
        e.stopPropagation();
      },
      true
    );
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
      // Ensure controls are set after video loads
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
      if (isVideoScrubberEnabled && value === false) {
        // Don't allow Instagram to disable controls when scrubber is enabled
        return;
      }
      if (value) {
        this.setAttribute("controls", "");
      } else {
        this.removeAttribute("controls");
      }
    },
  });

  console.log("Instafn: Video scrubber enabled for video element");
}

// Function to disable video scrubbers
function disableVideoScrubbers() {
  console.log("Instafn: Disabling video scrubbers");

  const videos = document.querySelectorAll(
    "video[data-instafn-scrubber-enabled]"
  );

  videos.forEach((video) => {
    video.removeAttribute("data-instafn-scrubber-enabled");
    video.controls = false;
    video.style.removeProperty("--ig-video-controls-opacity");
  });

  // Remove body class
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
              // Check if the added node is a video
              if (node.tagName === "VIDEO") {
                enableScrubberForVideo(node);
              }

              // Check for videos within the added node
              const videos = node.querySelectorAll
                ? node.querySelectorAll("video")
                : [];
              videos.forEach((video) => enableScrubberForVideo(video));
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
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
