import { escapeHtml } from "../utils.js";
import { formatRelativeTime, formatFullDate } from "../utils.js";
import { getUserProfilePic, getVerifiedCurrentUser } from "../profile.js";
import { handleLikeComment, handleDeleteComment } from "../comments-api.js";

/**
 * Handle reply to comment
 */
export function handleReplyComment(commentId, sidebarId) {
  const sidebar = document.getElementById(sidebarId);
  if (!sidebar) return;

  const input = sidebar.querySelector(".instafn-comment-input");
  if (input) {
    input.focus();
    // Use both dataset and setAttribute for compatibility
    input.dataset.replyingTo = commentId;
    input.setAttribute("data-replying-to", commentId);
    input.placeholder = `Reply to comment...`;
    console.log(
      `[Instafn Profile Comments] Reply button clicked - setting parentId: ${commentId}, verified: ${input
        .dataset.replyingTo || input.getAttribute("data-replying-to")}`
    );
  } else {
    console.error(
      "[Instafn Profile Comments] Could not find comment input element"
    );
  }
}

/**
 * Attach event listeners to reply elements
 */
export function attachReplyEventListeners(repliesList, replies, sidebarId) {
  if (!repliesList || !replies) return;

  replies.forEach((reply) => {
    // Find the reply element by comment ID
    const replyEl = repliesList.querySelector(
      `li[data-reply-username="${escapeHtml(reply.username)}"]`
    );
    if (!replyEl) return;

    // Attach like button listener
    const replyLikeHeart = replyEl.querySelector(
      `.instafn-comment-like-heart[data-comment-id="${reply.id}"]`
    );
    if (replyLikeHeart) {
      // Remove any existing listeners by cloning
      const newLikeHeart = replyLikeHeart.cloneNode(true);
      replyLikeHeart.parentNode.replaceChild(newLikeHeart, replyLikeHeart);
      newLikeHeart.addEventListener("click", () => {
        handleLikeComment(reply.id, newLikeHeart);
      });
    }

    // Attach reply button listener
    const replyReplyBtn = replyEl.querySelector(
      `.instafn-comment-reply-btn[data-comment-id="${reply.id}"]`
    );
    if (replyReplyBtn) {
      const newReplyBtn = replyReplyBtn.cloneNode(true);
      replyReplyBtn.parentNode.replaceChild(newReplyBtn, replyReplyBtn);
      newReplyBtn.addEventListener("click", () => {
        handleReplyComment(reply.id, sidebarId);
      });
    }

    // Attach delete button listener
    const replyDeleteBtn = replyEl.querySelector(
      `.instafn-comment-delete-btn[data-comment-id="${reply.id}"]`
    );
    if (replyDeleteBtn) {
      const newDeleteBtn = replyDeleteBtn.cloneNode(true);
      replyDeleteBtn.parentNode.replaceChild(newDeleteBtn, replyDeleteBtn);
      newDeleteBtn.addEventListener("click", () => {
        handleDeleteComment(reply.id);
      });
    }
  });
}

/**
 * Create a comment element matching Instagram's exact structure
 * Uses placeholder images initially - profile pics are lazy loaded
 */
