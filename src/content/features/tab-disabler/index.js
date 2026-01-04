// Tab disabler: Hide/disable navigation tabs based on user settings

let isEnabled = false;
let disabledTabs = new Set();
let observer = null;
let injectedStyleElement = null;

const TAB_RULES = [
  {
    key: "search",
    match: ({ href, ariaLabel, text }) =>
      (href === "#" || href === "/") &&
      (ariaLabel === "Search" || text === "search"),
  },
  {
    key: "explore",
    match: ({ href, ariaLabel, text }) =>
      href === "/explore/" || ariaLabel === "Explore" || text === "explore",
  },
  {
    key: "reels",
    match: ({ href, ariaLabel, text }) =>
      href === "/reels/" || ariaLabel === "Reels" || text === "reels",
  },
  {
    key: "messages",
    match: ({ href, ariaLabel, text }) =>
      href?.includes("/direct/inbox/") ||
      (ariaLabel && ariaLabel.toLowerCase().includes("direct messaging")) ||
      text === "messages",
  },
  {
    key: "notifications",
    match: ({ href, ariaLabel, text }) =>
      (href === "#" || !href) &&
      (ariaLabel === "Notifications" || text === "notifications"),
  },
  {
    key: "create",
    match: ({ href, ariaLabel, text }) =>
      (href === "#" || !href) &&
      (ariaLabel === "New post" || text === "create"),
  },
  {
    key: "profile",
    match: ({ href, ariaLabel, text, link }) => {
      const hasProfilePic = link.querySelector(
        'img[alt*="profile picture"], span[role="link"] img[alt*="profile picture"]'
      );
      const isUsernamePath =
        href &&
        /^\/[^\/]+\/?$/.test(href) &&
        href !== "/explore/" &&
        href !== "/reels/" &&
        href !== "/";
      return (
        (isUsernamePath && hasProfilePic) ||
        ariaLabel === "Profile" ||
        (text === "profile" && hasProfilePic)
      );
    },
  },
  {
    key: "moreFromMeta",
    match: ({ href, ariaLabel, text }) =>
      (href === "#" || !href) &&
      (ariaLabel === "Also from Meta" || text === "also from meta"),
  },
];

function getNavLinks() {
  const navContainer =
    document.querySelector('div[class*="x1xgvd2v"]') || document.body;
  return navContainer.querySelectorAll('a[role="link"]');
}

function hideTab(link) {
  const container =
    link.closest('span[class*="html-span"]') || link.parentElement;
  const target = container || link;
  target.style.display = "none";
  target.dataset.instafnHidden = "true";
}

function matchesDisabledRule(link) {
  const href = link.getAttribute("href");
  const ariaLabel =
    link.getAttribute("aria-label") ||
    link.querySelector("svg[aria-label]")?.getAttribute("aria-label");
  const text = link.textContent?.trim().toLowerCase();
  const descriptor = { href, ariaLabel, text, link };

  for (const { key, match } of TAB_RULES) {
    if (disabledTabs.has(key) && match(descriptor)) {
      return true;
    }
  }
  return false;
}

