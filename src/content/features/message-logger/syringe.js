/**
 * Syringe script - Injects socket-sniffer.js and graphql-sniffer.js into the page context
 */

(function() {
  'use strict';
  
  // Only inject if we're in the main frame (not in an iframe)
  if (window !== window.top) {
    return;
  }
  
  function injectScript(src) {
    try {
      var s = document.createElement('script');
      s.src = chrome.runtime.getURL(src);
      s.onload = function() {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {
      console.error('[Instafn Message Logger] Error injecting script:', e);
    }
  }
  
  // Inject WebSocket sniffer
  injectScript('content/features/message-logger/socket-sniffer.js');
  
  // Inject GraphQL sniffer
  injectScript('content/features/message-logger/graphql-sniffer.js');
})();

