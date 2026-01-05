/**
 * WebSocket Interceptor for Typing Receipt Blocking
 * Injected into page context to intercept and modify WebSocket messages
 */

(function() {
  "use strict";

  // Initialize flag
  if (!window.Instafn) window.Instafn = {};
  window.Instafn.blockTypingReceipts = false;

  // Listen for messages from content script to update the flag
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    if (event.data?.source === 'instafn-content' && event.data?.type === 'set-typing-blocker') {
      window.Instafn.blockTypingReceipts = event.data.enabled === true;
    }
  });

  // Always set up interceptor, but check flag dynamically in interceptSend
  // This allows toggling the feature on/off without re-injecting

  var OrigWebSocket = window.WebSocket;
  var originalPrototypeSend = OrigWebSocket.prototype.send;
  var interceptedWebSockets = new WeakSet();
  var protoTextDecoder = new TextDecoder("utf-8");
  var protoTextEncoder = new TextEncoder();

  // Intercept WebSocket constructor
  window.WebSocket = function WebSocket(url, protocols) {
    var ws;
    if (!(this instanceof WebSocket)) {
      ws = OrigWebSocket.apply(this, arguments);
    } else if (arguments.length === 1) {
      ws = new OrigWebSocket(url);
    } else if (arguments.length >= 2) {
      ws = new OrigWebSocket(url, protocols);
    } else {
      ws = new OrigWebSocket();
    }

    // Only intercept Instagram chat WebSocket
    if (url && url.includes("edge-chat.instagram.com")) {
      var textDecoder = new TextDecoder("utf-8");
      var textEncoder = new TextEncoder();
      var originalSend = OrigWebSocket.prototype.send;

      ws.send = function(data) {
        return interceptSend(data, originalSend, textDecoder, textEncoder, this);
      };
    }

    return ws;
  };

  // Copy prototype and static properties
  window.WebSocket.prototype = OrigWebSocket.prototype;
  window.WebSocket.prototype.constructor = window.WebSocket;

  // Intercept at prototype level to catch WebSockets created before our script runs
  OrigWebSocket.prototype.send = function(data) {
    // Only intercept Instagram chat WebSockets
    if (this.url && this.url.includes("edge-chat.instagram.com")) {
      interceptedWebSockets.add(this);
      return interceptSend(data, originalPrototypeSend, protoTextDecoder, protoTextEncoder, this);
    }

    // Not an Instagram chat WebSocket, use original send
    return originalPrototypeSend.call(this, data);
  };

  // Re-apply our send interception since copying the prototype overwrote it
  window.WebSocket.prototype.send = OrigWebSocket.prototype.send;

  // Copy static constants
  Object.defineProperty(window.WebSocket, "CONNECTING", {
    value: OrigWebSocket.CONNECTING,
    writable: false,
  });
  Object.defineProperty(window.WebSocket, "OPEN", {
    value: OrigWebSocket.OPEN,
    writable: false,
  });
  Object.defineProperty(window.WebSocket, "CLOSING", {
    value: OrigWebSocket.CLOSING,
    writable: false,
  });
  Object.defineProperty(window.WebSocket, "CLOSED", {
    value: OrigWebSocket.CLOSED,
    writable: false,
  });

  // Core interception function
  function interceptSend(data, originalSend, decoder, encoder, context) {
    // Check if still enabled (in case setting was toggled)
    var isEnabled = window.Instafn?.blockTypingReceipts === true;
    if (!isEnabled) {
      // Not enabled, pass through
      return originalSend.call(context, data);
    }
    // Typing receipts are tiny (<500 bytes). Skip all processing for larger messages.
    var messageSize = 0;
    if (typeof data === "string") {
      messageSize = data.length;
    } else if (data instanceof ArrayBuffer) {
      messageSize = data.byteLength;
    } else if (data instanceof Uint8Array) {
      messageSize = data.length;
    } else {
      // Blob or unknown type - pass through immediately
      return originalSend.call(context, data);
    }

    // Skip processing for messages larger than 500 bytes (not typing receipts)
    if (messageSize > 500) {
      return originalSend.call(context, data);
    }

    // For strings, quick check before processing
    if (typeof data === "string") {
      if (!data.includes("is_typing")) {
        return originalSend.call(context, data);
      }
      // Only process if is_typing found
      var modifiedStr = data
        .replace(/(\\+)"is_typing(\\+)"\s*:\s*\d+/g, function(match, bs1, bs2) {
          return bs1 + '"is_typing' + bs2 + '":0';
        })
        .replace(/"is_typing"\s*:\s*\d+/g, '"is_typing":0')
        .replace(/is_typing\s*:\s*\d+/g, "is_typing:0");
      return originalSend.call(context, modifiedStr !== data ? modifiedStr : data);
    }

    // For binary, do quick byte search BEFORE decoding (much faster)
    // Only search first 200 bytes - typing receipts are small and is_typing is near start
    var bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    var searchLimit = Math.min(messageSize - 9, 200);
    var found = false;
    // Quick byte search for "is_typing" (105, 115, 95, 116, 121, 112, 105, 110, 103)
    for (var i = 0; i <= searchLimit; i++) {
      if (
        bytes[i] === 105 &&
        bytes[i + 1] === 115 &&
        bytes[i + 2] === 95 &&
        bytes[i + 3] === 116 &&
        bytes[i + 4] === 121 &&
        bytes[i + 5] === 112 &&
        bytes[i + 6] === 105 &&
        bytes[i + 7] === 110 &&
        bytes[i + 8] === 103
      ) {
        found = true;
        break;
      }
    }

    // Only decode if we found is_typing
    if (!found) {
      return originalSend.call(context, data);
    }

    // Only decode if we found is_typing
    var dataStr = decoder.decode(bytes);

    // Process if is_typing is found
    if (dataStr.includes("is_typing")) {
      var modifiedStr = dataStr
        .replace(/(\\+)"is_typing(\\+)"\s*:\s*\d+/g, function(match, bs1, bs2) {
          return bs1 + '"is_typing' + bs2 + '":0';
        })
        .replace(/"is_typing"\s*:\s*\d+/g, '"is_typing":0')
        .replace(/is_typing\s*:\s*\d+/g, "is_typing:0");

      if (modifiedStr !== dataStr) {
        var encoded = encoder.encode(modifiedStr);
        return originalSend.call(
          context,
          data instanceof ArrayBuffer ? encoded.buffer : encoded
        );
      }
    }

    return originalSend.call(context, data);
  }
})();

