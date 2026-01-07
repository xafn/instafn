import { confirmWithModal } from "../follow-analyzer/index.js";
import {
  stopEvent,
  dispatchFullClick,
  dispatchMouseClick,
  interceptClicks,
  interceptKeydown,
} from "../../utils/eventInterceptor.js";

async function confirmAction(
  options,
  fallbackMessage = options?.message || "Are you sure?"
) {
  if (typeof confirmWithModal === "function") {
    try {
      return await confirmWithModal(options);
    } catch (_) {}
  }
  return confirm(fallbackMessage);
}

/**
 * Generic interceptor: find element → show modal → click if confirmed
 */
function intercept(config) {
  const {
    matcher,
    getElement,
    getConfirmation,
    getTarget,
    clickType = "mouse",
    eventType = "click",
  } = config;

  const handler = async (e) => {
    if (!matcher(e)) return;
    const element = getElement(e);
    if (!element) return;

    const confirmation = getConfirmation(e, element);
    if (!(await confirmAction(confirmation, confirmation.message))) return;

    const target = getTarget ? getTarget(e, element) : element;
    (clickType === "full" ? dispatchFullClick : dispatchMouseClick)(target);
    return false;
  };

  (eventType === "keydown" ? interceptKeydown : interceptClicks)(
    matcher,
    handler
  );
}

// Helper: find element by selector
const find = (selector) => (e) => e.target.closest(selector);
const findText = (selector, text) => (e) => {
  const el = e.target.closest(selector);
  return el && el.textContent.trim() === text;
};

export function interceptLikes() {
  intercept({
    matcher: (e) => {
      if (e.detail > 1) return false;
      return !!(
        find('svg[aria-label="Like"], svg[aria-label="Unlike"]')(e) ||
        find('button, [role="button"], a, div[role="button"]')(
          e
        )?.querySelector?.('svg[aria-label="Like"], svg[aria-label="Unlike"]')
      );
    },
    getElement: (e) =>
      find('button, [role="button"], a, div[role="button"]')(e) ||
      find('svg[aria-label="Like"], svg[aria-label="Unlike"]')(e),
    getConfirmation: (e, el) => {
      const icon =
        el.querySelector?.(
          'svg[aria-label="Like"], svg[aria-label="Unlike"]'
        ) ||
        el.closest?.('svg[aria-label="Like"], svg[aria-label="Unlike"]') ||
        el;
      const isLiked = icon.getAttribute("aria-label") === "Unlike";
      return {
        title: "Confirm like",
        message: `Do you want to ${isLiked ? "unlike" : "like"} this post?`,
        confirmText: isLiked ? "Unlike" : "Like",
      };
    },
    clickType: "full",
  });

  // Double-click handler
  document.addEventListener(
    "dblclick",
    async (e) => {
      if (e.isTrusted === false) return;
      stopEvent(e);
      const article = e.target.closest("article");
      if (!article) return;
      if (
        window.location.pathname.includes("/stories/") ||
        article.querySelector('[data-testid="story"], [aria-label*="story"]')
      )
        return;
      if (
        window.location.pathname.includes("/reels/") ||
        article.querySelector('[data-testid="reel"], [aria-label*="reel"]')
      )
        return;

      const likeBtn = article
        .querySelector('svg[aria-label="Like"]')
        ?.closest('button, [role="button"], a, div[role="button"]');
      if (
        likeBtn &&
        (await confirmAction({
          title: "Confirm like",
          message: "Do you want to like this post?",
          confirmText: "Like",
        }))
      ) {
        dispatchFullClick(likeBtn);
      }
    },
    true
  );
}

