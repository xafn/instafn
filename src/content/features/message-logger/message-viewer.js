/**
 * Message Viewer UI
 * 
 * Adds a button to view all logged messages in a modal
 */

import { createModal } from '../../ui/modal.js';

const ARCHIVE_ICON_PATH =
  '<polyline points="21 8 21 21 3 21 3 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline><rect x="1" y="3" width="22" height="5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></rect><line x1="10" y1="12" x2="14" y2="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></line>';

let messageViewerButton = null;
let messageViewerModal = null;

// Get all deleted messages from the store
function getDeletedMessages() {
  // Access the deletedMessagesStore from the message logger
  if (window.Instafn && window.Instafn.getDeletedMessagesStore) {
    const store = window.Instafn.getDeletedMessagesStore();
    return store instanceof Map ? store : new Map();
  }
  return new Map();
}

// Get thread name map from storage
function getThreadNameMap() {
  try {
    const stored = localStorage.getItem("instafn_thread_names");
    if (stored) {
      const mapArray = JSON.parse(stored);
      const map = new Map();
      mapArray.forEach(([threadId, threadName]) => {
        map.set(String(threadId), threadName);
      });
      return map;
    }
  } catch (e) {
    console.error("[Instafn Message Viewer] Error loading thread name map:", e);
  }
  return new Map();
}

// Get sender username map from storage
function getSenderUsernameMap() {
  try {
    const stored = localStorage.getItem("instafn_sender_usernames");
    if (stored) {
      const mapArray = JSON.parse(stored);
      const map = new Map();
      mapArray.forEach(([fbid, username]) => {
        map.set(String(fbid), username);
      });
      return map;
    }
  } catch (e) {
    console.error("[Instafn Message Viewer] Error loading sender username map:", e);
  }
  return new Map();
}

// Get current user Facebook ID from storage
function getCurrentUserFbid() {
  try {
    return localStorage.getItem("instafn_current_user_fbid");
  } catch (e) {
    return null;
  }
}

// Determine if a thread is a DM or group chat and get display name
function getThreadDisplayName(msg, threadNameMap, senderUsernameMap, currentUserFbid) {
  // Try all possible thread ID fields
  const threadId = msg.threadId || msg.threadFbid || msg.thread;
  
  if (!threadId) {
    return "Unknown";
  }
  
  const threadIdStr = String(threadId);
  
  // Try multiple variations of the thread ID to check thread name map
  const threadIdVariations = [
    threadIdStr,
    String(msg.threadId || ""),
    String(msg.threadFbid || ""),
    String(msg.thread || "")
  ].filter(id => id && id !== "undefined" && id !== "null");
  
  // Check if we have a thread name entry in the map (try all variations)
  // If an entry exists (even if empty string), it's a group chat
  let threadName = null;
  let hasThreadNameEntry = false;
  
  for (const idVar of threadIdVariations) {
    if (threadNameMap.has(idVar)) {
      hasThreadNameEntry = true;
      threadName = threadNameMap.get(idVar);
      break;
    }
  }
  
  if (hasThreadNameEntry) {
    // We have an entry in thread name map - this means it's a group chat
    if (threadName && threadName.trim() !== "") {
      // Group chat with a name - show the name
      return threadName;
    } else {
      // Group chat without a name - show the thread ID
      return threadIdStr;
    }
  } else {
    // No entry in thread name map - this is likely a DM
    // For DMs, the thread ID is often the other person's Facebook ID
    // Try to look it up in the sender username map
    
    // First, try the thread ID directly as a username lookup
    const threadIdUsername = senderUsernameMap.get(threadIdStr);
    if (threadIdUsername) {
      return `${threadIdUsername}'s DMs`;
    }
    
    // If that doesn't work, try to determine the other user from the sender
    const senderFbid = String(msg.originalSender || "");
    
    if (senderFbid && currentUserFbid) {
      // Determine the other user's Facebook ID
      let otherUserFbid = null;
      
      if (senderFbid === currentUserFbid) {
        // Current user sent it - the other person is the thread ID
        otherUserFbid = threadIdStr;
      } else {
        // Other person sent it - use their sender ID
        otherUserFbid = senderFbid;
      }
      
      // Try to get username from sender map using the other user's ID
      if (otherUserFbid !== threadIdStr) {
        const username = senderUsernameMap.get(otherUserFbid);
        if (username) {
          return `${username}'s DMs`;
        }
      }
    }
    
    // Last resort: show thread ID (not "ID's DMs" since we don't know the username)
    return threadIdStr;
  }
}

