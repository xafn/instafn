import { confirmWithModal } from "../follow-analyzer/index.js";

async function confirmAction(
  options,
  fallbackMessage = options?.message || "Are you sure?"
) {
  if (typeof confirmWithModal === "function") {
    try {
      return await confirmWithModal(options);
    } catch (_) {
      // Fall through to native confirm on failure
    }
  }
  return confirm(fallbackMessage);
}

export function interceptLikes() {
  document.addEventListener(
    "click",
    async (e) => {
      if (e.isTrusted === false) return;
      // Ignore clicks that are part of a double-click
      if (e.detail > 1) return;
      const heartSvg = e.target.closest(
        'svg[aria-label="Like"], svg[aria-label="Unlike"]'
      );
      const clickableWrapper = e.target.closest(
        'button, [role="button"], a, div[role="button"]'
      );
      const heartInsideWrapper =
        clickableWrapper?.querySelector?.(
          'svg[aria-label="Like"], svg[aria-label="Unlike"]'
        ) || null;
      const isLikeArea = !!(heartSvg || heartInsideWrapper);

      if (isLikeArea) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        const likeIcon = heartSvg || heartInsideWrapper;
        const isLiked = likeIcon.getAttribute("aria-label") === "Unlike";
        const action = isLiked ? "unlike" : "like";
        const confirmed = await confirmAction(
          {
            title: "Confirm like",
            message: `Do you want to ${action} this post?`,
            confirmText: isLiked ? "Unlike" : "Like",
          },
          `Do you want to ${action} this post?`
        );

        if (confirmed) {
          const targetEl = clickableWrapper || likeIcon;
          const eventInit = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
          };
          const pointerDown = new PointerEvent("pointerdown", {
            ...eventInit,
            pointerType: "mouse",
          });
          const mouseDown = new MouseEvent("mousedown", eventInit);
          const mouseUp = new MouseEvent("mouseup", eventInit);
          const clickEvt = new MouseEvent("click", eventInit);

          try {
            targetEl.dispatchEvent(pointerDown);
          } catch (_) {}
          try {
            targetEl.dispatchEvent(mouseDown);
          } catch (_) {}
          try {
            targetEl.dispatchEvent(mouseUp);
          } catch (_) {}
          targetEl.dispatchEvent(clickEvt);
        }
        return false;
      }
    },
    true
  );

  // Detect double clicks anywhere inside a post
  document.addEventListener(
    "dblclick",
    async (e) => {
      if (e.isTrusted === false) return;
      e.stopImmediatePropagation();
      e.stopPropagation();
      e.preventDefault();

      const article = e.target.closest("article");
      if (!article) return;

      const isStory =
        window.location.pathname.includes("/stories/") ||
        article.querySelector('[data-testid="story"], [aria-label*="story"]');
      const isReel =
        window.location.pathname.includes("/reels/") ||
        article.querySelector('[data-testid="reel"], [aria-label*="reel"]');
      if (isStory || isReel) return;

      // Find the like button inside the article
      const likeBtn = article
        .querySelector('svg[aria-label="Like"]')
        ?.closest('button, [role="button"], a, div[role="button"]');

      const confirmed = await confirmAction(
        {
          title: "Confirm like",
          message: "Do you want to like this post?",
          confirmText: "Like",
        },
        "Do you want to like this post?"
      );

      if (confirmed) {
        const eventInit = {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
        };
        const pointerDown = new PointerEvent("pointerdown", {
          ...eventInit,
          pointerType: "mouse",
        });
        const mouseDown = new MouseEvent("mousedown", eventInit);
        const mouseUp = new MouseEvent("mouseup", eventInit);
        const clickEvt = new MouseEvent("click", eventInit);
        try {
          likeBtn.dispatchEvent(pointerDown);
        } catch (_) {}
        try {
          likeBtn.dispatchEvent(mouseDown);
        } catch (_) {}
        try {
          likeBtn.dispatchEvent(mouseUp);
        } catch (_) {}
        likeBtn.dispatchEvent(clickEvt);
      }
      return false;
    },
    true
  );
}

