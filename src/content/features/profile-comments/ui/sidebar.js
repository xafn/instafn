import { SIDEBAR_ID } from "../config.js";
import { getProfileUsernameFromPath } from "../../follow-analyzer/logic.js";
import { testSupabaseConnection } from "../api.js";
import { loadComments } from "../comments-api.js";
import { postComment } from "../comments-api.js";
import { renderComments, lazyLoadProfilePics } from "./comments.js";
import { createModal } from "../../../ui/modal.js";

let sidebarOpen = false;

/**
 * Close comments sidebar
 */
export function closeCommentsSidebar() {
  const overlay = document.getElementById(SIDEBAR_ID + "-overlay");
  if (overlay) {
    overlay.remove();
  }
  sidebarOpen = false;
}

/**
 * Handle posting a comment
 */
async function handlePostComment(username, input, container) {
  const text = input.value.trim();
  if (!text) return;

  // Read parentId from both dataset and getAttribute for compatibility
  const parentId =
    input.dataset.replyingTo || input.getAttribute("data-replying-to") || null;
  console.log(
    `[Instafn Profile Comments] Posting comment - parentId: ${parentId ||
      "null"}, text: ${text.substring(0, 50)}..., dataset.replyingTo: ${input
      .dataset.replyingTo || "undefined"}, getAttribute: ${input.getAttribute(
      "data-replying-to"
    ) || "null"}`
  );
  const postBtn =
    container
      .closest(".instafn-comments-sidebar")
      ?.querySelector(".instafn-comment-post-btn") ||
    document.querySelector(".instafn-comment-post-btn");

  if (postBtn) {
    postBtn.disabled = true;
    postBtn.setAttribute("aria-disabled", "true");
    postBtn.setAttribute("tabindex", "-1");
    // Add posting feedback
    const originalText = postBtn.querySelector("span")?.textContent || "Post";
    if (postBtn.querySelector("span")) {
      postBtn.querySelector("span").textContent = "Posting...";
    }
  }
  input.disabled = true;

  try {
    const newComment = await postComment(username, text, parentId);
    // Reload comments
    try {
      const comments = await loadComments(username);
      await renderComments(container, comments, username, SIDEBAR_ID);
    } catch (loadError) {
      console.error(
        "[Instafn Profile Comments] Failed to reload comments after posting:",
        loadError
      );
      await renderComments(container, [], username, SIDEBAR_ID, loadError);
    }
    input.value = "";
    // Clear both dataset and attribute
    input.dataset.replyingTo = "";
    input.removeAttribute("data-replying-to");
    input.placeholder = "Add a comment...";
  } catch (error) {
    console.error("[Instafn Profile Comments] Error:", error);
    await createModal("Error", {
      showTabs: false,
    }).then((overlay) => {
      const modal = overlay.querySelector(".instafn-modal");
      modal.classList.add("instafn-modal--narrow");
      const content = overlay.querySelector(".instafn-content");
      content.innerHTML = `
        <div style="text-align: center; padding: 20px 20px 28px 20px;">
          <p class="instafn-modal-description">Failed to post comment. Please try again.</p>
          <div class="instafn-button-container">
            <button class="instafn-primary-button" onclick="this.closest('.instafn-modal-overlay').remove()">OK</button>
          </div>
        </div>
      `;
    });
  } finally {
    if (postBtn) {
      postBtn.disabled = false;
      postBtn.setAttribute("aria-disabled", "false");
      postBtn.setAttribute("tabindex", "0");
      // Restore original text
      if (postBtn.querySelector("span")) {
        postBtn.querySelector("span").textContent = "Post";
      }
    }
    input.disabled = false;
    input.focus();
  }
}

/**
 * Create and show the comments sidebar
 */
