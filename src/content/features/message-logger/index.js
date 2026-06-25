/**
 * Message Logger Feature
 *
 * Tracks messages sent in DMs and logs when messages are deleted,
 * including what message was deleted.
 */

import { resolveThreadDisplayName } from "./thread-name.js";

// Store messages by message_id
const messageStore = new Map();

// Store deleted messages with full info
const deletedMessagesStore = new Map();

// Store mapping of sender_fbid to username (from GraphQL data)
const senderUsernameMap = new Map();

// Store current user's Facebook ID
let currentUserFbid = null;

// Store mapping of thread_fbid to thread name (for group chats)
const threadNameMap = new Map();

// Store mapping of thread_fbid to participant fbids (interop fbids, all threads).
// This is how we name DMs ("the participant who isn't you") without scraping the
// on-screen header, which was attributing the wrong thread to most messages.
const threadParticipantsMap = new Map();

// Store mapping of thread_fbid to the conversation header text, captured ONLY
// while that exact thread is open (URL /direct/t/<id>/ === the delta thread_fbid).
// Pairing the URL id with the visible header is reliable; this is what lets us
// show a group's name/member list even when the inbox GraphQL never loads.
const threadDisplayNameMap = new Map();

// LocalStorage keys
const STORAGE_KEY_MESSAGE_STORE = "instafn_message_store";
const STORAGE_KEY_DELETED_MESSAGES = "instafn_deleted_messages";
const STORAGE_KEY_SENDER_USERNAMES = "instafn_sender_usernames";
const STORAGE_KEY_CURRENT_USER_FBID = "instafn_current_user_fbid";
const STORAGE_KEY_THREAD_NAMES = "instafn_thread_names";
const STORAGE_KEY_THREAD_PARTICIPANTS = "instafn_thread_participants";
const STORAGE_KEY_THREAD_DISPLAY_NAMES = "instafn_thread_display_names";
const STORAGE_KEY_THREAD_NAMES_MIGRATED = "instafn_thread_names_migrated_v1";

// Configuration
const MAX_STORE_SIZE = 5000; // Maximum messages to store
const MESSAGE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Cleanup old messages periodically
function cleanupOldMessages() {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, message] of messageStore.entries()) {
    // Remove messages older than TTL
    if (message.timestamp && now - parseInt(message.timestamp) > MESSAGE_TTL) {
      messageStore.delete(id);
      cleaned++;
    }
  }

  // If still too large, remove oldest messages
  if (messageStore.size > MAX_STORE_SIZE) {
    const entries = Array.from(messageStore.entries()).sort(
      (a, b) =>
        (parseInt(a[1].timestamp) || 0) - (parseInt(b[1].timestamp) || 0)
    );

    const toRemove = messageStore.size - MAX_STORE_SIZE;
    for (let i = 0; i < toRemove; i++) {
      messageStore.delete(entries[i][0]);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupOldMessages, 5 * 60 * 1000);

// Parse binary WebSocket message
function parseWebSocketMessage(data, dataType) {
  try {
    let bytes = null;
    let str = "";

    // Handle array (converted from ArrayBuffer/Uint8Array)
    if (Array.isArray(data)) {
      bytes = new Uint8Array(data);
      for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (
          (byte >= 32 && byte <= 126) ||
          byte === 9 ||
          byte === 10 ||
          byte === 13
        ) {
          str += String.fromCharCode(byte);
        } else if (byte === 0) {
          continue;
        }
      }
    }
    // Handle ArrayBuffer
    else if (data instanceof ArrayBuffer) {
      bytes = new Uint8Array(data);
      for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (
          (byte >= 32 && byte <= 126) ||
          byte === 9 ||
          byte === 10 ||
          byte === 13
        ) {
          str += String.fromCharCode(byte);
        } else if (byte === 0) {
          continue;
        }
      }
    }
    // Handle Uint8Array
    else if (data instanceof Uint8Array) {
      bytes = data;
      for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        if (
          (byte >= 32 && byte <= 126) ||
          byte === 9 ||
          byte === 10 ||
          byte === 13
        ) {
          str += String.fromCharCode(byte);
        } else if (byte === 0) {
          continue;
        }
      }
    }
    // Handle string data
    else if (typeof data === "string") {
      str = data;
    }

    if (!str) return null;

    // Look for /ig_message_sync path and extract JSON after it
    const syncIndex = str.indexOf("/ig_message_sync");

    if (syncIndex !== -1) {
      const afterSync = str.substring(syncIndex + "/ig_message_sync".length);
      const jsonStart = afterSync.indexOf("[");

      if (jsonStart !== -1) {
        let depth = 0;
        let jsonEnd = -1;
        for (let i = jsonStart; i < afterSync.length; i++) {
          if (afterSync[i] === "[") depth++;
          if (afterSync[i] === "]") {
            depth--;
            if (depth === 0) {
              jsonEnd = i + 1;
              break;
            }
          }
        }

        if (jsonEnd !== -1) {
          const jsonStr = afterSync.substring(jsonStart, jsonEnd);
          try {
            return JSON.parse(jsonStr);
          } catch (e) {
            // Try to find any JSON array in the string
            const jsonMatch = str.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              try {
                return JSON.parse(jsonMatch[0]);
              } catch (e2) {
                try {
                  return JSON.parse(str);
                } catch (e3) {
                  // Failed to parse
                }
              }
            }
          }
        }
      }
    }

    // Fallback: try to find any JSON array in the string
    const jsonMatch = str.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        try {
          return JSON.parse(str);
        } catch (e2) {
          // Failed
        }
      }
    }

    // Last resort: try parsing the whole string as JSON
    try {
      return JSON.parse(str);
    } catch (e) {
      // Not JSON
    }
  } catch (error) {
    // Silently fail
  }

  return null;
}

