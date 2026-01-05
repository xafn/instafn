/**
 * Call Timer Feature
 *
 * Displays elapsed time in Instagram calls, starting from when the page loads.
 * The timer appears next to the "2 people" (or similar) text in the call interface.
 */

import { injectStylesheet } from "../../utils/styleLoader.js";

let timerInterval = null;
let startTime = null;
let timerElement = null;
let separatorElement = null;
let isEnabled = false;

/**
 * Format elapsed time as MM:SS or HH:MM:SS
 * @param {number} seconds - Total seconds elapsed
 * @returns {string} Formatted time string
 */
function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(
      secs
    ).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Update the timer display
 */
function updateTimer() {
  if (!timerElement || !startTime) return;

  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  timerElement.textContent = formatTime(elapsed);
}

/**
 * Find the "2 people" text element and add timer next to it
 */
function findAndAttachTimer() {
  // Look for elements containing "people" text
  // Based on the HTML structure, we're looking for spans with "2 people" or similar
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    // Match patterns like "2 people", "3 people", etc.
    if (/^\d+\s+people?$/.test(text)) {
      const textParent = node.parentElement;
      if (!textParent) continue;

      // Check if we've already added a timer nearby
      const existingTimer = document.querySelector(".instafn-call-timer");
      const existingSeparator = document.querySelector(
        ".instafn-call-timer-separator"
      );
      if (existingTimer && existingTimer.parentElement) {
        // Timer already exists, reuse it
        timerElement = existingTimer;
        if (existingSeparator) {
          separatorElement = existingSeparator;
        } else {
          // Create separator if it doesn't exist
          separatorElement = document.createElement("span");
          separatorElement.className = "instafn-call-timer-separator";
          separatorElement.textContent = "·";
          // Insert separator before the timer
          existingTimer.parentElement.insertBefore(
            separatorElement,
            existingTimer
          );
        }
        // Reset start time if it's not set (new call)
        if (!startTime) {
          startTime = Date.now();
          updateTimer();
        }
        return true;
      }

      // Create separator element (middle dot)
      separatorElement = document.createElement("span");
      separatorElement.className = "instafn-call-timer-separator";
      separatorElement.textContent = "·";

      // Create timer element
      timerElement = document.createElement("span");
      timerElement.className = "instafn-call-timer";
      timerElement.textContent = "00:00";

      // Find the parent container that holds the "people" text
      // The text is typically in a span, which is in a div structure
      let container = textParent;

      // Walk up to find a div container that's likely the parent of multiple elements
      while (container && container !== document.body) {
        const parent = container.parentElement;
        if (parent && parent.tagName === "DIV") {
          // Check if this div has the "people" text and might be a good container
          // Look for a div that contains the text and has other siblings
          const siblings = Array.from(parent.children);
          if (siblings.length > 0) {
            // Found a container with children, insert separator and timer after the element containing "people"
            const peopleElement = container;
            const index = siblings.indexOf(peopleElement);
            if (index >= 0) {
              if (index < siblings.length - 1) {
                parent.insertBefore(separatorElement, siblings[index + 1]);
                parent.insertBefore(timerElement, siblings[index + 1]);
              } else {
                parent.appendChild(separatorElement);
                parent.appendChild(timerElement);
              }
              break;
            }
          }
        }
        container = container.parentElement;
      }

      // Fallback: if we couldn't find a good container, try to append to the parent of the text
      if (!timerElement.parentElement) {
        const fallbackContainer = textParent.parentElement || textParent;
        if (fallbackContainer) {
          // Try to insert after the text parent
          if (textParent.nextSibling) {
            fallbackContainer.insertBefore(
              separatorElement,
              textParent.nextSibling
            );
            fallbackContainer.insertBefore(
              timerElement,
              textParent.nextSibling
            );
          } else {
            fallbackContainer.appendChild(separatorElement);
            fallbackContainer.appendChild(timerElement);
          }
        }
      }

      // Start the timer
      startTime = Date.now();
      updateTimer();

      // Set up interval to update every second
      if (timerInterval) {
        clearInterval(timerInterval);
      }
      timerInterval = setInterval(updateTimer, 1000);

      return true;
    }
  }

  return false;
}

/**
 * Clean up timer resources
 */
function cleanup() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (timerElement) {
    timerElement.remove();
    timerElement = null;
  }
  if (separatorElement) {
    separatorElement.remove();
    separatorElement = null;
  }
  startTime = null;
}

/**
 * Check if we're on a call page
 */
function isCallPage() {
  return window.location.pathname.includes("/call/");
}

let observer = null;
let retryInterval = null;
let urlCheckInterval = null;
let lastUrl = window.location.href;

/**
 * Initialize the call timer feature
 * @param {boolean} enabled - Whether the feature is enabled
 */
export function initCallTimer(enabled = true) {
  try {
    isEnabled = enabled;

    // Inject stylesheet (only if enabled)
    if (enabled) {
      injectStylesheet(
        "content/features/call-timer/call-timer.css",
        "instafn-call-timer"
      );
    }

    // Clean up if disabling
    if (!enabled) {
      cleanup();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (retryInterval) {
        clearInterval(retryInterval);
        retryInterval = null;
      }
      if (urlCheckInterval) {
        clearInterval(urlCheckInterval);
        urlCheckInterval = null;
      }
      return;
    }
  } catch (err) {
    console.error("Instafn: Error initializing call timer:", err);
    return;
  }

  // Function to set up timer on call page
  function setupTimer() {
    try {
      // Only run on call pages
      if (!isCallPage()) {
        cleanup();
        return;
      }

      // Make sure document.body exists
      if (!document.body) {
        return;
      }

      // Reset start time for new call
      startTime = null;

      // If timer already exists in DOM, reuse it
      const existingTimer = document.querySelector(".instafn-call-timer");
      const existingSeparator = document.querySelector(
        ".instafn-call-timer-separator"
      );
      if (existingTimer && existingTimer.parentElement) {
        timerElement = existingTimer;
        if (existingSeparator) {
          separatorElement = existingSeparator;
        } else {
          // Create separator if it doesn't exist
          separatorElement = document.createElement("span");
          separatorElement.className = "instafn-call-timer-separator";
          separatorElement.textContent = "·";
          // Insert separator before the timer
          existingTimer.parentElement.insertBefore(
            separatorElement,
            existingTimer
          );
        }
        startTime = Date.now();
        updateTimer();
        if (!timerInterval) {
          timerInterval = setInterval(updateTimer, 1000);
        }
        return;
      }

      // Try to find and attach timer immediately
      if (findAndAttachTimer()) {
        return;
      }

      // If not found, set up observer to watch for DOM changes
      if (!observer && document.body) {
        observer = new MutationObserver(() => {
          if (!timerElement || !timerElement.parentElement) {
            findAndAttachTimer();
          }
        });

        // Start observing
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }

      // Also try periodically in case the element appears later
      if (!retryInterval) {
        retryInterval = setInterval(() => {
          if (!timerElement || !timerElement.parentElement) {
            findAndAttachTimer();
          }
        }, 1000);
      }
    } catch (err) {
      console.error("Instafn: Error in call timer setup:", err);
    }
  }

  // Set up timer initially
  setupTimer();

  // Watch for URL changes (Instagram is a SPA)
  if (!urlCheckInterval) {
    urlCheckInterval = setInterval(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // URL changed, clean up and reinitialize
        cleanup();
        setupTimer();
      }
    }, 500);
  }

  // Also listen to popstate for back/forward navigation
  window.addEventListener("popstate", () => {
    cleanup();
    setTimeout(setupTimer, 100);
  });
}
