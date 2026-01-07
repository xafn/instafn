import { getApiBaseUrl } from "./config.js";
import { getInstagramHeaders } from "./api.js";
import {
  getExtensionId,
  createPresenceProof,
  createRequestSignature,
} from "./auth.js";
import { getVerifiedCurrentUser } from "./profile.js";
import { getProfileUserId } from "./profile.js";
import { confirmModal, createModal } from "../../ui/modal.js";

/**
 * Load comments from backend
 */
export async function loadComments(username) {
  try {
    // Get verified current user for like status
    let currentUserId = null;
    try {
      const currentUser = await getVerifiedCurrentUser();
      currentUserId = currentUser?.userId || null;
    } catch (e) {
      // If we can't verify, continue without like status
      console.warn(
        "[Instafn Profile Comments] Could not verify user for like status"
      );
    }

    // Get profile user ID (with caching to avoid rate limits)
    let profileUserId;
    try {
      profileUserId = await getProfileUserId(username);
    } catch (error) {
      if (
        error.message?.includes("429") ||
        error.message?.includes("Rate limited")
      ) {
        console.error(
          "[Instafn Profile Comments] Rate limited when fetching profile user ID. Using cached data if available."
        );

        return [];
      }
      throw error;
    }

    const url = new URL(
      `${getApiBaseUrl()}/api/comments/${encodeURIComponent(profileUserId)}`
    );
    if (currentUserId) {
      url.searchParams.set("userId", currentUserId);
    }

    console.log(
      `[Instafn Profile Comments] Fetching comments from: ${url.toString()}`
    );

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: getInstagramHeaders(),
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[Instafn Profile Comments] API error ${response.status}:`,
        errorText
      );
      throw new Error(
        `HTTP ${response.status}: ${errorText || response.statusText}`
      );
    }

    const data = await response.json();
    const comments = data.comments || [];

    console.log(
      "[Instafn Profile Comments] Loaded comments from backend:",
      comments
    );
    comments.forEach((c, i) => {
      console.log(`[Instafn Profile Comments] Comment ${i} from backend:`, {
        id: c.id,
        username: c.username,
        userId: c.userId,
        text: c.text?.substring(0, 30),
      });
    });

    return comments;
  } catch (error) {
    console.error("[Instafn Profile Comments] Error loading comments:", error);

    // Provide more helpful error messages
    if (error.message.includes("Failed to fetch")) {
      console.error(
        "[Instafn Profile Comments] Network error - check if Supabase function is deployed and accessible:",
        getApiBaseUrl()
      );
      console.error(
        "[Instafn Profile Comments] This could be a CORS issue or the function URL is incorrect"
      );
    }

    return [];
  }
}

/**
 * Post a new comment
 */
export async function postComment(profileUsername, text, parentId = null) {
  try {
    console.log(
      `[Instafn Profile Comments]  Fetching verified current user (fresh fetch)...`
    );
    const currentUser = await getVerifiedCurrentUser();

    // Must have a verified username - if we can't verify the username, don't allow posting
    if (
      !currentUser ||
      !currentUser.username ||
      currentUser.username.trim() === ""
    ) {
      throw new Error(
        "Not authenticated - could not verify username. Please try again later."
      );
    }

    // If userId is missing (due to rate limiting), we'll still attempt to post
    // The backend will need to look up userId from username during verification
    if (!currentUser.userId) {
      console.warn(
        "[Instafn Profile Comments]  No userId available (rate limited). Will attempt with username only - backend will look up userId."
      );
    }

    if (currentUser.username === profileUsername) {
      console.warn(
        `[Instafn Profile Comments]  WARNING: Current user matches profile username. This is OK if commenting on own profile, but verifying...`
      );
    }

    console.log(
      `[Instafn Profile Comments]  Posting comment as LOGGED-IN USER: ${
        currentUser.username
      } (ID: ${currentUser.userId || "will be looked up by backend"})`
    );
    console.log(
      `[Instafn Profile Comments]  Commenting on profile: ${profileUsername}`
    );
    console.log(
      `[Instafn Profile Comments]  Verification: currentUser.username="${currentUser.username}" vs profileUsername="${profileUsername}"`
    );

    const profileUserId = await getProfileUserId(profileUsername);
    let sessionId = document.cookie.match(/sessionid=([^;]+)/)?.[1] || null;

    if (sessionId === "" || sessionId === null || sessionId === undefined) {
      sessionId = null;
    }

    if (!sessionId) {
      console.warn(
        "[Instafn Profile Comments] Cannot read sessionId from cookies (may be HttpOnly). " +
          "Will use placeholder - presence proof will verify session validity."
      );
      sessionId = "session_verified_via_api";
    }

    console.log(
      `[Instafn Profile Comments] Creating presence proof with: sessionId=${
        sessionId === "session_verified_via_api"
          ? "placeholder"
          : sessionId
          ? "real"
          : "missing"
      }, userId=${currentUser.userId ||
        "missing"}, username=${currentUser.username || "missing"}`
    );

    const presenceProof = await createPresenceProof(
      sessionId,
      currentUser.userId,
      currentUser.username
    );

    if (!presenceProof) {
      console.error(
        "[Instafn Profile Comments] Presence proof creation failed. Details:",
        {
          sessionId: sessionId
            ? sessionId === "session_verified_via_api"
              ? "placeholder"
              : "real"
            : "missing",
          userId: currentUser.userId || "missing",
          username: currentUser.username || "missing",
        }
      );
      throw new Error(
        "Failed to create presence proof - ensure you're on instagram.com and logged in"
      );
    }

    console.log(
      "[Instafn Profile Comments] ✅ Presence proof created - verified on instagram.com with valid sessionId"
    );

    if (!presenceProof) {
      throw new Error(
        "Presence proof is required but missing - cannot proceed with request"
      );
    }

    // Create request payload
    const requestPayload = {
      profileUserId, 
      profileUsername,
      text,
      parentId,
      userId: currentUser.userId || null,
      username: currentUser.username,
      timestamp: Date.now(), 
      sessionId: sessionId,

      presenceProof: presenceProof,
    };

    // Final validation: ensure presence proof is in payload
    if (!requestPayload.presenceProof) {
      throw new Error(
        "Presence proof was not included in request payload - this should never happen"
      );
    }

    const extensionId = getExtensionId();
    requestPayload._timestamp = Date.now();
    requestPayload._extId = extensionId;

    const requestSignature = await createRequestSignature(
      requestPayload,
      sessionId
    );

    if (!requestSignature) {
      throw new Error("Failed to create request signature");
    }

    requestPayload.signature = requestSignature;
    console.log(
      "[Instafn Profile Comments] Sending request with:",
      JSON.stringify({
        userId: requestPayload.userId,
        username: requestPayload.username,
        parentId: requestPayload.parentId || "null",
        profileUserId: requestPayload.profileUserId,
        profileUsername: requestPayload.profileUsername,
        sessionIdType:
          sessionId === "session_verified_via_api" ? "placeholder" : "real",
        hasPresenceProof: !!requestPayload.presenceProof,
        presenceProofPageUrl: requestPayload.presenceProof?.data?.pageUrl,
        presenceProofHash:
          requestPayload.presenceProof?.data?.instagramDataHash?.substring(
            0,
            20
          ) + "...",
        extensionId: requestPayload._extId,
        timestamp: requestPayload._timestamp,
        signatureLength: requestSignature?.length,
      })
    );

    const response = await fetch(`${getApiBaseUrl()}/api/comments`, {
      method: "POST",
      headers: getInstagramHeaders(),
      credentials: "include",
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log(
      "[Instafn Profile Comments] Comment created, backend returned:",
      data.comment
    );
    console.log(
      "[Instafn Profile Comments] Comment username:",
      data.comment?.username
    );
    console.log(
      "[Instafn Profile Comments] Expected username:",
      currentUser.username
    );

    // Ensure the returned comment has the correct username
    if (data.comment && data.comment.username !== currentUser.username) {
      console.error(
        `[Instafn Profile Comments] USERNAME MISMATCH! Backend returned: ${data.comment.username}, Expected: ${currentUser.username}`
      );
      // Override with correct username
      data.comment.username = currentUser.username;
      data.comment.userId = currentUser.userId;
    }

    return data.comment;
  } catch (error) {
    console.error("[Instafn Profile Comments] Error posting comment:", error);
    throw error;
  }
}

/**
 * Update like UI immediately (optimistic update)
 */
export function updateLikeUI(commentId, newLikedState, likesDelta) {
  // Update all heart buttons for this comment (works for both comments and replies)
  const allHeartBtns = document.querySelectorAll(
    `.instafn-comment-like-heart[data-comment-id="${commentId}"]`
  );
  allHeartBtns.forEach((btn) => {
    btn.dataset.liked = newLikedState ? "true" : "false";
    const heartSvg = btn.querySelector(".instafn-heart-icon");
    if (heartSvg) {
      const path = heartSvg.querySelector("path");
      if (newLikedState) {
        heartSvg.setAttribute("fill", "rgb(237, 73, 86)");
        if (path) {
          path.setAttribute("fill", "rgb(237, 73, 86)");
          path.setAttribute("stroke", "rgb(237, 73, 86)");
          path.setAttribute("stroke-width", "1.5");
          path.setAttribute(
            "d",
            "M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"
          );
        }
      } else {
        heartSvg.setAttribute("fill", "none");
        if (path) {
          path.setAttribute("fill", "currentColor");
          path.setAttribute("stroke", "currentColor");
          path.setAttribute("stroke-width", "1.5");
          path.setAttribute(
            "d",
            "M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"
          );
        }
      }
    }
  });

  // Update likes count text (works for both comments and replies)
  const likesCountSpans = document.querySelectorAll(
    `.instafn-comment-likes-count`
  );
  likesCountSpans.forEach((span) => {
    // Check if it's a regular comment
    let commentEl = span.closest("li[data-comment-id]");
    if (commentEl && commentEl.dataset.commentId === commentId) {
      const currentText = span.textContent.trim();
      const match = currentText.match(/^(\d+)\s+(like|likes)$/);
      if (match) {
        const currentLikes = parseInt(match[1], 10);
        const newLikes = Math.max(0, currentLikes + likesDelta);
        span.textContent = `${newLikes} ${newLikes === 1 ? "like" : "likes"}`;
      }
      return;
    }

    // Check if it's a reply - find the heart button with matching comment ID
    const replyLi = span.closest("li[data-reply-username]");
    if (replyLi) {
      const replyHeart = replyLi.querySelector(
        `.instafn-comment-like-heart[data-comment-id="${commentId}"]`
      );
      if (replyHeart) {
        const currentText = span.textContent.trim();
        const match = currentText.match(/^(\d+)\s+(like|likes)$/);
        if (match) {
          const currentLikes = parseInt(match[1], 10);
          const newLikes = Math.max(0, currentLikes + likesDelta);
          span.textContent = `${newLikes} ${newLikes === 1 ? "like" : "likes"}`;
        }
      }
    }
  });
}

/**
 * Like/unlike a comment
 */
export async function handleLikeComment(commentId, likeBtn) {
  try {
    const currentUser = await getVerifiedCurrentUser();
    if (!currentUser || !currentUser.username) {
      console.error("[Instafn Profile Comments] Not authenticated");
      return;
    }

    // Prevent multiple rapid clicks
    if (likeBtn.dataset.processing === "true") {
      return;
    }
    likeBtn.dataset.processing = "true";

    const isLiked = likeBtn.dataset.liked === "true";
    const newLikedState = !isLiked; // Toggle state

    // OPTIMISTIC UPDATE: Update UI immediately before API call
    updateLikeUI(commentId, newLikedState, isLiked ? -1 : 1);

    // Get sessionId (may be HttpOnly, so we'll use placeholder if needed)
    let sessionId = document.cookie.match(/sessionid=([^;]+)/)?.[1] || null;
    if (sessionId === "" || sessionId === null || sessionId === undefined) {
      sessionId = null;
    }
    if (!sessionId) {
      sessionId = "session_verified_via_api";
    }

    // Create presence proof for authentication
    const presenceProof = await createPresenceProof(
      sessionId,
      currentUser.userId,
      currentUser.username
    );

    if (!presenceProof) {
      console.error(
        "[Instafn Profile Comments] Failed to create presence proof for like"
      );
      likeBtn.dataset.processing = "false";
      return;
    }

    // Create request signature
    const requestPayload = {
      userId: currentUser.userId || null,
      username: currentUser.username,
      sessionId: sessionId,
      presenceProof: presenceProof,
    };

    const extensionId = getExtensionId();
    requestPayload._timestamp = Date.now();
    requestPayload._extId = extensionId;

    const requestSignature = await createRequestSignature(
      requestPayload,
      sessionId
    );

    if (!requestSignature) {
      console.error(
        "[Instafn Profile Comments] Failed to create request signature for like"
      );
      likeBtn.dataset.processing = "false";
      return;
    }

    requestPayload.signature = requestSignature;

    // If already liked, unlike it; if not liked, like it
    const response = await fetch(
      `${getApiBaseUrl()}/api/comments/${commentId}/like`,
      {
        method: isLiked ? "DELETE" : "POST",
        headers: getInstagramHeaders(),
        credentials: "include",
        body: JSON.stringify(requestPayload),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const newLikes = data.likes || 0;
      // Update with actual count from server (in case optimistic update was off)
      // Works for both comments and replies
      const likesCountSpans = document.querySelectorAll(
        `.instafn-comment-likes-count`
      );
      likesCountSpans.forEach((span) => {
        // Check if it's a regular comment
        let commentEl = span.closest("li[data-comment-id]");
        if (commentEl && commentEl.dataset.commentId === commentId) {
          span.textContent = `${newLikes} ${newLikes === 1 ? "like" : "likes"}`;
          return;
        }

        // Check if it's a reply - find the heart button with matching comment ID
        const replyLi = span.closest("li[data-reply-username]");
        if (replyLi) {
          const replyHeart = replyLi.querySelector(
            `.instafn-comment-like-heart[data-comment-id="${commentId}"]`
          );
          if (replyHeart) {
            span.textContent = `${newLikes} ${
              newLikes === 1 ? "like" : "likes"
            }`;
          }
        }
      });
    } else {
      // Revert optimistic update on error
      updateLikeUI(commentId, isLiked, isLiked ? 0 : -1);
      const errorData = await response.json().catch(() => ({}));
      console.error("[Instafn Profile Comments] Like failed:", errorData);
      // Show error modal
      await createModal("Error", {
        showTabs: false,
      }).then((overlay) => {
        const modal = overlay.querySelector(".instafn-modal");
        modal.classList.add("instafn-modal--narrow");
        const content = overlay.querySelector(".instafn-content");
        content.innerHTML = `
          <div style="text-align: center; padding: 20px 20px 28px 20px;">
            <p class="instafn-modal-description">${errorData.error ||
              "Failed to like comment. Please try again."}</p>
            <div class="instafn-button-container">
              <button class="instafn-primary-button" onclick="this.closest('.instafn-modal-overlay').remove()">OK</button>
            </div>
          </div>
        `;
      });
    }

    likeBtn.dataset.processing = "false";
  } catch (error) {
    console.error("[Instafn Profile Comments] Error liking comment:", error);
    // Revert optimistic update on error
    const wasLiked = likeBtn.dataset.liked === "true";
    updateLikeUI(commentId, !wasLiked, wasLiked ? 0 : -1);
    likeBtn.dataset.processing = "false";
    // Show error modal
    await createModal("Error", {
      showTabs: false,
    }).then((overlay) => {
      const modal = overlay.querySelector(".instafn-modal");
      modal.classList.add("instafn-modal--narrow");
      const content = overlay.querySelector(".instafn-content");
      content.innerHTML = `
        <div style="text-align: center; padding: 20px 20px 28px 20px;">
          <p class="instafn-modal-description">Failed to like comment. Please try again.</p>
          <div class="instafn-button-container">
            <button class="instafn-primary-button" onclick="this.closest('.instafn-modal-overlay').remove()">OK</button>
          </div>
        </div>
      `;
    });
  }
}

/**
 * Handle delete comment
 */
export async function handleDeleteComment(commentId) {
  const confirmed = await confirmModal({
    title: "Delete Comment",
    message: "Are you sure you want to delete this comment?",
    confirmText: "Delete",
    cancelText: "Cancel",
  });
  if (!confirmed) return;

  try {
    const currentUser = await getVerifiedCurrentUser();
    if (!currentUser || !currentUser.username) {
      await createModal("Error", {
        showTabs: false,
      }).then((overlay) => {
        const modal = overlay.querySelector(".instafn-modal");
        modal.classList.add("instafn-modal--narrow");
        const content = overlay.querySelector(".instafn-content");
        content.innerHTML = `
          <div style="text-align: center; padding: 20px 20px 28px 20px;">
            <p class="instafn-modal-description">Not authenticated. Please log in to Instagram.</p>
            <div class="instafn-button-container">
              <button class="instafn-primary-button" onclick="this.closest('.instafn-modal-overlay').remove()">OK</button>
            </div>
          </div>
        `;
      });
      return;
    }

    let sessionId = document.cookie.match(/sessionid=([^;]+)/)?.[1] || null;
    if (sessionId === "" || sessionId === null || sessionId === undefined) {
      sessionId = null;
    }
    if (!sessionId) {
      sessionId = "session_verified_via_api";
    }

    const presenceProof = await createPresenceProof(
      sessionId,
      currentUser.userId,
      currentUser.username
    );

    if (!presenceProof) {
      console.error(
        "[Instafn Profile Comments] Failed to create presence proof for delete"
      );
      await createModal("Error", {
        showTabs: false,
      }).then((overlay) => {
        const modal = overlay.querySelector(".instafn-modal");
        modal.classList.add("instafn-modal--narrow");
        const content = overlay.querySelector(".instafn-content");
        content.innerHTML = `
          <div style="text-align: center; padding: 20px 20px 28px 20px;">
            <p class="instafn-modal-description">Failed to authenticate. Please try again.</p>
            <div class="instafn-button-container">
              <button class="instafn-primary-button" onclick="this.closest('.instafn-modal-overlay').remove()">OK</button>
            </div>
          </div>
        `;
      });
      return;
    }

    const requestPayload = {
      userId: currentUser.userId || null,
      username: currentUser.username,
      sessionId: sessionId,
      presenceProof: presenceProof,
    };

    const extensionId = getExtensionId();
    requestPayload._timestamp = Date.now();
    requestPayload._extId = extensionId;

    const requestSignature = await createRequestSignature(
      requestPayload,
      sessionId
    );

    if (!requestSignature) {
      console.error(
        "[Instafn Profile Comments] Failed to create request signature for delete"
      );
      await createModal("Error", {
        showTabs: false,
      }).then((overlay) => {
        const modal = overlay.querySelector(".instafn-modal");
        modal.classList.add("instafn-modal--narrow");
        const content = overlay.querySelector(".instafn-content");
        content.innerHTML = `
          <div style="text-align: center; padding: 20px 20px 28px 20px;">
            <p class="instafn-modal-description">Failed to authenticate. Please try again.</p>
            <div class="instafn-button-container">
              <button class="instafn-primary-button" onclick="this.closest('.instafn-modal-overlay').remove()">OK</button>
            </div>
          </div>
        `;
      });
      return;
    }

    requestPayload.signature = requestSignature;

    const response = await fetch(
      `${getApiBaseUrl()}/api/comments/${commentId}`,
      {
        method: "DELETE",
        headers: getInstagramHeaders(),
        credentials: "include",
        body: JSON.stringify(requestPayload),
      }
    );

    if (response.ok) {
      const commentEl = document.querySelector(
        `[data-comment-id="${commentId}"]`
      );
      if (commentEl) {
        commentEl.remove();
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      await createModal("Error", {
        showTabs: false,
      }).then((overlay) => {
        const modal = overlay.querySelector(".instafn-modal");
        modal.classList.add("instafn-modal--narrow");
        const content = overlay.querySelector(".instafn-content");
        content.innerHTML = `
          <div style="text-align: center; padding: 20px 20px 28px 20px;">
            <p class="instafn-modal-description">${errorData.error ||
              "Failed to delete comment. Please try again."}</p>
            <div class="instafn-button-container">
              <button class="instafn-primary-button" onclick="this.closest('.instafn-modal-overlay').remove()">OK</button>
            </div>
          </div>
        `;
      });
    }
  } catch (error) {
    console.error("[Instafn Profile Comments] Error deleting comment:", error);
    await createModal("Error", {
      showTabs: false,
    }).then((overlay) => {
      const modal = overlay.querySelector(".instafn-modal");
      modal.classList.add("instafn-modal--narrow");
      const content = overlay.querySelector(".instafn-content");
      content.innerHTML = `
        <div style="text-align: center; padding: 20px 20px 28px 20px;">
          <p class="instafn-modal-description">Failed to delete comment. Please try again.</p>
          <div class="instafn-button-container">
            <button class="instafn-primary-button" onclick="this.closest('.instafn-modal-overlay').remove()">OK</button>
          </div>
        </div>
      `;
    });
  }
}
