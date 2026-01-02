// Tab disabler: Hide/disable navigation tabs based on user settings

let isEnabled = false;
let disabledTabs = new Set();
let observer = null;

// Map of tab identifiers to their detection methods
const TAB_DETECTORS = {
  search: (link) => {
    const href = link.getAttribute("href");
    const ariaLabel = link.querySelector('svg[aria-label="Search"]')?.getAttribute("aria-label");
    const text = link.textContent?.trim().toLowerCase();
    return (href === "#" || href === "/") && (ariaLabel === "Search" || text === "search");
  },
  explore: (link) => {
    const href = link.getAttribute("href");
    const ariaLabel = link.querySelector('svg[aria-label="Explore"]')?.getAttribute("aria-label");
    const text = link.textContent?.trim().toLowerCase();
    return href === "/explore/" || ariaLabel === "Explore" || text === "explore";
  },
  reels: (link) => {
    const href = link.getAttribute("href");
    const ariaLabel = link.querySelector('svg[aria-label="Reels"]')?.getAttribute("aria-label");
    const text = link.textContent?.trim().toLowerCase();
    return href === "/reels/" || ariaLabel === "Reels" || text === "reels";
  },
  messages: (link) => {
    const href = link.getAttribute("href");
    const ariaLabel = link.getAttribute("aria-label");
    const text = link.textContent?.trim().toLowerCase();
    return (
      href?.includes("/direct/inbox/") ||
      (ariaLabel && ariaLabel.toLowerCase().includes("direct messaging")) ||
      text === "messages"
    );
  },
  notifications: (link) => {
    const href = link.getAttribute("href");
    const ariaLabel = link.querySelector('svg[aria-label="Notifications"]')?.getAttribute("aria-label");
    const text = link.textContent?.trim().toLowerCase();
    return (href === "#" || !href) && (ariaLabel === "Notifications" || text === "notifications");
  },
  create: (link) => {
    const href = link.getAttribute("href");
    const ariaLabel = link.querySelector('svg[aria-label="New post"]')?.getAttribute("aria-label");
    const text = link.textContent?.trim().toLowerCase();
    return (href === "#" || !href) && (ariaLabel === "New post" || text === "create");
  },
  profile: (link) => {
    const href = link.getAttribute("href");
    const svg = link.querySelector('svg[aria-label="Profile"]');
    const ariaLabel = svg?.getAttribute("aria-label");
    const text = link.textContent?.trim().toLowerCase();
    // Profile link has format /username/ or contains profile picture
    const hasProfilePic = link.querySelector('img[alt*="profile picture"], span[role="link"] img[alt*="profile picture"]');
    // Check if it's a profile link (username path, not explore/reels/home)
    const isUsernamePath = href && /^\/[^\/]+\/?$/.test(href) && href !== "/explore/" && href !== "/reels/" && href !== "/";
    return (
      (isUsernamePath && hasProfilePic) ||
      ariaLabel === "Profile" ||
      (text === "profile" && hasProfilePic)
    );
  },
  moreFromMeta: (link) => {
    const href = link.getAttribute("href");
    const svg = link.querySelector('svg[aria-label]');
    const ariaLabel = svg?.getAttribute("aria-label");
    const text = link.textContent?.trim().toLowerCase();
    // Only match "Also from Meta" - do NOT match "Settings" (More menu)
    return (
      (href === "#" || !href) &&
      (ariaLabel === "Also from Meta" || text === "also from meta")
    );
  },
};

function hideTab(link) {
  // Find the parent span/container that wraps the link
  let container = link.closest('span[class*="html-span"]');
  if (!container) {
    container = link.parentElement;
  }
  
  if (container) {
    container.style.display = "none";
    container.dataset.instafnHidden = "true";
  } else {
    // Fallback: hide the link itself
    link.style.display = "none";
    link.dataset.instafnHidden = "true";
  }
}

function processTabs() {
  if (!isEnabled) return;

  // Find all navigation links in the sidebar/navigation area
  // Look for links within the navigation container
  const navContainer = document.querySelector('div[class*="x1xgvd2v"]') || document.body;
  const navLinks = navContainer.querySelectorAll('a[role="link"]');
  
  navLinks.forEach((link) => {
    // Skip if already processed and hidden
    if (link.dataset.instafnProcessed === "true") return;
    
    // Check each disabled tab type
    for (const [tabName, detector] of Object.entries(TAB_DETECTORS)) {
      if (disabledTabs.has(tabName) && detector(link)) {
        hideTab(link);
        link.dataset.instafnProcessed = "true";
        return; // Exit early once hidden
      }
    }
    
    // Mark as processed even if not disabled to avoid re-checking
    link.dataset.instafnProcessed = "true";
  });
}

function startObserver() {
  if (observer) return;
  
  observer = new MutationObserver(() => {
    processTabs();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

export function initTabDisabler(settings) {
  // Reset state
  disabledTabs.clear();
  stopObserver();
  
  // Check which tabs should be disabled
  const tabSettings = {
    search: settings.disableTabSearch,
    explore: settings.disableTabExplore,
    reels: settings.disableTabReels,
    messages: settings.disableTabMessages,
    notifications: settings.disableTabNotifications,
    create: settings.disableTabCreate,
    profile: settings.disableTabProfile,
    moreFromMeta: settings.disableTabMoreFromMeta,
  };
  
  // Build set of disabled tabs
  for (const [tabName, isDisabled] of Object.entries(tabSettings)) {
    if (isDisabled) {
      disabledTabs.add(tabName);
    }
  }
  
  isEnabled = disabledTabs.size > 0;
  
  if (isEnabled) {
    // Reset processed state to allow re-processing
    document.querySelectorAll('[data-instafn-processed="true"]').forEach((el) => {
      delete el.dataset.instafnProcessed;
    });
    
    // Process existing tabs immediately
    if (document.body) {
      processTabs();
    }
    
    // Also process after a short delay to catch tabs that load asynchronously
    setTimeout(() => {
      processTabs();
    }, 500);
    
    // Start observing for new tabs
    if (document.body) {
      startObserver();
    } else {
      // Wait for body to be ready
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          processTabs();
          startObserver();
          bodyObserver.disconnect();
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true });
    }
  } else {
    // Re-show any hidden tabs if feature is disabled
    document.querySelectorAll('[data-instafn-hidden="true"]').forEach((el) => {
      el.style.display = "";
      delete el.dataset.instafnHidden;
    });
    document.querySelectorAll('[data-instafn-processed="true"]').forEach((el) => {
      delete el.dataset.instafnProcessed;
    });
  }
}

