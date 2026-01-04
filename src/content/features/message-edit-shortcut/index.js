/**
 * Message Edit Shortcut Feature
 *
 * Allows pressing the up arrow key in the message textbox to edit the last sent message.
 * This will attempt to open edit mode, which only works if the message was sent within the last 15 minutes.
 */

import { showToast } from "../../ui/toast.js";

// Constants
const ACTION_BUTTON_SELECTORS = [
  '[role="button"][aria-haspopup="menu"]',
  '[aria-hidden="false"][role="button"]',
];
const ACTION_KEYWORDS = ["more", "React", "Reply", "more options"];

// Helper: Check if textbox is empty
function isEmptyTextBox(messageBox) {
  const text = messageBox.textContent?.trim() || "";
  const innerHTML = messageBox.innerHTML?.trim() || "";
  return (
    !text ||
    innerHTML === "<br>" ||
    innerHTML === "<p><br></p>" ||
    innerHTML === "<p></p>" ||
    /^<p\s*><br\s*><\/p>$/i.test(innerHTML)
  );
}

// Helper: Check if element is an action button
function isActionButton(btn) {
  const svg = btn.querySelector("svg");
  const svgLabel =
    svg?.getAttribute("aria-label") || svg?.getAttribute("title") || "";
  const ariaLabel = btn.getAttribute("aria-label") || "";
  return (
    ACTION_KEYWORDS.some(
      (keyword) => svgLabel.includes(keyword) || ariaLabel.includes(keyword)
    ) || btn.getAttribute("aria-haspopup") === "menu"
  );
}

// Helper: Check if element should be hidden
function shouldHideElement(element) {
  if (!element) return false;

  const rect = element.getBoundingClientRect();
  if (rect.width > 500 || rect.height > 400) return false; // Too large = main UI

  const role = element.getAttribute("role");
  const ariaLabel = element.getAttribute("aria-label") || "";
  const ariaHidden = element.getAttribute("aria-hidden");

  if (role === "dialog") return true;
  if (
    role === "button" &&
    (element.getAttribute("aria-haspopup") === "menu" ||
      isActionButton(element))
  )
    return true;
  if (
    ariaHidden === "false" &&
    element.querySelector(
      '[aria-haspopup="menu"], svg[aria-label*="more"], svg[aria-label*="React"], svg[aria-label*="Reply"]'
    )
  )
    return true;
  if (
    element.hasAttribute("data-pagelet") ||
    (element.hasAttribute("data-scope") &&
      element.getAttribute("data-scope") === "messages_table") ||
    ariaLabel.includes("Messages in conversation")
  )
    return false;

  return false;
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

// Helper: Check if container holds action buttons by checking for keywords
function isActionButtonContainer(container) {
  // Check for buttons/SVGs with action-related keywords in aria-labels or titles
  const actionKeywords = [
    "React to message",
    "Reply to message",
    "See more options",
    "more options for message",
  ];

  // Find all buttons and SVGs in the container
  const buttons = container.querySelectorAll(
    '[role="button"], svg, [aria-label], [title]'
  );
  let actionButtonCount = 0;

  for (const element of buttons) {
    const ariaLabel = element.getAttribute("aria-label") || "";
    const title = element.getAttribute("title") || "";
    const text = element.textContent?.trim() || "";
    const combined = `${ariaLabel} ${title} ${text}`.toLowerCase();

    // Check if this element or its parent button matches action keywords
    if (
      actionKeywords.some((keyword) => combined.includes(keyword.toLowerCase()))
    ) {
      actionButtonCount++;
    }

    // Also check if it's a "See more options" button
    if (
      element.getAttribute("aria-haspopup") === "menu" ||
      ariaLabel.includes("more") ||
      title.includes("more")
    ) {
      actionButtonCount++;
    }
  }

  // If we found multiple action buttons (React, Reply, See more), this is the container
  return actionButtonCount >= 2;
}

// Helper: Hide all menu elements (buttons, dialogs, containers)
function hideMenuElements(scope = document, hiddenElements = []) {
  // Hide action buttons
  ACTION_BUTTON_SELECTORS.forEach((selector) => {
    try {
      scope.querySelectorAll(selector).forEach((btn) => {
        if (isActionButton(btn)) {
          if (btn.getAttribute("aria-haspopup") === "menu") {
            btn.setAttribute("aria-expanded", "false");
          }
          hideElementInstantly(btn, hiddenElements);
        }
      });
    } catch (e) {}
  });

  // Hide menu dialogs
  scope.querySelectorAll('[role="dialog"]').forEach((menu) => {
    if (shouldHideElement(menu)) {
      hideElementInstantly(menu, hiddenElements);
      menu
        .querySelectorAll('[role="button"]')
        .forEach((btn) => hideElementInstantly(btn, hiddenElements));
    }
  });

  // Hide action button containers - check by keywords, not hardcoded classes
  scope.querySelectorAll('[aria-hidden="false"]').forEach((container) => {
    if (isActionButtonContainer(container) && shouldHideElement(container)) {
      hideElementInstantly(container, hiddenElements);
    }
  });

  // Also check parent containers that might wrap the action buttons
  // Look for elements that contain multiple action buttons
  const allContainers = scope.querySelectorAll(
    'div[aria-hidden="false"], span[aria-hidden="false"]'
  );
  allContainers.forEach((container) => {
    if (isActionButtonContainer(container) && shouldHideElement(container)) {
      hideElementInstantly(container, hiddenElements);
    }
  });
}

// Helper: Find element in parent chain
function findInParents(element, selector, maxDepth = 3) {
  let current = element;
  let depth = 0;
  while (current && depth < maxDepth) {
    const found = current.querySelector?.(selector);
    if (found) return found;
    current = current.parentElement;
    depth++;
  }
  return null;
}

// Helper: Create menu observer
function createMenuObserver(hiddenElements) {
  return new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) {
          // Hide menu dialogs
          if (node.matches?.('[role="dialog"]')) {
            hideElementInstantly(node, hiddenElements);
          }
          node
            .querySelectorAll?.('[role="dialog"]')
            .forEach((dialog) => hideElementInstantly(dialog, hiddenElements));

          // Hide action button containers
          if (isActionButtonContainer(node) && shouldHideElement(node)) {
            hideElementInstantly(node, hiddenElements);
          }
          node
            .querySelectorAll?.('[aria-hidden="false"]')
            .forEach((container) => {
              if (
                isActionButtonContainer(container) &&
                shouldHideElement(container)
              ) {
                hideElementInstantly(container, hiddenElements);
              }
            });
        }
      });

      // Handle attribute changes
      if (mutation.type === "attributes") {
        const target = mutation.target;

        // Hide menu dialogs when they appear
        if (target.matches?.('[role="dialog"]')) {
          hideElementInstantly(target, hiddenElements);
        }

        // Hide action button containers when aria-hidden changes to false
        if (
          mutation.attributeName === "aria-hidden" &&
          target.getAttribute("aria-hidden") === "false"
        ) {
          if (isActionButtonContainer(target) && shouldHideElement(target)) {
            hideElementInstantly(target, hiddenElements);
          }
        }
      }
    });
  });
}