export function interceptComments() {
  document.addEventListener(
    "click",
    async (e) => {
      if (e.isTrusted === false) return;
      const commentButton = e.target.closest(
        'div[role="button"][tabindex="0"]'
      );
      if (commentButton && commentButton.textContent.trim() === "Post") {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        const confirmed = await confirmAction(
          {
            title: "Confirm comment",
            message: "Do you want to post this comment?",
            confirmText: "Post",
          },
          "Do you want to post this comment?"
        );

        if (confirmed) {
          const evt = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          commentButton.dispatchEvent(evt);
        }
      }
    },
    true
  );

  // Check if enter was pressed to comment
  document.addEventListener(
    "keydown",
    async (e) => {
      if (e.isTrusted === false) return;
      if (e.key === "Enter" && !e.shiftKey) {
        const textarea = e.target.closest(
          'textarea[aria-label="Add a comment…"]'
        );
        if (textarea) {
          e.stopImmediatePropagation();
          e.stopPropagation();
          e.preventDefault();
          const confirmed = await confirmAction(
            {
              title: "Confirm comment",
              message: "Do you want to post this comment?",
              confirmText: "Post",
            },
            "Do you want to post this comment?"
          );

          if (confirmed) {
            const container =
              textarea.closest("form, div, section") || document;
            const postBtn = container.querySelector(
              'div[role="button"][tabindex="0"]'
            );
            if (postBtn && postBtn.textContent.trim() === "Post") {
              const evt = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window,
              });
              postBtn.dispatchEvent(evt);
            } else {
              const keyEvt = new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                cancelable: true,
              });
              textarea.dispatchEvent(keyEvt);
            }
          } else {
            return false;
          }
        }
      }
    },
    true
  );
}

export function interceptCalls() {
  document.addEventListener(
    "click",
    async (e) => {
      if (e.isTrusted === false) return;
      const videoCallButton = e.target.closest('svg[aria-label="Video call"]');
      const audioCallButton = e.target.closest('svg[aria-label="Audio call"]');

      if (videoCallButton || audioCallButton) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        const confirmed = await confirmAction(
          {
            title: "Confirm call",
            message: "Do you want to start this call?",
            confirmText: "Start call",
          },
          "Do you want to start this call?"
        );

        if (confirmed) {
          const clickable =
            (videoCallButton || audioCallButton).closest(
              'button, [role="button"], a, div[role="button"]'
            ) ||
            videoCallButton ||
            audioCallButton;
          const evt = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          clickable.dispatchEvent(evt);
        }
      }
    },
    true
  );
}

export function interceptFollows() {
  document.addEventListener(
    "click",
    async (e) => {
      if (e.isTrusted === false) return;
      const followButton = e.target.closest('button, div[role="button"]');
      if (followButton) {
        let followText = null;
        if (followButton.tagName === "BUTTON") {
          followText = followButton.querySelector(
            'div[dir="auto"], span[dir="auto"]'
          );
        } else if (
          followButton.tagName === "DIV" &&
          followButton.getAttribute("role") === "button"
        ) {
          followText = followButton;
        }

        const textContent = followText?.textContent?.trim();
        const isFollow =
          textContent === "Follow" || textContent === "Follow Back";
        const isUnfollow = textContent === "Unfollow";

        if (followText && (isFollow || isUnfollow)) {
          e.stopImmediatePropagation();
          e.stopPropagation();
          e.preventDefault();
          const action = isUnfollow ? "unfollow" : "follow";
          const confirmed = await confirmAction(
            {
              title: `Confirm ${action}`,
              message: `Do you want to ${action} this user?`,
              confirmText: isUnfollow ? "Unfollow" : "Follow",
            },
            `Do you want to ${action} this user?`
          );

          if (confirmed) {
            const evt = new MouseEvent("click", {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            followButton.dispatchEvent(evt);
          } else {
            return false;
          }
        }
      }
    },
    true
  );
}

export function interceptStoryQuickReactions() {
  document.addEventListener(
    "click",
    async (e) => {
      if (e.isTrusted === false) return;
      const emojiButton = e.target.closest('div[role="button"] span.xcg35fi');

      if (emojiButton) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        const emoji = emojiButton.textContent;
        const confirmed = await confirmAction(
          {
            title: "Confirm reaction",
            message: `Do you want to react with ${emoji} to this story?`,
            confirmText: "Send",
          },
          `Do you want to react with ${emoji} to this story?`
        );

        if (confirmed) {
          const clickable =
            emojiButton.closest('div[role="button"]') || emojiButton;
          const evt = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          clickable.dispatchEvent(evt);
        } else {
          return false;
        }
      }
    },
    true
  );
}

export function interceptStoryReplies() {
  document.addEventListener(
    "click",
    async (e) => {
      if (e.isTrusted === false) return;
      const sendButton = e.target.closest('div[role="button"][tabindex="0"]');
      if (sendButton && sendButton.textContent.trim() === "Send") {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
        const confirmed = await confirmAction(
          {
            title: "Confirm reply",
            message: "Do you want to send this story reply?",
            confirmText: "Send",
          },
          "Do you want to send this story reply?"
        );

        if (confirmed) {
          const evt = new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          sendButton.dispatchEvent(evt);
        } else {
          return false;
        }
      }
    },
    true
  );

  // Check if enter was pressed to reply to a story
  document.addEventListener(
    "keydown",
    async (e) => {
      if (e.isTrusted === false) return;
      if (e.key === "Enter" && !e.shiftKey) {
        const textarea = e.target.closest('textarea[placeholder*="Reply to"]');
        if (textarea) {
          e.stopImmediatePropagation();
          e.stopPropagation();
          e.preventDefault();
          const confirmed = await confirmAction(
            {
              title: "Confirm reply",
              message: "Do you want to send this story reply?",
              confirmText: "Send",
            },
            "Do you want to send this story reply?"
          );

          if (confirmed) {
            const container =
              textarea.closest("form, div, section") || document;
            const sendBtn = container.querySelector(
              'div[role="button"][tabindex="0"]'
            );
            if (sendBtn && sendBtn.textContent.trim() === "Send") {
              const evt = new MouseEvent("click", {
                bubbles: true,
                cancelable: true,
                view: window,
              });
              sendBtn.dispatchEvent(evt);
            } else {
              const keyEvt = new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                cancelable: true,
              });
              textarea.dispatchEvent(keyEvt);
            }
          } else {
            return false;
          }
        }
      }
    },
    true
  );
}

