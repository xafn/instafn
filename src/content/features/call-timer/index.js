import { injectStylesheet } from "../../utils/styleLoader.js";
import { watchUrlChanges } from "../../utils/domObserver.js";
import { watchForElement } from "../../utils/domObserver.js";

let timerInterval = null;
let startTime = null;
let timerElement = null;

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

function updateTimer() {
  if (!timerElement || !startTime) return;
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  timerElement.textContent = formatTime(elapsed);
}

function injectTimer() {
  if (timerElement?.parentElement) return; // Already injected

  // Find "people" text
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  let node;
  while ((node = walker.nextNode())) {
    if (/^\d+\s+people?$/.test(node.textContent.trim())) {
      const parent = node.parentElement;
      if (!parent) continue;

      // Create timer
      timerElement = document.createElement("span");
      timerElement.className = "instafn-call-timer";
      timerElement.textContent = "00:00";

      // Insert after the "people" element: separator first, then timer
      const separator = document.createElement("span");
      separator.className = "instafn-call-timer-separator";
      separator.textContent = "·";

      parent.parentElement?.insertBefore(separator, parent.nextSibling);
      separator.parentElement?.insertBefore(
        timerElement,
        separator.nextSibling
      );

      // Start timer
      startTime = Date.now();
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(updateTimer, 1000);
      return;
    }
  }
}

function cleanup() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (timerElement) {
    timerElement.remove();
    timerElement = null;
  }
  startTime = null;
}

export function initCallTimer(enabled = true) {
  if (!enabled) {
    cleanup();
    return;
  }

  injectStylesheet(
    "content/features/call-timer/call-timer.css",
    "instafn-call-timer"
  );

  // Only run on call pages
  if (!window.location.pathname.includes("/call/")) return;

  // Try to inject immediately
  if (document.body) {
    injectTimer();
  }

  // Watch for element to appear
  watchForElement(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node;
    while ((node = walker.nextNode())) {
      if (/^\d+\s+people?$/.test(node.textContent.trim())) {
        return node.parentElement;
      }
    }
    return null;
  }, injectTimer);

  // Watch for URL changes
  watchUrlChanges(() => {
    cleanup();
    if (window.location.pathname.includes("/call/")) {
      setTimeout(injectTimer, 100);
    }
  });
}
