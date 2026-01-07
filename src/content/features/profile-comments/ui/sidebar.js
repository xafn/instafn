import { SIDEBAR_ID } from "../config.js";
import { getProfileUsernameFromPath } from "../../follow-analyzer/logic.js";
import { testSupabaseConnection } from "../api.js";
import { loadComments } from "../comments-api.js";
import { postComment } from "../comments-api.js";
import { renderComments, lazyLoadProfilePics } from "./comments.js";
import { createModal } from "../../../ui/modal.js";

let sidebarOpen = false;

export function closeCommentsSidebar() {
  const overlay = document.getElementById(SIDEBAR_ID + "-overlay");
  if (overlay) {
    overlay.remove();
  }
  sidebarOpen = false;
}

async function handlePostComment(username, input, container) {
  const text = input.value.trim();
  if (!text) return;

  const parentId =
    input.dataset.replyingTo || input.getAttribute("data-replying-to") || null;
  const postBtn =
    container
      .closest(".instafn-comments-sidebar")
      ?.querySelector(".instafn-comment-post-btn") ||
    document.querySelector(".instafn-comment-post-btn");

  if (postBtn) {
    postBtn.disabled = true;
    postBtn.setAttribute("aria-disabled", "true");
    postBtn.setAttribute("tabindex", "-1");
    const originalText = postBtn.querySelector("span")?.textContent || "Post";
    if (postBtn.querySelector("span")) {
      postBtn.querySelector("span").textContent = "Posting...";
    }
  }
  input.disabled = true;

  try {
    const newComment = await postComment(username, text, parentId);
    const comments = await loadComments(username);
    await renderComments(container, comments, username, SIDEBAR_ID);
    input.value = "";
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

export async function showCommentsSidebar() {
  if (sidebarOpen) return;

  const username = getProfileUsernameFromPath();
  if (!username) return;

  sidebarOpen = true;

  if (!window.instafnSupabaseTested) {
    window.instafnSupabaseTested = true;
    await testSupabaseConnection();
  }

  const overlay = document.createElement("div");
  overlay.className = "instafn-comments-overlay";
  overlay.id = SIDEBAR_ID + "-overlay";

  const sidebar = document.createElement("div");
  sidebar.className = "instafn-comments-sidebar";
  sidebar.id = SIDEBAR_ID;

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

  const commentsContainer = document.createElement("div");
  commentsContainer.className = "instafn-comments-container";

  commentsContainer.innerHTML = `
    <div class="instafn-comments-loading">
      <div class="instafn-loading-spinner"></div>
      <div>Loading comments...</div>
    </div>
  `;

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

  const closeBtn = header.querySelector(".instafn-comments-close");
  closeBtn.addEventListener("click", closeCommentsSidebar);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeCommentsSidebar();
    }
  });

  const escapeHandler = (e) => {
    if (e.key === "Escape" && sidebarOpen) {
      closeCommentsSidebar();
      document.removeEventListener("keydown", escapeHandler);
    }
  };
  document.addEventListener("keydown", escapeHandler);

  const comments = await loadComments(username);
  await renderComments(commentsContainer, comments, username, SIDEBAR_ID);

  const input = inputArea.querySelector(".instafn-comment-input");
  const postBtn = inputArea.querySelector(".instafn-comment-post-btn");

  if (!input) {
    console.error("[Instafn Profile Comments] Textarea not found!");
    return;
  }

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

  setTimeout(() => input.focus(), 100);
}

export function isSidebarOpen() {
  return sidebarOpen;
}