// Process parsed message data
function processMessage(parsedData, url) {
  if (!parsedData || !Array.isArray(parsedData)) return;

  try {
    parsedData.forEach((item) => {
      if (!item.data?.slide_delta_processor) return;

      item.data.slide_delta_processor.forEach((delta) => {
        // DIAGNOSTIC: with window.__instafnSocketDebug on, log every delta type
        // we walk. If an unsend produces a delta whose __typename is NOT
        // "SlideUQPPDeleteMessage" (e.g. a renamed delete type), this surfaces it.
        if (window.__instafnSocketDebug) {
          console.log(
            "[Instafn Message Logger] delta __typename:",
            delta.__typename
          );
          if (
            delta.__typename !== "SlideUQPPDeleteMessage" &&
            /delete|unsend|revoke|remove/i.test(delta.__typename || "")
          ) {
            console.log(
              "[Instafn Message Logger] ⚠️ delete-like delta NOT matched by our check:",
              delta.__typename,
              delta
            );
          }
        }

        // Handle new messages
        if (delta.__typename === "SlideUQPPNewMessage" && delta.message) {
          const message = delta.message;
          const messageId = message.id;

          if (messageId) {
            const text = message.text_body || message.igd_snippet || "";

            // Cleanup if store is getting too large
            if (messageStore.size >= MAX_STORE_SIZE) {
              cleanupOldMessages();
            }

            // Get thread_fbid for this message (this is what deletion deltas use).
            // Do NOT fall back to offline_threading_id — that's a per-message id,
            // not a thread id, and using it corrupts the thread mapping.
            const messageThreadFbid = message.thread_fbid;

            // Thread names/participants come from the GraphQL inbox (see
            // processGraphQLMessages), never from the on-screen header — the
            // header reflects whatever conversation is open, not the thread this
            // WebSocket event belongs to.

            // Store the message with its content (store as much info as possible)
            messageStore.set(messageId, {
              id: messageId,
              text: text,
              timestamp: message.timestamp_ms,
              sender: message.sender_fbid,
              thread: messageThreadFbid,
              contentType: message.content_type,
              offlineThreadingId: message.offline_threading_id,
              threadFbid: message.thread_fbid,
              source: "websocket",
              storedAt: Date.now(),
              // Store full message object for reference
              raw: message,
            });
            // Persist so an unsend after a reload can still be matched.
            scheduleSaveMessageStore();

            // Only log if there's actual text content
            if (text) {
              console.log(`💬 Message: "${text}"`);
            }
          }
        }

        // Handle deleted messages
        if (delta.__typename === "SlideUQPPDeleteMessage") {
          const messageId = delta.message_id;
          const threadFbid = delta.thread_fbid;

          if (messageId) {
            const deletedMessage = messageStore.get(messageId);

            if (deletedMessage) {
              // Determine who deleted the message
              // If the message sender matches current user, current user deleted it
              // Otherwise, someone else deleted it
              let deletedByUsername = "Unknown";

              // Get current user info to determine who deleted the message
              // The sender_fbid tells us who SENT the message. In Instagram, you can only delete your own messages.
              // So: if the sender is you → you deleted it, if sender is other person → they deleted it
              const getDeletedBy = async () => {
                try {
                  const senderFbid = String(deletedMessage.sender || "");

                  // First, check if sender is the current user by comparing Facebook IDs
                  // This works for both 1-on-1 DMs and group chats
                  if (currentUserFbid && senderFbid === currentUserFbid) {
                    // It's the current user - try to get username, otherwise return "You"
                    let currentUsername = null;
                    if (window.Instafn && window.Instafn.getCurrentUser) {
                      try {
                        const currentUser = await window.Instafn.getCurrentUser();
                        if (currentUser) {
                          currentUsername = currentUser.username;
                        }
                      } catch (e) {
                        // Ignore
                      }
                    }
                    return currentUsername || "You";
                  }

                  // Not the current user - try to get their username
                  const mappedUsername = senderUsernameMap.get(senderFbid);
                  if (mappedUsername) {
                    return mappedUsername;
                  }

                  // No username found - return the sender Facebook ID
                  return senderFbid || "Unknown";
                } catch (e) {
                  // Fallback: return sender ID if available
                  const senderFbid = String(deletedMessage.sender || "");
                  return senderFbid || "Unknown";
                }
              };

              // Resolve the thread's display name from data we actually trust:
              // participant fbids (for DMs) and real group names (for groups),
              // both captured from the GraphQL inbox. The delta's thread_fbid is
              // the lookup key.
              const threadId =
                threadFbid ||
                deletedMessage.threadFbid ||
                deletedMessage.thread;

              const threadName = resolveThreadDisplayName({
                threadId,
                senderFbid: deletedMessage.sender,
                participantsMap: threadParticipantsMap,
                threadNameMap,
                displayNameMap: threadDisplayNameMap,
                senderUsernameMap,
                currentUserFbid,
              });

              console.log(
                `[Instafn Message Logger] 📌 Resolved thread name: "${threadName}" for threadId: ${threadId}`
              );

              // Store immediately - only store originalSender, not deletedBy
              // deletedBy will be computed on-the-fly when displaying from originalSender
              const deletedMsg = {
                id: messageId,
                text: deletedMessage.text || "(no text)",
                timestamp: deletedMessage.timestamp,
                deletedAt: Date.now(),
                threadName: threadName,
                threadId:
                  threadFbid ||
                  deletedMessage.threadFbid ||
                  deletedMessage.thread,
                threadFbid:
                  threadFbid ||
                  deletedMessage.threadFbid ||
                  deletedMessage.thread,
                originalSender: deletedMessage.sender,
              };
              deletedMessagesStore.set(messageId, deletedMsg);

              // Save immediately after storing
              saveDeletedMessages();

              // Tell the viewer a new entry landed so it can show its unread dot
              // without waiting for the modal to be reopened.
              window.dispatchEvent(new CustomEvent("instafn-new-deleted-message"));

              if (deletedMessage.text) {
                console.log(` Message deleted: "${deletedMessage.text}"`);
              } else {
                console.log(` Message deleted (ID: ${messageId})`);
              }

              // Remove from active message store
              messageStore.delete(messageId);
              scheduleSaveMessageStore();
            } else {
              console.log(
                ` Message deleted (ID: ${messageId}) - message not found in store`
              );
            }
          }
        }
      });
    });
  } catch (error) {
    // Silently fail
  }
}

// Hook a specific WebSocket instance
function hookWebSocketInstance(ws, url) {
  if (!ws || !url) return;

  console.log("[Instafn Message Logger] Hooking WebSocket instance:", url);
  console.log("[Instafn Message Logger] WebSocket readyState:", ws.readyState);

  // Intercept incoming messages via addEventListener
  const originalAddEventListener = ws.addEventListener.bind(ws);
  ws.addEventListener = function(type, listener, options) {
    if (type === "message") {
      console.log(
        "[Instafn Message Logger] Intercepting addEventListener for message"
      );
      return originalAddEventListener(
        type,
        (event) => {
          console.log(
            "[Instafn Message Logger] WebSocket message event received via addEventListener:",
            {
              type: event.type,
              dataType: event.data?.constructor?.name,
              url: url,
            }
          );

          // Call original listener
          if (listener) {
            if (typeof listener === "function") {
              listener(event);
            } else if (listener && typeof listener.handleEvent === "function") {
              listener.handleEvent(event);
            }
          }

          // Process the message
          const parsed = parseWebSocketMessage(event.data);
          if (parsed) {
            processMessage(parsed, url);
          } else {
            console.log(
              "[Instafn Message Logger] Could not parse message, skipping processing"
            );
          }
        },
        options
      );
    }
    return originalAddEventListener(type, listener, options);
  };

  // Intercept onmessage property
  let originalOnMessage = ws.onmessage;
  Object.defineProperty(ws, "onmessage", {
    get() {
      return this._onmessage || originalOnMessage;
    },
    set(handler) {
      this._onmessage = handler;
      originalOnMessage = handler;

      if (handler) {
        // Wrap the handler
        const wrappedHandler = (event) => {
          console.log(
            "[Instafn Message Logger] WebSocket onmessage handler called"
          );

          if (handler) handler.call(ws, event);

          // Process the message
          const parsed = parseWebSocketMessage(event.data);
          if (parsed) {
            processMessage(parsed, url);
          } else {
            console.log(
              "[Instafn Message Logger] Could not parse message from onmessage handler"
            );
          }
        };

        // Set up the wrapped handler
        originalAddEventListener("message", wrappedHandler);
      }
    },
    configurable: true,
  });

  // If WebSocket is already open, also hook existing message listeners
  if (
    ws.readyState === WebSocket.OPEN ||
    ws.readyState === WebSocket.CONNECTING
  ) {
    console.log(
      "[Instafn Message Logger] WebSocket is already open/connecting, setting up direct listener"
    );
    originalAddEventListener("message", (event) => {
      console.log(
        "[Instafn Message Logger] Direct message listener triggered:",
        {
          type: event.type,
          dataType: event.data?.constructor?.name,
          url: url,
        }
      );

      const parsed = parseWebSocketMessage(event.data);
      if (parsed) {
        processMessage(parsed, url);
      }
    });
  }
}

