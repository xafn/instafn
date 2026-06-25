/**
 * Changelog ("What's New") feature.
 *
 * Shows a modal listing every release the user hasn't seen yet, the first time
 * they land on Instagram after the extension updates.
 *
 * Trigger model (the "semantic" part):
 *   - The installed version is the manifest version (chrome.runtime.getManifest).
 *   - We persist `lastSeenChangelogVersion` in chrome.storage.sync.
 *   - On load: if the installed version is newer than the last seen one, we show
 *     every CHANGELOG entry in the (lastSeen, current] range, then write the
 *     current version back so it won't show again.
 *   - Fresh installs are seeded silently by the background onInstalled handler
 *     (the welcome page already greets new users), so they don't get a changelog
 *     for a version they never ran.
 */

import { createModal } from "../../ui/modal.js";
import { CHANGELOG } from "./changelog.js";

const STORAGE_KEY = "lastSeenChangelogVersion";

const TYPE_META = {
  new: { label: "New" },
  improved: { label: "Improved" },
  fixed: { label: "Fixed" },
  removed: { label: "Removed" },
};

// The order type groups are rendered in within each release.
const TYPE_ORDER = ["new", "improved", "fixed", "removed"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Format a "YYYY-MM-DD" string as e.g. "June 24, 2026". Parsed by hand so it
 * doesn't shift across time zones. Returns the input unchanged if unparseable.
 */
function formatDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return String(iso || "");
  const [, year, month, day] = m;
  return `${MONTHS[parseInt(month, 10) - 1]} ${parseInt(day, 10)}, ${year}`;
}

/**
 * Compare two semver-ish version strings ("1", "1.0", "1.2.3").
 * Returns >0 if a>b, <0 if a<b, 0 if equal. Missing parts count as 0.
 */
function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

