import { confirmWithModal } from "../follow-analyzer/index.js";

export function interceptJavaScriptExecution() {
  console.log("🚀 Starting JavaScript execution interceptor...");

  // Helper to get stack trace
  const getStack = () => {
    try {
      return new Error().stack;
    } catch (e) {
      return "Stack trace unavailable";
    }
  };

  // Helper to log execution
  const logExecution = (type, data) => {
    const stack = getStack();
    console.log(`🔍 [JS EXEC] ${type}:`, {
      ...data,
      source: stack,
      timestamp: new Date().toISOString(),
    });
  };

  // Intercept eval()
  try {
    const originalEval = window.eval;
    window.eval = function(code) {
      logExecution("eval", {
        code: typeof code === "string" ? code : String(code),
        codeLength: typeof code === "string" ? code.length : 0,
      });
      return originalEval.apply(this, arguments);
    };
    console.log("✅ Intercepted eval()");
  } catch (e) {
    console.error("❌ Failed to intercept eval:", e);
  }

  // Intercept Function constructor
  try {
    const originalFunction = window.Function;
    window.Function = function(...args) {
      const code = args[args.length - 1];
      const params = args.slice(0, -1);
      logExecution("Function", {
        code: typeof code === "string" ? code : String(code),
        params: params,
        codeLength: typeof code === "string" ? code.length : 0,
      });
      return originalFunction.apply(this, args);
    };
    console.log("✅ Intercepted Function()");
  } catch (e) {
    console.error("❌ Failed to intercept Function:", e);
  }

  // Intercept setTimeout with string code
  try {
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = function(fn, delay, ...args) {
      if (typeof fn === "string") {
        logExecution("setTimeout", {
          code: fn,
          delay: delay,
          codeLength: fn.length,
        });
      }
      return originalSetTimeout.apply(this, arguments);
    };
    console.log("✅ Intercepted setTimeout()");
  } catch (e) {
    console.error("❌ Failed to intercept setTimeout:", e);
  }

  // Intercept setInterval with string code
  try {
    const originalSetInterval = window.setInterval;
    window.setInterval = function(fn, delay, ...args) {
      if (typeof fn === "string") {
        logExecution("setInterval", {
          code: fn,
          delay: delay,
          codeLength: fn.length,
        });
      }
      return originalSetInterval.apply(this, arguments);
    };
    console.log("✅ Intercepted setInterval()");
  } catch (e) {
    console.error("❌ Failed to intercept setInterval:", e);
  }

  // Intercept script tag creation and execution
  try {
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName, options) {
      const element = originalCreateElement.call(this, tagName, options);
      if (tagName && tagName.toLowerCase() === "script") {
        // Intercept src attribute
        const originalSetAttribute = element.setAttribute;
        element.setAttribute = function(name, value) {
          if (name === "src" && value) {
            logExecution("script-src", {
              src: value,
            });
          }
          return originalSetAttribute.apply(this, arguments);
        };

        // Intercept textContent/innerHTML for inline scripts
        const originalTextContentSetter = Object.getOwnPropertyDescriptor(
          HTMLScriptElement.prototype,
          "textContent"
        );
        if (originalTextContentSetter && originalTextContentSetter.set) {
          Object.defineProperty(element, "textContent", {
            set: function(value) {
              if (value && typeof value === "string" && value.trim()) {
                logExecution("script-inline-textContent", {
                  code: value,
                  codeLength: value.length,
                });
              }
              originalTextContentSetter.set.call(this, value);
            },
            get: originalTextContentSetter.get,
            configurable: true,
          });
        }

        // Intercept when script is appended to DOM
        const originalAppendChild = element.appendChild;
        element.appendChild = function(child) {
          if (child && child.tagName === "SCRIPT") {
            if (child.src) {
              logExecution("script-append-src", {
                src: child.src,
              });
            } else if (child.textContent) {
              logExecution("script-append-inline", {
                code: child.textContent,
                codeLength: child.textContent.length,
              });
            }
          }
          return originalAppendChild.apply(this, arguments);
        };
      }
      return element;
    };
    console.log("✅ Intercepted createElement()");
  } catch (e) {
    console.error("❌ Failed to intercept createElement:", e);
  }

  // Use MutationObserver to catch all script additions
  try {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1 && node.tagName === "SCRIPT") {
            if (node.src) {
              logExecution("script-dom-added-src", {
                src: node.src,
                fullURL: node.src.startsWith("http")
                  ? node.src
                  : new URL(node.src, window.location.href).href,
              });
            } else if (node.textContent && node.textContent.trim()) {
              logExecution("script-dom-added-inline", {
                code: node.textContent,
                codeLength: node.textContent.length,
              });
            }
          }
        });
      });
    });

    // Start observing immediately
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
      console.log("✅ MutationObserver watching for scripts");
    } else {
      // Wait for DOM
      const checkDOM = setInterval(() => {
        if (document.documentElement) {
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
          });
          clearInterval(checkDOM);
          console.log("✅ MutationObserver watching for scripts (delayed)");
        }
      }, 100);
    }
  } catch (e) {
    console.error("❌ Failed to set up MutationObserver:", e);
  }

  // Intercept innerHTML/outerHTML modifications
  try {
    const interceptInnerHTML = (proto, property) => {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(proto, property);
        if (descriptor && descriptor.set) {
          Object.defineProperty(proto, property, {
            set: function(value) {
              if (typeof value === "string") {
                // Check for script tags
                const scriptMatch = value.match(
                  /<script[^>]*>([\s\S]*?)<\/script>/gi
                );
                if (scriptMatch) {
                  scriptMatch.forEach((scriptTag) => {
                    const srcMatch = scriptTag.match(
                      /src\s*=\s*["']([^"']+)["']/i
                    );
                    if (srcMatch) {
                      logExecution(`${property}-script-src`, {
                        src: srcMatch[1],
                        html: scriptTag.substring(0, 200),
                      });
                    } else {
                      const codeMatch = scriptTag.match(
                        /<script[^>]*>([\s\S]*?)<\/script>/i
                      );
                      if (codeMatch && codeMatch[1].trim()) {
                        logExecution(`${property}-script-inline`, {
                          code: codeMatch[1],
                          codeLength: codeMatch[1].length,
                        });
                      }
                    }
                  });
                }
              }
              descriptor.set.call(this, value);
            },
            get: descriptor.get,
            configurable: true,
          });
        }
      } catch (e) {
        // Silently fail for properties we can't intercept
      }
    };

    // Apply to prototypes
    [HTMLElement.prototype, Element.prototype].forEach((proto) => {
      interceptInnerHTML(proto, "innerHTML");
      interceptInnerHTML(proto, "outerHTML");
    });
    console.log("✅ Intercepted innerHTML/outerHTML");
  } catch (e) {
    console.error("❌ Failed to intercept innerHTML/outerHTML:", e);
  }

  // Intercept dynamic imports
  try {
    const originalImport = window.__import || (() => {});
    // Note: import() is a keyword, so we can't directly intercept it
    // But we can log when modules are loaded via other means
    console.log("ℹ️  Note: Dynamic import() cannot be directly intercepted");
  } catch (e) {
    // Ignore
  }

  console.log("✅ JavaScript execution interceptor fully enabled!");
  console.log("📝 Watch the console for 🔍 [JS EXEC] messages");
}

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

