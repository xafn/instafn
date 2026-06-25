/**
 * Shared UI helpers for the download buttons.
 *
 * Buttons are intentionally minimal DOM (a <button> with an inline SVG) and
 * styled via media-downloader.css. They carry a spinner state so the user gets
 * feedback while the private-API resolve + save is in flight.
 */

import { BUTTON_CLASS, PROCESSED_ATTR } from "./config.js";

// Download glyph (tray + down arrow). Uses currentColor so it inherits whatever
// the surrounding IG control color is.
const DOWNLOAD_SVG = `
<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 3v12"></path>
  <path d="M7 11l5 5 5-5"></path>
  <path d="M4 20h16"></path>
</svg>`;

const SPINNER_SVG = `
<svg viewBox="0 0 24 24" width="24" height="24" class="instafn-dl-spin" aria-hidden="true">
  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-dasharray="44" stroke-dashoffset="14"></circle>
</svg>`;

/**
 * Create a download button.
 * @param {Object} opts
 * @param {Function} opts.onClick async handler (button enters spinner state until it resolves)
 * @param {string}   [opts.title] tooltip / aria-label
 * @param {string}   [opts.variant] extra class for surface-specific styling
 * @param {number}   [opts.size] icon px size (default 24)
 */
export function createDownloadButton({ onClick, title = "Download", variant = "", size = 24 } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${BUTTON_CLASS} ${variant}`.trim();
  btn.setAttribute("aria-label", title);
  btn.title = title;
  btn.innerHTML = DOWNLOAD_SVG;
  btn.setAttribute(PROCESSED_ATTR, "1");
  if (size !== 24) {
    const svg = btn.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
    }
  }

  let busy = false;
  const setBusy = (b) => {
    busy = b;
    btn.classList.toggle("instafn-dl-busy", b);
    btn.innerHTML = b ? SPINNER_SVG : DOWNLOAD_SVG;
    // Re-apply the custom size to BOTH glyphs (the spinner SVG also ships at 24),
    // so the loading icon matches the download icon instead of jumping larger.
    if (size !== 24) {
      const svg = btn.querySelector("svg");
      if (svg) {
        svg.setAttribute("width", String(size));
        svg.setAttribute("height", String(size));
      }
    }
  };

  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await onClick(e);
    } catch (err) {
      console.error("[Instafn] download button error:", err);
    } finally {
      setBusy(false);
    }
  });

  // Stop IG's own handlers (post-open, like, etc.) from firing on our button.
  btn.addEventListener("mousedown", (e) => e.stopPropagation());
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());

  return btn;
}

/** Has this element already been given a download button by us? */
export function alreadyProcessed(el) {
  return !el || el.getAttribute(PROCESSED_ATTR) === "1";
}

export function markProcessed(el) {
  if (el) el.setAttribute(PROCESSED_ATTR, "1");
}
