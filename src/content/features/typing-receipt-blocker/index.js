/**
 * Typing Receipt Blocker
 * Blocks typing indicators from being sent in Instagram messages
 */

import { injectScript } from "../../utils/scriptInjector.js";

export function initTypingReceiptBlocker(enabled) {
  // Send flag to page context via postMessage (avoids CSP issues)
  function setFlag() {
    window.postMessage(
      {
        source: "instafn-content",
        type: "set-typing-blocker",
        enabled: enabled,
      },
      "*"
    );
  }

  // Set flag immediately
  setFlag();

  // Inject the WebSocket interceptor (it checks the flag dynamically)
  injectScript(
    "content/features/typing-receipt-blocker/websocket-interceptor.js",
    {
      once: true,
      onLoad: setFlag,
    }
  );

  // Also intercept fetch/XHR requests (fallback if WebSocket interceptor isn't enough)
  interceptTypingReceipts();
}

function interceptTypingReceipts() {
  const setupWsHook = () => {
    if (typeof window.wsHook !== "undefined") {
      window.wsHook.before = (data, url) => {
        try {
          if (
            url &&
            (url.includes("edge-chat.instagram.com") ||
              url.includes("instagram.com")) &&
            typeof data === "string"
          ) {
            if (
              data.includes('"is_typing":1') ||
              data.includes('"is_typing": 1') ||
              (data.includes('"type":4') && data.includes('"is_typing":1'))
            ) {
              return data.replace(/"is_typing":\s*1/g, '"is_typing":0');
            }
          }
        } catch (error) {
          console.log("Instafn: Error processing typing receipt:", error);
        }
        return data;
      };
      window.wsHook.after = (event) => event;
    } else {
      setTimeout(setupWsHook, 100);
    }
  };
  setupWsHook();

  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, options] = args;
    if (
      typeof url === "string" &&
      url.includes("edge-chat.instagram.com/chat") &&
      options?.body
    ) {
      try {
        let body = options.body;
        if (typeof body === "string") {
          try {
            const parsed = JSON.parse(body);
            if (parsed.payload) {
              const payload = JSON.parse(parsed.payload);
              if (payload.is_typing === 1) {
                payload.is_typing = 0;
                parsed.payload = JSON.stringify(payload);
                options.body = JSON.stringify(parsed);
              }
            }
          } catch (e) {
            if (body.includes('"is_typing":1')) {
              options.body = body.replace('"is_typing":1', '"is_typing":0');
            }
          }
        } else if (body instanceof FormData) {
          const formData = new FormData();
          for (let [key, value] of body.entries()) {
            if (key === "payload" && typeof value === "string") {
              try {
                const payload = JSON.parse(value);
                if (payload.is_typing === 1) {
                  payload.is_typing = 0;
                  formData.append(key, JSON.stringify(payload));
                } else {
                  formData.append(key, value);
                }
              } catch (e) {
                formData.append(key, value);
              }
            } else {
              formData.append(key, value);
            }
          }
          options.body = formData;
        }
      } catch (error) {
        console.log("Instafn: Error processing typing receipt:", error);
      }
    }
    return originalFetch.apply(this, args);
  };

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...args]);
  };
  XMLHttpRequest.prototype.send = function(data) {
    if (this._url && this._url.includes("edge-chat.instagram.com/chat")) {
      if (data && typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          if (parsed.payload) {
            const payload = JSON.parse(parsed.payload);
            if (payload.is_typing === 1) {
              payload.is_typing = 0;
              parsed.payload = JSON.stringify(payload);
              data = JSON.stringify(parsed);
            }
          }
        } catch (e) {
          if (data.includes('"is_typing":1')) {
            data = data.replace('"is_typing":1', '"is_typing":0');
          }
        }
      }
    }
    return originalXHRSend.call(this, data);
  };
}
