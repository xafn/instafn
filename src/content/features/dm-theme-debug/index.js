// DM Theme Debugger
// When a chat is open, fetch the thread theme and surface it in the DM header.

const THEME_BADGE_ID = "instafn-theme-badge";
let lastThreadId = null;
let lastTheme = null;
let navObserver = null;
let badgeRefreshInterval = null;

function parseThreadIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/\/direct\/t\/(\d+)/);
  return match ? match[1] : null;
}

function findHeaderContainer() {
  const infoIcon = document.querySelector('svg[aria-label="Conversation information"]');
  const audioIcon = document.querySelector('svg[aria-label="Audio call"]');
  const videoIcon = document.querySelector('svg[aria-label="Video call"]');

  const anchor = document.querySelector('a[aria-label^="Open the profile page"]');

  const anchorHeader = anchor?.closest("div");
  if (anchorHeader && (audioIcon || videoIcon || infoIcon)) {
    return anchorHeader;
  }

  const iconParent =
    infoIcon?.closest("div") ||
    audioIcon?.closest("div") ||
    videoIcon?.closest("div") ||
    null;

  if (!iconParent) return null;

  let node = iconParent;
  for (let i = 0; i < 4 && node; i++) {
    if (node.querySelector("h2")) return node;
    node = node.parentElement;
  }

  return iconParent;
}

function ensureBadgeContainer() {
  const header = findHeaderContainer();
  if (!header) return null;

  let badge = header.querySelector(`#${THEME_BADGE_ID}`);
  if (!badge) {
    badge = document.createElement("div");
    badge.id = THEME_BADGE_ID;
    badge.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:6px",
      "padding:4px 8px",
      "border-radius:12px",
      "font-size:12px",
      "font-weight:600",
      "color:#fff",
      "background:#111",
      "border:1px solid rgba(255,255,255,0.2)",
      "margin-left:8px",
      "max-width:220px",
      "white-space:nowrap",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "flex-shrink:0",
    ].join(";");

    const title = header.querySelector("h2");
    if (title && title.parentElement) {
      title.parentElement.appendChild(badge);
    } else {
      header.appendChild(badge);
    }
  }

  return badge;
}

function renderBadge(theme) {
  const badge = ensureBadgeContainer();
  if (!badge) return;

  const name =
    theme?.name ||
    theme?.theme_name ||
    theme?.title ||
    theme?.label ||
    theme?.friendly_name ||
    "Unknown";

  const id =
    theme?.id ||
    theme?.theme_id ||
    theme?.thread_theme_id ||
    theme?.thread_id ||
    "n/a";

  const colors = Array.isArray(theme?.colors) ? theme.colors : theme?.gradient;

  if (colors && Array.isArray(colors) && colors.length >= 2) {
    badge.style.background = `linear-gradient(90deg, ${colors.join(", ")})`;
    badge.style.color = "#fff";
    badge.style.borderColor = "rgba(255,255,255,0.35)";
  } else {
    badge.style.background = "#111";
    badge.style.color = "#fff";
    badge.style.borderColor = "rgba(255,255,255,0.2)";
  }

  badge.textContent = `Theme: ${name} (#${id})`;
}

function clearBadge() {
  const badge = document.getElementById(THEME_BADGE_ID);
  if (badge?.parentNode) {
    badge.parentNode.removeChild(badge);
  }
}

function extractTheme(threadPayload) {
  if (!threadPayload) return null;
  return (
    threadPayload.theme ||
    threadPayload.thread_theme ||
    threadPayload.thread_theme_info ||
    threadPayload.thread_theme_data ||
    threadPayload.theme_info ||
    null
  );
}