// Hook into WebSocket connections
function hookWebSocket() {
  console.log("[Instafn Message Logger] Setting up WebSocket hook...");

  const originalWebSocket = window.WebSocket;

  if (!originalWebSocket) {
    console.log("[Instafn Message Logger] WebSocket constructor not available");
    return;
  }

  window.WebSocket = function(...args) {
    const url = args[0];
    console.log(
      "[Instafn Message Logger] WebSocket constructor called with URL:",
      url
    );

    const ws = new originalWebSocket(...args);

    // Only hook into Instagram chat WebSocket
    if (url && url.includes("edge-chat.instagram.com")) {
      console.log(
        "[Instafn Message Logger]  Instagram chat WebSocket detected:",
        url
      );

      // Hook the instance
      hookWebSocketInstance(ws, url);
    } else {
      console.log(
        "[Instafn Message Logger] Not an Instagram chat WebSocket:",
        url
      );
    }

    return ws;
  };

  // Copy static properties
  Object.setPrototypeOf(window.WebSocket, originalWebSocket);
  Object.defineProperty(window.WebSocket, "prototype", {
    value: originalWebSocket.prototype,
    writable: false,
  });

  // Copy static constants
  Object.defineProperty(window.WebSocket, "CONNECTING", {
    value: originalWebSocket.CONNECTING,
    writable: false,
  });
  Object.defineProperty(window.WebSocket, "OPEN", {
    value: originalWebSocket.OPEN,
    writable: false,
  });
  Object.defineProperty(window.WebSocket, "CLOSING", {
    value: originalWebSocket.CLOSING,
    writable: false,
  });
  Object.defineProperty(window.WebSocket, "CLOSED", {
    value: originalWebSocket.CLOSED,
    writable: false,
  });

  console.log("[Instafn Message Logger] WebSocket hook installed");

  // Also hook at the prototype level as a backup - this catches ALL WebSocket messages
  const originalAddEventListener = WebSocket.prototype.addEventListener;
  const hookedWebSockets = new WeakSet();

  WebSocket.prototype.addEventListener = function(type, listener, options) {
    const result = originalAddEventListener.call(this, type, listener, options);

    // Check if this is an Instagram chat WebSocket
    const url = this.url;
    if (url && url.includes("edge-chat.instagram.com")) {
      // Only hook once per WebSocket instance
      if (!hookedWebSockets.has(this)) {
        hookedWebSockets.add(this);
        console.log(
          "[Instafn Message Logger]  Prototype-level hook: Instagram chat WebSocket detected:",
          url
        );
        console.log(
          "[Instafn Message Logger] WebSocket readyState:",
          this.readyState
        );

        // Add our own listener that will catch all messages
        originalAddEventListener.call(this, "message", (event) => {
          console.log(
            "[Instafn Message Logger] 🔵 Prototype-level message received from:",
            url,
            {
              dataType: event.data?.constructor?.name,
              dataLength: event.data?.length,
            }
          );

          const parsed = parseWebSocketMessage(event.data);
          if (parsed) {
            processMessage(parsed, url);
          } else {
            console.log(
              "[Instafn Message Logger] Could not parse message from prototype hook"
            );
          }
        });

        // Also hook when WebSocket opens if it's not already open
        if (this.readyState === WebSocket.CONNECTING) {
          originalAddEventListener.call(this, "open", () => {
            console.log("[Instafn Message Logger] WebSocket opened:", url);
          });
        }
      }
    }

    return result;
  };

  // Also hook the onmessage setter at prototype level
  const originalOnMessageDescriptor = Object.getOwnPropertyDescriptor(
    WebSocket.prototype,
    "onmessage"
  );
  if (originalOnMessageDescriptor) {
    Object.defineProperty(WebSocket.prototype, "onmessage", {
      get: originalOnMessageDescriptor.get,
      set: function(handler) {
        // Call original setter
        if (originalOnMessageDescriptor.set) {
          originalOnMessageDescriptor.set.call(this, handler);
        }

        // If this is an Instagram chat WebSocket, also add our listener
        const url = this.url;
        if (
          url &&
          url.includes("edge-chat.instagram.com") &&
          !hookedWebSockets.has(this)
        ) {
          hookedWebSockets.add(this);
          console.log(
            "[Instafn Message Logger]  Prototype-level onmessage hook: Instagram chat WebSocket detected:",
            url
          );

          originalAddEventListener.call(this, "message", (event) => {
            console.log(
              "[Instafn Message Logger] 🔵 Prototype-level onmessage received from:",
              url
            );
            const parsed = parseWebSocketMessage(event.data);
            if (parsed) {
              processMessage(parsed, url);
            }
          });
        }
      },
      configurable: true,
    });
  }

  console.log(
    "[Instafn Message Logger] Prototype-level hook installed (will catch all WebSocket messages)"
  );
}

