// DM Popup Hider: Hide the floating DM menu that appears when clicking home from DMs
// Also blocks API calls that mark messages as read when not on DM page

let isEnabled = false;
let observer = null;
let debugMode = false; // Set to true to log DM-related requests for debugging

function hideDMPopup() {
  if (!isEnabled) return;

  // Check if we're on the main DM page - if so, don't hide anything
  const isOnDMPage = window.location.pathname.includes('/direct/');
  if (isOnDMPage) return;

  // Find the DM popup menu - it's a floating window with conversation content
  // Look for elements with aria-label containing "Conversation with" or similar DM indicators
  const dmPopups = document.querySelectorAll('div[aria-label*="Conversation"], div[aria-label*="conversation"]');
  
  dmPopups.forEach((popup) => {
    // Check if this is the floating DM popup (not the main DM page)
    // The popup has specific styling with width/height CSS variables
    const container = popup.closest('div[style*="--x-height"][style*="--x-width"]');
    if (container && !container.dataset.instafnDmPopupHidden) {
      // Hide the popup
      container.style.display = 'none';
      container.dataset.instafnDmPopupHidden = 'true';
    }
  });

  // Also look for the specific structure from the HTML provided
  // The popup has classes like x7r02ix and contains message content
  const potentialPopups = document.querySelectorAll('div.x7r02ix');
  potentialPopups.forEach((popup) => {
    // Skip if already hidden
    if (popup.dataset.instafnDmPopupHidden) return;
    
    // Check if it contains DM conversation elements
    const hasConversation = popup.querySelector('div[aria-label*="Conversation"]') ||
                           popup.querySelector('div[data-pagelet="IGDOpenMessageList"]') ||
                           popup.querySelector('div[aria-label*="Messages in conversation"]') ||
                           popup.querySelector('div[data-scope="messages_table"]');
    
    // Also check for the specific width/height styling that indicates it's a floating popup
    const hasPopupStyling = popup.style.getPropertyValue('--x-height') && 
                           popup.style.getPropertyValue('--x-width');
    
    if (hasConversation || hasPopupStyling) {
      popup.style.display = 'none';
      popup.dataset.instafnDmPopupHidden = 'true';
    }
  });

  // Hide the floating messages button/indicator that appears even when no DMs are loaded
  // This is the button with aria-label containing "Messages" and notification count
  // Look for buttons with aria-label like "Messages - X new notifications"
  const messagesButtons = document.querySelectorAll('button[aria-label*="Messages"], div[aria-label*="Messages"][role="button"]');
  messagesButtons.forEach((button) => {
    if (button.dataset.instafnDmPopupHidden) return;
    
    // Check if it's the floating messages button (has notification badge, user avatars, or messages icon)
    const hasNotificationBadge = button.querySelector('span[class*="xwmz7sl"], span[class*="x1gabggj"], div[class*="x4fivb0"]');
    const hasUserAvatars = button.querySelector('img[alt="User avatar"]');
    const hasMessagesIcon = button.querySelector('svg[aria-label="Messages"]');
    const hasMessagesText = Array.from(button.querySelectorAll('span')).some(span => span.textContent?.trim() === 'Messages');
    
    // Check if it's in a floating container or has the floating button class
    const container = button.closest('div.x3h4tne, div.x145d82y, div.xixxii4');
    const isFloatingButton = button.classList.contains('x7r02ix') || 
                            (container && (container.classList.contains('x3h4tne') || container.classList.contains('x145d82y') || container.classList.contains('xixxii4')));
    
    if ((hasNotificationBadge || hasUserAvatars || hasMessagesIcon || hasMessagesText) && isFloatingButton) {
      // Hide the container if it exists, otherwise hide the button
      if (container && !container.dataset.instafnDmPopupHidden) {
        container.style.display = 'none';
        container.dataset.instafnDmPopupHidden = 'true';
      } else if (!button.dataset.instafnDmPopupHidden) {
        button.style.display = 'none';
        button.dataset.instafnDmPopupHidden = 'true';
      }
    }
  });

  // Also look for the container div with classes x3h4tne x145d82y xixxii4 (the outer container)
  const floatingMessageContainers = document.querySelectorAll('div.x3h4tne.x145d82y.xixxii4');
  floatingMessageContainers.forEach((container) => {
    if (container.dataset.instafnDmPopupHidden) return;
    
    // Check if it contains messages-related content
    const hasMessagesContent = container.querySelector('button[aria-label*="Messages"]') ||
                               container.querySelector('svg[aria-label="Messages"]') ||
                               Array.from(container.querySelectorAll('span')).some(span => span.textContent?.trim() === 'Messages');
    
    if (hasMessagesContent) {
      container.style.display = 'none';
      container.dataset.instafnDmPopupHidden = 'true';
    }
  });
}