// Format timestamp
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';
  
  const ts = parseInt(timestamp);
  if (isNaN(ts)) return 'Invalid';
  
  const date = new Date(ts);
  return date.toLocaleString();
}

// Create the message viewer modal
async function createMessageViewerModal() {
  // Remove existing modal if present
  if (messageViewerModal) {
    messageViewerModal.remove();
    messageViewerModal = null;
  }
  
  // Create modal using the abstract modal component
  const overlay = await createModal('Deleted Messages', { showTabs: false });
  messageViewerModal = overlay;
  
  const modal = overlay.querySelector('.instafn-modal');
  // Make the modal wider
  modal.classList.add('instafn-modal--wide');
  const content = overlay.querySelector('.instafn-content');
  
  // Table container
  const tableContainer = document.createElement('div');
  tableContainer.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 0;
  `;
  
  // Table
  const table = document.createElement('table');
  table.style.cssText = `
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-family-system);
    table-layout: auto;
  `;
  
  // Table header
  const thead = document.createElement('thead');
  thead.style.cssText = `
    position: sticky;
    top: 0;
    background: rgb(var(--ig-elevated-background));
    z-index: 10;
    border-bottom: 2px solid rgba(var(--ig-primary-text), 0.1);
  `;
  
  const headerRow = document.createElement('tr');
  const headers = ['Message', 'By', 'Thread', 'Timestamp', ''];
  headers.forEach((headerText, index) => {
    const th = document.createElement('th');
    th.textContent = headerText;
    th.style.cssText = `
      padding: 12px 16px;
      text-align: ${index === headers.length - 1 ? 'center' : 'left'};
      font-weight: var(--font-weight-system-semibold);
      font-size: var(--system-13-font-size);
      color: rgb(var(--ig-secondary-text));
      text-transform: ${headerText ? 'uppercase' : 'none'};
      letter-spacing: 0.5px;
      font-family: var(--font-family-system);
    `;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  
  // Table body
  const tbody = document.createElement('tbody');
  
  // Get all deleted messages
  const deletedMessages = getDeletedMessages();
  // Get thread name map and sender username map from storage
  const threadNameMap = getThreadNameMap();
  const senderUsernameMap = getSenderUsernameMap();
  const currentUserFbid = getCurrentUserFbid();
  
  const messageArray = Array.from(deletedMessages.entries())
    .map(([id, msg]) => ({ id, ...msg }))
    .sort((a, b) => {
      const tsA = parseInt(a.deletedAt || a.timestamp) || 0;
      const tsB = parseInt(b.deletedAt || b.timestamp) || 0;
      return tsB - tsA; // Newest first
    });
  
  if (messageArray.length === 0) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = headers.length;
    emptyCell.textContent = 'No deleted messages yet';
    emptyCell.style.cssText = `
      padding: 40px;
      text-align: center;
      color: rgb(var(--ig-secondary-text));
      font-size: var(--system-14-font-size);
      font-family: var(--font-family-system);
    `;
    emptyRow.appendChild(emptyCell);
    tbody.appendChild(emptyRow);
  } else {
    messageArray.forEach((msg, index) => {
      const row = document.createElement('tr');
      row.style.cssText = `
        border-bottom: 1px solid rgba(var(--ig-primary-text), 0.1);
        transition: background 0.15s;
      `;
      row.onmouseover = () => {
        row.style.background = 'rgb(var(--ig-highlight-background))';
      };
      row.onmouseout = () => {
        row.style.background = 'transparent';
      };
      
      // Message cell
      const messageCell = document.createElement('td');
      const messageText = msg.text || '(no text)';
      messageCell.textContent = messageText;
      messageCell.style.cssText = `
        padding: 12px 16px;
        font-size: var(--system-13-font-size);
        color: rgb(var(--ig-primary-text));
        word-break: break-word;
        font-family: var(--font-family-system);
        font-weight: var(--font-weight-system-medium);
        min-width: 200px;
        max-width: none;
      `;
      if (messageText.length > 150) {
        messageCell.textContent = messageText.substring(0, 150) + '...';
        messageCell.title = messageText;
      }
      row.appendChild(messageCell);
      
      // By cell - look up username from originalSender
      const byCell = document.createElement('td');
      const senderFbid = String(msg.originalSender || '');
      let deletedByDisplay = 'Unknown';
      
      if (senderFbid) {
        // Check if sender is current user
        if (currentUserFbid && senderFbid === currentUserFbid) {
          deletedByDisplay = 'You';
        } else {
          // Look up username from sender map
          const username = senderUsernameMap.get(senderFbid);
          if (username) {
            deletedByDisplay = username;
          } else {
            // No username found - show the sender ID
            deletedByDisplay = senderFbid;
          }
        }
      }
      
      byCell.textContent = deletedByDisplay;
      byCell.style.cssText = `
        padding: 12px 16px;
        font-size: var(--system-13-font-size);
        color: rgb(var(--ig-primary-text));
        font-family: var(--font-family-system);
        white-space: nowrap;
        min-width: 120px;
      `;
      row.appendChild(byCell);
      
      // Thread cell - get display name from storage
      const threadCell = document.createElement('td');
      // Always look up from storage to get the most up-to-date name
      // This handles cases where thread names were added after the message was deleted
      let displayThreadName = getThreadDisplayName(msg, threadNameMap, senderUsernameMap, currentUserFbid);
      
      // Debug logging for troubleshooting
      const threadId = msg.threadId || msg.threadFbid || msg.thread;
      if (threadId) {
        console.log(
          `[Instafn Message Viewer] 🔍 Thread lookup for ID: ${threadId}, ` +
          `threadNameMap has entry: ${threadNameMap.has(String(threadId))}, ` +
          `senderUsernameMap has entry: ${senderUsernameMap.has(String(threadId))}, ` +
          `result: "${displayThreadName}"`
        );
      }
      
      // If we got a stored threadName that's not "Unknown", prefer it (it might be more accurate)
      if (msg.threadName && 
          msg.threadName !== 'Unknown' && 
          msg.threadName !== 'Unknown Thread' &&
          msg.threadName !== 'Messages' &&
          !msg.threadName.endsWith("'s DMs")) {
        // Check if the stored name exists in our map (it's a group chat name)
        if (threadId && threadNameMap.has(String(threadId))) {
          displayThreadName = msg.threadName;
        }
      }
      
      threadCell.textContent = displayThreadName;
      threadCell.style.cssText = `
        padding: 12px 16px;
        font-size: var(--system-13-font-size);
        color: rgb(var(--ig-primary-text));
        font-family: var(--font-family-system);
        min-width: 150px;
      `;
      if (displayThreadName.length > 40) {
        threadCell.textContent = displayThreadName.substring(0, 40) + '...';
        threadCell.title = displayThreadName;
      }
      row.appendChild(threadCell);
      
      // Timestamp cell
      const timestampCell = document.createElement('td');
      timestampCell.textContent = formatTimestamp(msg.timestamp);
      timestampCell.style.cssText = `
        padding: 12px 16px;
        font-size: var(--system-13-font-size);
        color: rgb(var(--ig-secondary-text));
        font-family: var(--font-family-system);
        white-space: nowrap;
        min-width: 180px;
      `;
      row.appendChild(timestampCell);
      
      // Delete button cell
      const deleteCell = document.createElement('td');
      deleteCell.style.cssText = `
        padding: 12px 16px;
        text-align: center;
        width: 48px;
      `;
      const deleteButton = document.createElement('button');
      deleteButton.innerHTML = `
        <svg aria-label="Delete" fill="currentColor" height="16" role="img" viewBox="0 0 24 24" width="16">
          <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="3" y2="21"></line>
          <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="21" y2="3"></line>
        </svg>
      `;
      deleteButton.setAttribute('aria-label', 'Delete message');
      deleteButton.style.cssText = `
        background: transparent;
        color: rgb(var(--ig-secondary-text));
        border: none;
        border-radius: 50%;
        padding: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        width: 32px;
        height: 32px;
      `;
      deleteButton.onmouseover = () => {
        deleteButton.style.background = 'rgba(var(--ig-primary-text), 0.1)';
        deleteButton.style.color = 'rgb(var(--ig-primary-text))';
      };
      deleteButton.onmouseout = () => {
        deleteButton.style.background = 'transparent';
        deleteButton.style.color = 'rgb(var(--ig-secondary-text))';
      };
      deleteButton.onclick = async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete this message from the log?`)) {
          // Remove from deleted messages store
          if (window.Instafn && window.Instafn.getDeletedMessagesStore) {
            const store = window.Instafn.getDeletedMessagesStore();
            if (store instanceof Map) {
              store.delete(msg.id);
              // Save to localStorage
              if (window.Instafn && window.Instafn.saveDeletedMessages) {
                window.Instafn.saveDeletedMessages();
              }
            }
          }
          // Remove row from table
          row.remove();
          // If no more messages, show empty state
          if (tbody.children.length === 0) {
            const emptyRow = document.createElement('tr');
            const emptyCell = document.createElement('td');
            emptyCell.colSpan = headers.length;
            emptyCell.textContent = 'No deleted messages yet';
            emptyCell.style.cssText = `
              padding: 40px;
              text-align: center;
              color: rgb(var(--ig-secondary-text));
              font-size: var(--system-14-font-size);
              font-family: var(--font-family-system);
            `;
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
          }
        }
      };
      deleteCell.appendChild(deleteButton);
      row.appendChild(deleteCell);
      
      tbody.appendChild(row);
    });
  }
  
  table.appendChild(thead);
  table.appendChild(tbody);
  tableContainer.appendChild(table);
  
  // Assemble modal content
  content.appendChild(tableContainer);
  
  // Update close handler to clear reference
  const closeBtn = overlay.querySelector('.instafn-close');
  if (closeBtn) {
    const originalHandler = closeBtn.onclick;
    closeBtn.onclick = () => {
      if (originalHandler) originalHandler();
      messageViewerModal = null;
    };
  }
  
  return overlay;
}