export function initMessageEditShortcut() {
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "ArrowUp") return;

      const messageBox = e.target.closest(
        '[aria-label="Message"][contenteditable="true"], [aria-label="Message"][role="textbox"]'
      );
      if (!messageBox || !isEmptyTextBox(messageBox)) return;

      e.preventDefault();
      e.stopPropagation();

      const lastUserMessage = findLastUserMessage();
      if (!lastUserMessage) return;

      const messageHoverElement = findMessageHoverElement(lastUserMessage);
      if (!messageHoverElement) return;

      // Inject CSS
      if (!document.getElementById("instafn-hide-menu-style")) {
        const style = document.createElement("style");
        style.id = "instafn-hide-menu-style";
        style.textContent = `[data-instafn-hiding] { opacity: 0 !important; visibility: hidden !important; transition: none !important; pointer-events: none !important; }`;
        document.head.appendChild(style);
      }

      // Set up observer
      const observer = createMenuObserver([]);
      observer.observe(messageHoverElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["role", "aria-hidden"],
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["role", "aria-hidden"],
      });

      triggerHover(messageHoverElement);
      waitForMoreOptionsAndClickEdit(messageHoverElement, observer);
    },
    true
  );
}

function findLastUserMessage() {
  const messageList = document.querySelector(
    '[data-pagelet="IGDOpenMessageList"], [aria-label*="Messages in conversation"]'
  );
  if (!messageList) return null;

  const markers = Array.from(
    messageList.querySelectorAll("h6, span, div, button")
  ).filter((el) => {
    const text = el.textContent?.trim();
    const ariaLabel = el.getAttribute("aria-label") || "";
    return (
      text === "You sent" ||
      text?.startsWith("You sent") ||
      text === "Edited" ||
      ariaLabel === "Edited"
    );
  });

  if (markers.length === 0) return null;

  const lastMarker = markers[markers.length - 1];
  return (
    lastMarker.closest('[role="row"]') ||
    lastMarker
      .closest('[role="gridcell"][data-scope="messages_table"]')
      ?.closest('[role="row"]') ||
    lastMarker.closest('[role="row"]')
  );
}

