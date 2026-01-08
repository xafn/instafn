/**
 * Message Double-Tap to Like Feature
 *
 * Allows double-tapping a message to react with the first emoji.
 * Works by: hover message -> click React button -> click first emoji in menu.
 */

import { showToast } from "../../ui/toast.js";

// Helper: Check if element should be hidden (only dialogs)
function shouldHideElement(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width > 500 || rect.height > 400) return false; // Too large = main UI
  return element.getAttribute("role") === "dialog";
}

// Helper: Hide element instantly
function hideElementInstantly(element, hiddenElements = []) {
  if (!element || element.dataset.instafnHidden || !shouldHideElement(element))
    return;
  element.style.setProperty("opacity", "0", "important");
  element.style.setProperty("visibility", "hidden", "important");
  element.style.setProperty("transition", "none", "important");
  element.style.setProperty("pointer-events", "none", "important");
  element.setAttribute("data-instafn-hiding", "true");
  element.dataset.instafnHidden = "true";
  if (hiddenElements && !hiddenElements.includes(element)) {
    hiddenElements.push(element);
  }
}

// Helper: Create menu observer (only watches for dialogs)
function createMenuObserver(hiddenElements) {
  return new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.matches?.('[role="dialog"]')) {
          hideElementInstantly(node, hiddenElements);
        }
        node
          .querySelectorAll?.('[role="dialog"]')
          .forEach((dialog) => hideElementInstantly(dialog, hiddenElements));
      });
      if (
        mutation.type === "attributes" &&
        mutation.target.matches?.('[role="dialog"]')
      ) {
        hideElementInstantly(mutation.target, hiddenElements);
      }
    });
  });
}

// Helper: Restore visibility
function restoreVisibility(hiddenElements) {
  hiddenElements.forEach((element) => {
    if (element?.parentElement && element.dataset.instafnHidden) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 500 || rect.height > 400) {
        element.removeAttribute("data-instafn-hiding");
        delete element.dataset.instafnHidden;
        return;
      }
      element.style.removeProperty("opacity");
      element.style.removeProperty("visibility");
      element.style.removeProperty("transition");
      element.style.removeProperty("pointer-events");
      element.removeAttribute("data-instafn-hiding");
      delete element.dataset.instafnHidden;
    }
  });
}

