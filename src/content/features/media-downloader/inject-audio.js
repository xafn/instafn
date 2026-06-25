/**
 * DM voice-message download.
 *
 * Voice clips render as a waveform (svg[aria-label="Waveform for audio message"])
 * + play control inside the message bubble. The .ogg URL is in neither the DOM
 * nor an <audio> element — so rather than read React internals or make the user
 * play the clip, we pull the link from the same private DM API Instagram already
 * used to load the conversation (see voice-source.js) and map it to this bubble
 * via the waveform's clip-path id.
 *
 * We just drop a small download button into the bubble's corner; on click we
 * resolve the URL and hand it to the chrome.downloads bridge.
 */

import { createDownloadButton } from "./ui.js";
import { BUTTON_CLASS } from "./config.js";
import { downloadMedia, maybePromptQuality } from "./downloader.js";
import { showToast, CHECK_ICON } from "../../ui/toast.js";
import { resolveVoiceUrl } from "./voice-source.js";
import { MESSAGE_GROUP_SELECTOR } from "../_shared/dm-message-actions.js";

const FLAG = "data-instafn-dl-audio";
const WAVEFORM_SEL = 'svg[aria-label="Waveform for audio message"]';

// The peach voice bubble for a waveform svg — where we anchor the button.
function bubbleFor(waveform) {
  return (
    waveform.closest('[role="presentation"]') ||
    waveform.closest('[role="group"][tabindex="-1"]') ||
    waveform.parentElement
  );
}

// Instagram derives the waveform clip-path id from the message/media id, so it's
// our key back into the thread payload. e.g. "waveform-clip-path-1727482385064910".
function clipIdFor(scope) {
  const cp = scope.querySelector('clipPath[id^="waveform-clip-path-"]');
  const m = cp?.id.match(/(\d{6,})/);
  return m ? m[1] : null;
}

// Clip length from the bubble's timer ("0:04") in whole seconds, for the
// duration fallback match.
function durationSecFor(scope) {
  const txt = scope.querySelector('[role="timer"]')?.textContent?.trim() || "";
  const m = txt.match(/(\d+):(\d{2})/);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

// Instagram media ids begin with a Unix-seconds creation timestamp, so the
// waveform's attachment_fbid (== clipId) gives us the message's send time
// without any extra lookup. Returns a Date or null.
function sentDateFromClipId(clipId) {
  if (!clipId || clipId.length < 10) return null;
  const sec = parseInt(clipId.slice(0, 10), 10);
  // sanity: 2012..2100
  if (!(sec > 1325376000 && sec < 4102444800)) return null;
  return new Date(sec * 1000);
}

// Outgoing bubbles tint their controls with --ig-outgoing-message-bubble; label
// those "You". The chat partner's handle isn't reliably in the DOM, so incoming
// notes are left without an artist tag rather than guessing wrong.
function senderFor(scope) {
  return scope.querySelector('[style*="outgoing-message-bubble"]') ? "You" : "";
}

// Build the descriptor (descriptive filename bits + embeddable metadata) for a
// voice note. Filename → e.g. instagram_voice_2024-09-27_1453.ogg
function voiceDescriptor(clipId, group, url) {
  const date = sentDateFromClipId(clipId);
  const iso = date ? date.toISOString() : "";
  let code = "voice";
  if (date) {
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(
      date.getDate()
    )}_${p(date.getHours())}${p(date.getMinutes())}`;
    code = `voice_${stamp}`;
  }
  const sender = senderFor(group);
  const link = location.href.split(/[?#]/)[0];
  return {
    type: "audio",
    url,
    username: "instagram",
    code,
    index: 1,
    total: 1,
    metadata: {
      title: "Instagram voice message",
      artist: sender,
      date: iso,
      description: `Instagram Direct voice message${
        iso ? " sent " + iso.slice(0, 10) : ""
      }`,
      link,
    },
  };
}

function injectForGroup(group) {
  if (!group) return;
  const waveform = group.querySelector(WAVEFORM_SEL);
  if (!waveform) return;

  const bubble = bubbleFor(waveform);
  if (!bubble || bubble.getAttribute(FLAG) === "1") return;
  if (bubble.querySelector(`.${BUTTON_CLASS}`)) {
    bubble.setAttribute(FLAG, "1");
    return;
  }

  const btn = createDownloadButton({
    title: "Download voice message",
    variant: "instafn-dl-audio",
    size: 15,
    onClick: async () => {
      const url = await resolveVoiceUrl({
        clipId: clipIdFor(group),
        durationSec: durationSecFor(group),
      });
      if (!url) {
        showToast("Couldn't find this clip's link. Reopen the chat and retry.", {
          duration: 2800,
        });
        return;
      }
      // A voice note has a single rendition, so the quality prompt only ever
      // no-ops here — routed through it anyway so behaviour stays uniform.
      const picked = await maybePromptQuality([
        voiceDescriptor(clipIdFor(group), group, url),
      ]);
      if (picked === null) return; // cancelled
      const ok = await downloadMedia(picked[0]);
      if (ok) showToast("Saved", { duration: 1800, icon: CHECK_ICON });
      else showToast("Couldn't save this clip.", { duration: 1800 });
    },
  });

  const wrapper = document.createElement("span");
  wrapper.className = "instafn-dl-audio-wrap";
  wrapper.appendChild(btn);

  // Overlay the button in the bubble's corner. Ensure the bubble is a positioned
  // ancestor so the absolutely-placed wrapper lands inside it (instead of being
  // flung to the bottom of the full-width message row, as a plain append did).
  if (getComputedStyle(bubble).position === "static") {
    bubble.style.position = "relative";
  }
  bubble.appendChild(wrapper);
  bubble.setAttribute(FLAG, "1");
}

export function injectAudioButtons() {
  // Only meaningful in the DM surface.
  if (!location.pathname.startsWith("/direct/")) return;
  document.querySelectorAll(MESSAGE_GROUP_SELECTOR).forEach(injectForGroup);
}

export function removeAudioButtons() {
  document
    .querySelectorAll(`[${FLAG}="1"]`)
    .forEach((el) => el.removeAttribute(FLAG));
  document
    .querySelectorAll(".instafn-dl-audio-wrap")
    .forEach((el) => el.remove());
}