// Create the message viewer button
function createMessageViewerButton() {
  // Find the microphone button (voice clip button)
  const voiceClipButton = document.querySelector('svg[aria-label="Voice Clip"]')?.closest('[role="button"]');
  if (!voiceClipButton) return null;
  
  // Check if button already exists
  if (document.querySelector('[data-instafn-message-viewer-btn="true"]')) {
    return document.querySelector('[data-instafn-message-viewer-btn="true"]');
  }
  
  // Find the parent container
  const parent = voiceClipButton.parentElement;
  if (!parent) return null;
  
  // Clone the voice clip button structure for styling
  const button = voiceClipButton.cloneNode(true);
  button.dataset.instafnMessageViewerBtn = 'true';
  button.setAttribute('aria-label', 'View logged messages');
  button.title = 'View logged messages';
  button.tabIndex = 0;
  
  // Update the SVG to use archive icon
  const svg = button.querySelector('svg');
  if (svg) {
    svg.setAttribute('aria-label', 'View logged messages');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('height', '24');
    svg.setAttribute('width', '24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.innerHTML = ARCHIVE_ICON_PATH;
    svg.style.color = '#f5f5f5';
  }
  
  // Add click handler
  button.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Remove existing modal if present (to refresh data)
    if (messageViewerModal) {
      messageViewerModal.remove();
      messageViewerModal = null;
    }
    
    // Create and show new modal with fresh data
    messageViewerModal = await createMessageViewerModal();
  };
  
  // Insert before the voice clip button
  parent.insertBefore(button, voiceClipButton);
  
  return button;
}

// Setup message viewer button
export function setupMessageViewer() {
  const ensureButtonExists = () => {
    // Only show in DM chat context
    const isDMContext = window.location.pathname.includes('/direct/t/');
    if (!isDMContext) {
      if (messageViewerButton) {
        messageViewerButton.remove();
        messageViewerButton = null;
      }
      return;
    }
    
    // Try to create button if it doesn't exist
    if (!messageViewerButton || !document.contains(messageViewerButton)) {
      messageViewerButton = createMessageViewerButton();
    }
  };
  
  // Initial setup
  ensureButtonExists();
  
  // Watch for DOM changes
  const observer = new MutationObserver(() => {
    ensureButtonExists();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
  
  // Also check on navigation
  let lastHref = window.location.href;
  const checkNavigation = () => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      setTimeout(ensureButtonExists, 100);
    }
  };
  
  setInterval(checkNavigation, 500);
  
  // Check on popstate
  window.addEventListener('popstate', () => {
    setTimeout(ensureButtonExists, 100);
  });
}