export function interceptReposts() {
  document.addEventListener(
    "click",
    async (e) => {
      if (e.isTrusted === false) return;
      // Ignore clicks that are part of a double-click
      if (e.detail > 1) return;

      // Check for repost SVG - both "Repost" and "Unrepost" states
      const repostSvg = e.target.closest(
        'svg[aria-label="Repost"], svg[aria-label="Unrepost"]'
      );
      const clickableWrapper = e.target.closest(
        'button, [role="button"], a, div[role="button"]'
      );
      const repostInsideWrapper =
        clickableWrapper?.querySelector?.(
          'svg[aria-label="Repost"], svg[aria-label="Unrepost"]'
        ) || null;
      const isRepostArea = !!(repostSvg || repostInsideWrapper);

      if (isRepostArea) {
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();

        // Determine if already reposted
        const repostIcon = repostSvg || repostInsideWrapper;
        const ariaLabel = repostIcon?.getAttribute("aria-label") || "";
        const isReposted =
          ariaLabel === "Unrepost" ||
          // Check if SVG path contains checkmark (reposted state has checkmark path)
          (repostIcon &&
            repostIcon.querySelector("path") &&
            repostIcon
              .querySelector("path")
              ?.getAttribute("d")
              ?.includes("4.612-4.614"));

        const action = isReposted ? "unrepost" : "repost";
        const actionText = isReposted ? "Unrepost" : "Repost";

        const confirmed = await confirmAction(
          {
            title: `Confirm ${action}`,
            message: `Do you want to ${action} this?`,
            confirmText: actionText,
          },
          `Do you want to ${action} this?`
        );

        if (confirmed) {
          const targetEl = clickableWrapper || repostIcon;
          const eventInit = {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
          };
          const pointerDown = new PointerEvent("pointerdown", {
            ...eventInit,
            pointerType: "mouse",
          });
          const mouseDown = new MouseEvent("mousedown", eventInit);
          const mouseUp = new MouseEvent("mouseup", eventInit);
          const clickEvt = new MouseEvent("click", eventInit);

          try {
            targetEl.dispatchEvent(pointerDown);
          } catch (_) {}
          try {
            targetEl.dispatchEvent(mouseDown);
          } catch (_) {}
          try {
            targetEl.dispatchEvent(mouseUp);
          } catch (_) {}
          targetEl.dispatchEvent(clickEvt);
        }
        return false;
      }
    },
    true
  );
}