function extractThemeFromResponse(data) {
  // Deep search for theme data in various response structures
  function searchForTheme(obj, depth = 0) {
    if (depth > 5) return null;
    if (!obj || typeof obj !== "object") return null;
    
    // Direct theme fields
    if (obj.theme || obj.thread_theme || obj.thread_theme_info) {
      return obj.theme || obj.thread_theme || obj.thread_theme_info;
    }
    
    // Check for theme in arrays
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = searchForTheme(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    
    // Recursive search
    for (const key in obj) {
      if (key.toLowerCase().includes("theme")) {
        const val = obj[key];
        if (val && typeof val === "object") {
          return val;
        }
      }
      const found = searchForTheme(obj[key], depth + 1);
      if (found) return found;
    }
    
    return null;
  }
  
  return searchForTheme(data);
}

let themeRequestInterceptor = null;
let originalFetch = null;

function setupThemeInterceptor(threadId) {
  // Only set up once
  if (themeRequestInterceptor) return;
  
  if (!originalFetch) {
    originalFetch = window.fetch;
  }
  
  themeRequestInterceptor = true;
  
  window.fetch = async function(...args) {
    const [url, options = {}] = args;
    
    // Check if this is a GraphQL request
    if (
      typeof url === "string" &&
      url.includes("/api/graphql")
    ) {
      const bodyStr = typeof options.body === "string" 
        ? options.body 
        : (options.body instanceof URLSearchParams ? options.body.toString() : "");
      
      // Check if it's the theme query or contains thread_id
      if (
        bodyStr.includes("MWPThreadThemeProviderQuery") ||
        (bodyStr.includes("thread_theme") && bodyStr.includes(threadId))
      ) {
        try {
          const response = await originalFetch.apply(this, args);
          const clonedResponse = response.clone();
          
          // Try to parse as JSON
          try {
            const data = await clonedResponse.json();
            const theme = extractThemeFromResponse(data);
            
            if (theme) {
              lastTheme = theme;
              renderBadge(theme);
              console.log("[Instafn] Current chat theme:", theme);
            }
          } catch (parseErr) {
            // Response might not be JSON, that's okay
          }
          
          return response;
        } catch (err) {
          // Continue with original request on error
        }
      }
    }
    
    return originalFetch.apply(this, args);
  };
}

function cleanupThemeInterceptor() {
  if (themeRequestInterceptor && originalFetch) {
    window.fetch = originalFetch;
    themeRequestInterceptor = false;
  }
}

async function fetchThreadTheme(threadId) {
  if (!threadId) return;

  // Set up interceptor to catch Instagram's own GraphQL requests
  setupThemeInterceptor(threadId);
  
  // Also try to find theme data in the DOM or window object
  // Instagram sometimes stores thread data in window.__additionalData or similar
  try {
    if (window.__additionalData) {
      const theme = extractThemeFromResponse(window.__additionalData);
      if (theme) {
        lastTheme = theme;
        renderBadge(theme);
        console.log("[Instafn] Current chat theme:", theme);
        return;
      }
    }
  } catch (_) {}
  
  // Clean up interceptor after 15 seconds if no theme found
  setTimeout(() => {
    if (lastTheme) {
      cleanupThemeInterceptor();
    }
  }, 15000);
}

function handleNavigation() {
  const threadId = parseThreadIdFromPath();
  if (threadId !== lastThreadId) {
    // Clean up previous interceptor
    cleanupThemeInterceptor();
    
    lastThreadId = threadId;
    lastTheme = null;
    clearBadge();
    if (threadId) {
      fetchThreadTheme(threadId);
    } else {
      // Not on a DM page, clean up
      cleanupThemeInterceptor();
    }
  }
}

export function initDMThemeDebug() {
  handleNavigation();

  if (!navObserver) {
    navObserver = new MutationObserver(() => {
      handleNavigation();
    });
    navObserver.observe(document, { subtree: true, childList: true });
  }

  if (!badgeRefreshInterval) {
    badgeRefreshInterval = setInterval(() => {
      if (lastThreadId && lastTheme) {
        renderBadge(lastTheme);
      }
    }, 1000);
  }
}

