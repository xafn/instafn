/**
 * WebSocket Sniffer - Injected into page context
 * This intercepts all WebSocket messages and relays them to the content script
 */

(function() {
  "use strict";

  // Idempotent: this file may be injected both as a MAIN-world content script
  // (at document_start, to win the race against Instagram opening its chat
  // socket) and via the older async script-injection path. Whichever runs first
  // wins; later runs no-op so we never double-wrap window.WebSocket.
  if (window.__instafnSocketSnifferInstalled) return;
  window.__instafnSocketSnifferInstalled = true;
  console.log("[Instafn socket-sniffer] installed; wrapping window.WebSocket");

  var OrigWebSocket = window.WebSocket;
  var callWebSocket = OrigWebSocket.apply.bind(OrigWebSocket);
  var wsAddListener = OrigWebSocket.prototype.addEventListener;
  wsAddListener = wsAddListener.call.bind(wsAddListener);

  // Old edge-chat MQTT frames carry this literal in plaintext.
  var SYNC_MARKER = "ig_message_sync";
  // The actual delta payload (both transports) is an array of objects each with
  // this key. On the newer gateway transport it lives base64-encoded inside a
  // "payload" field; on edge-chat it's plaintext JSON.
  var DELTA_MARKER = "slide_delta_processor";
  var previewBudget = {}; // url -> remaining diagnostic previews

  function bytesToPrintable(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      if ((b >= 32 && b <= 126) || b === 9 || b === 10 || b === 13) {
        s += String.fromCharCode(b);
      }
    }
    return s;
  }

  // Pull out the first balanced [...] that contains the delta marker. String-aware
  // so brackets inside message text don't throw off the depth count.
  function extractDeltaArray(str) {
    var start = str.indexOf("[");
    while (start !== -1) {
      var depth = 0, inStr = false, esc = false, end = -1;
      for (var i = start; i < str.length; i++) {
        var ch = str[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === "\\") esc = true;
          else if (ch === '"') inStr = false;
        } else if (ch === '"') {
          inStr = true;
        } else if (ch === "[") {
          depth++;
        } else if (ch === "]") {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end !== -1) {
        var candidate = str.substring(start, end + 1);
        if (candidate.indexOf(DELTA_MARKER) !== -1) return candidate;
      }
      start = str.indexOf("[", start + 1);
    }
    return null;
  }

  function dbg() {
    if (window.__instafnSocketDebug) {
      console.log.apply(console, ["[Instafn socket-sniffer][extract]"].concat([].slice.call(arguments)));
    }
  }

  function isB64Char(c) {
    return (
      (c >= 65 && c <= 90) || // A-Z
      (c >= 97 && c <= 122) || // a-z
      (c >= 48 && c <= 57) || // 0-9
      c === 43 || // +
      c === 47 || // /
      c === 61 // =
    );
  }

  // Grab the base64 payload that follows the first `"payload":"`, up to the
  // closing quote of that JSON string. The gateway server JSON-escapes every '/'
  // in the base64 as '\/', so the run is peppered with backslashes; we collect
  // base64 chars and skip the escape backslashes, stopping at the first real
  // closing quote (base64 never contains a '"'). A plain "scan until first
  // non-base64 char" stopped at the first '\' and silently truncated every
  // new-message frame. Returns the reassembled base64 (>=16 chars) or null.
  function grabPayloadB64(printable) {
    var key = '"payload":"';
    var i = printable.indexOf(key);
    while (i !== -1) {
      var start = i + key.length;
      var b64 = "";
      var closedByQuote = false;
      for (var j = start; j < printable.length; j++) {
        var c = printable.charCodeAt(j);
        if (isB64Char(c)) {
          b64 += printable[j];
        } else if (c === 34) {
          closedByQuote = true;
          break;
        }
        // else: a JSON escape backslash (from '\/') or stray framing byte — skip.
      }
      if (b64.length >= 16) {
        return { b64: b64, closedByQuote: closedByQuote };
      }
      i = printable.indexOf(key, i + 1);
    }
    return null;
  }

  // Decode base64. A complete run (the normal case) decodes as-is — do NOT strip
  // its '=' padding, that would corrupt the final bytes. Only if atob rejects the
  // run (a genuinely truncated frame) do we trim to a 4-char boundary and decode
  // the valid prefix so we at least recover the JSON we can.
  function safeAtob(b64) {
    try {
      return atob(b64);
    } catch (e) {
      var s = b64.slice(0, b64.length - (b64.length % 4));
      try {
        return atob(s);
      } catch (e2) {
        return null;
      }
    }
  }

  // Returns the slide-delta JSON array from a frame, or null. Handles both the
  // plaintext form and the newer { "payload": "<base64>" } gateway form.
  function extractDeltaJson(printable) {
    if (printable.indexOf(DELTA_MARKER) !== -1) {
      var direct = extractDeltaArray(printable);
      if (direct) return direct;
      dbg("delta marker present in plaintext but extractDeltaArray returned null");
    }
    var hit = grabPayloadB64(printable);
    if (!hit) return null;
    var decoded = safeAtob(hit.b64);
    if (decoded === null) {
      dbg("atob failed on base64 run (len " + hit.b64.length + ")");
      return null;
    }
    if (decoded.indexOf(DELTA_MARKER) === -1) {
      // Not a delta payload (e.g. an item_ack with an object payload, which
      // grabPayloadB64 won't reach since its payload isn't a quoted string).
      return null;
    }
    var arr = extractDeltaArray(decoded);
    if (!arr) {
      dbg(
        "FRAGMENTED? decoded has delta marker but no balanced array. b64 len " +
          hit.b64.length +
          ", closedByQuote " + hit.closedByQuote +
          ", decoded len " + decoded.length
      );
    }
    return arr;
  }

  function relayFrame(url, data, dataType, printable) {
    // DIAGNOSTIC: dump the structure of every lightspeed frame so we can see how
    // a large (fragmented) new-message payload is chunked across frames. For each
    // frame: total printable length, whether it carries the {"payload":"..."}
    // envelope, the base64 run length + whether it's quote-terminated, and the
    // head/tail of that run. Send ONE message and read the consecutive frames.
    if (window.__instafnSocketDebug && url.indexOf("lightspeed") !== -1) {
      var key = '"payload":"';
      var pi = printable.indexOf(key);
      if (pi !== -1) {
        var rs = pi + key.length, rj = rs;
        while (rj < printable.length && isB64Char(printable.charCodeAt(rj))) rj++;
        // The char that broke the run, shown as its code so control chars are visible.
        var boundary = [];
        for (var k = rj; k < Math.min(rj + 8, printable.length); k++) boundary.push(printable.charCodeAt(k));
        // Count how many base64 chars exist in TOTAL after the payload start if we
        // skip every non-base64 char up to the final closing quote — i.e. does
        // collecting all segments reconstruct a complete base64 string?
        var collected = 0, sawQuote = -1;
        for (var c = rs; c < printable.length; c++) {
          var cc = printable.charCodeAt(c);
          if (isB64Char(cc)) collected++;
          else if (cc === 34) { sawQuote = c; break; }
        }
        console.log("[Instafn socket-sniffer][LS]", {
          printableLen: printable.length,
          firstRunLen: rj - rs,
          boundaryCharCodes: boundary,
          boundaryAscii: JSON.stringify(printable.slice(rj, rj + 8)),
          collectedB64UpToQuote: collected,
          quoteFoundAt: sawQuote === -1 ? "none" : (sawQuote - rs),
          payloadOccurrences: printable.split(key).length - 1,
        });
      }
    }

    // DIAGNOSTIC: when debugging deleted-message capture, dump what every frame
    // on the chat sockets looks like — which __typename(s) it carries, whether a
    // delete-ish word appears, and which marker (if any) matched. Unsend a
    // message and read these: a delete-word frame with hasDelta=false means the
    // unsend uses a transport/shape we drop here; an unfamiliar __typename with
    // hasDelta=true means the delete delta was renamed (update index.js).
    if (window.__instafnSocketDebug) {
      var dbgTypes = (printable.match(/"__typename"\s*:\s*"[^"]+"/g) || []).slice(0, 12);
      var dbgDelete = /delete|unsend|revoke|removed/i.test(printable);
      if (dbgTypes.length || dbgDelete) {
        console.log("[Instafn socket-sniffer] FRAME", {
          url: url,
          dataType: dataType,
          typenames: dbgTypes,
          deleteWord: dbgDelete,
          hasSync: printable.indexOf(SYNC_MARKER) !== -1,
          hasDelta: printable.indexOf(DELTA_MARKER) !== -1,
          preview: printable.slice(0, 400),
        });
      }
    }

    // Old edge-chat format: relay the raw frame; the parser finds ig_message_sync.
    if (printable.indexOf(SYNC_MARKER) !== -1) {
      window.postMessage(
        { source: "instafn-websocket", type: "websocket-message", url: url, data: data, dataType: dataType },
        "*"
      );
      return;
    }
    // Newer gateway format: decode/extract the delta JSON and relay it as a clean
    // string the existing parser can consume directly.
    var deltaJson = extractDeltaJson(printable);
    if (deltaJson) {
      window.postMessage(
        { source: "instafn-websocket", type: "websocket-message", url: url, data: deltaJson, dataType: "string" },
        "*"
      );
      return;
    }
    // Diagnostic: a few previews per socket for any still-unhandled format.
    // Gated behind window.__instafnSocketDebug to keep the console readable.
    var left = previewBudget[url] === undefined ? 3 : previewBudget[url];
    if (left > 0 && printable.trim().length > 0 && window.__instafnSocketDebug) {
      previewBudget[url] = left - 1;
      console.log("[Instafn socket-sniffer] frame (no marker) on " + url + ":", printable.slice(0, 220));
    }
  }

  function handleFrame(url, raw) {
    if (raw instanceof Blob) {
      var reader = new FileReader();
      reader.onload = function() {
        var u8 = new Uint8Array(reader.result);
        relayFrame(url, Array.from(u8), "Blob", bytesToPrintable(u8));
      };
      reader.readAsArrayBuffer(raw);
    } else if (raw instanceof ArrayBuffer) {
      var a8 = new Uint8Array(raw);
      relayFrame(url, Array.from(a8), "ArrayBuffer", bytesToPrintable(a8));
    } else if (raw instanceof Uint8Array) {
      relayFrame(url, Array.from(raw), "Uint8Array", bytesToPrintable(raw));
    } else if (typeof raw === "string") {
      relayFrame(url, raw, "string", raw);
    }
  }

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

    if (url && window.__instafnSocketDebug) {
      console.log("[Instafn socket-sniffer] WebSocket opened:", url);
    }

    // Hook all of Instagram's realtime sockets. DM sync has been migrating from
    // edge-chat.instagram.com onto gateway.instagram.com, so we can't hard-code
    // one host; relayFrame() filters to the message-sync frames.
    if (
      url &&
      (url.indexOf("edge-chat.instagram.com") !== -1 ||
        url.indexOf("gateway.instagram.com") !== -1)
    ) {
      wsAddListener(ws, "message", function(event) {
        try {
          handleFrame(url, event.data);
        } catch (e) {
          // Ignore malformed frames
        }
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