export function interceptTypingReceipts() {
  // Wait for wsHook to be available, then set up hooks
  const setupWsHook = () => {
    if (typeof window.wsHook !== "undefined") {
      console.log("Instafn: Setting up wsHook for typing receipts blocking");

      // Set up the before hook to intercept outgoing messages
      window.wsHook.before = function(data, url, wsObject) {
        try {
          // Check if this is a WebSocket to Instagram's chat service
          if (
            url &&
            (url.includes("edge-chat.instagram.com") ||
              url.includes("instagram.com"))
          ) {
            if (typeof data === "string") {
              // Check for typing indicators in various formats
              if (
                data.includes('"is_typing":1') ||
                data.includes('"is_typing": 1')
              ) {
                console.log("Instafn: Blocking typing receipt via wsHook");
                return data.replace(/"is_typing":\s*1/g, '"is_typing":0');
              }

              // Also check for the specific payload format you mentioned
              if (data.includes('"type":4') && data.includes('"is_typing":1')) {
                console.log(
                  "Instafn: Blocking typing receipt via wsHook (type 4)"
                );
                return data.replace(/"is_typing":\s*1/g, '"is_typing":0');
              }
            }
          }
        } catch (error) {
          console.log(
            "Instafn: Error processing typing receipt via wsHook:",
            error
          );
        }

        return data; // Return original data if no modification needed
      };

      // Set up the after hook for incoming messages (optional)
      window.wsHook.after = function(event, url, wsObject) {
        return event; // Pass through incoming messages unchanged
      };
    } else {
      // If wsHook is not available yet, try again in 100ms
      setTimeout(setupWsHook, 100);
    }
  };

  // Start setting up wsHook
  setupWsHook();

  // Intercept fetch requests to edge-chat.instagram.com
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, options] = args;

    // Check if this is a request to edge-chat.instagram.com/chat
    if (
      typeof url === "string" &&
      url.includes("edge-chat.instagram.com/chat")
    ) {
      // Check if this is a typing receipt request
      if (options && options.body) {
        try {
          let body = options.body;

          // Handle different body types
          if (typeof body === "string") {
            // Try to parse as JSON to check for typing indicators
            try {
              const parsed = JSON.parse(body);
              if (parsed.payload) {
                const payload = JSON.parse(parsed.payload);
                if (payload.is_typing === 1) {
                  console.log("Instafn: Blocking typing receipt via fetch");
                  // Modify the payload to set is_typing to 0
                  payload.is_typing = 0;
                  parsed.payload = JSON.stringify(payload);
                  options.body = JSON.stringify(parsed);
                }
              }
            } catch (e) {
              // If not JSON, check for the specific pattern in the request
              if (body.includes('"is_typing":1')) {
                console.log("Instafn: Blocking typing receipt via fetch");
                options.body = body.replace('"is_typing":1', '"is_typing":0');
              }
            }
          } else if (body instanceof FormData) {
            // Handle FormData
            const formData = new FormData();
            for (let [key, value] of body.entries()) {
              if (key === "payload" && typeof value === "string") {
                try {
                  const payload = JSON.parse(value);
                  if (payload.is_typing === 1) {
                    console.log(
                      "Instafn: Blocking typing receipt via fetch (FormData)"
                    );
                    payload.is_typing = 0;
                    formData.append(key, JSON.stringify(payload));
                  } else {
                    formData.append(key, value);
                  }
                } catch (e) {
                  formData.append(key, value);
                }
              } else {
                formData.append(key, value);
              }
            }
            options.body = formData;
          }
        } catch (error) {
          console.log("Instafn: Error processing typing receipt:", error);
        }
      }
    }

    return originalFetch.apply(this, args);
  };

  // Also intercept XMLHttpRequest for additional coverage
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._url = url;
    return originalXHROpen.apply(this, [method, url, ...args]);
  };

  XMLHttpRequest.prototype.send = function(data) {
    if (this._url && this._url.includes("edge-chat.instagram.com/chat")) {
      if (data && typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          if (parsed.payload) {
            const payload = JSON.parse(parsed.payload);
            if (payload.is_typing === 1) {
              console.log("Instafn: Blocking typing receipt via XHR");
              payload.is_typing = 0;
              parsed.payload = JSON.stringify(payload);
              data = JSON.stringify(parsed);
            }
          }
        } catch (e) {
          if (data.includes('"is_typing":1')) {
            console.log("Instafn: Blocking typing receipt via XHR");
            data = data.replace('"is_typing":1', '"is_typing":0');
          }
        }
      }
    }
    return originalXHRSend.call(this, data);
  };
}
