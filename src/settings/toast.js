/**
 * Reusable Toast Component (settings-page copy)
 *
 * Mirror of src/content/ui/toast.js so the extension's own settings pages
 * (popup.js / settings.js, which run as plain scripts) can show the same
 * centered toast the content script uses. Also exposed on window.InstafnToast.
 */

// A bare checkmark tick (no surrounding circle), stroked with currentColor so it
// inherits the toast's text colour. Pass it as `options.icon` for a success toast.
export const CHECK_ICON =
  '<svg aria-label="Done" role="img" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">' +
  '<polyline points="20 6 9 17 4 12"></polyline>' +
  "</svg>";

/**
 * Shows a toast message in the center of the screen.
 * @param {string} message - The message to display
 * @param {Object} options - Configuration options
 * @param {number} options.duration - How long to show the toast in ms (default: 2000)
 * @param {string} options.id - Unique ID for the toast (default: 'instafn-toast')
 * @param {string} options.icon - Optional leading SVG markup (e.g. CHECK_ICON)
 */
export function showToast(message, options = {}) {
  const { duration = 2000, id = "instafn-toast", icon = null } = options;

  const existing = document.getElementById(id);
  if (existing) existing.remove();

  if (!document.getElementById("instafn-toast-styles")) {
    const style = document.createElement("style");
    style.id = "instafn-toast-styles";
    style.textContent = `
      @keyframes instafn-toast-fade-in {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.98); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
      @keyframes instafn-toast-fade-out {
        from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        to { opacity: 0; transform: translate(-50%, -50%) scale(0.98); }
      }
    `;
    document.head.appendChild(style);
  }

  const toast = document.createElement("div");
  toast.id = id;
  if (icon) {
    // text + trailing icon on one centred row. The icon markup is a trusted
    // in-extension constant (never user content), so innerHTML is safe here.
    const label = document.createElement("span");
    label.textContent = message;
    const glyph = document.createElement("span");
    glyph.style.display = "inline-flex";
    glyph.innerHTML = icon;
    toast.append(label, glyph);
  } else {
    toast.textContent = message;
  }

  Object.assign(toast.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
    background: "rgba(0, 0, 0, 0.72)",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "600",
    zIndex: "999999",
    pointerEvents: "none",
    boxShadow: "0 6px 18px rgba(0, 0, 0, 0.35)",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    animation: "instafn-toast-fade-in 0.15s ease-out",
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.transition = "opacity 200ms ease, transform 200ms ease";
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%, -50%) scale(0.96)";
      setTimeout(() => toast.remove(), 220);
    }
  }, duration);
}

// Expose for the plain-script settings pages.
if (typeof window !== "undefined") {
  window.InstafnToast = { showToast, CHECK_ICON };
}