export function interceptComments() {
  intercept({
    matcher: findText('div[role="button"][tabindex="0"]', "Post"),
    getElement: find('div[role="button"][tabindex="0"]'),
    getConfirmation: () => ({
      title: "Confirm comment",
      message: "Do you want to post this comment?",
      confirmText: "Post",
    }),
  });

  interceptKeydown(
    (e) => {
      if (e.key !== "Enter" || e.shiftKey) return false;
      const field = e.target.closest(
        'textarea, input, [contenteditable="true"], [role="textbox"]'
      );
      if (!field) return false;
      const meta = [
        field.getAttribute("aria-label") || "",
        field.getAttribute("placeholder") || "",
        field.getAttribute("name") || "",
      ]
        .join(" ")
        .toLowerCase();
      const isComment =
        meta.includes("comment") ||
        !!field.closest('[data-testid="post_comment_input"]');
      const container = field.closest("form, div, section") || document;
      const hasPostBtn =
        container
          .querySelector('div[role="button"][tabindex="0"]')
          ?.textContent.trim() === "Post";
      return isComment || hasPostBtn;
    },
    async (e) => {
      const field = e.target.closest(
        'textarea, input, [contenteditable="true"], [role="textbox"]'
      );
      if (
        await confirmAction({
          title: "Confirm comment",
          message: "Do you want to post this comment?",
          confirmText: "Post",
        })
      ) {
        const container = field.closest("form, div, section") || document;
        const postBtn = container.querySelector(
          'div[role="button"][tabindex="0"]'
        );
        if (postBtn?.textContent.trim() === "Post") {
          dispatchMouseClick(postBtn);
        } else {
          field.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              bubbles: true,
              cancelable: true,
            })
          );
        }
      }
      return false;
    }
  );
}

export function interceptCalls() {
  intercept({
    matcher: (e) =>
      !!(
        find('svg[aria-label="Video call"]')(e) ||
        find('svg[aria-label="Audio call"]')(e)
      ),
    getElement: (e) => {
      const btn =
        find('svg[aria-label="Video call"]')(e) ||
        find('svg[aria-label="Audio call"]')(e);
      return (
        btn?.closest('button, [role="button"], a, div[role="button"]') || btn
      );
    },
    getConfirmation: () => ({
      title: "Confirm call",
      message: "Do you want to start this call?",
      confirmText: "Start call",
    }),
  });
}

export function interceptFollows() {
  intercept({
    matcher: (e) => {
      const btn = find('button, div[role="button"]')(e);
      if (!btn) return false;
      const text = (btn.tagName === "BUTTON"
        ? btn.querySelector('div[dir="auto"], span[dir="auto"]')
        : btn.getAttribute("role") === "button"
        ? btn
        : null
      )?.textContent?.trim();
      return text === "Follow" || text === "Follow Back" || text === "Unfollow";
    },
    getElement: find('button, div[role="button"]'),
    getConfirmation: (e, el) => {
      const text = (el.tagName === "BUTTON"
        ? el.querySelector('div[dir="auto"], span[dir="auto"]')
        : el.getAttribute("role") === "button"
        ? el
        : null
      )?.textContent?.trim();
      const isUnfollow = text === "Unfollow";
      return {
        title: `Confirm ${isUnfollow ? "unfollow" : "follow"}`,
        message: `Do you want to ${
          isUnfollow ? "unfollow" : "follow"
        } this user?`,
        confirmText: isUnfollow ? "Unfollow" : "Follow",
      };
    },
  });
}

export function interceptStoryQuickReactions() {
  intercept({
    matcher: (e) => !!find('div[role="button"] span.xcg35fi')(e),
    getElement: (e) => {
      const emoji = find('div[role="button"] span.xcg35fi')(e);
      return emoji?.closest('div[role="button"]') || emoji;
    },
    getConfirmation: (e) => ({
      title: "Confirm reaction",
      message: `Do you want to react with ${
        find('div[role="button"] span.xcg35fi')(e)?.textContent
      } to this story?`,
      confirmText: "Send",
    }),
  });
}

export function interceptStoryReplies() {
  intercept({
    matcher: findText('div[role="button"][tabindex="0"]', "Send"),
    getElement: find('div[role="button"][tabindex="0"]'),
    getConfirmation: () => ({
      title: "Confirm reply",
      message: "Do you want to send this story reply?",
      confirmText: "Send",
    }),
  });

  interceptKeydown(
    (e) =>
      e.key === "Enter" &&
      !e.shiftKey &&
      !!find('textarea[placeholder*="Reply to"]')(e),
    async (e) => {
      const textarea = find('textarea[placeholder*="Reply to"]')(e);
      if (
        await confirmAction({
          title: "Confirm reply",
          message: "Do you want to send this story reply?",
          confirmText: "Send",
        })
      ) {
        const container = textarea.closest("form, div, section") || document;
        const sendBtn = container.querySelector(
          'div[role="button"][tabindex="0"]'
        );
        if (sendBtn?.textContent.trim() === "Send") {
          dispatchMouseClick(sendBtn);
        } else {
          textarea.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              bubbles: true,
              cancelable: true,
            })
          );
        }
      }
      return false;
    }
  );
}

