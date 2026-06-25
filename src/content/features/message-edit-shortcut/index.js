/**
 * Message Edit and Reply Shortcut Feature
 *
 * Quick Edit:  Ctrl/Cmd+Shift+Up - Edit the last message YOU sent.
 * Quick Reply: Ctrl/Cmd+Up       - Reply to the other person's messages.
 *   - First press: reply to most recent message.
 *   - Consecutive presses: walk up through older messages.
 *
 * Both happen instantly and flash-free — see ../_shared/dm-message-actions.js
 * for the (rewritten for Instagram's new DM DOM) detection and click pipeline.
 */

import { showToast } from "../../ui/toast.js";
import {
  findLastSentMessage,
  findOtherPersonMessages,
  replyToMessage,
  editMessage,
  isDmComposerFocused,
} from "../_shared/dm-message-actions.js";

// Quick-reply navigation state.
let quickReplyIndex = 0;
let quickReplyResetTimer = null;
let currentConversationId = null;

export function initMessageEditShortcut() {
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "ArrowUp" || !(e.ctrlKey || e.metaKey)) return;
      // Only act when a DM message composer is focused (works in the docked DM
      // widget too, not just /direct/).
      if (!isDmComposerFocused()) return;

      const isQuickEdit = e.shiftKey;
      const isQuickReply = !e.shiftKey;

      chrome.storage.sync.get(
        { enableMessageEditShortcut: true, enableMessageReplyShortcut: true },
        (settings) => {
          if (isQuickEdit && !settings.enableMessageEditShortcut) return;
          if (isQuickReply && !settings.enableMessageReplyShortcut) return;

          e.preventDefault();
          e.stopPropagation();

          if (isQuickEdit) {
            resetQuickReply();
            handleQuickEdit();
          } else {
            handleQuickReply();
          }
        }
      );
    },
    true
  );
}

function resetQuickReply() {
  quickReplyIndex = 0;
  currentConversationId = null;
  if (quickReplyResetTimer) {
    clearTimeout(quickReplyResetTimer);
    quickReplyResetTimer = null;
  }
}

function handleQuickEdit() {
  const lastSent = findLastSentMessage();
  if (!lastSent) {
    showToast("No message to edit", { id: "instafn-edit-tooltip" });
    return;
  }

  editMessage(lastSent).then((ok) => {
    if (!ok) showToast("Quick edit failed", { id: "instafn-edit-tooltip" });
  });
}

function handleQuickReply() {
  const conversationId = window.location.pathname;

  // Restart navigation when the conversation changes.
  if (currentConversationId !== conversationId) {
    quickReplyIndex = 0;
    currentConversationId = conversationId;
  }

  // Reset to the most recent message after a short idle period.
  if (quickReplyResetTimer) clearTimeout(quickReplyResetTimer);
  quickReplyResetTimer = setTimeout(() => {
    quickReplyIndex = 0;
  }, 1500);

  const messages = findOtherPersonMessages();
  if (messages.length === 0) {
    quickReplyIndex = 0;
    showToast("No message to reply to", { id: "instafn-reply-tooltip" });
    return;
  }

  if (quickReplyIndex >= messages.length) {
    // Past the oldest — wrap back to the most recent.
    quickReplyIndex = 0;
  }

  const target = messages[quickReplyIndex];
  quickReplyIndex++;

  replyToMessage(target).then((ok) => {
    if (!ok) {
      quickReplyIndex = 0;
      showToast("Quick reply failed", { id: "instafn-reply-tooltip" });
    }
  });
}
