/**
 * Message Double-Tap to Like Feature
 *
 * Double-click a message bubble to react with the heart (first reaction).
 * Works by hovering the message, clicking the React button, then the ❤️ — all
 * instantly and without any visible flash of the hover bar or reaction panel.
 *
 * Instagram's DM DOM changed: messages are now `[role="group"][tabindex="-1"]`
 * with `[role="presentation"]` bubbles (no more "Double tap to like" buttons),
 * so detection lives in the shared module.
 */

import { showToast } from "../../ui/toast.js";
import {
  MESSAGE_GROUP_SELECTOR,
  reactToMessage,
} from "../_shared/dm-message-actions.js";

const STYLE_ID = "instafn-double-tap-style";

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // Stop the browser selecting text when the user double-clicks a bubble.
  style.textContent = `${MESSAGE_GROUP_SELECTOR}{ -webkit-user-select:none; user-select:none; }`;
  document.head.appendChild(style);
}

function findMessageGroup(target) {
  const group = target.closest?.(MESSAGE_GROUP_SELECTOR);
  if (!group) return null;
  // Ignore clicks on the hover action bar / avatar links themselves.
  if (target.closest('[role="dialog"], a[role="link"]')) return null;
  return group;
}

const DOUBLE_TAP_MS = 350;

export function initMessageDoubleTapLike() {
  ensureStyle();

  // Detect the double-tap manually via click timing instead of the native
  // `dblclick` event. The first click renders the hover bar (shifting layout)
  // and can begin a text selection, so the second click often lands on a
  // different target — which suppresses native `dblclick` entirely. Matching on
  // the message GROUP (not the exact element) is robust to that.
  let lastTapTime = 0;
  let lastTapGroup = null;

  // Prevent text selection from the second click of a double-tap.
  document.addEventListener(
    "mousedown",
    (e) => {
      if (e.detail > 1 && findMessageGroup(e.target)) {
        e.preventDefault();
      }
    },
    true
  );

  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;
      const group = findMessageGroup(e.target);
      if (!group) {
        lastTapTime = 0;
        lastTapGroup = null;
        return;
      }

      const now = Date.now();
      if (lastTapGroup === group && now - lastTapTime < DOUBLE_TAP_MS) {
        e.preventDefault();
        e.stopPropagation();
        lastTapTime = 0;
        lastTapGroup = null;

        reactToMessage(group).then((ok) => {
          if (!ok) showToast("Couldn't like message");
        });
      } else {
        lastTapTime = now;
        lastTapGroup = group;
      }
    },
    true
  );
}
