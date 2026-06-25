/**
 * Message Viewer UI
 * 
 * Adds a button to view all logged messages in a modal
 */

import { createModal } from '../../ui/modal.js';
import { resolveThreadDisplayName } from './thread-name.js';

const ARCHIVE_ICON_PATH =
  '<polyline points="21 8 21 21 3 21 3 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline><rect x="1" y="3" width="22" height="5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></rect><line x1="10" y1="12" x2="14" y2="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></line>';

let messageViewerButton = null;
let messageViewerModal = null;

// Timestamp (ms) of the last time the user opened the viewer. Anything deleted
// after this is considered "unread" and drives the blue dot on the icon.
const STORAGE_KEY_LAST_SEEN = 'instafn_message_log_last_seen';

function getLastSeen() {
  const value = parseInt(localStorage.getItem(STORAGE_KEY_LAST_SEEN), 10);
  return isNaN(value) ? 0 : value;
}

// Number of deleted messages newer than the last time the viewer was opened.
function getUnreadCount() {
  const store = getDeletedMessages();
  const lastSeen = getLastSeen();
  let count = 0;
  for (const msg of store.values()) {
    const ts = parseInt(msg.deletedAt || msg.timestamp, 10) || 0;
    if (ts > lastSeen) count++;
  }
  return count;
}

// Record that the user has now seen everything up to this moment.
function markMessageLogSeen() {
  try {
    localStorage.setItem(STORAGE_KEY_LAST_SEEN, String(Date.now()));
  } catch (e) {
    // Ignore storage errors — the dot just won't clear, which is harmless.
  }
}

// Show/hide a small blue dot in the top-right corner of the viewer button to
// signal unread (newly deleted) messages.
function updateUnreadDot(button) {
  if (!button) return;
  let dot = button.querySelector('[data-instafn-unread-dot="true"]');
  const hasUnread = getUnreadCount() > 0;

  if (hasUnread) {
    if (!dot) {
      button.style.position = 'relative';
      dot = document.createElement('span');
      dot.dataset.instafnUnreadDot = 'true';
      dot.style.cssText = `
        position: absolute;
        top: 3px;
        right: 3px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgb(var(--ig-outgoing-message-bubble));
        box-shadow: 0 0 0 2px rgb(var(--ig-secondary-background, 0 0 0));
        pointer-events: none;
      `;
      button.appendChild(dot);
    }
  } else if (dot) {
    dot.remove();
  }
}

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

// Get thread participants map from storage
function getThreadParticipantsMap() {
  try {
    const stored = localStorage.getItem("instafn_thread_participants");
    if (stored) {
      const mapArray = JSON.parse(stored);
      const map = new Map();
      mapArray.forEach(([threadId, fbids]) => {
        if (Array.isArray(fbids)) {
          map.set(String(threadId), fbids.map(String));
        }
      });
      return map;
    }
  } catch (e) {
    console.error("[Instafn Message Viewer] Error loading thread participants map:", e);
  }
  return new Map();
}