export function initMessageDoubleTapLike() {
  let lastTapTime = 0;
  let lastTapTarget = null;
  const DOUBLE_TAP_DELAY = 300;

  // Prevent text selection on double-tap
  document.addEventListener(
    "mousedown",
    (e) => {
      const messageButton = e.target.closest(
        '[role="button"][aria-label*="Double tap to like"]'
      );
      if (messageButton && e.detail > 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  // Inject CSS to prevent text selection and hide dialogs
  if (!document.getElementById("instafn-double-tap-style")) {
    const style = document.createElement("style");
    style.id = "instafn-double-tap-style";
    style.textContent = `
      [role="button"][aria-label*="Double tap to like"] {
        user-select: none !important;
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
      }
      [data-instafn-hiding] {
        opacity: 0 !important;
        visibility: hidden !important;
        transition: none !important;
        pointer-events: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;

      const currentTime = Date.now();
      const timeSinceLastTap = currentTime - lastTapTime;
      const messageButton = e.target.closest(
        '[role="button"][aria-label*="Double tap to like"]'
      );

      if (!messageButton) {
        lastTapTime = 0;
        lastTapTarget = null;
        return;
      }

      if (
        lastTapTarget === messageButton &&
        timeSinceLastTap < DOUBLE_TAP_DELAY
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const messageElement = findMessageHoverElement(messageButton);
        if (messageElement) {
          const hiddenElements = [];
          const observer = createMenuObserver(hiddenElements);
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["role"],
          });

          triggerHover(messageElement);
          waitForReactButtonAndClickEmoji(
            messageElement,
            observer,
            hiddenElements
          );
        }

        lastTapTime = 0;
        lastTapTarget = null;
      } else {
        lastTapTime = currentTime;
        lastTapTarget = messageButton;
      }
    },
    true
  );
}

function findMessageHoverElement(messageButton) {
  const messageRow =
    messageButton.closest('[role="row"]') ||
    messageButton
      .closest('[role="gridcell"][data-scope="messages_table"]')
      ?.closest('[role="row"]') ||
    messageButton.closest('[role="row"]');

  if (!messageRow) {
    let parent = messageButton.parentElement;
    let depth = 0;
    while (parent && depth < 5) {
      if (
        parent.getAttribute("role") === "row" ||
        parent.hasAttribute("data-scope")
      ) {
        return parent;
      }
      parent = parent.parentElement;
      depth++;
    }
    return messageButton;
  }

  return (
    messageRow.querySelector(
      '[role="gridcell"][data-scope="messages_table"]'
    ) ||
    messageRow.querySelector(
      'div[style*="paddingBottom"][style*="paddingInlineEnd"], div[style*="paddingBottom"][style*="paddingInlineStart"]'
    ) ||
    messageRow
  );
}

function triggerHover(element) {
  const rect = element.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  [
    "mouseenter",
    "mouseover",
    "mousemove",
    "pointerenter",
    "pointerover",
  ].forEach((type) => {
    const EventClass = type.startsWith("pointer") ? PointerEvent : MouseEvent;
    element.dispatchEvent(
      new EventClass(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
      })
    );
  });
}

function waitForReactButtonAndClickEmoji(
  messageElement,
  observer,
  hiddenElements
) {
  let attempts = 0;
  const maxAttempts = 20;

  const checkForReactButton = () => {
    attempts++;

    let reactButton =
      messageElement
        .querySelector('svg[aria-label*="React to message"]')
        ?.closest("button, [role='button']") ||
      messageElement.querySelector(
        '[role="button"][aria-label*="React to message"]'
      );

    if (!reactButton) {
      let searchElement = messageElement.parentElement;
      let searchDepth = 0;
      while (searchElement && searchDepth < 3) {
        reactButton =
          searchElement
            .querySelector('svg[aria-label*="React to message"]')
            ?.closest("button, [role='button']") ||
          searchElement.querySelector(
            '[role="button"][aria-label*="React to message"]'
          );
        if (reactButton) break;
        searchElement = searchElement.parentElement;
        searchDepth++;
      }
    }

    if (reactButton) {
      if (observer) observer.disconnect();
      const menuObserver = createMenuObserver(hiddenElements);
      menuObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["role"],
      });
      clickButtonInstantly(reactButton, () => {
        waitForEmojiMenuAndClickFirst(menuObserver, hiddenElements);
      });
      return;
    }

    if (attempts < maxAttempts) {
      setTimeout(checkForReactButton, 50);
    } else {
      if (observer) observer.disconnect();
      setTimeout(() => restoreVisibility(hiddenElements), 300);
      showToast("Failed to like message: React button not found");
    }
  };

  checkForReactButton();
}

function waitForEmojiMenuAndClickFirst(menuObserver, hiddenElements) {
  let attempts = 0;
  const maxAttempts = 15;

  const checkForEmojiMenu = () => {
    attempts++;
    const emojiMenu = document.querySelector('[role="dialog"]');

    if (emojiMenu && shouldHideElement(emojiMenu)) {
      hideElementInstantly(emojiMenu, hiddenElements);
      const allButtons = Array.from(
        emojiMenu.querySelectorAll('[role="button"]')
      );
      const emojiButtons = allButtons.filter((btn) => {
        if (btn.querySelector('svg[aria-label="Choose an emoji"]'))
          return false;
        const span = btn.querySelector("span");
        if (!span) return false;
        const text = span.textContent?.trim();
        if (!text) return false;
        const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/u.test(
          text
        );
        return hasEmoji && text.length <= 5;
      });

      if (emojiButtons.length > 0) {
        if (menuObserver) menuObserver.disconnect();
        clickButtonInstantly(emojiButtons[0]);
        setTimeout(() => restoreVisibility(hiddenElements), 300);
        return;
      } else if (emojiMenu) {
        // Menu found but no emoji buttons available
        if (menuObserver) menuObserver.disconnect();
        setTimeout(() => restoreVisibility(hiddenElements), 300);
        showToast("Failed to like message: No emoji buttons found");
        return;
      }
    }

    if (attempts < maxAttempts) {
      setTimeout(checkForEmojiMenu, 50);
    } else {
      if (menuObserver) menuObserver.disconnect();
      setTimeout(() => restoreVisibility(hiddenElements), 300);
      showToast("Failed to like message: Emoji menu not found");
    }
  };

  checkForEmojiMenu();
}

function clickButtonInstantly(button, callback) {
  const handler = findClickHandler(button);
  if (handler) {
    try {
      handler.call(
        button,
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          detail: 1,
          button: 0,
        })
      );
      if (callback) callback();
      return;
    } catch (err) {}
  }

  const rect = button.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  [
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
      button: 0,
    }),
    new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
      button: 0,
    }),
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
      button: 0,
      detail: 1,
    }),
  ].forEach((event) => button.dispatchEvent(event));

  button.click();
  if (callback) setTimeout(callback, 50);
}

function findClickHandler(element) {
  const reactFiber = findReactFiber(element);
  if (reactFiber) {
    const props = reactFiber.memoizedProps || reactFiber.pendingProps;
    if (props?.onClick) return props.onClick;
    if (reactFiber.stateNode?.props?.onClick)
      return reactFiber.stateNode.props.onClick;
    if (reactFiber.stateNode?.onClick) return reactFiber.stateNode.onClick;
  }
  if (element.onclick && typeof element.onclick === "function")
    return element.onclick;
  if (typeof getEventListeners === "function") {
    try {
      const listeners = getEventListeners(element);
      if (listeners?.click?.[0]) return listeners.click[0].listener;
    } catch (e) {}
  }
  return null;
}

function findReactFiber(dom) {
  if (!dom) return null;
  for (let key in dom) {
    if (
      key.startsWith("__reactFiber") ||
      key.startsWith("__reactInternalInstance") ||
      key.startsWith("__reactContainer")
    ) {
      return dom[key];
    }
  }
  let parent = dom.parentElement;
  let depth = 0;
  while (parent && depth < 5) {
    for (let key in parent) {
      if (
        key.startsWith("__reactFiber") ||
        key.startsWith("__reactInternalInstance")
      ) {
        let fiber = parent[key];
        while (fiber) {
          if (fiber.stateNode === dom || fiber.memoizedProps?.onClick)
            return fiber;
          fiber = fiber.child || fiber.sibling;
        }
      }
    }
    parent = parent.parentElement;
    depth++;
  }
  return null;
}