// Find and hook existing WebSocket connections
function findAndHookExistingWebSockets() {
  console.log(
    "[Instafn Message Logger] Searching for existing WebSocket connections..."
  );

  let foundCount = 0;

  // Method 1: Look for WebSocket in window properties
  for (const key in window) {
    try {
      const value = window[key];
      if (value instanceof WebSocket) {
        const url = value.url || "unknown";
        console.log(
          "[Instafn Message Logger] Found existing WebSocket in window:",
          key,
          url
        );
        if (url.includes("edge-chat.instagram.com")) {
          console.log(
            "[Instafn Message Logger]  Found Instagram chat WebSocket! Hooking..."
          );
          hookWebSocketInstance(value, url);
          foundCount++;
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }

  // Method 2: Try to find WebSocket in React/Instagram's internal state
  // Instagram might store the WebSocket in a closure or internal variable
  // We can try to access it through various common patterns

  // Method 3: Hook all existing WebSocket instances by checking their readyState
  // This is a bit of a hack - we'll try to access WebSocket instances through
  // the prototype or by monitoring message events globally

  // Method 4: Try to intercept at a lower level - hook the EventTarget prototype
  // This might catch messages even if we can't find the WebSocket instance

  if (foundCount === 0) {
    console.log(
      "[Instafn Message Logger] No Instagram chat WebSockets found in window properties"
    );
    console.log(
      "[Instafn Message Logger] WebSocket might be stored in a closure or created in a different context"
    );
  } else {
    console.log(
      `[Instafn Message Logger] Found and hooked ${foundCount} Instagram chat WebSocket(s)`
    );
  }

  console.log(
    "[Instafn Message Logger] Finished searching for existing WebSockets"
  );
  return foundCount;
}

// Alternative: Use wsHook if available
function setupWsHook() {
  if (typeof window.wsHook !== "undefined") {
    console.log(
      "[Instafn Message Logger] Setting up wsHook for message logging"
    );

    // Preserve existing after hook if it exists
    const existingAfter = window.wsHook.after;

    // Intercept incoming messages
    window.wsHook.after = function(event, url, wsObject) {
      console.log("[Instafn Message Logger] wsHook.after called:", {
        url: url,
        hasEvent: !!event,
        hasData: !!(event && event.data),
        eventType: event?.type,
      });

      // Call existing hook first if it exists
      if (existingAfter) {
        event = existingAfter.call(this, event, url, wsObject);
      }

      // Only process Instagram chat WebSocket
      if (url && url.includes("edge-chat.instagram.com")) {
        console.log(
          "[Instafn Message Logger] Processing Instagram chat WebSocket message"
        );
        if (event && event.data) {
          const parsed = parseWebSocketMessage(event.data);
          if (parsed) {
            processMessage(parsed, url);
          } else {
            console.log(
              "[Instafn Message Logger] Could not parse message from wsHook"
            );
          }
        } else {
          console.log(
            "[Instafn Message Logger] No event or event.data in wsHook"
          );
        }
      } else {
        console.log(
          "[Instafn Message Logger] Not an Instagram chat WebSocket:",
          url
        );
      }
      return event;
    };

    return true;
  }
  return false;
}

// Process GraphQL messages from initial DM load
function processGraphQLMessages(data) {
  let storedCount = 0;

  try {
    console.log("[Instafn Message Logger]  Processing GraphQL data...");
    console.log("[Instafn Message Logger] 📦 Data structure:", {
      hasData: !!data?.data,
      hasGetSlideMailbox: !!data?.data?.get_slide_mailbox_for_iris_subscription,
    });

    const mailbox = data?.data?.get_slide_mailbox_for_iris_subscription;
    if (!mailbox) {
      console.log("[Instafn Message Logger]  No mailbox found in data");
      return 0;
    }

    const threads = mailbox.threads_by_folder?.edges || [];
    console.log(`[Instafn Message Logger] 📬 Found ${threads.length} threads`);

    threads.forEach((threadEdge, threadIdx) => {
      const thread = threadEdge?.node?.as_ig_direct_thread;
      if (!thread) {
        console.log(
          `[Instafn Message Logger]  Thread ${threadIdx} has no as_ig_direct_thread`
        );
        return;
      }

      // Extract usernames from thread participants and store mapping.
      // Also collect the participant fbids so we can name DMs reliably later.
      const participantFbids = [];
      if (thread.users && Array.isArray(thread.users)) {
        thread.users.forEach((user) => {
          const fbid = user.interop_messaging_user_fbid;
          const username = user.username;
          if (fbid) participantFbids.push(String(fbid));
          if (fbid && username) {
            senderUsernameMap.set(String(fbid), username);
            console.log(
              `[Instafn Message Logger]  Mapped sender ${fbid} → ${username}`
            );
          }
        });
        // Save the map after processing thread users
        saveSenderUsernameMap();
      }

      // Store current user's Facebook ID from viewer info
      if (thread.viewer) {
        const viewerFbid = thread.viewer.interop_messaging_user_fbid;
        if (viewerFbid) {
          currentUserFbid = String(viewerFbid);
          localStorage.setItem(STORAGE_KEY_CURRENT_USER_FBID, currentUserFbid);
          console.log(
            `[Instafn Message Logger]  Stored current user FBID: ${currentUserFbid}`
          );
          // Include the viewer so the participant count reflects everyone.
          if (!participantFbids.includes(String(viewerFbid))) {
            participantFbids.push(String(viewerFbid));
          }
        }
      }

      // Get thread IDs - we need to store the thread name with multiple keys to ensure we can find it
      const threadId = thread.thread_id || thread.id;
      // Also check thread_key - this might be the thread_fbid used in deletion deltas
      const threadKey = thread.thread_key;

      // A thread is a group when it's not a 1:1. Instagram tags real DMs with
      // thread_subtype "IG_ONLY_ONE_TO_ONE", which is the strongest signal; when
      // it's missing we fall back to the participant count. We count
      // participantFbids (which already includes the viewer, added above) rather
      // than thread.users, because thread.users excludes the viewer and would make
      // a 3-person group look like a 2-person DM. Getting this right matters
      // because storing a name in threadNameMap is itself the "this is a group"
      // signal the resolver uses — naming a DM here would misclassify it.
      const isOneToOne = thread.thread_subtype === "IG_ONLY_ONE_TO_ONE";
      const isGroupChat = thread.thread_subtype
        ? !isOneToOne
        : participantFbids.length > 2;

      // The group's display title. Instagram's inbox field is `thread_title`
      // (the old code looked for thread_name/title, which don't exist, so every
      // group came through unnamed and fell back to the member list). Only trust
      // it for groups — a DM's thread_title is just the partner's name and must
      // go through the participant-based path, not the group-name map.
      const threadName = isGroupChat
        ? thread.thread_title || thread.thread_name || thread.title || null
        : null;

      // DIAGNOSTIC: for groups that still have no title, dump every field of the
      // thread object so we can find which one holds the custom group name.
      if (isGroupChat && !threadName) {
        const dump = {};
        for (const k of Object.keys(thread)) {
          const v = thread[k];
          // Only scalar fields — skip the big arrays/objects (users, messages).
          if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            dump[k] = v;
          } else {
            dump[k] = `<${Array.isArray(v) ? "array[" + v.length + "]" : typeof v}>`;
          }
        }
        console.log(
          "[Instafn Message Logger][thread-fields] unnamed group " + (thread.thread_id || thread.id),
          dump
        );
      }

      // Store participant fbids under every id form a deletion delta might use,
      // so we can later name the thread from its participants regardless of which
      // id format the delta carries.
      if (participantFbids.length > 0) {
        const participantKeys = [
          threadId,
          thread.id,
          threadKey,
          thread.thread_fbid,
        ];
        let storedParticipants = false;
        for (const key of participantKeys) {
          if (key) {
            threadParticipantsMap.set(String(key), participantFbids);
            storedParticipants = true;
          }
        }
        if (storedParticipants) {
          saveThreadParticipantsMap();
        }
      }

      // Store thread name using multiple keys:
      // 1. thread.thread_id (long GraphQL ID)
      // 2. thread.thread_key (might be the thread_fbid used in deletion deltas)
      // This ensures we can find it regardless of which ID format is used
      if (threadName) {
        if (threadId) {
          threadNameMap.set(String(threadId), threadName);
          console.log(
            `[Instafn Message Logger]  Mapped thread ID ${threadId} → "${threadName}"`
          );
        }
        if (threadKey && String(threadKey) !== String(threadId)) {
          threadNameMap.set(String(threadKey), threadName);
          console.log(
            `[Instafn Message Logger]  Mapped thread key ${threadKey} → "${threadName}"`
          );
        }
        // Save immediately to localStorage
        localStorage.setItem(
          STORAGE_KEY_THREAD_NAMES,
          JSON.stringify(Array.from(threadNameMap.entries()))
        );
        console.log(
          `[Instafn Message Logger] 💾 Saved thread name "${threadName}" to storage (keys: ${threadId}${
            threadKey && String(threadKey) !== String(threadId)
              ? `, ${threadKey}`
              : ""
          })`
        );
      } else if (isGroupChat) {
        // Store empty string to mark this as a group chat without a name
        if (threadId) {
          threadNameMap.set(String(threadId), "");
          console.log(
            `[Instafn Message Logger]  Marked thread ID ${threadId} as group chat (no name)`
          );
        }
        if (threadKey && String(threadKey) !== String(threadId)) {
          threadNameMap.set(String(threadKey), "");
          console.log(
            `[Instafn Message Logger]  Marked thread key ${threadKey} as group chat (no name)`
          );
        }
        // Save immediately to localStorage
        localStorage.setItem(
          STORAGE_KEY_THREAD_NAMES,
          JSON.stringify(Array.from(threadNameMap.entries()))
        );
        console.log(
          `[Instafn Message Logger] 💾 Saved group chat marker to storage (keys: ${threadId}${
            threadKey && String(threadKey) !== String(threadId)
              ? `, ${threadKey}`
              : ""
          })`
        );
      }
      // If it's not a group chat (DM), we don't store it - so absence from map = DM

      const messages = thread.slide_messages?.edges || [];
      console.log(
        `[Instafn Message Logger] 💬 Thread ${threadIdx} has ${messages.length} messages`
      );

      messages.forEach((messageEdge, msgIdx) => {
        const message = messageEdge?.node;
        if (!message) {
          console.log(
            `[Instafn Message Logger]  Message ${msgIdx} in thread ${threadIdx} has no node`
          );
          return;
        }

        if (message.__typename !== "SlideMessage") {
          console.log(
            `[Instafn Message Logger]  Message ${msgIdx} type is ${message.__typename}, not SlideMessage`
          );
          return;
        }

        const messageId = message.id;
        if (!messageId) {
          console.log(
            `[Instafn Message Logger]  Message ${msgIdx} has no ID`
          );
          return;
        }

        // Get thread_fbid from the message - store thread name with this key too
        // Check multiple possible fields that might match deletion delta thread_fbid
        const messageThreadFbid =
          message.thread_fbid ||
          message.thread_id ||
          thread.thread_key || // thread_key might be the thread_fbid used in deletion deltas
          thread.thread_id ||
          thread.id;

        // Bind the per-message thread_fbid (the id WebSocket deltas use) to this
        // thread's participants, so DM naming works for the exact delta key.
        if (participantFbids.length > 0 && message.thread_fbid) {
          threadParticipantsMap.set(
            String(message.thread_fbid),
            participantFbids
          );
        }

        // Store thread name using multiple keys for redundancy
        // The key insight: deletion deltas use thread_fbid which might be thread.thread_key
        // Store with ALL possible ID variations to ensure we can find it
        let savedThreadName = false;
        if (threadName) {
          // Store with thread.thread_key (this is likely what deletion deltas use)
          if (threadKey) {
            threadNameMap.set(String(threadKey), threadName);
            savedThreadName = true;
            console.log(
              `[Instafn Message Logger]  Mapped thread key ${threadKey} → "${threadName}"`
            );
          }
          // Store with message's thread_fbid
          if (
            messageThreadFbid &&
            String(messageThreadFbid) !== String(threadKey || "")
          ) {
            threadNameMap.set(String(messageThreadFbid), threadName);
            savedThreadName = true;
            console.log(
              `[Instafn Message Logger]  Mapped message thread_fbid ${messageThreadFbid} → "${threadName}"`
            );
          }
          // Also store with thread ID if different
          if (
            threadId &&
            String(threadId) !== String(messageThreadFbid || "") &&
            String(threadId) !== String(threadKey || "")
          ) {
            threadNameMap.set(String(threadId), threadName);
            savedThreadName = true;
            console.log(
              `[Instafn Message Logger]  Also mapped thread ID ${threadId} → "${threadName}"`
            );
          }
          // Store with message.thread_id if it exists and is different
          if (
            message.thread_id &&
            String(message.thread_id) !== String(messageThreadFbid || "") &&
            String(message.thread_id) !== String(threadId || "") &&
            String(message.thread_id) !== String(threadKey || "")
          ) {
            threadNameMap.set(String(message.thread_id), threadName);
            savedThreadName = true;
            console.log(
              `[Instafn Message Logger]  Also mapped message.thread_id ${message.thread_id} → "${threadName}"`
            );
          }
          // Store with message.thread_fbid if it exists and is different
          if (
            message.thread_fbid &&
            String(message.thread_fbid) !== String(messageThreadFbid || "") &&
            String(message.thread_fbid) !== String(threadId || "") &&
            String(message.thread_fbid) !== String(threadKey || "") &&
            String(message.thread_fbid) !== String(message.thread_id || "")
          ) {
            threadNameMap.set(String(message.thread_fbid), threadName);
            savedThreadName = true;
            console.log(
              `[Instafn Message Logger]  Also mapped message.thread_fbid ${message.thread_fbid} → "${threadName}"`
            );
          }
        } else if (isGroupChat) {
          // Store empty string to mark as group chat without name
          if (threadKey) {
            threadNameMap.set(String(threadKey), "");
            savedThreadName = true;
            console.log(
              `[Instafn Message Logger]  Marked thread key ${threadKey} as group chat (no name)`
            );
          }
          if (
            messageThreadFbid &&
            String(messageThreadFbid) !== String(threadKey || "")
          ) {
            threadNameMap.set(String(messageThreadFbid), "");
            savedThreadName = true;
            console.log(
              `[Instafn Message Logger]  Marked message thread_fbid ${messageThreadFbid} as group chat (no name)`
            );
          }
          if (
            threadId &&
            String(threadId) !== String(messageThreadFbid || "") &&
            String(threadId) !== String(threadKey || "")
          ) {
            threadNameMap.set(String(threadId), "");
            savedThreadName = true;
          }
        }

        // Save to localStorage immediately if we stored a thread name
        if (savedThreadName) {
          localStorage.setItem(
            STORAGE_KEY_THREAD_NAMES,
            JSON.stringify(Array.from(threadNameMap.entries()))
          );
        }

        // Extract text from igd_snippet
        // Format can be "username: message" or "You: message" or just "message"
        let text = message.igd_snippet || "";
        const originalText = text;

        // Clean up the snippet format (remove username prefix if present)
        const colonIndex = text.indexOf(": ");
        if (colonIndex > 0) {
          text = text.substring(colonIndex + 2);
        }

        // Skip non-text messages (attachments, reactions, etc.)
        if (
          !text ||
          text.includes("sent an attachment") ||
          text.includes("sent a photo") ||
          text.includes("sent a voice message") ||
          text.includes("Liked a message") ||
          text.includes("Reacted") ||
          text.includes("started a video chat") ||
          text.includes("missed a video chat")
        ) {
          console.log(
            `[Instafn Message Logger]  Skipping non-text message: "${originalText}"`
          );
          return;
        }

        // Cleanup if store is getting too large
        if (messageStore.size >= MAX_STORE_SIZE) {
          cleanupOldMessages();
        }

        // Store the message (don't overwrite if already exists from WebSocket)
        if (!messageStore.has(messageId)) {
          messageStore.set(messageId, {
            id: messageId,
            text: text,
            timestamp: message.timestamp_ms,
            sender: message.sender_fbid,
            thread: messageThreadFbid,
            contentType: "TEXT",
            source: "graphql",
            storedAt: Date.now(),
            threadFbid: message.thread_fbid || messageThreadFbid,
            // Store full message object for reference
            raw: message,
          });
          storedCount++;
          console.log(
            `[Instafn Message Logger] 💾 Stored message [${messageId}]: "${text}"`
          );
        } else {
          console.log(
            `[Instafn Message Logger]  Message [${messageId}] already exists in store`
          );
        }
      });

      // Save thread name map after processing all messages in the thread
      if (threadNameMap.size > 0) {
        localStorage.setItem(
          STORAGE_KEY_THREAD_NAMES,
          JSON.stringify(Array.from(threadNameMap.entries()))
        );
        console.log(
          `[Instafn Message Logger] 💾 Saved ${threadNameMap.size} thread name mappings to storage`
        );
      }
    });

    console.log(
      `[Instafn Message Logger]  Processed GraphQL messages. Total stored: ${storedCount}, Store size: ${messageStore.size}`
    );
    if (storedCount > 0) {
      scheduleSaveMessageStore();
    }
    // Persist participants — the per-message set() calls above add message-level
    // thread_fbid keys that the per-thread save didn't cover.
    if (threadParticipantsMap.size > 0) {
      saveThreadParticipantsMap();
    }
    return storedCount;
  } catch (error) {
    console.error(
      "[Instafn Message Logger]  Error processing GraphQL messages:",
      error
    );
    return storedCount;
  }
}

// Extract JSON from JavaScript-wrapped GraphQL response
function extractJSONFromJS(jsCode) {
  // Instagram wraps JSON in JavaScript code
  // Look for the JSON object starting with {"data"
  const startIdx = jsCode.indexOf('{"data"');
  if (startIdx === -1) return null;

  // Find the matching closing brace by tracking depth
  let depth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < jsCode.length; i++) {
    const char = jsCode[i];
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }

  if (endIdx > startIdx) {
    try {
      return JSON.parse(jsCode.substring(startIdx, endIdx));
    } catch (e) {
      return null;
    }
  }

  return null;
}

// GraphQL interceptor is now handled by the injected graphql-sniffer.js script
// This function is kept for compatibility but does nothing
function setupGraphQLInterceptor() {
  // GraphQL interception is now done in the page context via graphql-sniffer.js
  // which is injected by syringe.js
}

// Listen for messages from the injected socket-sniffer and graphql-sniffer scripts
function setupPostMessageListener() {
  window.addEventListener("message", (event) => {
    // Only process messages from our injected scripts
    if (event.source !== window) {
      return;
    }

    // Handle WebSocket messages
    if (
      event.data?.source === "instafn-websocket" &&
      event.data.type === "websocket-message"
    ) {
      // Parse and process the message
      const parsed = parseWebSocketMessage(
        event.data.data,
        event.data.dataType
      );
      if (parsed) {
        processMessage(parsed, event.data.url);
      }
    }

    // Handle GraphQL responses
    if (
      event.data?.source === "instafn-graphql" &&
      event.data.type === "graphql-response"
    ) {
      console.log(
        "[Instafn Message Logger] 📡 GraphQL response received from page context"
      );
      const responseText = event.data.data;

      if (responseText) {
        console.log(
          "[Instafn Message Logger] 📄 Response length:",
          responseText.length
        );
        console.log(
          "[Instafn Message Logger] 📄 Response preview:",
          responseText.substring(0, 500)
        );

        // Extract JSON from JavaScript wrapper
        const extracted = extractJSONFromJS(responseText);
        if (extracted) {
          console.log(
            "[Instafn Message Logger]  Extracted JSON from GraphQL response"
          );
          const messageCount = processGraphQLMessages(extracted);
          console.log(
            `[Instafn Message Logger] 💾 Stored ${messageCount} messages from GraphQL`
          );
        } else {
          try {
            const data = JSON.parse(responseText);
            console.log(
              "[Instafn Message Logger]  Parsed GraphQL response as JSON"
            );
            const messageCount = processGraphQLMessages(data);
            console.log(
              `[Instafn Message Logger] 💾 Stored ${messageCount} messages from GraphQL`
            );
          } catch (e) {
            console.log(
              "[Instafn Message Logger]  Failed to parse GraphQL response:",
              e.message
            );
          }
        }
      }
    }
  });
}

// Export function to get message store (for message viewer)
export function getMessageStore() {
  return messageStore;
}

// Export function to get deleted messages store
export function getDeletedMessagesStore() {
  return deletedMessagesStore;
}

// How many recent messages to keep in the persisted index. The in-memory store
// can hold MAX_STORE_SIZE, but we cap what we write to localStorage so the index
// survives reloads (to match unsends) without risking the storage quota.
const PERSISTED_MESSAGE_LIMIT = 2500;

let saveMessageStoreTimer = null;

// Debounced persist — many messages can arrive in a burst; batch the writes.
function scheduleSaveMessageStore() {
  if (saveMessageStoreTimer) return;
  saveMessageStoreTimer = setTimeout(() => {
    saveMessageStoreTimer = null;
    saveMessageStore();
  }, 3000);
}

// Persist a slim copy of the message index (no bulky `raw`) so a deletion that
// arrives in a later session can still be matched to its original message.
function saveMessageStore() {
  try {
    const entries = Array.from(messageStore.values())
      .sort((a, b) => (a.storedAt || 0) - (b.storedAt || 0))
      .slice(-PERSISTED_MESSAGE_LIMIT)
      .map((m) => ({
        id: m.id,
        text: m.text,
        timestamp: m.timestamp,
        sender: m.sender,
        thread: m.thread,
        contentType: m.contentType,
        threadFbid: m.threadFbid,
        storedAt: m.storedAt,
      }));
    localStorage.setItem(STORAGE_KEY_MESSAGE_STORE, JSON.stringify(entries));
  } catch (e) {
    // Most likely a quota error — retry once with a smaller slice.
    try {
      const entries = Array.from(messageStore.values())
        .sort((a, b) => (a.storedAt || 0) - (b.storedAt || 0))
        .slice(-500)
        .map((m) => ({
          id: m.id,
          text: m.text,
          timestamp: m.timestamp,
          sender: m.sender,
          thread: m.thread,
          contentType: m.contentType,
          threadFbid: m.threadFbid,
          storedAt: m.storedAt,
        }));
      localStorage.setItem(STORAGE_KEY_MESSAGE_STORE, JSON.stringify(entries));
    } catch (e2) {
      console.error("[Instafn Message Logger] Error saving message store:", e2);
    }
  }
}

// Load the persisted message index so deletions of messages from earlier
// sessions can be matched. Skips entries past the TTL.
function loadMessageStore() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MESSAGE_STORE);
    if (!stored) return;
    const now = Date.now();
    const entries = JSON.parse(stored);
    let loaded = 0;
    entries.forEach((m) => {
      if (!m || !m.id) return;
      if (m.timestamp && now - parseInt(m.timestamp) > MESSAGE_TTL) return;
      if (!messageStore.has(m.id)) {
        messageStore.set(m.id, { ...m, source: m.source || "restored" });
        loaded++;
      }
    });
    console.log(
      `[Instafn Message Logger] 📥 Restored ${loaded} messages into the index from storage`
    );
  } catch (e) {
    console.error("[Instafn Message Logger] Error loading message store:", e);
  }
}

