export function interceptLikes() {
  document.addEventListener(
    "click",
    async (e) => {
      if (e.isTrusted === false) return;
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
        const confirmed = (await window.Instafn?.confirmWithModal)
          ? await window.Instafn.confirmWithModal({
              title: "Confirm like",
              message: `Do you want to ${action} this post?`,
              confirmText: isLiked ? "Unlike" : "Like",
            })
          : confirm(`Do you want to ${action} this post?`);

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

  // Detect double clicks on post images
  document.addEventListener(
    "dblclick",
    async (e) => {
      if (e.isTrusted === false) return;

      // More specific selector to only target actual post images
      const postImage = e.target.closest(
        'article div[role="button"] img, article div[role="button"]'
      );

      if (postImage) {
        // Additional check to ensure this is actually a post image, not just any clickable div
        const postContainer = postImage.closest('article div[role="button"]');
        if (!postContainer) return;

        // Check if this container has post-specific attributes or structure
        const hasPostStructure =
          postContainer.querySelector(
            'img[alt*="photo"], img[alt*="image"], img[alt*="post"]'
          ) ||
          postContainer.querySelector("video") ||
          postContainer.closest('article[data-testid="post"]') ||
          postContainer.closest('div[data-testid="post"]');

        if (!hasPostStructure) return;

        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();

        if (postContainer && postContainer.querySelector("video")) {
          const evt = new MouseEvent("dblclick", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          postContainer.dispatchEvent(evt);
          return;
        }

        const isStory =
          window.location.pathname.includes("/stories/") ||
          (postContainer &&
            (postContainer.querySelector('[data-testid="story"]') ||
              postContainer.querySelector('[aria-label*="story"]')));
        const isReel =
          window.location.pathname.includes("/reels/") ||
          (postContainer &&
            (postContainer.querySelector('[data-testid="reel"]') ||
              postContainer.querySelector('[aria-label*="reel"]')));

        if (isStory || isReel) {
          const evt = new MouseEvent("dblclick", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          postContainer.dispatchEvent(evt);
          return;
        }

        const confirmed = (await window.Instafn?.confirmWithModal)
          ? await window.Instafn.confirmWithModal({
              title: "Confirm like",
              message: "Do you want to like this post?",
              confirmText: "Like",
            })
          : confirm("Do you want to like this post?");

        if (confirmed) {
          const evt = new MouseEvent("dblclick", {
            bubbles: true,
            cancelable: true,
            view: window,
          });
          postContainer.dispatchEvent(evt);
        }
        return false;
      }
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
        const confirmed = (await window.Instafn?.confirmWithModal)
          ? await window.Instafn.confirmWithModal({
              title: "Confirm comment",
              message: "Do you want to post this comment?",
              confirmText: "Post",
            })
          : confirm("Do you want to post this comment?");

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
          const confirmed = (await window.Instafn?.confirmWithModal)
            ? await window.Instafn.confirmWithModal({
                title: "Confirm comment",
                message: "Do you want to post this comment?",
                confirmText: "Post",
              })
            : confirm("Do you want to post this comment?");

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
        const confirmed = (await window.Instafn?.confirmWithModal)
          ? await window.Instafn.confirmWithModal({
              title: "Confirm call",
              message: "Do you want to start this call?",
              confirmText: "Start call",
            })
          : confirm("Do you want to start this call?");

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
          followText = followButton.querySelector('div[dir="auto"]');
        } else if (
          followButton.tagName === "DIV" &&
          followButton.getAttribute("role") === "button"
        ) {
          followText = followButton;
        }

        if (
          followText &&
          (followText.textContent?.trim() === "Follow" ||
            followText.textContent?.trim() === "Follow Back")
        ) {
          e.stopImmediatePropagation();
          e.stopPropagation();
          e.preventDefault();
          const confirmed = (await window.Instafn?.confirmWithModal)
            ? await window.Instafn.confirmWithModal({
                title: "Confirm follow",
                message: "Do you want to follow this user?",
                confirmText: "Follow",
              })
            : confirm("Do you want to follow this user?");

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
        const confirmed = (await window.Instafn?.confirmWithModal)
          ? await window.Instafn.confirmWithModal({
              title: "Confirm reaction",
              message: `Do you want to react with ${emoji} to this story?`,
              confirmText: "Send",
            })
          : confirm(`Do you want to react with ${emoji} to this story?`);

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
        const confirmed = (await window.Instafn?.confirmWithModal)
          ? await window.Instafn.confirmWithModal({
              title: "Confirm reply",
              message: "Do you want to send this story reply?",
              confirmText: "Send",
            })
          : confirm("Do you want to send this story reply?");

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
          const confirmed = (await window.Instafn?.confirmWithModal)
            ? await window.Instafn.confirmWithModal({
                title: "Confirm reply",
                message: "Do you want to send this story reply?",
                confirmText: "Send",
              })
            : confirm("Do you want to send this story reply?");

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
