import { injectStylesheet } from "../../utils/styleLoader.js";

const ensureStyles = () =>
  injectStylesheet(
    "content/features/profile-pic-popup/profilePicPopup.css",
    "instafn-pfp-popup"
  );

let listenersAdded = false;
let timer, startX, startY, cancelled;
let lastTarget = null;
let overlayActive = false;
const PRESS_MS = 250;

// Settings
let enableProfilePicPopup = true;
let enableHighlightPopup = true;

function isMainProfilePicImg(img) {
  if (!img?.tagName || img.tagName !== "IMG") return false;

  // Only work on profile pages
  if (!getProfileUsernameFromLocation()) return false;

  // Must be inside a header tag
  if (!img.closest("header")) return false;

  // Check if it's the main profile picture based on alt text only
  const alt = img.alt || "";

  // Look for the main profile picture in alt text
  const isMainProfilePic = /profile picture/i.test(alt);

  return isMainProfilePic;
}

function isHighlightImg(img) {
  if (!img?.tagName || img.tagName !== "IMG") return false;

  // Only work on profile pages
  if (!getProfileUsernameFromLocation()) return false;

  // Must be inside a header tag
  if (!img.closest("header")) return false;

  // Check if it's a highlight image based on alt text only
  const alt = img.alt || "";

  // Look for highlight story picture in alt text
  const isHighlight = /highlight story picture/i.test(alt);

  return isHighlight;
}

// Returns username from /username/ profile page or null if not profile page
function getProfileUsernameFromLocation() {
  const m = window.location.pathname.match(/^\/([a-zA-Z0-9._]+)\/?$/);
  return m ? m[1] : null;
}

// Helper function to create and show the image modal
function createImageModal(imageSrc, imageAlt) {
  ensureStyles();
  const overlay = document.createElement("div");
  overlay.className = "instafn-pfp-overlay";
  overlay.tabIndex = -1;

  const imgEl = document.createElement("img");
  imgEl.src = imageSrc;
  imgEl.alt = imageAlt;
  imgEl.className = "instafn-pfp-image";

  const closeBtn = document.createElement("button");
  closeBtn.className = "instafn-pfp-close";
  closeBtn.innerHTML =
    '<svg width="32" height="32" fill="white" style="pointer-events:none" viewBox="0 0 24 24"><path d="M6 6L18 18M6 18L18 6" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
  closeBtn.setAttribute("aria-label", "Close");

  function removeOverlay() {
    overlayActive = false;
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener("keydown", onKey, true);
  }

  function onKey(e) {
    if (e.key === "Escape") removeOverlay();
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) removeOverlay();
  });
  closeBtn.addEventListener("click", removeOverlay);
  document.addEventListener("keydown", onKey, true);

  overlay.appendChild(imgEl);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
}

// Helper function to get actual image dimensions
function getImageDimensions(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}

async function showImageModal(img) {
  if (overlayActive) return;
  overlayActive = true;

  const originalSrc = img.src;
  const isHighlight = isHighlightImg(img);

  // For highlight images, just use the original src directly
  if (isHighlight) {
    createImageModal(originalSrc, img.alt || "Highlight story picture");
    return;
  }

  // For profile pictures, check actual image dimensions first
  const dimensions = await getImageDimensions(originalSrc);
  const actualSize = Math.max(dimensions.width, dimensions.height);

  let hdUrl = null;
  let shouldFetchHD = false;

  // Determine if we need to fetch HD based on actual image size
  if (actualSize < 1000) {
    // Image is smaller than 1000px, try to fetch HD version
    shouldFetchHD = true;
  } else if (actualSize >= 1000) {
    // Image is already high quality, use original
    createImageModal(originalSrc, img.alt || "Profile picture");
    return;
  }

  // Fetch HD version if needed
  if (shouldFetchHD) {
    const profileUsername = getProfileUsernameFromLocation();
    if (profileUsername) {
      try {
        // Use REST API to get profile info
        const resp = await fetch(
          `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
            profileUsername
          )}`,
          {
            credentials: "include",
            headers: {
              "X-IG-App-ID": "936619743392459",
              "X-Requested-With": "XMLHttpRequest",
            },
          }
        );
        if (resp.ok) {
          const userInfo = await resp.json();
          const hd = userInfo?.data?.user?.profile_pic_url_hd;
          if (hd) hdUrl = hd;
        }
      } catch (err) {
        /* ignore */
      }
    }
  }

  // Use HD URL if available, otherwise fall back to original
  const finalSrc = hdUrl || originalSrc;
  createImageModal(finalSrc, img.alt || "Profile picture");
}

function handlePointerDown(e) {
  if (!getProfileUsernameFromLocation()) return;
  if (overlayActive) return;
  if (e.target.closest && e.target.closest(".instafn-pfp-overlay")) return;
  const img = e.target;

  // Check if it's a profile pic or highlight image
  const isProfilePic = isMainProfilePicImg(img);
  const isHighlight = isHighlightImg(img);

  // Check if the respective feature is enabled
  if (
    (isProfilePic && !enableProfilePicPopup) ||
    (isHighlight && !enableHighlightPopup)
  )
    return;
  if (!isProfilePic && !isHighlight) return;

  // Prevent default behavior to avoid scrolling
  e.preventDefault();
  e.stopPropagation();

  startX = e.clientX;
  startY = e.clientY;
  cancelled = false;
  lastTarget = img;
  timer = setTimeout(() => {
    if (!cancelled && lastTarget === img) {
      showImageModal(img);
    }
  }, PRESS_MS);
}

function handlePointerUp() {
  clearTimeout(timer);
  lastTarget = null;
  cancelled = true;
}

function handlePointerMove(e) {
  if (!lastTarget) return;
  if (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8) {
    cancelled = true;
    clearTimeout(timer);
    lastTarget = null;
  }
}

export function injectProfilePicPopupOverlay(
  enableProfilePicPopupParam,
  enableHighlightPopupParam = false
) {
  // Update settings
  enableProfilePicPopup = enableProfilePicPopupParam;
  enableHighlightPopup = enableHighlightPopupParam;

  if (!enableProfilePicPopup && !enableHighlightPopup) {
    // Remove listeners if both features are disabled
    if (listenersAdded) {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerUp, true);
      document.removeEventListener("pointerleave", handlePointerUp, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("mouseover", handleMouseOver, true);
      listenersAdded = false;
    }
    return;
  }

  // Only add listeners once
  if (!listenersAdded) {
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerUp, true);
    document.addEventListener("pointerleave", handlePointerUp, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("mouseover", handleMouseOver, true);
    listenersAdded = true;
  }
}

function handleMouseOver(e) {
  const img = e.target;
  const isProfilePic = isMainProfilePicImg(img);
  const isHighlight = isHighlightImg(img);

  if (
    (isProfilePic && enableProfilePicPopup) ||
    (isHighlight && enableHighlightPopup)
  ) {
    img.style.cursor = "pointer";
  }
}
