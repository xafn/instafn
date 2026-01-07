/**
 * Reusable DOM observation utilities
 * Provides common patterns for watching DOM changes
 */

/**
 * Watch for URL changes (useful for SPA navigation)
 * @param {Function} callback - Called when URL changes
 * @returns {Function} - Cleanup function
 */
export function watchUrlChanges(callback) {
  let lastUrl = location.href;

  const observer = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      const previousUrl = lastUrl;
      lastUrl = currentUrl;
      callback(currentUrl, previousUrl);
    }
  });

  observer.observe(document, { subtree: true, childList: true });

  return () => observer.disconnect();
}

/**
 * Watch for element appearance in DOM
 * @param {string|Function} selector - CSS selector or function that returns element
 * @param {Function} callback - Called when element appears
 * @param {Object} options - Options
 * @param {number} options.interval - Polling interval in ms (default: 100)
 * @param {number} options.timeout - Timeout in ms (default: 10000)
 * @returns {Function} - Cleanup function
 */
export function watchForElement(selector, callback, options = {}) {
  const { interval = 100, timeout = 10000 } = options;

  let checkCount = 0;
  const maxChecks = timeout / interval;

  const check = () => {
    const element =
      typeof selector === "function"
        ? selector()
        : document.querySelector(selector);

    if (element) {
      callback(element);
      return;
    }

    checkCount++;
    if (checkCount < maxChecks) {
      setTimeout(check, interval);
    }
  };

  check();

  return () => {
    // Cleanup handled by timeout
  };
}

/**
 * Watch for DOM mutations with a selector
 * @param {string} selector - CSS selector to watch for
 * @param {Function} callback - Called when matching elements are added
 * @param {Object} options - MutationObserver options
 * @returns {Function} - Cleanup function
 */
export function watchDOMChanges(selector, callback, options = {}) {
  const defaultOptions = {
    childList: true,
    subtree: true,
    ...options,
  };

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.matches?.(selector)) {
            callback(node);
          }
          const matches = node.querySelectorAll?.(selector);
          if (matches) {
            matches.forEach((match) => callback(match));
          }
        }
      });
    });
  });

  observer.observe(document.body || document.documentElement, defaultOptions);

  return () => observer.disconnect();
}
