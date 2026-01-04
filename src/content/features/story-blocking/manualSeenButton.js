import { showToast } from "../../ui/toast.js";

const EYE_ICON_PATH =
  '<path d="M2 12s3-6 10-6S22 12 22 12s-3 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" stroke-width="2"></circle>';

let teardown = null;

function showSeenToast() {
  showToast("Marked as seen", {
    id: "instafn-story-seen-toast",
    duration: 1000,
  });
}

function markCurrentStoryAsSeen() {
  // Allow seen requests to go through and replay the most recent one
  // This marks the current story as seen regardless of progress (0%, 90%, etc.)
  window.postMessage(
    { source: "instafn", type: "ALLOW_STORY_SEEN", ms: 3000 },
    "*"
  );
  window.postMessage({ source: "instafn", type: "MARK_STORY_SEEN" }, "*");
}

function removeExistingButtons() {
  document
    .querySelectorAll('[data-instafn-story-seen-btn="true"]')
    .forEach((btn) => btn.remove());
}

function isStoryContext() {
  // Only show button on actual story pages
  // Check URL first - most reliable indicator
  if (window.location.pathname.includes("/stories/")) {
    return true;
  }

  // Additional checks for story viewer (modal/dialog)
  // Stories typically have a reply textarea AND are in a dialog/modal
  const hasReplyTextarea = !!document.querySelector(
    'textarea[placeholder*="Reply to"]'
  );
  const hasStoryDialog =
    !!document.querySelector('[role="dialog"]') ||
    !!document.querySelector('article[role="presentation"]');

  // Only consider it a story if we have both the reply textarea AND a dialog/modal
  // This prevents false positives on regular posts/reels
  if (hasReplyTextarea && hasStoryDialog) {
    // Double-check: stories usually have a "Next" button in the dialog
    const hasNextButton = !!document.querySelector('svg[aria-label="Next"]');
    if (hasNextButton) {
      return true;
    }
  }

  return false;
}

function copyLayout(templateButton, button) {
  try {
    const computed = getComputedStyle(templateButton);
    const ensure = (prop, fallback) => {
      if (!button.style[prop]) {
        button.style[prop] =
          templateButton.style[prop] || computed[prop] || fallback;
      }
    };
    ensure("display", "inline-flex");
    ensure("flex", "0 0 auto");
    ensure("alignItems", "center");
    ensure("justifyContent", "center");
    ensure("alignSelf", "center");
    ensure("flexDirection", "row");
    ensure("verticalAlign", "middle");
    ensure("marginRight", "8px");
    ensure("marginLeft", "0px");

    // Avoid inheriting absolute positioning from the heart
    button.style.position = "static";
    button.style.right = "";
    button.style.left = "";
    button.style.top = "";
    button.style.bottom = "";
    button.style.transform = "none";
    button.style.background = "transparent";
    button.style.border = "none";

    // Nudge order to appear before heart in flex layouts
    const heartOrder = parseInt(computed.order || "0", 10);
    if (!Number.isNaN(heartOrder)) {
      button.style.order = (heartOrder - 1).toString();
    }

    // Neutral color so it doesn’t inherit the red liked state
    const neutral = "var(--ig-primary-text, #fff)";
    button.style.color = neutral;
  } catch (_) {
    // ignore styling copy failures
  }
}

function createManualSeenButton(templateButton) {
  const button = templateButton.cloneNode(true);
  button.dataset.instafnStorySeenBtn = "true";
  button.setAttribute("aria-label", "Mark story as seen");
  button.title = "Mark story as seen";
  button.tabIndex = 0;
  button.setAttribute("aria-pressed", "false");

  copyLayout(templateButton, button);

  const svg = button.querySelector("svg");
  if (svg) {
    svg.setAttribute("aria-label", "Mark story as seen");
    svg.setAttribute("role", "img");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("height", "24");
    svg.setAttribute("width", "24");
    svg.innerHTML = EYE_ICON_PATH;
    svg.style.color = "var(--ig-primary-text, #fff)";
    svg.style.fill = "none";
    svg.style.stroke = "currentColor";
    svg.querySelectorAll("path,circle").forEach((p) => {
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", "currentColor");
    });
  } else {
    const span = document.createElement("span");
    span.innerHTML = `<svg aria-label="Mark story as seen" role="img" viewBox="0 0 24 24" height="24" width="24">${EYE_ICON_PATH}</svg>`;
    button.appendChild(span);
  }

  const handleTrigger = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    button.setAttribute("data-instafn-story-seen-active", "true");
    markCurrentStoryAsSeen();
    showSeenToast();
    setTimeout(() => {
      button.removeAttribute("data-instafn-story-seen-active");
    }, 1200);
  };

  button.addEventListener("click", handleTrigger);
  button.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      handleTrigger(e);
    }
  });

  return button;
}