function findMessageHoverElement(messageRow) {
  return (
    messageRow.querySelector(
      '[role="gridcell"][data-scope="messages_table"]'
    ) ||
    messageRow.querySelector(
      'div[style*="paddingBottom"][style*="paddingInlineEnd"]'
    ) ||
    messageRow
      .querySelector('[role="button"][aria-label*="Double tap to like"]')
      ?.closest("div") ||
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

function waitForMoreOptionsAndClickEdit(messageElement, observer) {
  let attempts = 0;
  const maxAttempts = 20;
  const hiddenElements = [];

  const checkForMoreOptions = () => {
    attempts++;
    hideMenuElements(messageElement, hiddenElements);

    let moreOptionsButton =
      messageElement.querySelector('[aria-haspopup="menu"][role="button"]') ||
      findInParents(messageElement, '[aria-haspopup="menu"][role="button"]') ||
      findInParents(
        messageElement,
        'svg[aria-label*="more options"], svg[title*="more options"]'
      )?.closest('[role="button"]');

    if (moreOptionsButton) {
      if (!moreOptionsButton.getAttribute("aria-haspopup")) {
        const innerButton = moreOptionsButton.querySelector(
          '[aria-haspopup="menu"][role="button"]'
        );
        if (innerButton) moreOptionsButton = innerButton;
      }

      hideElementInstantly(moreOptionsButton, hiddenElements);
      observer.disconnect();

      const menuObserver = createMenuObserver(hiddenElements);
      menuObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["role"],
      });

      clickButtonInstantly(moreOptionsButton, () =>
        waitForEditButton(hiddenElements, menuObserver)
      );
      return;
    }

    if (attempts < maxAttempts) {
      setTimeout(checkForMoreOptions, 50);
    }
  };

  checkForMoreOptions();
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
  ].forEach((e) => button.dispatchEvent(e));

  button.click();
  if (callback) setTimeout(callback, 50);
}

function waitForEditButton(hiddenElements, menuObserver) {
  let attempts = 0;
  const maxAttempts = 15;

  const checkForEdit = () => {
    attempts++;
    hideMenuElements(document, hiddenElements);

    const menu =
      document.querySelector('[role="dialog"]') ||
      Array.from(document.querySelectorAll('div[tabindex="-1"]')).find(
        (d) => d.querySelectorAll('[role="button"]').length > 0
      );

    if (menu && shouldHideElement(menu)) {
      hideElementInstantly(menu, hiddenElements);

      const editButton =
        menu.querySelector('[aria-label="Edit"][role="button"]') ||
        Array.from(menu.querySelectorAll('[role="button"]')).find(
          (btn) => btn.textContent?.trim() === "Edit"
        ) ||
        menu
          .querySelector('svg[aria-label="Edit"], svg[title="Edit"]')
          ?.closest('[role="button"], button, div[role="button"]') ||
        (menu.querySelectorAll('[role="button"]')[0]?.textContent?.trim() ===
        "Edit"
          ? menu.querySelectorAll('[role="button"]')[0]
          : null);

      if (editButton) {
        if (menuObserver) menuObserver.disconnect();
        clickButtonInstantly(editButton);
        closeMenuButton(hiddenElements);
        setTimeout(() => restoreVisibility(hiddenElements), 300);
        return;
      }
    }

    if (attempts < maxAttempts) {
      setTimeout(checkForEdit, 50);
    } else {
      if (menuObserver) menuObserver.disconnect();
      showToast("Quick edit failed", {
        id: "instafn-edit-tooltip",
      });
      closeMenuButton(hiddenElements);
      setTimeout(() => restoreVisibility(hiddenElements), 300);
    }
  };

  checkForEdit();
}

function closeMenuButton(hiddenElements) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    })
  );
  hideMenuElements(document, hiddenElements);

  const persistentObserver = createMenuObserver(hiddenElements);
  persistentObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["role", "aria-hidden", "style"],
  });

  let checkCount = 0;
  const interval = setInterval(() => {
    checkCount++;
    hideMenuElements(document, hiddenElements);
    if (checkCount >= 20) {
      clearInterval(interval);
      persistentObserver.disconnect();
    }
  }, 50);
}

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
