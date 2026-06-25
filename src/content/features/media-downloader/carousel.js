/**
 * Carousel download flow.
 *
 * Single-media posts download straight away. Carousels first ask — via the
 * extension's own modal component (ui/modal.js) — whether to grab the current
 * slide, every item as separate files, or every item bundled into one .zip.
 */

import { createModal } from "../../ui/modal.js";
import { showToast, CHECK_ICON } from "../../ui/toast.js";
import { downloadMedia, maybePromptQuality } from "./downloader.js";
import { buildZipDownload } from "./zip.js";

// ---------------------------------------------------------------------------
// The choice dialog — our own modal component (ui/modal.js) for the shell
// (card shape, radius, colours, zoom animation, header + close), with the
// IG-native action-sheet rows slotted into its content.
// ---------------------------------------------------------------------------

/** Ask how to download a carousel. Resolves to 'current' | 'separate' | 'zip' | null. */
function chooseCarouselDownload(count) {
  return new Promise(async (resolve) => {
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
      overlay = await createModal("Download carousel", { showTabs: false });
    } catch (_) {
      resolve("separate"); // modal failed — fall back to the safe default
      return;
    }

    const modal = overlay.querySelector(".instafn-modal");
    modal.classList.add("instafn-modal--narrow");
    const content = overlay.querySelector(".instafn-content");

    // Slot the description into the modal header, under the title (stack the
    // header's title block into a column so they sit centred together).
    // Pin the close button to the top so it aligns with the title instead of
    // floating to the vertical centre of the now-taller header (where it would
    // overlap the description). Also wire it to cancel.
    const closeBtn = modal.querySelector(".instafn-close");
    if (closeBtn) {
      closeBtn.style.top = "16px";
      closeBtn.onclick = () => done(null);
    }

    const headerLeft = overlay.querySelector(".instafn-header-left");
    if (headerLeft) {
      headerLeft.style.flexDirection = "column";
      headerLeft.style.alignItems = "center";
      const desc = document.createElement("p");
      desc.className = "instafn-modal-description";
      desc.style.margin = "8px 0 0";
      desc.style.textAlign = "center";
      desc.textContent = `This post has ${count} items. Choose how you'd like to download them.`;
      headerLeft.appendChild(desc);
    }

    content.innerHTML = `
      <div class="_a9-v">
        <div class="_a9-z instafn-dl-rows">
          <button class="_a9-- _ap36 _a9_1" type="button" tabindex="0" data-choice="current">Current item only</button>
          <button class="_a9-- _ap36 _a9_1" type="button" tabindex="0" data-choice="separate">All ${count} as separate files</button>
          <button class="_a9-- _ap36 _a9_1" type="button" tabindex="0" data-choice="zip">All ${count} as a .zip</button>
          <button class="_a9-- _ap36 _a9_1" type="button" tabindex="0" data-choice="cancel">Cancel</button>
        </div>
      </div>`;

    content.querySelectorAll("[data-choice]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const c = btn.dataset.choice;
        done(c === "cancel" ? null : c);
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

// ---------------------------------------------------------------------------
// Which slide is showing?
// ---------------------------------------------------------------------------

// A CDN media filename starts with a long numeric id unique to that carousel
// child; both the rendered (downscaled) image and the API's high-res candidate
// share it, so we can map the on-screen slide to a list entry by this token.
// Position-independent — survives IG windowing the dot strip on long carousels.
function mediaToken(url) {
  try {
    const file = new URL(url, location.href).pathname.split("/").pop() || "";
    const m = file.match(/\d{10,}/);
    return m ? m[0] : "";
  } catch (_) {
    return "";
  }
}

function matchByVisibleMedia(root, list) {
  const rootRect = root.getBoundingClientRect();
  const cx = rootRect.left + rootRect.width / 2;

  const medias = Array.from(root.querySelectorAll("img, video")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 100 && r.height > 100;
  });

  // The slide on screen is the large media whose horizontal centre is nearest
  // the carousel's centre.
  let chosen = null;
  let best = Infinity;
  for (const el of medias) {
    const r = el.getBoundingClientRect();
    if (r.right < rootRect.left || r.left > rootRect.right) continue;
    const d = Math.abs(r.left + r.width / 2 - cx);
    if (d < best) {
      best = d;
      chosen = el;
    }
  }
  if (!chosen) return -1;

  const token = mediaToken(
    chosen.currentSrc || chosen.src || chosen.poster || ""
  );
  if (!token) return -1;

  return list.findIndex((m) => {
    const t = mediaToken(m.url);
    return t && (t === token || t.includes(token) || token.includes(t));
  });
}

// Fallback: the active carousel dot. IG marks the current dot with an extra
// class, so it's the odd-one-out among the dot classNames. Correct whenever the
// dot strip isn't windowed (i.e. most carousels).
function matchByActiveDot(root) {
  const strip = root.querySelector("._acnc");
  if (!strip) return -1;
  const dots = Array.from(strip.querySelectorAll(":scope > ._acnb"));
  if (dots.length < 2) return -1;
  const counts = {};
  dots.forEach((d) => (counts[d.className] = (counts[d.className] || 0) + 1));
  return dots.findIndex((d) => counts[d.className] === 1);
}

function currentCarouselIndex(root, list) {
  if (!root) return 0;
  const byMedia = matchByVisibleMedia(root, list);
  if (byMedia >= 0) return byMedia;
  const byDot = matchByActiveDot(root);
  if (byDot >= 0 && byDot < list.length) return byDot;
  return 0;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Resolve a post's media (via `resolver`) and download it. Single media saves
 * immediately; carousels prompt for current / all-separate / zip. `root` is the
 * post's <article>, used to detect the on-screen slide for "current".
 */
export async function handlePostDownload(resolver, root) {
  let list;
  try {
    list = await resolver();
  } catch (err) {
    showToast(`Download failed: ${err.message || err}`, { duration: 2600 });
    return;
  }
  if (!list || !list.length) {
    showToast("Couldn't find anything to download here.", { duration: 2600 });
    return;
  }

  // Single media: optional quality prompt, then save.
  if (list.length === 1) {
    const picked = await maybePromptQuality(list);
    if (picked === null) return; // cancelled
    const ok = await downloadMedia(picked[0]);
    if (ok) showToast("Saved", { duration: 1500, icon: CHECK_ICON });
    else showToast("Couldn't save this.", { duration: 1500 });
    return;
  }

  // Carousel: ask the scope question FIRST (current / all-separate / zip), then
  // the quality prompt — scoped to exactly what's being saved. For "current"
  // that's the single on-screen item (so its own ladder drives the rungs); for
  // separate/zip the one choice maps across every item.
  const choice = await chooseCarouselDownload(list.length);
  if (!choice) return;

  if (choice === "current") {
    const idx = currentCarouselIndex(root, list);
    const picked = await maybePromptQuality([list[idx]]);
    if (picked === null) return; // cancelled
    const ok = await downloadMedia(picked[0]);
    if (ok) showToast(`Saved item ${idx + 1}`, { duration: 1600, icon: CHECK_ICON });
    else showToast("Couldn't save this.", { duration: 1600 });
    return;
  }

  const picked = await maybePromptQuality(list);
  if (picked === null) return; // cancelled
  const items = picked;

  if (choice === "zip") {
    await buildZipDownload(items);
    return;
  }

  // 'separate'
  showToast(`Downloading ${items.length} items…`, { duration: 1800 });
  let ok = 0;
  for (const m of items) {
    // eslint-disable-next-line no-await-in-loop
    if (await downloadMedia(m)) ok++;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 350));
  }
  showToast(`Saved ${ok}/${items.length}`, { duration: 2000, icon: CHECK_ICON });
}
