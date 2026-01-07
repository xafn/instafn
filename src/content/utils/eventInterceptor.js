/**
 * Reusable event interception utility
 * Provides common patterns for intercepting user actions
 */

/**
 * Stop event propagation and prevent default
 */
export function stopEvent(e) {
  e.stopImmediatePropagation();
  e.stopPropagation();
  e.preventDefault();
}

/**
 * Full click event configuration
 */
const FULL_CLICK_INIT = {
  bubbles: true,
  cancelable: true,
  composed: true,
  view: window,
};

/**
 * Dispatch a full click sequence (pointerdown, mousedown, mouseup, click)
 */
export function dispatchFullClick(target) {
  if (!target) return;

  const events = [
    new PointerEvent("pointerdown", {
      ...FULL_CLICK_INIT,
      pointerType: "mouse",
    }),
    new MouseEvent("mousedown", FULL_CLICK_INIT),
    new MouseEvent("mouseup", FULL_CLICK_INIT),
    new MouseEvent("click", FULL_CLICK_INIT),
  ];

  events.forEach((evt) => {
    try {
      target.dispatchEvent(evt);
    } catch (_) {
      // Ignore errors
    }
  });
}

/**
 * Dispatch a simple mouse click
 */
export function dispatchMouseClick(target) {
  if (!target) return;

  const evt = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window,
  });
  target.dispatchEvent(evt);
}

/**
 * Create an event interceptor for click events
 * @param {Function} matcher - Function that returns true if event should be intercepted
 * @param {Function} handler - Async function that handles the intercepted event
 * @param {Object} options - Options
 * @param {boolean} options.capture - Use capture phase (default: true)
 * @returns {Function} - Cleanup function to remove listener
 */
export function interceptClicks(matcher, handler, options = {}) {
  const { capture = true } = options;

  const listener = async (e) => {
    if (e.isTrusted === false) return;

    if (matcher(e)) {
      stopEvent(e);
      const result = await handler(e);
      if (result === false) {
        return false;
      }
    }
  };

  document.addEventListener("click", listener, capture);

  return () => {
    document.removeEventListener("click", listener, capture);
  };
}

/**
 * Create an event interceptor for keyboard events
 * @param {Function} matcher - Function that returns true if event should be intercepted
 * @param {Function} handler - Async function that handles the intercepted event
 * @param {Object} options - Options
 * @param {boolean} options.capture - Use capture phase (default: true)
 * @returns {Function} - Cleanup function to remove listener
 */
export function interceptKeydown(matcher, handler, options = {}) {
  const { capture = true } = options;

  const listener = async (e) => {
    if (e.isTrusted === false) return;

    if (matcher(e)) {
      stopEvent(e);
      const result = await handler(e);
      if (result === false) {
        return false;
      }
    }
  };

  document.addEventListener("keydown", listener, capture);

  return () => {
    document.removeEventListener("keydown", listener, capture);
  };
}
