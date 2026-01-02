// Hide Instagram recent searches section in the search dialog.
// We watch the DOM for the search overlay and hide the "Recent" header,
// the "Clear all" button, and the accompanying list.

let observer = null;

function hideRecentBlocks(root = document) {
  const recentHeadings = Array.from(root.querySelectorAll("h4")).filter(
    (h4) => h4.textContent?.trim().toLowerCase() === "recent"
  );

  recentHeadings.forEach((heading) => {
    // Hide the header row (contains the heading and "Clear all" action).
    const headerRow = heading.parentElement?.parentElement || heading.parentElement;
    if (headerRow) {
      headerRow.style.display = "none";
    }

    // Hide the list of recent items (typically the next sibling UL).
    const maybeList =
      headerRow?.nextElementSibling ||
      headerRow?.parentElement?.querySelector("ul");
    if (maybeList && maybeList.tagName?.toLowerCase() === "ul") {
      maybeList.style.display = "none";
    }
  });

  // Also hide the "Clear all" control if it is present anywhere else.
  const clearButtons = Array.from(
    root.querySelectorAll('[role="button"], button, div')
  ).filter((el) => el.textContent?.trim().toLowerCase() === "clear all");

  clearButtons.forEach((btn) => {
    const container = btn.closest("div") || btn;
    container.style.display = "none";
  });
}

export function initHideRecentSearches(enabled = true) {
  // Clean up existing observer if disabling
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (!enabled) return;

  // Clean any previously hidden elements immediately.
  hideRecentBlocks();

  observer = new MutationObserver(() => hideRecentBlocks());
  observer.observe(document.body, { childList: true, subtree: true });
}

