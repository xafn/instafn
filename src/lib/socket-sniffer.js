/**
 * WebSocket Sniffer - Injected into page context
 * This intercepts all WebSocket messages and relays them to the content script
 */

(function() {
  'use strict';
  
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
    } else { // No arguments (browsers will throw an error)
      ws = new OrigWebSocket();
    }

    // Only intercept Instagram chat WebSocket
    if (url && url.includes('edge-chat.instagram.com')) {
      // Intercept outgoing messages (send method) to block typing receipts
      var originalSend = OrigWebSocket.prototype.send;
      ws.send = function(data) {
        try {
          var dataStr = null;
          
          // Convert data to string for inspection
          if (typeof data === 'string') {
            dataStr = data;
          } else if (data instanceof ArrayBuffer) {
            var decoder = new TextDecoder('utf-8');
            dataStr = decoder.decode(new Uint8Array(data));
          } else if (data instanceof Uint8Array) {
            var decoder = new TextDecoder('utf-8');
            dataStr = decoder.decode(data);
          } else if (data instanceof Blob) {
            return originalSend.call(this, data);
          } else {
            return originalSend.call(this, data);
          }
          
          var modifiedData = data;
          
          // ALWAYS check for is_typing and set it to 0, regardless of current value
          if (dataStr && dataStr.includes('is_typing')) {
            console.log('[Instafn] ✅ User is typing - DETECTED! Blocking...');
            var modified = false;
            var modifiedStr = dataStr;
            
            // Handle format: /ls_req{"app_id":"...","payload":"{\"is_typing\":1,...}","request_id":34,"type":4}
            var payloadMatch = modifiedStr.match(/"payload"\s*:\s*"([^"]+)"/);
            if (payloadMatch) {
              try {
                var payloadStr = payloadMatch[1]
                  .replace(/\\"/g, '"')
                  .replace(/\\\\/g, '\\');
                var payload = JSON.parse(payloadStr);
                
                // ALWAYS set is_typing to 0, regardless of current value
                if (payload.hasOwnProperty('is_typing') && payload.is_typing !== 0) {
                  console.log('[Instafn] 🔒 Setting is_typing from', payload.is_typing, 'to 0 (nested payload)');
                  payload.is_typing = 0;
                  var newPayloadStr = JSON.stringify(payload)
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"');
                  modifiedStr = modifiedStr.replace(
                    /"payload"\s*:\s*"[^"]+"/,
                    '"payload":"' + newPayloadStr + '"'
                  );
                  modified = true;
                }
              } catch (e) {
                // If parsing fails, use regex to replace any is_typing value with 0
                var beforeReplace = modifiedStr;
                modifiedStr = modifiedStr.replace(/"is_typing"\s*:\s*\d+/g, '"is_typing":0');
                modifiedStr = modifiedStr.replace(/is_typing"\s*:\s*\d+/g, 'is_typing":0');
                modifiedStr = modifiedStr.replace(/is_typing\s*:\s*\d+/g, 'is_typing:0');
                if (modifiedStr !== beforeReplace) {
                  modified = true;
                  console.log('[Instafn] 🔒 Set is_typing to 0 (string replace fallback)');
                }
              }
            } else {
              // No nested payload, use regex to replace any is_typing value with 0
              var beforeReplace = modifiedStr;
              modifiedStr = modifiedStr.replace(/"is_typing"\s*:\s*\d+/g, '"is_typing":0');
              modifiedStr = modifiedStr.replace(/is_typing"\s*:\s*\d+/g, 'is_typing":0');
              modifiedStr = modifiedStr.replace(/is_typing\s*:\s*\d+/g, 'is_typing:0');
              if (modifiedStr !== beforeReplace) {
                modified = true;
                console.log('[Instafn] 🔒 Set is_typing to 0 (direct replace)');
              }
            }
            
            // If we modified the string, convert back to original format
            if (modified) {
              if (typeof data === 'string') {
                modifiedData = modifiedStr;
              } else if (data instanceof ArrayBuffer) {
                var encoder = new TextEncoder();
                modifiedData = encoder.encode(modifiedStr).buffer;
              } else if (data instanceof Uint8Array) {
                var encoder = new TextEncoder();
                modifiedData = encoder.encode(modifiedStr);
              }
              console.log('[Instafn] ✅ Typing receipt blocked - is_typing is now 0');
            }
          }
          
          // Send the (possibly modified) data
          return originalSend.call(this, modifiedData);
        } catch (error) {
          return originalSend.call(this, data);
        }
      };
      
      // Listen to incoming messages
      wsAddListener(ws, 'message', function(event) {
        // Convert data to a format that can be sent via postMessage
        let dataToSend = null;
        let dataType = 'unknown';
        
        if (event.data instanceof ArrayBuffer) {
          dataType = 'ArrayBuffer';
          const uint8 = new Uint8Array(event.data);
          dataToSend = Array.from(uint8);
        } else if (event.data instanceof Blob) {
          dataType = 'Blob';
          const reader = new FileReader();
          reader.onload = function() {
            const uint8 = new Uint8Array(reader.result);
            window.postMessage({
              source: 'instafn-websocket',
              type: 'websocket-message',
              url: url,
              data: Array.from(uint8),
              dataType: 'Blob'
            }, '*');
          };
          reader.readAsArrayBuffer(event.data);
          return;
        } else if (event.data instanceof Uint8Array) {
          dataType = 'Uint8Array';
          dataToSend = Array.from(event.data);
        } else if (typeof event.data === 'string') {
          dataType = 'string';
          dataToSend = event.data;
        } else {
          dataType = event.data?.constructor?.name || 'unknown';
          dataToSend = event.data;
        }
        
        // Relay to content script via postMessage
        window.postMessage({
          source: 'instafn-websocket',
          type: 'websocket-message',
          url: url,
          data: dataToSend,
          dataType: dataType
        }, '*');
      });
    }
    
    return ws;
  };
  
  // Copy prototype and static properties
  window.WebSocket.prototype = OrigWebSocket.prototype;
  window.WebSocket.prototype.constructor = window.WebSocket;
  
  // Copy static constants
  Object.defineProperty(window.WebSocket, 'CONNECTING', {
    value: OrigWebSocket.CONNECTING,
    writable: false
  });
  Object.defineProperty(window.WebSocket, 'OPEN', {
    value: OrigWebSocket.OPEN,
    writable: false
  });
  Object.defineProperty(window.WebSocket, 'CLOSING', {
    value: OrigWebSocket.CLOSING,
    writable: false
  });
  Object.defineProperty(window.WebSocket, 'CLOSED', {
    value: OrigWebSocket.CLOSED,
    writable: false
  });
})();

