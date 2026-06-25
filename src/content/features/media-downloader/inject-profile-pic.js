/**
 * Profile picture download — the avatar in a profile header.
 *
 * Instagram only renders a downscaled avatar in the DOM, so we never download
 * the <img> src directly. Instead the button resolves the true HD square via the
 * private user-info endpoints (ig-api.resolveProfilePicture).
 *
 * The button is an overlay anchored to the avatar's container, revealed on hover
 * (see media-downloader.css). It coexists with the long-press Profile Picture
 * Popup feature — different gesture, different control.
 */

import { createDownloadButton } from "./ui.js";
import { BUTTON_CLASS } from "./config.js";
import { resolveProfilePicture } from "./ig-api.js";
import { runDownload } from "./downloader.js";

const FLAG = "data-instafn-dl-pfp";

function profileUsername() {
  const m = location.pathname.match(/^\/([a-zA-Z0-9._]+)\/?$/);
  return m ? m[1] : null;
}

function findAvatarImg() {
  const header = document.querySelector("header");
  if (!header) return null;
  const imgs = header.querySelectorAll("img");
  for (const img of imgs) {
    if (/profile picture/i.test(img.alt || "")) return img;
  }
  return null;
}

// Pick the box to anchor the overlay on: the smallest ancestor that still
// tightly bounds the avatar but does NOT clip its overflow. When the user has
// an active story, IG nests the avatar inside an extra circular, overflow-hidden
// ring container — anchoring on that clip box would cut off the corner button,
// so we step out to the first non-clipping ancestor instead.
function pickAnchor(img) {
  const imgRect = img.getBoundingClientRect();
  let el = img.parentElement;
  while (el && el !== document.body) {
    const rect = el.getBoundingClientRect();
    // Past ~1.8x the avatar we'd be anchoring on page chrome, not the avatar.
    if (rect.width > imgRect.width * 1.8) break;
    const cs = getComputedStyle(el);
    const clips = cs.overflowX !== "visible" || cs.overflowY !== "visible";
    if (!clips && rect.width >= imgRect.width - 1) return el;
    el = el.parentElement;
  }
  return img.closest("span, div");
}

export function injectProfilePicButton() {
  const username = profileUsername();
  if (!username) return;

  const img = findAvatarImg();
  if (!img) return;

  const anchor = pickAnchor(img);
  if (!anchor || anchor.getAttribute(FLAG) === username) return;
  if (anchor.querySelector(`.${BUTTON_CLASS}`)) {
    anchor.setAttribute(FLAG, username);
    return;
  }

  // Reveal-on-hover hook + positioning context for the overlay.
  anchor.classList.add("instafn-dl-pfp-anchor");
  const pos = getComputedStyle(anchor).position;
  if (pos === "static") anchor.style.position = "relative";

  const btn = createDownloadButton({
    title: "Download profile picture",
    variant: "instafn-dl-pfp",
    size: 18,
    onClick: async () => {
      const media = await resolveProfilePicture(username);
      return runDownload(async () => (media ? [media] : []), "profile picture");
    },
  });

  const wrapper = document.createElement("div");
  wrapper.className = "instafn-dl-pfp-wrap";
  wrapper.appendChild(btn);
  anchor.appendChild(wrapper);

  anchor.setAttribute(FLAG, username);
}

export function removeProfilePicButton() {
  document.querySelectorAll(`[${FLAG}]`).forEach((el) => {
    el.removeAttribute(FLAG);
    el.classList.remove("instafn-dl-pfp-anchor");
  });
  document.querySelectorAll(".instafn-dl-pfp-wrap").forEach((el) => el.remove());
}