// Save deleted messages to localStorage
function saveDeletedMessages() {
  try {
    const messagesArray = Array.from(deletedMessagesStore.entries()).map(
      ([id, msg]) => ({
        id,
        ...msg,
      })
    );
    localStorage.setItem(
      STORAGE_KEY_DELETED_MESSAGES,
      JSON.stringify(messagesArray)
    );
  } catch (e) {
    console.error("[Instafn Message Logger] Error saving deleted messages:", e);
  }
}

// Load deleted messages from localStorage
function loadDeletedMessages() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_DELETED_MESSAGES);
    if (stored) {
      const messagesArray = JSON.parse(stored);
      messagesArray.forEach((msg) => {
        deletedMessagesStore.set(msg.id, msg);
      });
      console.log(
        `[Instafn Message Logger] 📥 Loaded ${messagesArray.length} deleted messages from storage`
      );
    }
  } catch (e) {
    console.error(
      "[Instafn Message Logger] Error loading deleted messages:",
      e
    );
  }
}

// Save sender username map to localStorage
function saveSenderUsernameMap() {
  try {
    const mapArray = Array.from(senderUsernameMap.entries());
    localStorage.setItem(
      STORAGE_KEY_SENDER_USERNAMES,
      JSON.stringify(mapArray)
    );
  } catch (e) {
    console.error(
      "[Instafn Message Logger] Error saving sender username map:",
      e
    );
  }
}

