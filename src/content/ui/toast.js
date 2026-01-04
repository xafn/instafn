/**
 * Reusable Toast/Tooltip Component
 *
 * Displays temporary messages in the center of the screen.
 * Can be used for notifications, tooltips, and feedback messages.
 */

/**
 * Shows a toast message in the center of the screen
 * @param {string} message - The message to display
 * @param {Object} options - Configuration options
 * @param {number} options.duration - How long to show the toast in ms (default: 2000)
 * @param {string} options.id - Unique ID for the toast (default: 'instafn-toast')
 */
export function showToast(message, options = {}) {
  const { duration = 2000, id = "instafn-toast" } = options;

  // Remove existing toast with same ID
  const existing = document.getElementById(id);
  if (existing) existing.remove();

  // Inject styles if not already present
  if (!document.getElementById("instafn-toast-styles")) {
    const style = document.createElement("style");
    style.id = "instafn-toast-styles";
    style.textContent = `
      @keyframes instafn-toast-fade-in {
        from {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
      }
      @keyframes instafn-toast-fade-out {
        from {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }
        to {
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.98);
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Create toast element
  const toast = document.createElement("div");
  toast.id = id;
  toast.textContent = message;

  // Apply unified styles
  Object.assign(toast.style, {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
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

  // Remove toast after duration
  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.transition = "opacity 200ms ease, transform 200ms ease";
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%, -50%) scale(0.96)";
      setTimeout(() => toast.remove(), 220);
    }
  }, duration);
}
