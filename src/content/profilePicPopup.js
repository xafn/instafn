// Instagram Profile Picture Long-Press HD Popup Overlay
let listenersAdded = false;
let timer, startX, startY, cancelled;
let lastTarget = null;
let overlayActive = false;
const PRESS_MS = 600;

// Settings
let enableProfilePicPopup = true;
let enableHighlightPopup = true;

function isMainProfilePicImg(img) {
  if (!img?.tagName || img.tagName !== "IMG") return false;

  // Only work on profile pages
  if (!getProfileUsernameFromLocation()) return false;

  // Must be inside a header tag
  if (!img.closest("header")) return false;

  // Check if it's the main profile picture (large one on profile page)
  const classes = img.className || "";
  const alt = img.alt || "";

  // Look for the main profile picture indicators
  const isMainProfilePic =
    // Alt text indicates main profile picture
    /profile picture/i.test(alt) ||
    // Specific classes for the main profile picture
    classes.includes("xpdipgo") || // Main profile pic class
    classes.includes("x5yr21d") || // Another profile pic class
    classes.includes("x972fbf"); // Profile pic container class

  return isMainProfilePic;
}

function isHighlightImg(img) {
  if (!img?.tagName || img.tagName !== "IMG") return false;

  // Only work on profile pages
  if (!getProfileUsernameFromLocation()) return false;

  // Check if it's a highlight image
  const classes = img.className || "";
  const alt = img.alt || "";

  // Look for highlight image indicators
  const isHighlight =
    // Alt text indicates highlight story picture
    /highlight story picture/i.test(alt) ||
    // Specific classes for highlight images
    classes.includes("xz74otr") || // Highlight image class
    classes.includes("x15mokao") || // Highlight container class
    classes.includes("x1ga7v0g"); // Highlight image wrapper class

  return isHighlight;
}

// Returns username from /username/ profile page or null if not profile page
function getProfileUsernameFromLocation() {
  const m = window.location.pathname.match(/^\/([a-zA-Z0-9._]+)\/?$/);
  return m ? m[1] : null;
}

async function showImageModal(img) {
  if (overlayActive) return;
  overlayActive = true;

  // Check if the original image is already high quality
  const originalSrc = img.src;

  // Determine the quality level of the original image
  let originalQuality = "low";
  if (originalSrc.includes("s1080x1080")) {
    originalQuality = "highest"; // 1080x1080 is the highest
  } else if (originalSrc.includes("s640x640")) {
    originalQuality = "high"; // 640x640 is high
  } else if (originalSrc.includes("s320x320")) {
    originalQuality = "medium"; // 320x320 is medium
  } else if (originalSrc.includes("s150x150")) {
    originalQuality = "low"; // 150x150 is low
  } else {
    // Unknown size, assume it might be high quality
    originalQuality = "unknown";
  }

  let hdUrl = null;

  // Only fetch from API if the original image is not already the highest quality
  if (originalQuality !== "highest" && originalQuality !== "unknown") {
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
  // --- Custom Overlay ---
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0,0,0,0.86)";
  overlay.style.zIndex = "999999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.tabIndex = -1;
  overlay.className = "instafn-pfp-overlay";

  const imgEl = document.createElement("img");
  // Use the highest quality available: fetched HD > original (if highest) > original (fallback)
  if (hdUrl) {
    imgEl.src = hdUrl; // Use fetched HD URL (should be 1080x1080)
  } else if (originalQuality === "highest" || originalQuality === "unknown") {
    imgEl.src = originalSrc; // Use original if it's already highest quality
  } else {
    imgEl.src = originalSrc; // Fallback to original
  }
  imgEl.alt = img.alt || "Profile picture";
  imgEl.style.maxWidth = "92vw";
  imgEl.style.maxHeight = "80vh";
  imgEl.style.borderRadius = "0px";
  imgEl.style.boxShadow = "0 8px 40px rgba(0,0,0,.6)";
  imgEl.style.background = "#222";

  // Close (X) button
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML =
    '<svg width="32" height="32" fill="white" style="pointer-events:none" viewBox="0 0 24 24"><path d="M6 6L18 18M6 18L18 6" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "32px";
  closeBtn.style.right = "40px";
  closeBtn.style.background = "rgba(0,0,0,0.60)";
  closeBtn.style.border = "none";
  closeBtn.style.padding = "8px";
  closeBtn.style.borderRadius = "50%";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.zIndex = "1000001";
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
  setTimeout(() => {
    try {
      overlay.focus();
    } catch (e) {}
  }, 0);
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