function stopEvent(e) {
  e.stopImmediatePropagation();
  e.stopPropagation();
  e.preventDefault();
}

const FULL_CLICK_INIT = {
  bubbles: true,
  cancelable: true,
  composed: true,
  view: window,
};

function dispatchFullClick(target) {
  const pointerDown = new PointerEvent("pointerdown", {
    ...FULL_CLICK_INIT,
    pointerType: "mouse",
  });
  const mouseDown = new MouseEvent("mousedown", FULL_CLICK_INIT);
  const mouseUp = new MouseEvent("mouseup", FULL_CLICK_INIT);
  const clickEvt = new MouseEvent("click", FULL_CLICK_INIT);

  try {
    target.dispatchEvent(pointerDown);
  } catch (_) {}
  try {
    target.dispatchEvent(mouseDown);
  } catch (_) {}
  try {
    target.dispatchEvent(mouseUp);
  } catch (_) {}
  target.dispatchEvent(clickEvt);
}

function dispatchMouseClick(target) {
  const evt = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window,
  });
  target.dispatchEvent(evt);
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
        stopEvent(e);
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
          dispatchFullClick(targetEl);
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
        dispatchFullClick(likeBtn);
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
        stopEvent(e);
        const confirmed = await confirmAction(
          {
            title: "Confirm comment",
            message: "Do you want to post this comment?",
            confirmText: "Post",
          },
          "Do you want to post this comment?"
        );

        if (confirmed) {
          dispatchMouseClick(commentButton);
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
        const commentField = e.target.closest(
          'textarea, input, [contenteditable="true"], [role="textbox"]'
        );

        if (commentField) {
          // Only treat fields that look like comment boxes (avoid DM/search inputs)
          const fieldMeta =
            [
              commentField.getAttribute("aria-label") || "",
              commentField.getAttribute("placeholder") || "",
              commentField.getAttribute("name") || "",
            ]
              .join(" ")
              .toLowerCase() || "";

          const isLikelyComment =
            fieldMeta.includes("comment") ||
            !!commentField.closest('[data-testid="post_comment_input"]');

          // Reels overlay sometimes lacks explicit comment labels; fall back to presence of a Post button nearby
          const container =
            commentField.closest("form, div, section") || document;
          const nearbyPostBtn = container.querySelector(
            'div[role="button"][tabindex="0"]'
          );
          const hasPostButton =
            nearbyPostBtn && nearbyPostBtn.textContent.trim() === "Post";

          if (!isLikelyComment && !hasPostButton) return;

          stopEvent(e);
          const confirmed = await confirmAction(
            {
              title: "Confirm comment",
              message: "Do you want to post this comment?",
              confirmText: "Post",
            },
            "Do you want to post this comment?"
          );

          if (confirmed) {
            const postBtn = container.querySelector(
              'div[role="button"][tabindex="0"]'
            );
            if (postBtn && postBtn.textContent.trim() === "Post") {
              dispatchMouseClick(postBtn);
            } else {
              const keyEvt = new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                cancelable: true,
              });
              commentField.dispatchEvent(keyEvt);
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
        stopEvent(e);
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
          dispatchMouseClick(clickable);
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
          stopEvent(e);
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
            dispatchMouseClick(followButton);
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
        stopEvent(e);
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
          dispatchMouseClick(clickable);
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
        stopEvent(e);
        const confirmed = await confirmAction(
          {
            title: "Confirm reply",
            message: "Do you want to send this story reply?",
            confirmText: "Send",
          },
          "Do you want to send this story reply?"
        );

        if (confirmed) {
          dispatchMouseClick(sendButton);
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
          stopEvent(e);
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
              dispatchMouseClick(sendBtn);
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
        stopEvent(e);

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
          dispatchFullClick(targetEl);
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

export function forceHoverOnElement(selectorOrElement) {
  let element;

  if (typeof selectorOrElement === "string") {
    // Try by ID first
    element = document.getElementById(selectorOrElement);
    // If not found, try as selector
    if (!element) {
      element = document.querySelector(selectorOrElement);
    }
  } else if (selectorOrElement instanceof Element) {
    element = selectorOrElement;
  } else {
    console.error("forceHoverOnElement: Invalid selector or element");
    return false;
  }

  if (!element) {
    console.error("forceHoverOnElement: Element not found");
    return false;
  }

  console.log("🖱️ Forcing hover on element:", element);

  // Create and dispatch mouse events to simulate hover
  const mouseEnter = new MouseEvent("mouseenter", {
    bubbles: true,
    cancelable: true,
    view: window,
    relatedTarget: null,
  });

  const mouseOver = new MouseEvent("mouseover", {
    bubbles: true,
    cancelable: true,
    view: window,
    relatedTarget: null,
  });

  const pointerEnter = new PointerEvent("pointerenter", {
    bubbles: true,
    cancelable: true,
    view: window,
    pointerType: "mouse",
    relatedTarget: null,
  });

  const pointerOver = new PointerEvent("pointerover", {
    bubbles: true,
    cancelable: true,
    view: window,
    pointerType: "mouse",
    relatedTarget: null,
  });

  // Dispatch events in order
  try {
    element.dispatchEvent(pointerEnter);
    element.dispatchEvent(pointerOver);
    element.dispatchEvent(mouseEnter);
    element.dispatchEvent(mouseOver);

    // Also trigger CSS :hover state by setting a class if needed
    element.classList.add("force-hover");

    console.log("✅ Hover events dispatched successfully");
    return true;
  } catch (error) {
    console.error("❌ Error dispatching hover events:", error);
    return false;
  }
}

export function keepElementClicked(selectorOrElement, duration = null) {
  let element;

  if (typeof selectorOrElement === "string") {
    // Try by ID first
    element = document.getElementById(selectorOrElement);
    // If not found, try as selector
    if (!element) {
      element = document.querySelector(selectorOrElement);
    }
  } else if (selectorOrElement instanceof Element) {
    element = selectorOrElement;
  } else {
    console.error("keepElementClicked: Invalid selector or element");
    return false;
  }

  if (!element) {
    console.error("keepElementClicked: Element not found");
    return false;
  }

  console.log("🖱️ Keeping element clicked:", element);

  // Create and dispatch mouse down events
  const pointerDown = new PointerEvent("pointerdown", {
    bubbles: true,
    cancelable: true,
    view: window,
    pointerType: "mouse",
    button: 0,
    buttons: 1,
  });

  const mouseDown = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    buttons: 1,
  });

  // Dispatch down events
  try {
    element.dispatchEvent(pointerDown);
    element.dispatchEvent(mouseDown);

    // Add a class to indicate pressed state
    element.classList.add("force-clicked");
    element.setAttribute("data-force-clicked", "true");

    // Store reference to element for cleanup
    if (!window._instafnClickedElements) {
      window._instafnClickedElements = new Set();
    }
    window._instafnClickedElements.add(element);

    console.log("✅ Element is now in clicked state");

    // If duration is specified, release after that time
    if (duration && duration > 0) {
      setTimeout(() => {
        releaseElementClick(element);
      }, duration);
    }

    return true;
  } catch (error) {
    console.error("❌ Error keeping element clicked:", error);
    return false;
  }
}

export function releaseElementClick(selectorOrElement) {
  let element;

  if (typeof selectorOrElement === "string") {
    element = document.getElementById(selectorOrElement);
    if (!element) {
      element = document.querySelector(selectorOrElement);
    }
  } else if (selectorOrElement instanceof Element) {
    element = selectorOrElement;
  } else {
    console.error("releaseElementClick: Invalid selector or element");
    return false;
  }

  if (!element) {
    console.error("releaseElementClick: Element not found");
    return false;
  }

  // Create and dispatch mouse up events
  const pointerUp = new PointerEvent("pointerup", {
    bubbles: true,
    cancelable: true,
    view: window,
    pointerType: "mouse",
    button: 0,
    buttons: 0,
  });

  const mouseUp = new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    buttons: 0,
  });

  const click = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    buttons: 0,
  });

  try {
    element.dispatchEvent(pointerUp);
    element.dispatchEvent(mouseUp);
    element.dispatchEvent(click);

    // Remove pressed state
    element.classList.remove("force-clicked");
    element.removeAttribute("data-force-clicked");

    // Remove from tracked elements
    if (window._instafnClickedElements) {
      window._instafnClickedElements.delete(element);
    }

    console.log("✅ Element click released");
    return true;
  } catch (error) {
    console.error("❌ Error releasing element click:", error);
    return false;
  }
}

// Make it available globally for easy console access
if (typeof window !== "undefined") {
  window.Instafn = window.Instafn || {};
  window.Instafn.forceHover = forceHoverOnElement;
  window.Instafn.keepClicked = keepElementClicked;
  window.Instafn.releaseClick = releaseElementClick;
}
