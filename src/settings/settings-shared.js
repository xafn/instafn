/**
 * Shared settings logic for BOTH the popup (popup.js) and the full settings
 * page (settings.js). Loaded as a classic <script> before each page's own
 * script; everything is exposed on window.InstafnSettings.
 *
 * This is the single source of truth for the settings list, so the two UIs
 * can never drift apart again. It also handles the warning modals, the
 * custom date-format fields, and live cross-view sync via storage.onChanged.
 */
(function () {
  "use strict";

  // Every setting and its default. Both UIs read/write this exact set, so a
  // setting added here shows up (and stays in sync) in both places.
  const DEFAULTS = {
    blockStorySeen: false,
    enableManualMarkAsSeen: false,
    blockTypingReceipts: false,
    confirmLike: false,
    confirmComment: false,
    confirmCall: false,
    confirmFollow: false,
    confirmReposts: false,
    confirmStoryQuickReactions: false,
    confirmStoryReplies: false,
    activateFollowAnalyzer: false,
    enableVideoScrubber: false,
    enableReelSpeedHold: true,
    enableCarouselDotDrag: false,
    enableProfilePicPopup: false,
    enableHighlightPopup: false,
    enableProfileFollowIndicator: false,
    hideRecentSearches: false,
    hideSuggestedProfiles: false,
    hideSuggestedAccountsOnProfile: false,
    hideHomeFooter: false,
    hideRightSidebar: false,
    hideStoriesTray: false,
    hideNotesTray: false,
    disableTabSearch: false,
    disableTabExplore: false,
    disableTabReels: false,
    disableTabMessages: false,
    disableTabNotifications: false,
    disableTabCreate: false,
    disableTabMoreFromMeta: false,
    enableMessageEditShortcut: false,
    enableMessageReplyShortcut: false,
    enableMessageDoubleTapLike: false,
    enableMessageLogger: false,
    enableDMBackground: false,
    showExactTime: false,
    timeFormat: "{M}/{D}/{YY}, {h}:{mm} {A}",
    enableCallTimer: false,
    enablePostHoverInfo: false,
    postHoverDateFormat: "{M}/{D}/{YY}",
    profileGridColumns: "default",
    enableMediaDownloader: false,
    downloadOnPosts: true,
    downloadOnReels: true,
    downloadOnStories: true,
    downloadProfilePictures: true,
    downloadAudioMessages: true,
    downloadChatImages: true,
    downloadAskLocation: false,
    downloadAskQuality: false,
    downloadEmbedMetadata: true,
  };

  // Toggles that pop a warning the user must confirm before they switch ON.
  // Cancelling reverts the toggle.
  const CONFIRM_ON_ENABLE = {
    blockTypingReceipts: {
      title: "Block the typing indicator?",
      message:
        "Instagram won't be told when you're typing. A side effect of this tweak is all messages being sent may be delayed, conversations may feel laggy. Turn this on?",
      confirmText: "Turn on",
    },
    enableDMBackground: {
      title: "Enable Native DM Themes?",
      message:
        "This tweak pings Instagram's private servers to fetch theme information. While this is low-risk, your account may get rate-limited. Turn this on?",
      confirmText: "Turn on",
    },
    activateFollowAnalyzer: {
      title: "Enable the Follow Analyzer?",
      message:
        "The analyzer makes many rapid requests to Instagram to map your followers and following. On large accounts (13,000+ connections) this can get you rate-limited or actioned. Use at your own risk. Turn this on?",
      confirmText: "Turn on",
    },
  };

  // Parent toggle -> nested container id. `offChildren` are forced OFF whenever
  // the parent is OFF (the media sub-toggles deliberately keep their values).
  const NESTED = [
    {
      // The child is disabled (greyed) while the parent is off, but its saved
      // value is left untouched — toggling the parent must not flip it.
      parent: "blockStorySeen",
      container: "nestedStorySeen",
    },
    { parent: "enableMediaDownloader", container: "nestedMediaDownloader" },
    { parent: "showExactTime", container: "nestedTimeFormat" },
    { parent: "enablePostHoverInfo", container: "nestedPostHoverDateFormat" },
    // Inverted: removing the whole right column already hides the suggestions
    // and footer, so those sub-toggles are disabled while it's ON.
    { parent: "hideRightSidebar", container: "nestedRightSidebar", invert: true },
  ];

  // Text fields (id === storage key) that get preset chips + a live preview.
  const DATE_FIELDS = ["timeFormat", "postHoverDateFormat"];

  // Dropdown sentinel for "Custom…" (reveals the token text box).
  const DATE_CUSTOM = "__custom__";

  // Each preset option in the dropdown previews the current date/time (captured
  // when the menu is built) rather than showing abstract labels.
  const DATE_PREVIEW_REF = new Date();

  const DATE_PRESETS = [
    { label: "Default", value: "{MMM} {D}, {YYYY}, {h}:{mm} {A}" },
    { label: "M/D/YY time", value: "{M}/{D}/{YY}, {h}:{mm} {A}" },
    { label: "M/D/YY", value: "{M}/{D}/{YY}" },
    { label: "US", value: "{MM}/{DD}/{YYYY}, {h}:{mm} {A}" },
    { label: "European", value: "{DD}/{MM}/{YYYY}, {HH}:{mm}" },
    { label: "ISO 8601", value: "{YYYY}-{MM}-{DD} {HH}:{mm}:{ss}" },
    { label: "Long", value: "{MMMM} {D}, {YYYY}, {h}:{mm} {A}" },
    { label: "Day month", value: "{D} {MMM} {YYYY}" },
    { label: "Date only", value: "{MMM} {D}, {YYYY}" },
    { label: "Time only", value: "{h}:{mm} {A}" },
    { label: "DD/MM/YY", value: "{DD}/{MM}/{YY}" },
    { label: "Weekday", value: "{ddd}, {MMM} {D}, {YYYY}" },
  ];

  const TOKEN_LEGEND = [
    ["{YYYY}", "2026"],
    ["{YY}", "26"],
    ["{MMMM}", "January"],
    ["{MMM}", "Jan"],
    ["{MM}", "01"],
    ["{M}", "1"],
    ["{DD}", "07"],
    ["{D}", "7"],
    ["{dddd}", "Monday"],
    ["{ddd}", "Mon"],
    ["{HH}", "06 (24h)"],
    ["{H}", "6 (24h)"],
    ["{hh}", "06 (12h)"],
    ["{h}", "6 (12h)"],
    ["{mm}", "14"],
    ["{ss}", "52"],
    ["{A}", "AM/PM"],
    ["{a}", "am/pm"],
    ["{time}", "6:14 AM"],
    ["{date}", "Jan 7, 2026"],
  ];

  // Legacy enum format -> equivalent token string, so values saved by older
  // versions display sensibly in the new text box. The content formatter still
  // understands the old enums directly, so rendering keeps working until a
  // re-save migrates the value.
  const LEGACY_FORMAT_TO_TOKENS = {
    default: "{MMM} {D}, {YYYY}, {h}:{mm} {A}",
    full: "{MMMM} {D}, {YYYY}, {h}:{mm}:{ss} {A}",
    short: "{M}/{D}/{YYYY}, {h}:{mm} {A}",
    iso: "{YYYY}-{MM}-{DD} {HH}:{mm}:{ss}",
    us: "{MM}/{DD}/{YYYY}, {h}:{mm} {A}",
    european: "{DD}/{MM}/{YYYY}, {HH}:{mm}",
    "date-only": "{MMM} {D}, {YYYY}",
    "time-only": "{h}:{mm} {A}",
    "24h": "{MMM} {D}, {YYYY}, {HH}:{mm}",
    "24h-full": "{MMMM} {D}, {YYYY}, {HH}:{mm}:{ss}",
    "relative-precise": "{MMM} {D}, {YYYY}, {h}:{mm} {A}",
    compact: "{D} {MMM} {YYYY}, {h}:{mm} {A}",
    rfc2822: "{ddd}, {DD} {MMM} {YYYY} {HH}:{mm}:{ss}",
    "dd/mm/yy": "{DD}/{MM}/{YY}",
    "dd/mm/yy-time": "{DD}/{MM}/{YY}, {h}:{mm} {A}",
    "mm/dd/yy": "{MM}/{DD}/{YY}",
    "mm/dd/yy-time": "{MM}/{DD}/{YY}, {h}:{mm} {A}",
    "dd/mm/yyyy": "{DD}/{MM}/{YYYY}",
    "dd/mm/yyyy-time": "{DD}/{MM}/{YYYY}, {h}:{mm} {A}",
    "mm/dd/yyyy": "{MM}/{DD}/{YYYY}",
    "day-month": "{D} {MMM} {YYYY}",
    "day-month-time": "{D} {MMM} {YYYY}, {h}:{mm} {A}",
  };

  const MONTHS_LONG = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const MONTHS_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const DAYS_LONG = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ];
  const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // Mirror of formatWithTokens() in the content script's exact-time-display.
  function formatTokens(date, fmt) {
    const Y = date.getFullYear();
    const Mi = date.getMonth();
    const D = date.getDate();
    const dow = date.getDay();
    const H = date.getHours();
    const m = date.getMinutes();
    const s = date.getSeconds();
    const h12 = H % 12 || 12;
    const ampm = H >= 12 ? "PM" : "AM";
    const map = {
      YYYY: Y,
      YY: pad(Y % 100),
      MMMM: MONTHS_LONG[Mi],
      MMM: MONTHS_SHORT[Mi],
      MM: pad(Mi + 1),
      M: Mi + 1,
      DD: pad(D),
      D: D,
      dddd: DAYS_LONG[dow],
      ddd: DAYS_SHORT[dow],
      HH: pad(H),
      H: H,
      hh: pad(h12),
      h: h12,
      mm: pad(m),
      m: m,
      ss: pad(s),
      s: s,
      A: ampm,
      a: ampm.toLowerCase(),
      time: `${h12}:${pad(m)} ${ampm}`,
      date: `${MONTHS_SHORT[Mi]} ${D}, ${Y}`,
    };
    return String(fmt).replace(/\{(\w+)\}/g, (full, t) =>
      t in map ? String(map[t]) : full
    );
  }

  // Normalize a stored format value into a token string for the text box.
  function toTokenFormat(stored) {
    if (typeof stored !== "string" || !stored) return DEFAULTS.timeFormat;
    if (stored.includes("{")) return stored; // already a token format
    if (stored in LEGACY_FORMAT_TO_TOKENS) return LEGACY_FORMAT_TO_TOKENS[stored];
    return stored; // unknown plain string: leave as-is
  }

  function formatPreview(fmt) {
    try {
      return formatTokens(new Date(), fmt);
    } catch (e) {
      return "";
    }
  }

  function readControl(el) {
    if (!el) return undefined;
    if (el.type === "checkbox") return !!el.checked;
    return el.value;
  }

  function writeControl(el, v) {
    if (!el) return;
    if (el.type === "checkbox") el.checked = !!v;
    else el.value = v;
  }

  // ---- Confirmation modal --------------------------------------------------
  // Reuse the project's own modal component (settings/modal.js, exposed on
  // window.InstafnModal). Falls back to a native confirm() if it isn't loaded.

  function confirmDialog(opts) {
    const o = opts || {};
    if (window.InstafnModal && window.InstafnModal.confirmModal) {
      return window.InstafnModal.confirmModal({
        title: o.title || "Confirm",
        message: o.message || "Are you sure?",
        confirmText: o.confirmText || "Confirm",
        cancelText: o.cancelText || "Cancel",
      });
    }
    return Promise.resolve(window.confirm(o.message || "Are you sure?"));
  }

  // ---- Toasts --------------------------------------------------------------
  // Reuse the project's own toast (settings/toast.js, on window.InstafnToast).

  function toastSuccess(message) {
    const T = window.InstafnToast;
    if (T && T.showToast) T.showToast(message, { icon: T.CHECK_ICON });
  }

  function toastError(message) {
    const T = window.InstafnToast;
    if (T && T.showToast) T.showToast(message, { duration: 3500 });
  }

  // ---- Import / export -----------------------------------------------------

  function exportToFile(done) {
    chrome.storage.sync.get(DEFAULTS, (cfg) => {
      const settings = {};
      for (const k of Object.keys(DEFAULTS)) settings[k] = cfg[k];

      let version = "unknown";
      try {
        version = chrome.runtime.getManifest().version || version;
      } catch (e) {}

      const payload = {
        app: "instafn",
        version,
        exportedAt: new Date().toISOString(),
        settings,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `instafn-settings-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (typeof done === "function") done();
    });
  }

  // Turn a parsed JSON payload into a sanitized config patch. Returns
  // { newCfg, applied } or throws an Error with a user-facing message.
  function parseImport(parsed) {
    const incoming =
      parsed &&
      typeof parsed === "object" &&
      parsed.settings &&
      typeof parsed.settings === "object"
        ? parsed.settings
        : parsed;

    if (!incoming || typeof incoming !== "object") {
      throw new Error("unrecognized file format.");
    }

    const newCfg = {};
    let applied = 0;
    for (const k of Object.keys(DEFAULTS)) {
      if (!(k in incoming)) continue;
      const def = DEFAULTS[k];
      const val = incoming[k];
      if (typeof def === "boolean") {
        newCfg[k] = !!val;
        applied++;
      } else if (typeof def === "string" && typeof val === "string") {
        newCfg[k] = val;
        applied++;
      }
    }
    if (applied === 0) throw new Error("no recognized settings found.");
    if (!newCfg.blockStorySeen) newCfg.enableManualMarkAsSeen = false;
    return { newCfg, applied };
  }

  // ---- Form controller -----------------------------------------------------

  // Wires up an entire settings form (load/save/dirty-tracking, nested
  // toggles, date fields, confirm-on-enable modals, and live cross-view
  // sync). Both UIs share this; they only differ in navigation chrome and
  // what happens after a save (onAfterSave).
  function createForm(options) {
    const opts = options || {};
    const doc = document;
    const saveButton = doc.getElementById("save");
    let originalSettings = {};

    function checkForChanges() {
      if (!saveButton) return;
      let dirty = false;
      for (const k of Object.keys(DEFAULTS)) {
        const el = doc.getElementById(k);
        if (!el) continue;
        if (readControl(el) !== originalSettings[k]) {
          dirty = true;
          break;
        }
      }
      saveButton.classList.toggle("active", dirty);
    }

    function applyNested() {
      for (const n of NESTED) {
        const parent = doc.getElementById(n.parent);
        const container = doc.getElementById(n.container);
        if (!parent || !container) continue;
        const on = n.invert ? !parent.checked : parent.checked;
        container.classList.toggle("enabled", on);
        container
          .querySelectorAll("input, select, button")
          .forEach((c) => {
            c.disabled = !on;
          });
        if (!on && n.offChildren) {
          for (const childId of n.offChildren) {
            const child = doc.getElementById(childId);
            if (child) child.checked = false;
          }
        }
      }
    }

    function refreshDateFields() {
      for (const id of DATE_FIELDS) {
        const el = doc.getElementById(id);
        if (el && el._ifnSync) el._ifnSync();
      }
    }

    function wireNested() {
      for (const n of NESTED) {
        const parent = doc.getElementById(n.parent);
        if (parent && !parent.dataset.ifnNestedWired) {
          parent.dataset.ifnNestedWired = "1";
          parent.addEventListener("change", () => {
            applyNested();
            checkForChanges();
          });
        }
      }
    }

    function wireDateFields() {
      // Populate the token legend (shared across fields) once.
      doc.querySelectorAll("[data-date-legend]").forEach((legend) => {
        if (legend.dataset.ifnFilled) return;
        legend.dataset.ifnFilled = "1";
        legend.innerHTML = TOKEN_LEGEND.map(
          ([tok, ex]) =>
            `<span><code>${tok}</code> ${ex}</span>`
        ).join("");
      });

      for (const id of DATE_FIELDS) {
        // input#<id> is the storage-backed source of truth (a format string).
        const input = doc.getElementById(id);
        if (!input) continue;
        const select = doc.querySelector(`[data-date-select="${id}"]`);
        const preview = doc.querySelector(`[data-date-preview="${id}"]`);
        const previewRow = preview
          ? preview.closest(".date-format-preview")
          : null;
        const custom = doc.querySelector(`[data-date-custom="${id}"]`);

        const updatePreview = () => {
          if (preview)
            preview.textContent = formatPreview(input.value || DEFAULTS[id]);
        };

        // The custom token box + live preview only matter in "Custom…" mode;
        // presets already show their result right in the dropdown.
        const isCustom = () => select && select.value === DATE_CUSTOM;
        const applyVisibility = () => {
          if (custom) custom.hidden = !isCustom();
          if (previewRow) previewRow.hidden = !isCustom();
        };

        // Point the dropdown + custom box at whatever input.value currently is.
        const sync = () => {
          if (select) {
            const match = DATE_PRESETS.find((p) => p.value === input.value);
            select.value = match ? match.value : DATE_CUSTOM;
          }
          applyVisibility();
          updatePreview();
        };
        input._ifnSync = sync;
        input._ifnUpdatePreview = updatePreview;

        // Populate the dropdown once: first preset, then "Custom", then the rest.
        if (select && !select.dataset.ifnWired) {
          select.dataset.ifnWired = "1";
          const opts = [
            ...DATE_PRESETS,
            { label: "Custom…", value: DATE_CUSTOM },
          ];
          select.innerHTML = opts
            .map((o) => {
              const text =
                o.value === DATE_CUSTOM
                  ? o.label
                  : formatTokens(DATE_PREVIEW_REF, o.value);
              return `<option value="${o.value}">${text}</option>`;
            })
            .join("");
          select.addEventListener("change", () => {
            if (select.value === DATE_CUSTOM) {
              input.focus();
            } else {
              input.value = select.value;
            }
            applyVisibility();
            updatePreview();
            checkForChanges();
          });
        }

        if (!input.dataset.ifnWired) {
          input.dataset.ifnWired = "1";
          input.addEventListener("input", () => {
            updatePreview();
            checkForChanges();
          });
        }
      }
    }

    function wireConfirmToggles() {
      for (const key of Object.keys(CONFIRM_ON_ENABLE)) {
        const el = doc.getElementById(key);
        if (!el || el.dataset.ifnConfirmWired) continue;
        el.dataset.ifnConfirmWired = "1";
        el.addEventListener("change", async () => {
          if (!el.checked) return; // only confirm when switching ON
          const cfg = CONFIRM_ON_ENABLE[key];
          const ok = await confirmDialog(cfg);
          if (!ok) el.checked = false;
          applyNested();
          checkForChanges();
        });
      }
    }

    function applyConfig(cfg, opts2) {
      const setBaseline = !(opts2 && opts2.markDirty);
      for (const k of Object.keys(DEFAULTS)) {
        const el = doc.getElementById(k);
        if (!el) continue;
        let v = cfg[k] !== undefined && cfg[k] !== null ? cfg[k] : DEFAULTS[k];
        if (DATE_FIELDS.indexOf(k) !== -1) v = toTokenFormat(v);
        writeControl(el, v);
        if (setBaseline) originalSettings[k] = readControl(el);
      }
      applyNested();
      refreshDateFields();
      checkForChanges();
    }

    function load() {
      wireNested();
      wireDateFields();
      wireConfirmToggles();
      return new Promise((resolve) => {
        chrome.storage.sync.get(DEFAULTS, (cfg) => {
          applyConfig(cfg);
          resolve(cfg);
        });
      });
    }

    function save() {
      if (!saveButton || !saveButton.classList.contains("active")) return;
      const newCfg = {};
      for (const k of Object.keys(DEFAULTS)) {
        const el = doc.getElementById(k);
        if (!el) continue;
        newCfg[k] = readControl(el);
      }
      // Mirror nested offChildren rules on save.
      for (const n of NESTED) {
        if (!n.offChildren) continue;
        const p = doc.getElementById(n.parent);
        if (p && !p.checked) {
          for (const c of n.offChildren) newCfg[c] = false;
        }
      }
      chrome.storage.sync.set(newCfg, () => {
        originalSettings = Object.assign({}, originalSettings, newCfg);
        saveButton.classList.remove("active");
        if (typeof opts.onAfterSave === "function") opts.onAfterSave(newCfg);
      });
    }

    function isDirty() {
      return !!(saveButton && saveButton.classList.contains("active"));
    }

    // Re-pull from storage and refresh the form (used after an import).
    function reloadFromStorage() {
      chrome.storage.sync.get(DEFAULTS, (cfg) => applyConfig(cfg));
    }

    // Live sync: when another open view saves, reflect it here — unless the
    // user has unsaved edits in this view (don't clobber their work).
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync" || isDirty()) return;
      let touched = false;
      for (const k of Object.keys(changes)) {
        if (!(k in DEFAULTS)) continue;
        const el = doc.getElementById(k);
        if (!el) continue;
        let v = changes[k].newValue;
        if (v === undefined) v = DEFAULTS[k];
        if (DATE_FIELDS.indexOf(k) !== -1) v = toTokenFormat(v);
        writeControl(el, v);
        originalSettings[k] = readControl(el);
        touched = true;
      }
      if (touched) {
        applyNested();
        refreshDateFields();
        checkForChanges();
      }
    });

    // Catch every other control change (checkboxes, selects).
    doc.addEventListener("change", checkForChanges);

    return {
      load,
      save,
      isDirty,
      reloadFromStorage,
      checkForChanges,
    };
  }

  window.InstafnSettings = {
    DEFAULTS,
    CONFIRM_ON_ENABLE,
    DATE_PRESETS,
    confirmDialog,
    toastSuccess,
    toastError,
    formatPreview,
    toTokenFormat,
    exportToFile,
    parseImport,
    createForm,
  };
})();