let stylesInjected = false;
function ensureChangelogStyles() {
  if (stylesInjected) return;
  const styleId = "instafn-changelog-styles";
  if (document.getElementById(styleId)) {
    stylesInjected = true;
    return;
  }
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .instafn-changelog-body {
      padding: 8px 20px 20px 20px;
    }
    .instafn-changelog-release + .instafn-changelog-release {
      margin-top: 8px;
      padding-top: 20px;
      border-top: 1px solid rgba(var(--ig-primary-text), 0.1);
    }
    .instafn-changelog-version {
      display: block;
      margin: 12px 0 4px 0;
      font-size: var(--system-16-font-size);
      font-weight: var(--font-weight-system-semibold);
      color: rgb(var(--ig-primary-text));
      font-family: var(--font-family-system);
    }
    .instafn-changelog-title {
      margin: 0 0 4px 0;
      font-size: var(--system-14-font-size);
      line-height: 1.4;
      color: rgb(var(--ig-secondary-text));
      font-family: var(--font-family-system);
    }
    .instafn-changelog-group {
      margin-top: 16px;
    }
    .instafn-changelog-badge {
      display: inline-flex;
      align-items: center;
      font-size: var(--system-14-font-size);
      font-weight: var(--font-weight-system-semibold);
      font-family: var(--font-family-system);
      color: rgb(var(--ig-link));
    }
    .instafn-changelog-list {
      margin: 8px 0 0 0;
      padding-left: 22px;
      list-style: disc;
    }
    .instafn-changelog-list li {
      font-size: var(--system-14-font-size);
      color: rgb(var(--ig-primary-text));
      font-family: var(--font-family-system);
      line-height: 1.4;
      padding: 3px 0;
    }
    .instafn-changelog-list li::marker {
      color: rgb(var(--ig-secondary-text));
    }
    .instafn-changelog-feature {
      font-weight: var(--font-weight-system-semibold);
    }
    .instafn-changelog-footer {
      display: flex;
      justify-content: flex-end;
      padding: 16px 20px;
      border-top: 1px solid rgba(var(--ig-primary-text), 0.1);
    }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

function renderReleases(releases) {
  ensureChangelogStyles();
  return releases
    .map((release) => {
      const all = release.changes || [];
      // Any types we don't have an explicit order for get appended at the end.
      const seen = new Set(TYPE_ORDER);
      const order = [
        ...TYPE_ORDER,
        ...all.map((c) => c.type).filter((t) => t && !seen.has(t) && !seen.add(t)),
      ];

      const groups = order
        .map((type) => {
          const items = all.filter((c) => c.type === type);
          if (!items.length) return "";
          const meta = TYPE_META[type] || { label: type || "Note" };
          const bullets = items
            .map((c) => `<li>${c.text}</li>`)
            .join("");
          return `
            <div class="instafn-changelog-group">
              <span class="instafn-changelog-badge">${meta.label}</span>
              <ul class="instafn-changelog-list">${bullets}</ul>
            </div>`;
        })
        .join("");

      return `
        <div class="instafn-changelog-release">
          <span class="instafn-changelog-version">Version ${release.version}</span>
          ${release.title ? `<p class="instafn-changelog-title">${release.title}</p>` : ""}
          ${groups}
        </div>`;
    })
    .join("");
}

/**
 * Build and display the changelog modal for the given releases.
 * Exported so it can be opened manually (e.g. from settings) too.
 *
 * The modal is deliberately "sticky": it can only be dismissed with the
 * "Got it" button or the X. Clicking the backdrop or pressing Escape does
 * nothing, so the user can't dismiss it by accident. `onDismiss` runs only on
 * an explicit dismiss — closing the tab does NOT count as seeing it.
 *
 * @param {Array} releases - Releases to render.
 * @param {Function} [onDismiss] - Called once when the user explicitly dismisses.
 */
export async function showChangelogModal(releases, onDismiss) {
  if (!releases || !releases.length) return;
  // Newest release leads; surface its date in the header (in brackets).
  const headerDate = releases[0] && releases[0].date
    ? ` (${formatDate(releases[0].date)})`
    : "";
  const overlay = await createModal(`What’s new in Instafn${headerDate}`, {
    showTabs: false,
    closeOnBackdrop: false,
    closeOnEscape: false,
  });
  const content = overlay.querySelector(".instafn-content");

  let dismissed = false;
  const dismissModal = () => {
    if (dismissed) return;
    dismissed = true;
    overlay.remove();
    if (typeof onDismiss === "function") onDismiss();
  };

  const body = document.createElement("div");
  body.className = "instafn-changelog-body";
  body.innerHTML = renderReleases(releases);
  content.appendChild(body);

  const footer = document.createElement("div");
  footer.className = "instafn-changelog-footer";
  const dismiss = document.createElement("button");
  dismiss.className = "instafn-primary-button";
  dismiss.textContent = "Got it";
  dismiss.addEventListener("click", dismissModal);
  footer.appendChild(dismiss);

  // The X in the header also counts as an explicit dismiss.
  const closeBtn = overlay.querySelector(".instafn-close");
  if (closeBtn) closeBtn.addEventListener("click", dismissModal);

  // Footer lives outside the scrollable content so the button is always visible.
  overlay.querySelector(".instafn-modal").appendChild(footer);
  return overlay;
}

/**
 * Entry point — call once on page load. Decides whether to show the modal and
 * records the current version as seen.
 */
export function initChangelog() {
  let currentVersion;
  try {
    currentVersion = chrome.runtime.getManifest().version;
  } catch (err) {
    return; // not in an extension context
  }

  chrome.storage.sync.get({ [STORAGE_KEY]: null }, (result) => {
    if (chrome.runtime.lastError) return;
    const lastSeen = result[STORAGE_KEY];

    // No baseline yet (e.g. updated from a build before this feature existed, and
    // the background handler hasn't seeded it). Record current and stay silent so
    // we never dump the whole history on someone the first time.
    if (lastSeen == null) {
      chrome.storage.sync.set({ [STORAGE_KEY]: currentVersion });
      return;
    }

    if (compareVersions(currentVersion, lastSeen) <= 0) return; // already up to date

    // Show every release strictly newer than what they last saw.
    const unseen = CHANGELOG.filter(
      (r) => compareVersions(r.version, lastSeen) > 0
    );

    const markSeen = () =>
      chrome.storage.sync.set({ [STORAGE_KEY]: currentVersion });

    if (!unseen.length) {
      // No copy for this version — mark seen now so we don't re-check forever.
      markSeen();
      return;
    }

    // Only record the version as seen once the user explicitly dismisses the
    // modal. Closing the tab without dismissing leaves it to show again next time.
    showChangelogModal(unseen, markSeen).catch((err) =>
      console.error("Instafn: Error showing changelog:", err)
    );
  });
}