function findActionRows() {
  // Only find action rows within story contexts
  // Stories typically have a reply textarea nearby
  const storyContainer =
    document.querySelector('[role="dialog"]') ||
    document.querySelector('article[role="presentation"]') ||
    document.body;

  const hearts = Array.from(
    storyContainer.querySelectorAll(
      'svg[aria-label="Like"], svg[aria-label="Unlike"]'
    )
  );

  return hearts
    .map((heart) => {
      const heartButton = heart.closest(
        'button, [role="button"], div[role="button"]'
      );
      if (!heartButton) return null;

      // Verify this heart is within a story context
      // Stories have a reply textarea nearby
      const hasNearbyReply =
        !!heartButton
          .closest('[role="dialog"]')
          ?.querySelector('textarea[placeholder*="Reply to"]') ||
        !!heartButton
          .closest('article[role="presentation"]')
          ?.querySelector('textarea[placeholder*="Reply to"]');

      if (!hasNearbyReply && !window.location.pathname.includes("/stories/")) {
        return null; // Not in a story context
      }

      // Prefer a row that also contains send/direct
      let row = heartButton;
      for (let i = 0; i < 8 && row; i++) {
        if (
          row.querySelector('svg[aria-label="Direct"], svg[aria-label="Send"]')
        ) {
          break;
        }
        row = row.parentElement;
      }

      // Fallback to immediate parent
      if (!row) row = heartButton.parentElement;

      return row ? { row, heartButton } : null;
    })
    .filter(Boolean);
}

function setupManualSeenButton() {
  let lastHref = window.location.href;
  let rafId = null;
  let hrefPollId = null;
  let intervalId = null;

  const ensureButtonExists = () => {
    // Always check story context first - remove buttons if not in story
    if (!isStoryContext()) {
      removeExistingButtons();
      return;
    }

    const actions = findActionRows();
    if (!actions.length) return;

    // Additional safety: verify we're still in story context before adding buttons
    if (!isStoryContext()) {
      return;
    }

    actions.forEach(({ row, heartButton }) => {
      if (!row || !heartButton) return;
      // Place relative to the heart's actual parent to avoid NotFoundError
      const parent = heartButton.parentNode;
      if (!parent || !parent.contains(heartButton)) return;
      // Ensure the container lays out children horizontally
      if (!parent.style.display) parent.style.display = "flex";
      if (!parent.style.alignItems) parent.style.alignItems = "center";
      if (
        parent.querySelector &&
        parent.querySelector('[data-instafn-story-seen-btn="true"]')
      )
        return;

      const manualButton = createManualSeenButton(heartButton);
      parent.insertBefore(manualButton, heartButton);
    });
  };

  const scheduleRefresh = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      ensureButtonExists();
    });
  };

  const observer = new MutationObserver(scheduleRefresh);
  const target = document.body || document.documentElement;
  if (target) {
    observer.observe(target, { childList: true, subtree: true });
  }

  document.addEventListener("click", scheduleRefresh, true);
  window.addEventListener("popstate", scheduleRefresh);
  window.addEventListener("hashchange", scheduleRefresh);
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      scheduleRefresh();
    }
  });

  hrefPollId = window.setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      removeExistingButtons();
    }
    scheduleRefresh();
  }, 400);

  // Extra safety: lightweight poll to reassert button in case React re-renders
  intervalId = window.setInterval(() => {
    ensureButtonExists();
  }, 600);

  scheduleRefresh();

  return () => {
    observer.disconnect();
    document.removeEventListener("click", scheduleRefresh, true);
    window.removeEventListener("popstate", scheduleRefresh);
    window.removeEventListener("hashchange", scheduleRefresh);
    if (hrefPollId) {
      clearInterval(hrefPollId);
      hrefPollId = null;
    }
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (rafId) cancelAnimationFrame(rafId);
    removeExistingButtons();
  };
}

export function initManualStorySeenButton(enabled) {
  if (!enabled) {
    if (teardown) {
      teardown();
      teardown = null;
    }
    return;
  }

  if (teardown) return;
  teardown = setupManualSeenButton();
}
