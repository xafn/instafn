/**
 * Voice-message URL sniffer — injected into the page (MAIN world).
 *
 * Instagram's web DM runs on the Messenger/MNet GraphQL backend. A voice note's
 * playable .ogg URL is delivered only inside the thread's GraphQL response as a
 * `SlideMessageAudiosContent` node:
 *
 *   "audio_attachments":[{
 *     "attachment_fbid":"1727482385064910",        // == the waveform clip-path id
 *     "waveform_data":[...],
 *     "playable_duration_ms":4420,
 *     "attachment_cdn_url":"https://cdn.fbsbx.com/...audioclip-...ogg..."
 *   }]
 *
 * It is NOT in the REST /direct_v2/threads/ payload and not in the DOM, so we
 * passively capture it from the page's network traffic as the conversation
 * loads, then relay each { fbid -> url } pair to the content script (via
 * postMessage). The download button maps the bubble's clip-path id straight to
 * the url — no playback, no slow pagination. (See voice-source.js.)
 */

(function () {
  "use strict";

  if (window.__instafnVoiceSnifferInstalled) return;
  window.__instafnVoiceSnifferInstalled = true;

  var DEBUG = false; // flip on to trace capture in the console

  // attachment_fbid then (within the same flat attachment object — the waveform
  // is a bare number array, no braces) the cdn url. URLs never contain a
  // double-quote, so [^"]+ captures the whole signed link.
  var PAIR_RE =
    /"attachment_fbid":"(\d{6,})"[^}]*?"attachment_cdn_url":"([^"]+)"/g;

  function scan(text, whence) {
    if (!text || typeof text !== "string") return;
    if (text.indexOf("attachment_cdn_url") === -1) return;

    if (DEBUG) {
      console.log(
        "[voice-sniffer] audio-bearing response via",
        whence,
        "len=",
        text.length,
        "| audioclip:",
        /audioclip|\.ogg/i.test(text),
        "| SlideMessageAudios:",
        text.indexOf("SlideMessageAudiosContent") !== -1
      );
    }

    var pairs = [];
    var m;
    PAIR_RE.lastIndex = 0;
    while ((m = PAIR_RE.exec(text)) !== null) {
      var url = m[2];
      if (/audioclip|\.ogg(\?|#|$)/i.test(url)) pairs.push({ fbid: m[1], url: url });
    }

    if (DEBUG) {
      console.log("[voice-sniffer] extracted", pairs.length, "voice pair(s)",
        pairs.map(function (p) { return p.fbid; }));
    }

    if (pairs.length) {
      try {
        window.postMessage({ source: "instafn-voice-dl", pairs: pairs }, "*");
      } catch (e) {}
    }
  }

  // Only the DM transport endpoints — not every response. The voice url was
  // confirmed on /api/graphql, and the thread traffic rides /ajax/bz (the comet
  // PolarisDirect* routes); /graphql covers the older shape. Everything else
  // (images, scripts, telemetry) is skipped, and even within these the real work
  // is gated on a cheap indexOf("attachment_cdn_url") inside scan().
  function isInteresting(url) {
    return (
      typeof url === "string" &&
      (url.indexOf("/api/graphql") !== -1 ||
        url.indexOf("/graphql") !== -1 ||
        url.indexOf("/ajax/bz") !== -1 ||
        url.indexOf("PolarisDirect") !== -1)
    );
  }

  // fetch path.
  var originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function () {
      var args = arguments;
      var first = args[0];
      var url = first && (first.url || first);
      var p = originalFetch.apply(this, args);
      if (isInteresting(url)) {
        p.then(function (res) {
          try {
            res
              .clone()
              .text()
              .then(function (t) { scan(t, "fetch " + url); })
              .catch(function () {});
          } catch (e) {}
          return res;
        }).catch(function () {});
      }
      return p;
    };
  }

  // XHR path — this is how the thread loads its messages.
  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__instafnVoiceUrl = url;
    return originalOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    if (isInteresting(this.__instafnVoiceUrl)) {
      var xhr = this;
      xhr.addEventListener("load", function () {
        if (xhr.readyState !== 4) return;
        var rt = xhr.responseType;
        // responseText only exists for '' | 'text'. For json/arraybuffer/blob
        // we read .response instead (and JSON-stringify objects).
        var body = null;
        try {
          if (rt === "" || rt === "text") {
            body = xhr.responseText;
          } else if (rt === "json") {
            body = JSON.stringify(xhr.response);
          } else if (rt === "arraybuffer") {
            body = new TextDecoder("utf-8").decode(new Uint8Array(xhr.response));
          } else if (rt === "blob") {
            // async; handle separately
            xhr.response.text().then(function (t) {
              scan(t, "xhr(blob) " + xhr.__instafnVoiceUrl);
            }).catch(function () {});
            return;
          }
        } catch (e) {
          if (DEBUG)
            console.log("[voice-sniffer] body read failed; responseType=", rt, e && e.message);
        }
        if (body != null) scan(body, "xhr(" + (rt || "text") + ") " + xhr.__instafnVoiceUrl);
      });
    }
    return originalSend.apply(this, arguments);
  };

  if (DEBUG) console.log("[Instafn voice-sniffer] installed");
})();
