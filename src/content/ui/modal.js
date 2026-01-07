/**
 * Abstract Modal Component
 *
 * Provides two modal variants:
 * 1. Full modal - with tabs support (for follow analyzer, message viewer)
 * 2. Confirm modal - narrow confirmation dialog (for action interceptors)
 */

// Ensure styles are injected
let stylesInjected = false;

function ensureStyles() {
  if (stylesInjected) return;

  const styleId = "instafn-modal-styles";
  if (document.getElementById(styleId)) {
    stylesInjected = true;
    return;
  }

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .instafn-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .instafn-modal {
      width: min(600px, 90vw);
      max-height: 85vh;
      background: rgb(var(--ig-elevated-background));
      border-radius: var(--igds-dialog-border-radius);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgb(var(--ig-separator));
      animation: instafn-modal-zoom-in 0.1s cubic-bezier(0.08, 0.52, 0.52, 1);
    }

    .instafn-modal.instafn-modal--wide {
      width: min(900px, 95vw);
    }

    @keyframes instafn-modal-zoom-in {
      0% {
        opacity: 0;
        transform: scale(1.2);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }

    .instafn-modal.instafn-modal--narrow {
      width: min(380px, 92vw);
    }

    .instafn-modal-header {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px 16px;
      border-bottom: 1px solid rgba(var(--ig-primary-text), 0.1);
      background: rgb(var(--ig-elevated-background));
      position: relative;
    }

    .instafn-header-left {
      display: inline-flex;
      align-items: center;
    }

    .instafn-close {
      position: absolute;
      right: 16px;
      cursor: pointer;
      font-size: 24px;
      line-height: 1;
      border: none;
      background: transparent;
      color: rgb(var(--ig-primary-icon));
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.2s ease;
    }

    .instafn-close:hover {
      color: rgb(var(--ig-secondary-text));
    }

    .instafn-modal-title {
      font-weight: var(--font-weight-system-semibold);
      font-size: var(--system-16-font-size);
      color: rgb(var(--ig-primary-text));
      font-family: var(--font-family-system);
    }

    .instafn-tabs {
      display: flex;
      gap: 0;
      padding: 0;
      border-bottom: 1px solid rgba(var(--ig-primary-text), 0.1);
      background: rgb(var(--ig-elevated-background));
      overflow-x: auto;
      scrollbar-width: none;
      -ms-overflow-style: none;
      scroll-behavior: smooth;
    }

    .instafn-tabs::-webkit-scrollbar {
      display: none;
    }

    .instafn-tab {
      padding: 16px 20px;
      border: none;
      background: transparent;
      cursor: pointer;
      font-size: var(--system-14-font-size);
      font-weight: var(--font-weight-system-semibold);
      color: rgb(var(--ig-secondary-text));
      border-bottom: 2px solid transparent;
      white-space: nowrap;
      font-family: var(--font-family-system);
      transition: all 0.2s;
    }

    .instafn-tab.active {
      color: rgb(var(--ig-primary-text));
      border-bottom-color: rgb(var(--ig-primary-text));
    }

    .instafn-tab:hover {
      background: rgb(var(--ig-highlight-background));
    }

    .instafn-content {
      padding: 0;
      overflow: auto;
      max-height: 60vh;
      background: rgb(var(--ig-elevated-background));
    }

    .instafn-modal-description {
      margin: 0 0 16px 0;
      font-size: var(--system-14-font-size);
      color: rgb(var(--ig-secondary-text));
      font-family: var(--font-family-system);
      line-height: 1.4;
    }

    .instafn-button-container {
      display: flex !important;
      gap: 12px !important;
      justify-content: center !important;
      align-items: center !important;
      flex-wrap: wrap !important;
      margin-top: 20px !important;
    }

    .instafn-primary-button {
      background: rgb(var(--ig-colors-button-primary-background));
      color: rgb(var(--ig-colors-button-primary-text));
      border: none;
      border-radius: 8px;
      padding: 12px 24px;
      font-weight: var(--font-weight-system-semibold);
      font-size: var(--system-14-font-size);
      cursor: pointer;
      font-family: var(--font-family-system);
      transition: background-color 0.2s;
    }

    .instafn-primary-button:hover {
      background: rgb(var(--ig-colors-button-primary-background--hover));
    }

    .instafn-primary-button:active {
      background: rgb(var(--ig-colors-button-primary-background--pressed));
    }

    .instafn-primary-button:disabled {
      background: rgb(var(--ig-colors-button-primary-background--disabled));
      color: rgb(var(--ig-colors-button-primary-text--disabled));
    }

    .instafn-secondary-button {
      background: rgb(var(--ig-secondary-button-background));
      color: rgb(var(--ig-secondary-button));
      border: none;
      border-radius: 8px;
      padding: 12px 24px;
      font-weight: var(--font-weight-system-semibold);
      font-size: var(--system-14-font-size);
      cursor: pointer;
      font-family: var(--font-family-system);
      transition: background-color 0.2s;
    }

    .instafn-secondary-button:hover {
      background: rgba(var(--ig-primary-text), 0.1);
    }

    .instafn-list {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .instafn-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid rgba(var(--ig-primary-text), 0.1);
      transition: background-color 0.2s;
    }

    .instafn-item:hover {
      background: rgb(var(--ig-highlight-background));
    }

    .instafn-item-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }

    .instafn-item img {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
      background: rgb(var(--ig-secondary-background));
    }

    .instafn-item-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .instafn-item-username {
      font-weight: var(--font-weight-system-semibold);
      font-size: var(--system-14-font-size);
      color: rgb(var(--ig-primary-text));
      font-family: var(--font-family-system);
    }

    .instafn-item-name {
      font-size: var(--system-14-font-size);
      color: rgb(var(--ig-secondary-text));
      font-family: var(--font-family-system);
    }

    .instafn-item a {
      color: inherit;
      text-decoration: none;
    }

    .instafn-item a:hover {
      text-decoration: underline;
    }

    .instafn-item-username a {
      color: rgb(var(--ig-primary-text)) !important;
    }

    .instafn-follow-btn {
      background: rgb(var(--ig-colors-button-primary-background));
      color: rgb(var(--ig-colors-button-primary-text));
      border: none;
      border-radius: 8px;
      padding: 7px 16px;
      font-weight: var(--font-weight-system-semibold);
      font-size: var(--system-14-font-size);
      cursor: pointer;
      font-family: var(--font-family-system);
      transition: background-color 0.2s;
    }

    .instafn-follow-btn:hover {
      background: rgb(var(--ig-colors-button-primary-background--hover));
    }

    .instafn-follow-btn:active {
      background: rgb(var(--ig-colors-button-primary-background--pressed));
    }

    .instafn-follow-btn:disabled {
      background: rgb(var(--ig-colors-button-primary-background--disabled));
      color: rgb(var(--ig-colors-button-primary-text--disabled));
    }

    .instafn-follow-btn.following {
      background: rgb(var(--ig-secondary-button-background));
      color: rgb(var(--ig-secondary-button));
    }

    .instafn-follow-btn.following:hover {
      background: rgba(var(--ig-primary-text), 0.1);
    }

    .instafn-empty {
      color: rgb(var(--ig-secondary-text));
      font-style: italic;
      text-align: center;
      padding: 40px 20px;
      font-size: var(--system-14-font-size);
      font-family: var(--font-family-system);
    }

    .instafn-warning-box {
      margin-bottom: 20px;
      padding: 12px;
      background: rgb(var(--ig-temporary-highlight));
      border: 1px solid rgb(var(--ig-separator));
      border-radius: 8px;
      color: rgb(var(--ig-secondary-text));
      font-size: var(--system-13-font-size);
      font-family: var(--font-family-system);
      line-height: 1.4;
    }

    .instafn-loading-text {
      margin: 0;
      font-size: var(--system-14-font-size);
      color: rgb(var(--ig-secondary-text));
      font-family: var(--font-family-system);
    }

    .instafn-error-icon {
      margin-bottom: 20px;
      color: rgb(var(--ig-error-or-destructive));
      font-size: 48px;
    }

    .instafn-error-title {
      margin: 0 0 12px 0;
      font-size: var(--system-18-font-size);
      font-weight: var(--font-weight-system-semibold);
      color: rgb(var(--ig-primary-text));
      font-family: var(--font-family-system);
    }

    .instafn-error-message {
      margin: 0 0 24px 0;
      font-size: var(--system-14-font-size);
      color: rgb(var(--ig-secondary-text));
      font-family: var(--font-family-system);
      line-height: 1.4;
    }

    .instafn-loading-container {
      text-align: center;
      padding: 40px 20px;
    }

    .instafn-loading-spinner {
      margin-bottom: 20px;
    }

    .instafn-loading-spinner svg {
      width: 32px;
      height: 32px;
      margin: 0 auto;
    }
  `;

  document.head.appendChild(style);
  stylesInjected = true;
}

/**
 * Creates a full modal with tabs support (variant 1)
 * @param {string} titleText - Modal title
 * @param {Object} options - Options
 * @param {boolean} options.showTabs - Whether to show tabs (default: true)
 * @returns {Promise<HTMLElement>} - The overlay element containing the modal
 */
export async function createModal(titleText, options = {}) {
  ensureStyles();

  const { showTabs = true } = options;

  const overlay = document.createElement("div");
  overlay.className = "instafn-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "instafn-modal";

  const header = document.createElement("div");
  header.className = "instafn-modal-header";

  const headerLeft = document.createElement("div");
  headerLeft.className = "instafn-header-left";

  const title = document.createElement("div");
  title.className = "instafn-modal-title";
  title.textContent = titleText || "";
  headerLeft.appendChild(title);

  const close = document.createElement("button");
  close.className = "instafn-close";
  close.innerHTML = `<svg aria-label="Close" class="x1lliihq x1n2onr6 x5n08af" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
    <title>Close</title>
    <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="3" y2="21"></line>
    <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="21" y2="3"></line>
  </svg>`;
  close.addEventListener("click", () => {
    overlay.remove();
  });

  header.appendChild(headerLeft);
  header.appendChild(close);

  const tabs = document.createElement("div");
  tabs.className = "instafn-tabs";
  if (!showTabs) {
    tabs.style.display = "none";
  }

  const content = document.createElement("div");
  content.className = "instafn-content";

  modal.appendChild(header);
  modal.appendChild(tabs);
  modal.appendChild(content);
  overlay.appendChild(modal);

  // Close on backdrop click
  const backdropClickHandler = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };
  overlay.addEventListener("click", backdropClickHandler);
  overlay._clickHandler = backdropClickHandler;

  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === "Escape" && document.body.contains(overlay)) {
      document.removeEventListener("keydown", handleEscape, true);
      overlay.remove();
    }
  };
  document.addEventListener("keydown", handleEscape, true);

  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Creates a confirmation modal (variant 2 - narrow)
 * @param {Object} options - Options
 * @param {string} options.title - Modal title (default: "Confirm")
 * @param {string} options.message - Message text (default: "Are you sure?")
 * @param {string} options.confirmText - Confirm button text (default: "Confirm")
 * @param {string} options.cancelText - Cancel button text (default: "Cancel")
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
export function confirmModal({
  title = "Confirm",
  message = "Are you sure?",
  confirmText = "Confirm",
  cancelText = "Cancel",
} = {}) {
  ensureStyles();

  return new Promise(async (resolve) => {
    try {
      const overlay = await createModal(title, { showTabs: false });
      const modal = overlay.querySelector(".instafn-modal");
      modal.classList.add("instafn-modal--narrow");
      const content = overlay.querySelector(".instafn-content");

      content.innerHTML = `
        <div style="text-align: center; padding: 20px 20px 28px 20px;">
          <p class="instafn-modal-description">${message}</p>
          <div class="instafn-button-container">
            <button class="instafn-secondary-button" data-instafn-cancel>${cancelText}</button>
            <button class="instafn-primary-button" data-instafn-confirm>${confirmText}</button>
          </div>
        </div>
      `;

      const cleanupAndResolve = (value) => {
        if (document.body.contains(overlay)) {
          overlay.remove();
        }
        resolve(value);
      };

      content
        .querySelector("[data-instafn-cancel]")
        .addEventListener("click", () => cleanupAndResolve(false));
      content
        .querySelector("[data-instafn-confirm]")
        .addEventListener("click", () => cleanupAndResolve(true));

      const closeBtn = modal.querySelector(".instafn-close");
      if (closeBtn) {
        closeBtn.onclick = () => cleanupAndResolve(false);
      }

      // The overlay click handler is already set up in createModal
      // We just need to override it for this specific case
      const originalClickHandler = overlay._clickHandler;
      if (originalClickHandler) {
        overlay.removeEventListener("click", originalClickHandler);
      }
      overlay._clickHandler = (e) => {
        if (e.target === overlay) {
          cleanupAndResolve(false);
        }
      };
      overlay.addEventListener("click", overlay._clickHandler);
    } catch (err) {
      // Fallback to native confirm
      resolve(confirm(message));
    }
  });
}