// Load sender username map from localStorage
function loadSenderUsernameMap() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SENDER_USERNAMES);
    if (stored) {
      const mapArray = JSON.parse(stored);
      mapArray.forEach(([fbid, username]) => {
        senderUsernameMap.set(String(fbid), username);
      });
      console.log(
        `[Instafn Message Logger] 📥 Loaded ${mapArray.length} sender username mappings from storage`
      );
    }
  } catch (e) {
    console.error(
      "[Instafn Message Logger] Error loading sender username map:",
      e
    );
  }
}

// Load current user Facebook ID from localStorage
function loadCurrentUserFbid() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CURRENT_USER_FBID);
    if (stored) {
      currentUserFbid = stored;
      console.log(
        `[Instafn Message Logger] 📥 Loaded current user FBID: ${currentUserFbid}`
      );
    }
  } catch (e) {
    console.error(
      "[Instafn Message Logger] Error loading current user FBID:",
      e
    );
  }
}

// Load thread name map from localStorage
function loadThreadNameMap() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_THREAD_NAMES);
    if (stored) {
      const mapArray = JSON.parse(stored);
      mapArray.forEach(([threadId, threadName]) => {
        threadNameMap.set(String(threadId), threadName);
      });
      console.log(
        `[Instafn Message Logger] 📥 Loaded ${mapArray.length} thread name mappings from storage`
      );
    } else {
      console.log(
        `[Instafn Message Logger]  No thread name mappings found in storage. Thread names will be rebuilt automatically when you load DMs or receive messages.`
      );
    }
  } catch (e) {
    console.error("[Instafn Message Logger] Error loading thread name map:", e);
    console.log(
      `[Instafn Message Logger]  Thread names will be rebuilt automatically when you load DMs or receive messages.`
    );
  }
}