// Get thread display-name map from storage (header text captured per open thread)
function getThreadDisplayNameMap() {
  try {
    const stored = localStorage.getItem("instafn_thread_display_names");
    if (stored) {
      const mapArray = JSON.parse(stored);
      const map = new Map();
      mapArray.forEach(([threadId, name]) => {
        map.set(String(threadId), name);
      });
      return map;
    }
  } catch (e) {
    console.error("[Instafn Message Viewer] Error loading thread display-name map:", e);
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

// Format timestamp into a compact "Jun 9, 2026 · 12:45 AM" form
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Unknown';

  const ts = parseInt(timestamp);
  if (isNaN(ts)) return 'Invalid';

  const date = new Date(ts);
  const datePart = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

// Create the message viewer modal. `unreadSince` is the "last seen" timestamp
// captured before this open, so rows for messages deleted after it get a dot.
async function createMessageViewerModal(unreadSince = 0) {
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
  `;

  const headerRow = document.createElement('tr');
  headerRow.style.cssText = `
    border-bottom: 1px solid rgba(var(--ig-primary-text), 0.08);
  `;
  const headers = ['Message', 'By', 'Thread', 'Timestamp', ''];
  headers.forEach((headerText, index) => {
    const th = document.createElement('th');
    th.textContent = headerText;
    th.style.cssText = `
      padding: 10px 16px;
      text-align: ${index === headers.length - 1 ? 'center' : 'left'};
      vertical-align: middle;
      font-weight: var(--font-weight-system-semibold);
      font-size: var(--system-12-font-size);
      color: rgb(var(--ig-secondary-text));
      white-space: nowrap;
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
  const threadParticipantsMap = getThreadParticipantsMap();
  const threadDisplayNameMap = getThreadDisplayNameMap();
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
        border-bottom: 1px solid rgba(var(--ig-primary-text), 0.06);
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
      const hasText = Boolean(msg.text);
      const messageText = msg.text || 'No text';
      messageCell.style.cssText = `
        padding: 11px 16px;
        font-size: var(--system-13-font-size);
        line-height: 1.4;
        color: ${hasText ? 'rgb(var(--ig-primary-text))' : 'rgb(var(--ig-secondary-text))'};
        font-style: ${hasText ? 'normal' : 'italic'};
        word-break: break-word;
        vertical-align: top;
        font-family: var(--font-family-system);
        font-weight: var(--font-weight-system-medium);
        min-width: 200px;
        max-width: none;
      `;

      // Lay out an optional unread dot to the left of the text.
      const messageWrap = document.createElement('div');
      messageWrap.style.cssText = 'display: flex; align-items: baseline; gap: 8px;';

      const isUnread =
        (parseInt(msg.deletedAt || msg.timestamp, 10) || 0) > unreadSince;
      if (isUnread) {
        const dot = document.createElement('span');
        dot.style.cssText = `
          flex: 0 0 auto;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgb(var(--ig-outgoing-message-bubble));
          align-self: center;
        `;
        messageWrap.appendChild(dot);
      }

      const textSpan = document.createElement('span');
      if (messageText.length > 150) {
        textSpan.textContent = messageText.substring(0, 150) + '...';
        textSpan.title = messageText;
      } else {
        textSpan.textContent = messageText;
      }
      messageWrap.appendChild(textSpan);
      messageCell.appendChild(messageWrap);
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
        padding: 11px 16px;
        font-size: var(--system-13-font-size);
        line-height: 1.4;
        color: rgb(var(--ig-primary-text));
        font-family: var(--font-family-system);
        vertical-align: top;
        white-space: nowrap;
        min-width: 120px;
      `;
      row.appendChild(byCell);
      
      // Thread cell - resolve the display name fresh from storage every time, so
      // names that were captured after the message was deleted are picked up. We
      // intentionally ignore msg.threadName: older logs may carry a name from the
      // buggy DOM-scraping era, and the resolver below is authoritative.
      const threadCell = document.createElement('td');
      const displayThreadName = resolveThreadDisplayName({
        threadId: msg.threadFbid || msg.threadId || msg.thread,
        senderFbid: msg.originalSender,
        participantsMap: threadParticipantsMap,
        threadNameMap,
        displayNameMap: threadDisplayNameMap,
        senderUsernameMap,
        currentUserFbid,
      });

      threadCell.textContent = displayThreadName;
      threadCell.style.cssText = `
        padding: 11px 16px;
        font-size: var(--system-13-font-size);
        line-height: 1.4;
        color: rgb(var(--ig-primary-text));
        font-family: var(--font-family-system);
        vertical-align: top;
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
        padding: 11px 16px;
        font-size: var(--system-13-font-size);
        line-height: 1.4;
        color: rgb(var(--ig-secondary-text));
        font-family: var(--font-family-system);
        vertical-align: top;
        white-space: nowrap;
        min-width: 150px;
      `;
      row.appendChild(timestampCell);

      // Delete button cell
      const deleteCell = document.createElement('td');
      deleteCell.style.cssText = `
        padding: 6px 10px;
        text-align: right;
        vertical-align: top;
        white-space: nowrap;
        width: 1%;
      `;
      const deleteButton = document.createElement('button');
      deleteButton.innerHTML = `
        <svg aria-label="Delete" fill="currentColor" height="16" role="img" viewBox="0 0 24 24" width="16">
          <title>Delete</title>
          <path d="M20.654 5.717h-3.605V4.039A2.041 2.041 0 0 0 15.01 2H8.99a2.041 2.041 0 0 0-2.039 2.039v1.678H3.347a.75.75 0 1 0 0 1.5h.806v12.744A2.041 2.041 0 0 0 6.191 22h11.618a2.041 2.041 0 0 0 2.038-2.039V7.217h.807a.75.75 0 1 0 0-1.5ZM8.451 4.039a.539.539 0 0 1 .539-.539h6.02a.539.539 0 0 1 .539.539v1.678H8.451Zm9.896 15.922a.539.539 0 0 1-.538.539H6.191a.539.539 0 0 1-.538-.539V7.217h12.694ZM9.872 17.5a.75.75 0 0 0 .75-.75V10.5a.75.75 0 0 0-1.5 0v6.25c0 .414.336.75.75.75Zm4.256 0a.75.75 0 0 0 .75-.75V10.5a.75.75 0 0 0-1.5 0v6.25c0 .414.336.75.75.75Z"></path>
        </svg>
      `;
      deleteButton.setAttribute('aria-label', 'Delete message');
      deleteButton.style.cssText = `
        background: transparent;
        color: rgb(var(--ig-secondary-text));
        border: none;
        border-radius: 50%;
        padding: 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s;
        width: 28px;
        height: 28px;
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
          // Keep the trailing divider off whatever row is now last.
          if (tbody.lastElementChild) {
            tbody.lastElementChild.style.borderBottom = 'none';
          }
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

    // Drop the trailing divider on the last row so it doesn't double up with
    // the modal/content edge.
    const lastRow = tbody.lastElementChild;
    if (lastRow) {
      lastRow.style.borderBottom = 'none';
    }
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

    // Capture what was unread BEFORE marking seen, so the modal can still flag
    // those rows. Opening then marks the log as seen and clears the icon dot.
    const unreadSince = getLastSeen();
    markMessageLogSeen();
    updateUnreadDot(button);

    // Remove existing modal if present (to refresh data)
    if (messageViewerModal) {
      messageViewerModal.remove();
      messageViewerModal = null;
    }

    // Create and show new modal with fresh data
    messageViewerModal = await createMessageViewerModal(unreadSince);
  };

  // Insert before the voice clip button
  parent.insertBefore(button, voiceClipButton);

  // Reflect any unread messages as soon as the button appears.
  updateUnreadDot(button);

  return button;
}

// Setup message viewer button
export function setupMessageViewer() {
  const ensureButtonExists = () => {
    // Only show in DM chat context
    const isDMContext = window.location.pathname.includes('/direct/t/');

    // When the composer has text, Instagram swaps the mic/action buttons for a
    // Send button. The logger button must not show in that state or it breaks
    // the composer layout (it stacks above Send).
    const sendButton = document.querySelector('[aria-label="Send"][role="button"], svg[aria-label="Send"]');
    const voiceClipButton = document.querySelector('svg[aria-label="Voice Clip"]')?.closest('[role="button"]');

    if (!isDMContext || sendButton || !voiceClipButton) {
      if (messageViewerButton) {
        messageViewerButton.remove();
        messageViewerButton = null;
      }
      return;
    }

    // Try to create button if it doesn't exist
    if (!messageViewerButton || !document.contains(messageViewerButton)) {
      messageViewerButton = createMessageViewerButton();
    } else {
      // Button already present — keep its unread dot in sync.
      updateUnreadDot(messageViewerButton);
    }
  };

  // Update the dot the moment a new message is deleted, even if the modal is closed.
  window.addEventListener('instafn-new-deleted-message', () => {
    if (messageViewerButton && document.contains(messageViewerButton)) {
      updateUnreadDot(messageViewerButton);
    }
  });

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