export async function showCommentsSidebar() {
  if (sidebarOpen) return;

  const username = getProfileUsernameFromPath();
  if (!username) return;

  sidebarOpen = true;

  // Test Supabase connection on first open (for debugging)
  if (!window.instafnSupabaseTested) {
    window.instafnSupabaseTested = true;
    await testSupabaseConnection();
  }

  // Create sidebar overlay
  const overlay = document.createElement("div");
  overlay.className = "instafn-comments-overlay";
  overlay.id = SIDEBAR_ID + "-overlay";

  // Create sidebar
  const sidebar = document.createElement("div");
  sidebar.className = "instafn-comments-sidebar";
  sidebar.id = SIDEBAR_ID;

  // Header
  const header = document.createElement("div");
  header.className = "instafn-comments-header";
  header.innerHTML = `
    <div class="instafn-comments-header-title">Comments</div>
    <button class="instafn-comments-close" aria-label="Close">
      <svg aria-label="Close" class="x1lliihq x1n2onr6 x5n08af" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
        <title>Close</title>
        <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="3" y2="21"></line>
        <line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="21" x2="3" y1="21" y2="3"></line>
      </svg>
    </button>
  `;

  // Comments container
  const commentsContainer = document.createElement("div");
  commentsContainer.className = "instafn-comments-container";

  // Loading state
  commentsContainer.innerHTML = `
    <div class="instafn-comments-loading">
      <div class="instafn-loading-spinner"></div>
      <div>Loading comments...</div>
    </div>
  `;

  // Input area - pill-shaped with post button inside
  const inputArea = document.createElement("div");
  inputArea.className = "instafn-comment-input-area";
  inputArea.innerHTML = `
    <section class="instafn-comment-input-section">
      <div class="instafn-comment-input-pill">
        <textarea aria-label="Add a comment…" placeholder="Add a comment…" autocomplete="off" autocorrect="off" class="instafn-comment-input" dir="" maxlength="2200"></textarea>
        <div aria-disabled="true" class="instafn-comment-post-btn" role="button" tabindex="-1"><span>Post</span></div>
      </div>
    </section>
  `;

  sidebar.appendChild(header);
  sidebar.appendChild(commentsContainer);
  sidebar.appendChild(inputArea);
  overlay.appendChild(sidebar);
  document.body.appendChild(overlay);

  // Close handlers
  const closeBtn = header.querySelector(".instafn-comments-close");
  closeBtn.addEventListener("click", closeCommentsSidebar);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeCommentsSidebar();
    }
  });

  // Escape key handler
  const escapeHandler = (e) => {
    if (e.key === "Escape" && sidebarOpen) {
      closeCommentsSidebar();
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);

  // Load comments
  try {
    const comments = await loadComments(username);
    await renderComments(commentsContainer, comments, username, SIDEBAR_ID);
  } catch (error) {
    console.error("[Instafn Profile Comments] Failed to load comments:", error);
    await renderComments(commentsContainer, [], username, SIDEBAR_ID, error);
  }

  // Input handler
  const input = inputArea.querySelector(".instafn-comment-input");
  const postBtn = inputArea.querySelector(".instafn-comment-post-btn");

  if (!input) {
    console.error("[Instafn Profile Comments] Textarea not found!");
    return;
  }

  // Auto-resize textarea
  const autoResize = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 100)}px`;
  };

  input.addEventListener("input", () => {
    autoResize();
    const hasText = input.value.trim().length > 0;
    if (postBtn) {
      postBtn.disabled = !hasText;
      postBtn.setAttribute("aria-disabled", hasText ? "false" : "true");
      postBtn.setAttribute("tabindex", hasText ? "0" : "-1");
    }
  });

  input.addEventListener("keydown", async (e) => {
    if (e.key === "Enter" && !e.shiftKey && input.value.trim()) {
      e.preventDefault();
      await handlePostComment(username, input, commentsContainer);
    }
  });

  postBtn.addEventListener("click", async () => {
    if (input.value.trim()) {
      await handlePostComment(username, input, commentsContainer);
    }
  });

  // Focus input
  setTimeout(() => input.focus(), 100);
}

export function isSidebarOpen() {
  return sidebarOpen;
}