// Save thread participants map to localStorage
function saveThreadParticipantsMap() {
  try {
    localStorage.setItem(
      STORAGE_KEY_THREAD_PARTICIPANTS,
      JSON.stringify(Array.from(threadParticipantsMap.entries()))
    );
  } catch (e) {
    console.error(
      "[Instafn Message Logger] Error saving thread participants map:",
      e
    );
  }
}

// Load thread participants map from localStorage
function loadThreadParticipantsMap() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_THREAD_PARTICIPANTS);
    if (stored) {
      const mapArray = JSON.parse(stored);
      mapArray.forEach(([threadId, fbids]) => {
        if (Array.isArray(fbids)) {
          threadParticipantsMap.set(String(threadId), fbids.map(String));
        }
      });
      console.log(
        `[Instafn Message Logger] 📥 Loaded ${mapArray.length} thread participant mappings from storage`
      );
    }
  } catch (e) {
    console.error(
      "[Instafn Message Logger] Error loading thread participants map:",
      e
    );
  }
}

// Save thread display-name map to localStorage
function saveThreadDisplayNameMap() {
  try {
    localStorage.setItem(
      STORAGE_KEY_THREAD_DISPLAY_NAMES,
      JSON.stringify(Array.from(threadDisplayNameMap.entries()))
    );
  } catch (e) {
    console.error(
      "[Instafn Message Logger] Error saving thread display-name map:",
      e
    );
  }
}

