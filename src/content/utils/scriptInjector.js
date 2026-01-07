/**
 * Reusable script injection utility
 * Handles injecting scripts into page context with proper error handling
 */

const injectedScripts = new Set();

/**
 * Inject a script into the page context
 * @param {string} scriptPath - Path to script (relative to extension root)
 * @param {Object} options - Injection options
 * @param {boolean} options.once - Only inject once (default: true)
 * @param {Function} options.onLoad - Callback when script loads
 * @param {Function} options.onError - Callback on error
 * @returns {boolean} - Whether injection was attempted
 */
export function injectScript(scriptPath, options = {}) {
  const { once = true, onLoad, onError } = options;

  if (once && injectedScripts.has(scriptPath)) {
    return false;
  }

  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(scriptPath);

    if (onLoad) {
      script.onload = function() {
        this.remove();
        onLoad();
      };
    } else {
      script.onload = function() {
        this.remove();
      };
    }

    if (onError) {
      script.onerror = onError;
    }

    const target = document.head || document.documentElement || document.body;
    if (target) {
      target.appendChild(script);
      if (once) {
        injectedScripts.add(scriptPath);
      }
      return true;
    } else {
      // Wait for DOM to be ready
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          const readyTarget =
            document.head || document.documentElement || document.body;
          if (readyTarget) {
            readyTarget.appendChild(script);
            if (once) {
              injectedScripts.add(scriptPath);
            }
          }
        },
        { once: true }
      );
      return true;
    }
  } catch (err) {
    console.error(`[Instafn] Error injecting script ${scriptPath}:`, err);
    if (onError) onError(err);
    return false;
  }
}

/**
 * Inject multiple scripts in sequence
 * @param {string[]} scriptPaths - Array of script paths
 * @param {Object} options - Same as injectScript options
 */
export function injectScripts(scriptPaths, options = {}) {
  scriptPaths.forEach((path) => injectScript(path, options));
}
