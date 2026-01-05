/**
 * WebSocket Sniffer - Injected into page context
 * This intercepts all WebSocket messages and relays them to the content script
 */

(function() {
  "use strict";

  var OrigWebSocket = window.WebSocket;
  var callWebSocket = OrigWebSocket.apply.bind(OrigWebSocket);
  var wsAddListener = OrigWebSocket.prototype.addEventListener;
  wsAddListener = wsAddListener.call.bind(wsAddListener);

  window.WebSocket = function WebSocket(url, protocols) {
    var ws;
    if (!(this instanceof WebSocket)) {
      // Called without 'new' (browsers will throw an error).
      ws = callWebSocket(this, arguments);
    } else if (arguments.length === 1) {
      ws = new OrigWebSocket(url);
    } else if (arguments.length >= 2) {
      ws = new OrigWebSocket(url, protocols);
    } else {
      // No arguments (browsers will throw an error)
      ws = new OrigWebSocket();
    }

    // Only intercept Instagram chat WebSocket
    if (url && url.includes("edge-chat.instagram.com")) {
      // Listen to incoming messages
      wsAddListener(ws, "message", function(event) {
        // Convert data to a format that can be sent via postMessage
        let dataToSend = null;
        let dataType = "unknown";

        if (event.data instanceof ArrayBuffer) {
          dataType = "ArrayBuffer";
          const uint8 = new Uint8Array(event.data);
          dataToSend = Array.from(uint8);
        } else if (event.data instanceof Blob) {
          dataType = "Blob";
          const reader = new FileReader();
          reader.onload = function() {
            const uint8 = new Uint8Array(reader.result);
            window.postMessage(
              {
                source: "instafn-websocket",
                type: "websocket-message",
                url: url,
                data: Array.from(uint8),
                dataType: "Blob",
              },
              "*"
            );
          };
          reader.readAsArrayBuffer(event.data);
          return;
        } else if (event.data instanceof Uint8Array) {
          dataType = "Uint8Array";
          dataToSend = Array.from(event.data);
        } else if (typeof event.data === "string") {
          dataType = "string";
          dataToSend = event.data;
        } else {
          dataType = event.data?.constructor?.name || "unknown";
          dataToSend = event.data;
        }

        // Relay to content script via postMessage
        window.postMessage(
          {
            source: "instafn-websocket",
            type: "websocket-message",
            url: url,
            data: dataToSend,
            dataType: dataType,
          },
          "*"
        );
      });
    }

    return ws;
  };

  // Copy prototype and static properties
  window.WebSocket.prototype = OrigWebSocket.prototype;
  window.WebSocket.prototype.constructor = window.WebSocket;

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
})();
