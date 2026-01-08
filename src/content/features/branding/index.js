import { injectStylesheet } from "../../utils/styleLoader.js";

export function initBranding() {
  injectStylesheet(
    "content/features/branding/branding.css",
    "instafn-branding"
  );

  function updateBranding(element) {
    if (!element || element.dataset.instafnModified === "true") return;

    const originalText = element.textContent.trim();
    if (!originalText || originalText.includes("Instafn")) return;

    element.innerHTML = `${originalText} • 💽 Instafn by <a href="https://afn.im" target="_blank" rel="noopener noreferrer" class="instafn-link">afn.im</a>`;
    element.dataset.instafnModified = "true";
  }

  function checkAndUpdate() {
    // Check main footer
    const mainFooter = document.querySelector("._ab8i span");
    if (mainFooter) updateBranding(mainFooter);

    // Check profile footer - find span containing "Instagram from Meta"
    const profileFooter = document.querySelector('footer[role="contentinfo"]');
    if (profileFooter) {
      const spans = profileFooter.querySelectorAll("span");
      spans.forEach((span) => {
        if (span.textContent.includes("Instagram from Meta")) {
          updateBranding(span);
        }
      });
    }
  }

  // Check immediately and periodically
  checkAndUpdate();
  setInterval(checkAndUpdate, 500);

  // Also watch for DOM changes
  const observer = new MutationObserver(() => {
    checkAndUpdate();
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}