export function createCommentElement(comment, currentUser, sidebarId) {
  const li = document.createElement("li");
  li.className = "_a9zj _a9zl";
  li.dataset.commentId = comment.id;

  // DEBUG: Log what we're getting
  console.log("[Instafn Profile Comments] Creating comment element:", {
    commentId: comment.id,
    commentUsername: comment.username,
    commentUserId: comment.userId,
    currentUserUsername: currentUser?.username,
    currentUserId: currentUser?.userId,
  });

  const isOwnComment = currentUser && comment.userId === currentUser.userId;

  // CRITICAL: Use comment.username (the commenter's username), NOT profileUsername
  const commenterUsername = comment.username;
  if (!commenterUsername) {
    console.error(
      "[Instafn Profile Comments] Comment missing username!",
      comment
    );
  }

  // Use placeholder image initially - will be lazy loaded
  const placeholderPic =
    "https://instagram.com/static/images/anonymousUser.jpg/23e7b3b2a737.jpg";

  // Store username in data attribute for lazy loading
  li.dataset.commenterUsername = commenterUsername;

  li.innerHTML = `
    <div class="_a9zm">
      <div class="_a9zn _a9zo">
        <a href="/${escapeHtml(commenterUsername)}/" role="link" tabindex="0">
          <img alt="${escapeHtml(
            commenterUsername
          )}'s profile picture" crossorigin="anonymous" draggable="false" src="${placeholderPic}" data-username="${escapeHtml(
    commenterUsername
  )}" class="instafn-lazy-profile-pic">
        </a>
      </div>
      <div class="_a9zr">
        <div class="instafn-comment-header-row">
          <a class="instafn-comment-username" href="/${escapeHtml(
            commenterUsername
          )}/" role="link" tabindex="0">${escapeHtml(
    commenterUsername
  )}</a> <span class="instafn-comment-text">${escapeHtml(comment.text)}</span>
        </div>
        <div class="instafn-comment-footer-row">
          <time class="instafn-comment-time" datetime="${new Date(
            comment.createdAt
          ).toISOString()}" title="${formatFullDate(
    comment.createdAt
  )}">${formatRelativeTime(comment.createdAt)}</time>
          <span class="instafn-comment-likes-count">${comment.likes || 0} ${
    comment.likes === 1 ? "like" : "likes"
  }</span>
          <button class="instafn-comment-reply-btn" data-comment-id="${
            comment.id
          }">
            <span>Reply</span>
          </button>
          ${
            isOwnComment
              ? `<button class="instafn-comment-delete-btn" data-comment-id="${comment.id}"><span>Delete</span></button>`
              : ""
          }
        </div>
      </div>
      <span class="_a9zu">
        <div class="instafn-comment-like-heart" role="button" tabindex="0" data-comment-id="${
          comment.id
        }" data-liked="${comment.liked || false}">
          <svg aria-label="Like" class="instafn-heart-icon" fill="${
            comment.liked ? "rgb(237, 73, 86)" : "none"
          }" height="12" role="img" viewBox="0 0 24 24" width="12"><title>Like</title><path d="${
    comment.liked
      ? "M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"
      : "M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"
  }" fill="${comment.liked ? "rgb(237, 73, 86)" : "currentColor"}" stroke="${
    comment.liked ? "rgb(237, 73, 86)" : "currentColor"
  }" stroke-width="1.5"></path></svg>
        </div>
      </span>
    </div>
    ${
      comment.replies && comment.replies.length > 0
        ? `
      <div class="instafn-comment-replies">
        <button class="instafn-view-replies">View replies (${
          comment.replies.length
        })</button>
        <ul class="_a9ym" style="display: none;">
            ${comment.replies
              .map((reply) => {
                return `
                <li class="_a9zj _a9zl" data-reply-username="${escapeHtml(
                  reply.username
                )}">
                    <div class="_a9zm">
                    <div class="_a9zn _a9zo">
                      <a href="/${escapeHtml(
                        reply.username
                      )}/" role="link" tabindex="0" style="height: 32px; width: 32px; display: block;">
                        <img alt="${escapeHtml(
                          reply.username
                        )}'s profile picture" crossorigin="anonymous" draggable="false" src="${placeholderPic}" data-username="${escapeHtml(
                  reply.username
                )}" class="instafn-lazy-profile-pic" style="width: 32px; height: 32px; border-radius: 50%; object-fit: cover;">
                      </a>
                    </div>
                    <div class="_a9zr">
                      <div class="instafn-comment-header-row">
                        <a class="instafn-comment-username" href="/${escapeHtml(
                          reply.username
                        )}/" role="link" tabindex="0">${escapeHtml(
                  reply.username
                )}</a>
                        <span class="instafn-comment-text">${escapeHtml(
                          reply.text
                        )}</span>
                      </div>
                      <div class="instafn-comment-footer-row">
                        <time class="instafn-comment-time" datetime="${new Date(
                          reply.createdAt
                        ).toISOString()}" title="${formatFullDate(
                  reply.createdAt
                )}">${formatRelativeTime(reply.createdAt)}</time>
                        <span class="instafn-comment-likes-count">${reply.likes ||
                          0} ${reply.likes === 1 ? "like" : "likes"}</span>
                        <button class="instafn-comment-reply-btn" data-comment-id="${
                          reply.id
                        }">
                          <span>Reply</span>
                        </button>
                        ${
                          currentUser && reply.userId === currentUser.userId
                            ? `<button class="instafn-comment-delete-btn" data-comment-id="${reply.id}"><span>Delete</span></button>`
                            : ""
                        }
                      </div>
                    </div>
                    <span class="_a9zu">
                      <div class="instafn-comment-like-heart" role="button" tabindex="0" data-comment-id="${
                        reply.id
                      }" data-liked="${reply.liked || false}">
                        <svg aria-label="Like" class="instafn-heart-icon" fill="${
                          reply.liked ? "rgb(237, 73, 86)" : "none"
                        }" height="12" role="img" viewBox="0 0 24 24" width="12"><title>Like</title><path d="${
                  reply.liked
                    ? "M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"
                    : "M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"
                }" fill="${
                  reply.liked ? "rgb(237, 73, 86)" : "currentColor"
                }" stroke="${
                  reply.liked ? "rgb(237, 73, 86)" : "currentColor"
                }" stroke-width="1.5"></path></svg>
                      </div>
                    </span>
                  </div>
                </li>
              `;
              })
              .join("")}
        </ul>
      </div>
    `
        : ""
    }
  `;

  // Add event listeners
  const likeHeart = li.querySelector(".instafn-comment-like-heart");
  if (likeHeart) {
    likeHeart.addEventListener("click", () => {
      handleLikeComment(comment.id, likeHeart);
    });
  }

  const replyBtn = li.querySelector(".instafn-comment-reply-btn");
  if (replyBtn) {
    replyBtn.addEventListener("click", () =>
      handleReplyComment(comment.id, sidebarId)
    );
  }

  const deleteBtn = li.querySelector(".instafn-comment-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => handleDeleteComment(comment.id));
  }

  const viewRepliesBtn = li.querySelector(".instafn-view-replies");
  if (viewRepliesBtn) {
    viewRepliesBtn.addEventListener("click", () => {
      const repliesList = li.querySelector("._a9ym");
      if (repliesList) {
        const isShowing = repliesList.style.display !== "none";
        repliesList.style.display = isShowing ? "none" : "block";
        viewRepliesBtn.textContent = isShowing
          ? `View replies (${comment.replies.length})`
          : `Hide replies (${comment.replies.length})`;

        // Lazy load profile pics when replies are shown
        if (!isShowing) {
          lazyLoadProfilePics(repliesList);
          // Attach event listeners to reply elements when they're shown
          attachReplyEventListeners(
            repliesList,
            comment.replies || [],
            sidebarId
          );
        }
      }
    });
  }

  return li;
}