export function interceptReposts() {
  intercept({
    matcher: (e) => {
      if (e.detail > 1) return false;
      return !!(
        find('svg[aria-label="Repost"], svg[aria-label="Unrepost"]')(e) ||
        find('button, [role="button"], a, div[role="button"]')(
          e
        )?.querySelector?.(
          'svg[aria-label="Repost"], svg[aria-label="Unrepost"]'
        )
      );
    },
    getElement: (e) =>
      find('button, [role="button"], a, div[role="button"]')(e) ||
      find('svg[aria-label="Repost"], svg[aria-label="Unrepost"]')(e),
    getConfirmation: (e, el) => {
      const icon =
        el.querySelector?.(
          'svg[aria-label="Repost"], svg[aria-label="Unrepost"]'
        ) ||
        el.closest?.('svg[aria-label="Repost"], svg[aria-label="Unrepost"]') ||
        el;
      const isReposted =
        icon.getAttribute("aria-label") === "Unrepost" ||
        icon
          .querySelector("path")
          ?.getAttribute("d")
          ?.includes("4.612-4.614");
      return {
        title: `Confirm ${isReposted ? "unrepost" : "repost"}`,
        message: `Do you want to ${isReposted ? "unrepost" : "repost"} this?`,
        confirmText: isReposted ? "Unrepost" : "Repost",
      };
    },
    clickType: "full",
  });
}

// Element manipulation helpers
const getEl = (sel) =>
  typeof sel === "string"
    ? document.getElementById(sel) || document.querySelector(sel)
    : sel instanceof Element
    ? sel
    : null;

export function forceHoverOnElement(selectorOrElement) {
  const el = getEl(selectorOrElement);
  if (!el) return console.error("[Instafn] Element not found"), false;

  [
    new PointerEvent("pointerenter", {
      bubbles: true,
      cancelable: true,
      view: window,
      pointerType: "mouse",
    }),
    new PointerEvent("pointerover", {
      bubbles: true,
      cancelable: true,
      view: window,
      pointerType: "mouse",
    }),
    new MouseEvent("mouseenter", {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
    new MouseEvent("mouseover", {
      bubbles: true,
      cancelable: true,
      view: window,
    }),
  ].forEach((evt) => el.dispatchEvent(evt));
  el.classList.add("force-hover");
  return true;
}

export function keepElementClicked(selectorOrElement, duration = null) {
  const el = getEl(selectorOrElement);
  if (!el) return console.error("[Instafn] Element not found"), false;

  [
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      view: window,
      pointerType: "mouse",
      button: 0,
      buttons: 1,
    }),
    new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
    }),
  ].forEach((evt) => el.dispatchEvent(evt));
  el.classList.add("force-clicked");
  el.setAttribute("data-force-clicked", "true");

  if (!window._instafnClickedElements)
    window._instafnClickedElements = new Set();
  window._instafnClickedElements.add(el);

  if (duration && duration > 0)
    setTimeout(() => releaseElementClick(el), duration);
  return true;
}

export function releaseElementClick(selectorOrElement) {
  const el = getEl(selectorOrElement);
  if (!el) return console.error("[Instafn] Element not found"), false;

  [
    new PointerEvent("pointerup", {
      bubbles: true,
      cancelable: true,
      view: window,
      pointerType: "mouse",
      button: 0,
      buttons: 0,
    }),
    new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 0,
    }),
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 0,
    }),
  ].forEach((evt) => el.dispatchEvent(evt));
  el.classList.remove("force-clicked");
  el.removeAttribute("data-force-clicked");
  if (window._instafnClickedElements) window._instafnClickedElements.delete(el);
  return true;
}

if (typeof window !== "undefined") {
  window.Instafn = window.Instafn || {};
  window.Instafn.forceHover = forceHoverOnElement;
  window.Instafn.keepClicked = keepElementClicked;
  window.Instafn.releaseClick = releaseElementClick;
}
