/**
 * Typing Receipt Blocker
 * Blocks typing indicators from being sent in Instagram messages
 */

// Track if script is already injected (in content script context)
var interceptorInjected = false;

export function initTypingReceiptBlocker(enabled) {
  // Send flag to page context via postMessage (avoids CSP issues)
  function setFlag() {
    window.postMessage({
      source: 'instafn-content',
      type: 'set-typing-blocker',
      enabled: enabled
    }, '*');
  }

  // Set flag immediately
  setFlag();

  // Always inject the WebSocket interceptor (it checks the flag dynamically)
  function injectScript() {
    try {
      // Check if already injected
      if (interceptorInjected) {
        // Already injected, just update the flag
        setFlag();
        return;
      }
      
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL(
        "content/features/typing-receipt-blocker/websocket-interceptor.js"
      );
      script.onload = function() {
        interceptorInjected = true;
        // Send flag after script loads
        setFlag();
      };
      const target = document.head || document.documentElement || document.body;
      if (target) {
        target.appendChild(script);
      }
    } catch (err) {
      console.error("Instafn: Error injecting typing receipt blocker:", err);
    }
  }

  // Inject immediately
  injectScript();

  // Also try injecting after a short delay in case DOM isn't ready
  setTimeout(injectScript, 100);
}