function processTabs() {
  if (!isEnabled) return;
  getNavLinks().forEach((link) => {
    if (link.dataset.instafnProcessed === "true") return;
    if (matchesDisabledRule(link)) {
      hideTab(link);
    }
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

function injectEarlyHideCSS(disabledTabsSet) {
  // Remove existing style if any
  if (injectedStyleElement) {
    injectedStyleElement.remove();
    injectedStyleElement = null;
  }

  if (disabledTabsSet.size === 0) return;

  // Generate CSS rules to hide tabs immediately based on disabled tabs
  const cssRules = [];

  if (disabledTabsSet.has("search")) {
    cssRules.push(`
      a[role="link"][href="#"]:has(svg[aria-label="Search"]),
      a[role="link"][href="/"]:has(svg[aria-label="Search"]),
      a[role="link"][aria-label="Search"],
      a[role="link"][href="#"]:has(svg[aria-label*="Search" i]),
      a[role="link"][href="/"]:has(svg[aria-label*="Search" i]) {
        display: none !important;
      }
    `);
  }

  if (disabledTabsSet.has("explore")) {
    cssRules.push(`
      a[role="link"][href="/explore/"],
      a[role="link"][href="/explore"],
      a[role="link"][aria-label="Explore"],
      a[role="link"][aria-label*="Explore" i],
      a[role="link"]:has(svg[aria-label="Explore"]),
      a[role="link"]:has(svg[aria-label*="Explore" i]) {
        display: none !important;
      }
    `);
  }

  if (disabledTabsSet.has("reels")) {
    cssRules.push(`
      a[role="link"][href="/reels/"],
      a[role="link"][href="/reels"],
      a[role="link"][aria-label="Reels"],
      a[role="link"][aria-label*="Reels" i],
      a[role="link"]:has(svg[aria-label="Reels"]),
      a[role="link"]:has(svg[aria-label*="Reels" i]) {
        display: none !important;
      }
    `);
  }

  if (disabledTabsSet.has("messages")) {
    cssRules.push(`
      a[role="link"][href*="/direct/inbox/"],
      a[role="link"][href*="/direct/"],
      a[role="link"][aria-label*="Direct messaging" i],
      a[role="link"][aria-label*="Direct" i],
      a[role="link"]:has(svg[aria-label*="Direct messaging" i]),
      a[role="link"]:has(svg[aria-label*="Direct" i]) {
        display: none !important;
      }
    `);
  }

  if (disabledTabsSet.has("notifications")) {
    cssRules.push(`
      a[role="link"][href="#"]:has(svg[aria-label="Notifications"]),
      a[role="link"][aria-label="Notifications"],
      a[role="link"][aria-label*="Notification" i],
      a[role="link"]:has(svg[aria-label="Notifications"]),
      a[role="link"]:has(svg[aria-label*="Notification" i]) {
        display: none !important;
      }
    `);
  }

  if (disabledTabsSet.has("create")) {
    cssRules.push(`
      a[role="link"][href="#"]:has(svg[aria-label="New post"]),
      a[role="link"][aria-label="New post"],
      a[role="link"][aria-label*="New post" i],
      a[role="link"][aria-label*="Create" i],
      a[role="link"]:has(svg[aria-label="New post"]),
      a[role="link"]:has(svg[aria-label*="New post" i]),
      a[role="link"]:has(svg[aria-label*="Create" i]) {
        display: none !important;
      }
    `);
  }

  if (disabledTabsSet.has("profile")) {
    cssRules.push(`
      a[role="link"][href^="/"]:not([href="/"]):not([href="/explore/"]):not([href="/explore"]):not([href="/reels/"]):not([href="/reels"]):has(img[alt*="profile picture" i]),
      a[role="link"][aria-label="Profile"]:has(img[alt*="profile picture" i]),
      a[role="link"][aria-label*="Profile" i]:has(img[alt*="profile picture" i]) {
        display: none !important;
      }
    `);
  }

  if (disabledTabsSet.has("moreFromMeta")) {
    cssRules.push(`
      a[role="link"][href="#"]:has(svg[aria-label="Also from Meta"]),
      a[role="link"][aria-label="Also from Meta"],
      a[role="link"][aria-label*="Also from Meta" i],
      a[role="link"]:has(svg[aria-label*="Also from Meta" i]) {
        display: none !important;
      }
    `);
  }

  if (cssRules.length > 0) {
    // Remove existing style first
    const existing = document.getElementById("instafn-tab-disabler-early");
    if (existing) {
      existing.remove();
    }

    const style = document.createElement("style");
    style.id = "instafn-tab-disabler-early";
    style.textContent = cssRules.join("\n");
    
    // Inject immediately - try head first, then documentElement, then body
    const injectStyle = () => {
      const target = document.head || document.documentElement || document.body;
      if (target) {
        // Check if already exists to avoid duplicates
        if (!document.getElementById("instafn-tab-disabler-early")) {
          target.appendChild(style);
          injectedStyleElement = style;
        }
        return true;
      }
      return false;
    };

    if (!injectStyle()) {
      // If injection failed, try again when DOM is ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectStyle, { once: true });
        // Also try immediately in case documentElement exists
        setTimeout(injectStyle, 0);
      } else {
        injectStyle();
      }
    }
  }
}

export function initTabDisablerEarly(settings) {
  // Build disabled tabs set
  const disabledTabsSet = new Set();
  TAB_RULES.forEach(({ key }) => {
    if (settings[`disableTab${key[0].toUpperCase()}${key.slice(1)}`]) {
      disabledTabsSet.add(key);
    }
  });

  // Inject CSS immediately to prevent flash
  if (disabledTabsSet.size > 0) {
    injectEarlyHideCSS(disabledTabsSet);
  } else {
    // Remove CSS if no tabs are disabled
    if (injectedStyleElement) {
      injectedStyleElement.remove();
      injectedStyleElement = null;
    }
  }
}

export function initTabDisabler(settings) {
  disabledTabs.clear();
  stopObserver();

  TAB_RULES.forEach(({ key }) => {
    if (settings[`disableTab${key[0].toUpperCase()}${key.slice(1)}`]) {
      disabledTabs.add(key);
    }
  });

  isEnabled = disabledTabs.size > 0;

  // Update early CSS injection
  if (isEnabled) {
    injectEarlyHideCSS(disabledTabs);
  } else {
    // Remove CSS if no tabs are disabled
    if (injectedStyleElement) {
      injectedStyleElement.remove();
      injectedStyleElement = null;
    }
  }

  if (!isEnabled) {
    document.querySelectorAll('[data-instafn-hidden="true"]').forEach((el) => {
      el.style.display = "";
      delete el.dataset.instafnHidden;
    });
    document
      .querySelectorAll('[data-instafn-processed="true"]')
      .forEach((el) => {
        delete el.dataset.instafnProcessed;
      });
    return;
  }

  document.querySelectorAll('[data-instafn-processed="true"]').forEach((el) => {
    delete el.dataset.instafnProcessed;
  });

  const runProcessing = () => {
    processTabs();
    startObserver();
  };

  if (document.body) {
    runProcessing();
    setTimeout(processTabs, 500);
  } else {
    const bodyObserver = new MutationObserver(() => {
      if (document.body) {
        runProcessing();
        bodyObserver.disconnect();
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true });
  }
}