/**
 * Lazy load profile pictures for all comments
 * Uses batching and delays to avoid rate limiting
 */
export async function lazyLoadProfilePics(container) {
  // Find all images that need to be loaded
  const images = container.querySelectorAll("img.instafn-lazy-profile-pic");

  // Get unique usernames to avoid duplicate fetches
  const usernameToImg = new Map();
  images.forEach((img) => {
    const username = img.dataset.username;
    if (username && !usernameToImg.has(username)) {
      usernameToImg.set(username, []);
    }
    if (username) {
      usernameToImg.get(username).push(img);
    }
  });

  const usernames = Array.from(usernameToImg.keys());
  if (usernames.length === 0) return;

  // Batch requests with delays to avoid rate limiting
  // Process in batches of 3 with 500ms delay between batches
  const BATCH_SIZE = 3;
  const BATCH_DELAY = 500;

  for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
    const batch = usernames.slice(i, i + BATCH_SIZE);

    // Process batch in parallel
    const batchPromises = batch.map(async (username) => {
      try {
        const profilePic = await getUserProfilePic(username);

        // Only update if we got a valid profile pic (not null/undefined)
        if (profilePic) {
          const imgElements = usernameToImg.get(username);
          if (imgElements) {
            imgElements.forEach((img) => {
              img.src = profilePic;
            });
          }
        }
        // If profilePic is null (rate limited or error), keep placeholder
      } catch (error) {
        console.warn(
          `[Instafn Profile Comments] Failed to load profile pic for ${username}:`,
          error
        );
      }
    });

    // Wait for batch to complete
    await Promise.all(batchPromises);

    // Add delay before next batch (except for the last batch)
    if (i + BATCH_SIZE < usernames.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
    }
  }
}

/**
 * Render comments in container
 */
export async function renderComments(container, comments, username, sidebarId, error = null) {
  let currentUser = null;
  try {
    currentUser = await getVerifiedCurrentUser();
  } catch (e) {
    // Continue without current user (won't show delete buttons)
    console.warn(
      "[Instafn Profile Comments] Could not get current user for rendering"
    );
  }

  // If there was an error fetching comments, show error message
  if (error) {
    container.innerHTML = `
      <div class="instafn-comments-empty">
        <div>Failed to fetch comments.</div>
        <div style="margin-top: 8px; color: rgb(var(--ig-secondary-text)); font-size: 14px;">
          Please try again later.
        </div>
      </div>
    `;
    return;
  }

  // DEBUG: Log all comments before rendering
  console.log("[Instafn Profile Comments] Rendering comments:", comments);
  comments.forEach((c, i) => {
    console.log(`[Instafn Profile Comments] Comment ${i}:`, {
      id: c.id,
      username: c.username,
      userId: c.userId,
      text: c.text?.substring(0, 50),
    });
  });

  if (comments.length === 0) {
    container.innerHTML = `
      <div class="instafn-comments-empty">
        <div>No comments yet.</div>
        <div style="margin-top: 8px; color: rgb(var(--ig-secondary-text)); font-size: 14px;">
          Be the first to comment!
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = '<ul class="_a9ym"></ul>';
  const commentsList = container.querySelector("._a9ym");

  // Create all comments synchronously (no async operations)
  // This makes them appear instantly
  const commentElements = comments.map((comment) =>
    createCommentElement(comment, currentUser, sidebarId)
  );

  // Append all comments at once
  commentElements.forEach((commentEl) => {
    commentsList.appendChild(commentEl);
  });

  // Lazy load profile pictures in the background
  lazyLoadProfilePics(container);
}
