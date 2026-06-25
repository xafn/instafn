/**
 * Quality-selection flow.
 *
 * Off by default: downloads always take the largest rendition (the descriptor's
 * `url` is already the top of the ladder — see ig-api.js), so highest quality is
 * the zero-config behaviour.
 *
 * When the "Ask for Quality" setting is on, clicking a download button first
 * opens a modal — the extension's own modal component (ui/modal.js), styled like
 * the carousel chooser — listing the available resolutions. The user's pick is
 * returned as a *target area* (px²) that's then mapped onto each media's own
 * ladder (`applyQualityTarget`), so one choice applies cleanly across a carousel
 * even when individual items expose slightly different rungs.
 */

import { createModal } from "../../ui/modal.js";
import { SETTINGS_KEYS } from "./config.js";

// Sentinel meaning "always the largest rung available", independent of the
// representative item's pixel area (each item keeps its own best).
export const QUALITY_HIGHEST = Infinity;

/** Read the "Ask for Quality" toggle (defaults false → no prompt). */
export async function getAskQuality() {
  return new Promise((resolve) => {
    try {
      chrome.storage.sync.get(
        { [SETTINGS_KEYS.askQuality]: false },
        (s) => resolve(!!s[SETTINGS_KEYS.askQuality])
      );
    } catch (_) {
      resolve(false);
    }
  });
}

// Collapse a ladder to distinct resolution rungs (IG sometimes repeats a size
// with different crops). Input is already sorted largest-first by ig-api.
function distinctTiers(candidates) {
  const seen = new Set();
  const out = [];
  for (const c of candidates || []) {
    const key = `${c.width}x${c.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// File extension (JPG / MP4 / WEBP …) from a candidate URL, upper-cased.
function fileType(c) {
  try {
    const p = new URL(c.url, location.href).pathname;
    const m = p.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toUpperCase() : "";
  } catch (_) {
    return "";
  }
}

function tierLabel(c) {
  const dims =
    c.width && c.height ? `${c.width} × ${c.height}` : "Original quality";
  const type = fileType(c);
  return type ? `${dims} · ${type}` : dims;
}

/**
 * Rewrite a media descriptor's `url` to the rung nearest `targetArea`.
 * `QUALITY_HIGHEST` (or a media with ≤1 candidate) keeps the existing largest.
 */
export function applyQualityTarget(media, targetArea) {
  const list = media?.candidates;
  if (!Array.isArray(list) || list.length < 2 || targetArea == null) return media;
  if (targetArea === QUALITY_HIGHEST) {
    return { ...media, url: list[0].url };
  }
  let best = list[0];
  let bestDist = Infinity;
  for (const c of list) {
    const dist = Math.abs((c.width || 0) * (c.height || 0) - targetArea);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  return { ...media, url: best.url };
}

/**
 * Ask which resolution to download. `candidates` is a representative ladder
 * (e.g. the first carousel item's). Resolves to:
 *   - a target area (px²) or QUALITY_HIGHEST to download with,
 *   - null if the user cancelled.
 * If there's nothing meaningful to choose (0–1 distinct rungs), resolves
 * immediately to QUALITY_HIGHEST without showing a modal.
 */
export function chooseQuality(candidates, { isVideo = false, count = 1 } = {}) {
  const tiers = distinctTiers(candidates);

  return new Promise(async (resolve) => {
    if (tiers.length < 2) {
      resolve(QUALITY_HIGHEST);
      return;
    }

    let settled = false;
    let overlay;
    const onEsc = (e) => {
      if (e.key === "Escape") done(null);
    };
    const done = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onEsc, true);
      if (overlay && overlay.parentNode) overlay.remove();
      resolve(value);
    };

    try {
      overlay = await createModal("Choose quality", { showTabs: false });
    } catch (_) {
      // Modal failed — fall back to highest quality rather than blocking.
      resolve(QUALITY_HIGHEST);
      return;
    }

    const modal = overlay.querySelector(".instafn-modal");
    modal.classList.add("instafn-modal--narrow");
    const content = overlay.querySelector(".instafn-content");

    const closeBtn = modal.querySelector(".instafn-close");
    if (closeBtn) {
      closeBtn.style.top = "16px";
      closeBtn.onclick = () => done(null);
    }

    // Slot a short description under the title (centred column header).
    const headerLeft = overlay.querySelector(".instafn-header-left");
    if (headerLeft) {
      headerLeft.style.flexDirection = "column";
      headerLeft.style.alignItems = "center";
      const desc = document.createElement("p");
      desc.className = "instafn-modal-description";
      desc.style.margin = "8px 0 0";
      desc.style.textAlign = "center";
      const kind = isVideo ? "video" : "image";
      desc.textContent =
        count > 1
          ? `Pick a resolution. It'll apply to all ${count} items.`
          : `Pick a resolution for this ${kind}.`;
      headerLeft.appendChild(desc);
    }

    const rows = tiers
      .map((c, i) => {
        const area = (c.width || 0) * (c.height || 0);
        // The top rung downloads each item's own largest (QUALITY_HIGHEST),
        // so a carousel of mixed sizes still gets every item at full quality.
        const value = i === 0 ? "max" : String(area);
        const suffix = i === 0 ? " (Highest)" : "";
        return `<button class="_a9-- _ap36 _a9_1" type="button" tabindex="0" data-area="${value}">${tierLabel(
          c
        )}${suffix}</button>`;
      })
      .join("");

    content.innerHTML = `
      <div class="_a9-v">
        <div class="_a9-z instafn-dl-rows">
          ${rows}
          <button class="_a9-- _ap36 _a9_1" type="button" tabindex="0" data-area="cancel">Cancel</button>
        </div>
      </div>`;

    content.querySelectorAll("[data-area]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const v = btn.dataset.area;
        if (v === "cancel") return done(null);
        done(v === "max" ? QUALITY_HIGHEST : Number(v));
      })
    );

    // Backdrop click → cancel (override createModal's plain remove handler so
    // our promise resolves and the button leaves its busy state).
    if (overlay._clickHandler) {
      overlay.removeEventListener("click", overlay._clickHandler);
    }
    overlay._clickHandler = (e) => {
      if (e.target === overlay) done(null);
    };
    overlay.addEventListener("click", overlay._clickHandler);
    document.addEventListener("keydown", onEsc, true);
  });
}