function startObserver() {
  if (observer) return;
  
  observer = new MutationObserver(() => {
    hideDMPopup();
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

let lastUrl = location.href;
let originalFetch = null;
let originalXHRSend = null;
let originalXHROpen = null;

// Debug helper to log DM-related requests
function logDMRequest(type, url, body, method = 'POST') {
  if (!debugMode) return;
  
  const isDMRelated = 
    (url && (url.includes('/direct/') || url.includes('direct') || url.includes('message') || url.includes('chat'))) ||
    (body && typeof body === 'string' && (
      body.includes('direct') || 
      body.includes('message') || 
      body.includes('chat') ||
      body.includes('read') ||
      body.includes('seen') ||
      body.includes('thread') ||
      body.includes('inbox')
    ));
  
  if (isDMRelated) {
    console.log(`[Instafn DM Debug] ${type} Request:`, {
      method,
      url: url || 'N/A',
      body: body ? (body.length > 500 ? body.substring(0, 500) + '...' : body) : 'N/A',
      timestamp: new Date().toISOString(),
      pathname: window.location.pathname
    });
  }
}

// Block DM read/seen API calls when not on DM page
function shouldBlockDMRequest(url, body) {
  if (!isEnabled) return false;
  
  // Don't block if we're on the DM page
  const isOnDMPage = window.location.pathname.includes('/direct/');
  if (isOnDMPage) return false;
  
  // Check URL patterns
  if (url) {
    const urlStr = url.toString();
    if (
      urlStr.includes('/direct/') ||
      urlStr.includes('direct_inbox') ||
      urlStr.includes('direct_v2') ||
      urlStr.includes('ig_direct') ||
      urlStr.includes('threads') ||
      (urlStr.includes('graphql') && (urlStr.includes('direct') || urlStr.includes('message')))
    ) {
      // Check if it's a read/seen request
      if (body && typeof body === 'string') {
        const bodyLower = body.toLowerCase();
        if (
          bodyLower.includes('mark_as_read') ||
          bodyLower.includes('markasread') ||
          bodyLower.includes('seen') ||
          bodyLower.includes('read_receipt') ||
          bodyLower.includes('readreceipt') ||
          bodyLower.includes('thread_id') ||
          bodyLower.includes('threadid')
        ) {
          return true;
        }
      } else {
        // If no body but URL suggests DM read operation, block it
        if (urlStr.includes('read') || urlStr.includes('seen')) {
          return true;
        }
      }
    }
  }
  
  // Check body patterns
  if (body && typeof body === 'string') {
    const bodyLower = body.toLowerCase();
    if (
      bodyLower.includes('mark_as_read') ||
      bodyLower.includes('markasread') ||
      bodyLower.includes('read_receipt') ||
      bodyLower.includes('readreceipt') ||
      (bodyLower.includes('direct') && (bodyLower.includes('read') || bodyLower.includes('seen')))
    ) {
      return true;
    }
  }
  
  return false;
}

export function initDMPopupHider(settings) {
  isEnabled = settings.hideDMPopup;
  debugMode = settings.debugDMPopup || false; // Add this to settings if needed
  
  if (isEnabled) {
    // Hide existing popups immediately
    if (document.body) {
      hideDMPopup();
    }
    
    // Also hide after a short delay to catch dynamically loaded popups
    setTimeout(() => {
      hideDMPopup();
    }, 500);
    
    // Start observing for new popups
    if (document.body) {
      startObserver();
    } else {
      // Wait for body to be ready
      const bodyObserver = new MutationObserver(() => {
        if (document.body) {
          hideDMPopup();
          startObserver();
          bodyObserver.disconnect();
        }
      });
      bodyObserver.observe(document.documentElement, { childList: true });
    }
    
    // Watch for URL changes (e.g., navigating from DMs to home)
    const urlObserver = new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        // Hide popup when URL changes (especially when leaving DMs)
        setTimeout(() => {
          hideDMPopup();
        }, 100);
      }
    });
    urlObserver.observe(document, { subtree: true, childList: true });
    
    // Intercept and block DM read/seen API calls
    if (!originalFetch) {
      originalFetch = window.fetch;
      window.fetch = function(...args) {
        const [url, options = {}] = args;
        const body = options.body || '';
        const method = options.method || 'GET';
        
        logDMRequest('FETCH', url, typeof body === 'string' ? body : body.toString(), method);
        
        if (shouldBlockDMRequest(url, typeof body === 'string' ? body : body.toString())) {
          console.log('[Instafn] Blocked DM read/seen request via fetch:', url);
          // Return a resolved promise with empty response to prevent errors
          return Promise.resolve(new Response(null, { status: 200, statusText: 'OK' }));
        }
        
        return originalFetch.apply(this, args);
      };
    }
    
    if (!originalXHROpen) {
      originalXHROpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._instafnDmUrl = url;
        this._instafnDmMethod = method;
        return originalXHROpen.apply(this, [method, url, ...rest]);
      };
    }
    
    if (!originalXHRSend) {
      originalXHRSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.send = function(body) {
        const url = this._instafnDmUrl;
        const method = this._instafnDmMethod || 'GET';
        const bodyStr = body ? (typeof body === 'string' ? body : body.toString()) : '';
        
        logDMRequest('XHR', url, bodyStr, method);
        
        if (shouldBlockDMRequest(url, bodyStr)) {
          console.log('[Instafn] Blocked DM read/seen request via XHR:', url);
          // Don't send the request
          return;
        }
        
        return originalXHRSend.apply(this, [body]);
      };
    }
  } else {
    // Re-show any hidden popups if feature is disabled
    document.querySelectorAll('[data-instafn-dm-popup-hidden="true"]').forEach((el) => {
      el.style.display = '';
      delete el.dataset.instafnDmPopupHidden;
    });
    stopObserver();
    
    // Restore original fetch/XHR if they were intercepted
    if (originalFetch) {
      window.fetch = originalFetch;
      originalFetch = null;
    }
    if (originalXHROpen) {
      XMLHttpRequest.prototype.open = originalXHROpen;
      originalXHROpen = null;
    }
    if (originalXHRSend) {
      XMLHttpRequest.prototype.send = originalXHRSend;
      originalXHRSend = null;
    }
  }
}

// Export debug function to enable from console
export function enableDMDebug() {
  debugMode = true;
  console.log('[Instafn] DM request debugging enabled. Check console for DM-related network requests.');
  console.log('[Instafn] Navigate to home page and watch for DM read/seen requests.');
  console.log('[Instafn] Look for requests with patterns like: mark_as_read, read_receipt, seen, etc.');
}