// Load thread display-name map from localStorage
function loadThreadDisplayNameMap() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_THREAD_DISPLAY_NAMES);
    if (stored) {
      const mapArray = JSON.parse(stored);
      mapArray.forEach(([threadId, name]) => {
        threadDisplayNameMap.set(String(threadId), name);
      });
      console.log(
        `[Instafn Message Logger] 📥 Loaded ${mapArray.length} thread display names from storage`
      );
    }
  } catch (e) {
    console.error(
      "[Instafn Message Logger] Error loading thread display-name map:",
      e
    );
  }
}

// Instagram chrome strings that are headings/h1s elsewhere on the page (global
// nav, account switcher, our own modal). The old page-wide querySelector grabbed
// these by mistake — e.g. a group chat was named "Switch accounts" because the
// account-switcher heading matched before the conversation header did.
const HEADER_BLOCKLIST = new Set([
  "Messages",
  "Switch accounts",
  "Switch",
  "Notifications",
  "Instagram",
  "Home",
  "Search",
  "Explore",
  "Reels",
  "Create",
  "Profile",
  "Settings",
  "Direct",
  "Threads",
  "Meta",
  "More",
  "Your messages",
  "Message requests",
  "New message",
  "No posts yet",
  "Deleted Messages",
]);

function isBlockedHeaderText(text) {
  return HEADER_BLOCKLIST.has(text);
}

// Read the title shown in the header of the currently-open conversation. Scoped
// to the conversation pane (role="main") and filtered so global nav, popovers,
// dialogs (including our own viewer) and known chrome strings can't be captured
// as a thread name.
function readOpenThreadHeaderTitle() {
  const main = document.querySelector('div[role="main"]') || document;
  const selectors = [
    'div[role="heading"][aria-level="1"]',
    'header [role="heading"]',
    "header h1",
    'header span[dir="auto"]',
  ];
  for (const selector of selectors) {
    const elements = main.querySelectorAll(selector);
    for (const element of elements) {
      // Never trust headings that live in the global nav or any dialog/popover
      // (the account switcher, menus, our own "Deleted Messages" modal, etc.).
      if (
        element.closest('[role="navigation"]') ||
        element.closest('[role="dialog"]')
      ) {
        continue;
      }
      // Must be actually rendered — a hidden off-screen heading isn't the header.
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;

      const text = element.textContent && element.textContent.trim();
      if (
        text &&
        text.length > 0 &&
        text.length < 200 &&
        !isBlockedHeaderText(text) &&
        !/^\d+$/.test(text)
      ) {
        return text;
      }
    }
  }
  return null;
}

// Capture the open conversation's header text, keyed by the thread id in the URL.
// Both come from the same open thread, so this can't mis-attribute names across
// threads the way the old WebSocket-time DOM scraping did.
//
// We require the thread to have been open for one full tick before capturing,
// because right after navigating the URL updates before the header DOM does —
// capturing immediately could pair thread B's id with thread A's stale header.
let lastTickThreadId = null;
function captureOpenThreadDisplayName() {
  try {
    const match = window.location.pathname.match(/\/direct\/t\/(\d+)/);
    if (!match) {
      lastTickThreadId = null;
      return;
    }
    const threadId = String(match[1]);
    const wasStable = lastTickThreadId === threadId;
    lastTickThreadId = threadId;
    if (!wasStable) return; // first tick on this thread — let the header settle

    const title = readOpenThreadHeaderTitle();
    if (!title) return;
    if (threadDisplayNameMap.get(threadId) === title) return;
    threadDisplayNameMap.set(threadId, title);
    saveThreadDisplayNameMap();
    console.log(
      `[Instafn Message Logger] 🏷️ Captured thread name "${title}" for open thread ${threadId}`
    );
  } catch (e) {
    // Ignore
  }
}

// One-time cleanup of the thread-name map. An earlier version scraped the
// on-screen conversation header and stored it as a "thread name", which attached
// the wrong name (often a DM partner's username, or UI text like "No posts yet")
// to unrelated threads. We can't tell a real group name from a scraped one after
// the fact, so we drop every non-empty entry and keep only the "" markers (which
// reliably came from GraphQL and mean "unnamed group"). Real group names are
// re-added cleanly the next time the DM inbox loads.
function migrateThreadNames() {
  try {
    if (localStorage.getItem(STORAGE_KEY_THREAD_NAMES_MIGRATED)) return;

    let removed = 0;
    for (const [key, value] of Array.from(threadNameMap.entries())) {
      if (value !== "") {
        threadNameMap.delete(key);
        removed++;
      }
    }
    localStorage.setItem(
      STORAGE_KEY_THREAD_NAMES,
      JSON.stringify(Array.from(threadNameMap.entries()))
    );
    localStorage.setItem(STORAGE_KEY_THREAD_NAMES_MIGRATED, "1");
    console.log(
      `[Instafn Message Logger] 🧹 Cleaned ${removed} scraped thread name(s). Real group names rebuild on next inbox load.`
    );
  } catch (e) {
    console.error(
      "[Instafn Message Logger] Error migrating thread names:",
      e
    );
  }
}

// Drop any captured header names that are actually Instagram chrome (e.g.
// "Switch accounts" wrongly attached to a group chat by the old page-wide
// scrape). Runs every load — not one-time gated — so bad entries from a prior
// build are cleaned up. Real names are re-captured from the scoped header.
function purgeBadThreadDisplayNames() {
  try {
    let removed = 0;
    for (const [key, value] of Array.from(threadDisplayNameMap.entries())) {
      if (typeof value !== "string" || isBlockedHeaderText(value.trim())) {
        threadDisplayNameMap.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      saveThreadDisplayNameMap();
      console.log(
        `[Instafn Message Logger] 🧹 Purged ${removed} chrome-string thread name(s) (e.g. "Switch accounts").`
      );
    }
  } catch (e) {
    // Ignore
  }
}

export function initMessageLogger() {
  // Load persisted data from localStorage
  loadMessageStore();
  loadDeletedMessages();
  loadSenderUsernameMap();
  loadCurrentUserFbid();
  loadThreadNameMap();
  loadThreadParticipantsMap();
  loadThreadDisplayNameMap();
  migrateThreadNames();
  purgeBadThreadDisplayNames();

  // Capture the open conversation's name from its header (keyed by the URL's
  // thread id). The header loads asynchronously and changes as you navigate
  // between threads, so poll on a light interval.
  captureOpenThreadDisplayName();
  setInterval(captureOpenThreadDisplayName, 1500);

  // Set up listener for messages from injected script (WebSocket)
  setupPostMessageListener();

  // Set up GraphQL interceptor to capture initial messages
  setupGraphQLInterceptor();

  // Expose message store on window for message viewer
  if (!window.Instafn) window.Instafn = {};
  window.Instafn.getMessageStore = getMessageStore;
  window.Instafn.getDeletedMessagesStore = getDeletedMessagesStore;
  window.Instafn.saveDeletedMessages = saveDeletedMessages;

  // Save sender username map periodically
  setInterval(() => {
    if (senderUsernameMap.size > 0) {
      saveSenderUsernameMap();
    }
  }, 30 * 1000); // Every 30 seconds
}
