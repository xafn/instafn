import { BUTTON_ID } from "../config.js";
import { getProfileUsernameFromPath } from "../../follow-analyzer/logic.js";

let isEnabled = false;
let currentUsername = null;
let isInjecting = false;
let retryCount = 0;
const MAX_RETRIES = 5;

/**
 * Create the Comments button wrapper
 * Clones the structure of a reference button to match Instagram's styling
 */
function createCommentsButton(referenceWrapper) {
  // Clone the reference wrapper's structure
  const buttonWrapper = document.createElement("div");
  buttonWrapper.className = referenceWrapper?.className || "html-div";
  buttonWrapper.id = BUTTON_ID;

  // Create the button element - match Instagram's button structure
  const button = document.createElement("div");
  button.setAttribute("role", "button");
  button.setAttribute("tabindex", "0");
  button.setAttribute("aria-label", "Comments");
  button.style.cursor = "pointer";
  button.innerHTML = `
    <div class="x6s0dn4 x78zum5 xdt5ytf xl56j7k">
      <svg aria-label="Comment" class="x1lliihq x1n2onr6 x5n08af" fill="currentColor" height="16" role="img" viewBox="0 0 24 24" width="16">
        <title>Comment</title>
        <path d="M20.656 17.008a9.993 9.993 0 1 0-3.59 3.615L22 22Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path>
      </svg>
    </div>
    <div class="_ap3a _aaco _aacw _aad6 _aade" dir="auto">Comments</div>
  `;

  buttonWrapper.appendChild(button);
  return buttonWrapper;
}

/**
 * Find a reference button that exists on all profile types
 * Returns: { button, wrapper, container } or null
 * Works for: own profile (Edit Profile), followed profiles (Message/Following), unfollowed profiles (Follow)
 */
export function findReferenceButton() {
  // Try to find any of these buttons in order of preference:
  // 1. Message button (profiles you follow)
  // 2. Follow button (profiles you don't follow)
  // 3. Edit Profile button (own profile)
  // 4. Following button (profiles you follow)

  const buttonTexts = [
    "Message",
    "Follow Back", // Profiles that follow you back
    "Follow",
    "View archive", // On own profile, inject after this
    "Edit profile",
    "Edit Profile",
    "Following",
  ];

  // First, find the header or main section that contains profile buttons
  const header = document.querySelector("header");

  // Only look for sections within the header area (not way down the page like "Suggested for you")
  const sections = Array.from(document.querySelectorAll("section")).filter(
    (section) => {
      // Only consider sections that are within or near the header
      // Skip sections that are too far down (like "Suggested for you")
      if (header && !header.contains(section)) {
        // Check if section is close to header (within reasonable distance)
        const headerRect = header.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        // If section starts more than 500px below header, skip it
        if (sectionRect.top > headerRect.bottom + 500) {
          return false;
        }
      }

      // Look for sections that contain button-like elements (including links like "Edit profile")
      const hasButtons = section.querySelector(
        "button, [role='button'], a[role='link']"
      );
      return !!hasButtons;
    }
  );

  const targetContainers = [];
  if (header) targetContainers.push(header);
  targetContainers.push(...sections);

  for (const buttonText of buttonTexts) {
    // Look for buttons, elements with role="button", and links that act as buttons (like "Edit profile" on own profile)
    const allButtons = Array.from(
      document.querySelectorAll("button, [role='button'], a[role='link']")
    );

    const buttons = allButtons.filter((el) => {
      const text = el.textContent?.trim();
      return text === buttonText;
    });

    if (buttons.length > 0) {
      for (const btn of buttons) {
        // Check if button is in one of our target containers
        const container = targetContainers.find((c) => c.contains(btn));
        if (!container) continue;

        // Find the wrapper - use closest .html-div (same pattern as follow analyzer)
        let wrapper = btn.closest(".html-div");
        if (!wrapper) continue;

        // Find the container that holds button wrappers
        // Walk up from wrapper to find a container that has multiple .html-div children
        let current = wrapper.parentElement;
        let foundContainer = null;

        while (current && current !== document.body) {
          // Check if current has multiple .html-div children (indicating it's the button row container)
          const buttonWrappers = Array.from(current.children || []).filter(
            (child) => child.classList && child.classList.contains("html-div")
          );

          if (buttonWrappers.length >= 1 && container.contains(current)) {
            foundContainer = current;
            // Find the wrapper that's a direct child of this container
            let currentWrapper = wrapper;
            while (
              currentWrapper &&
              currentWrapper.parentElement !== foundContainer
            ) {
              const parent = currentWrapper.parentElement;
              if (
                parent &&
                parent.classList &&
                parent.classList.contains("html-div")
              ) {
                currentWrapper = parent;
              } else {
                break;
              }
            }
            if (
              currentWrapper &&
              currentWrapper.parentElement === foundContainer
            ) {
              wrapper = currentWrapper;
            }
            break;
          }

          current = current.parentElement;
        }

        if (foundContainer) {
          return { button: btn, wrapper, container: foundContainer };
        }
      }
    }
  }

  return null;
}

/**
 * Inject the Comments button
 * Works on all profile types: own profile, followed profiles, unfollowed profiles
 */
export function injectCommentsButton(onClickHandler) {
  if (!isEnabled) return;
  if (isInjecting) return;

  const username = getProfileUsernameFromPath();
  if (!username) {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
    currentUsername = null;
    retryCount = 0;
    return;
  }

  // Check if button already exists for this profile
  const existing = document.getElementById(BUTTON_ID);
  if (existing && currentUsername === username) {
    return; // Already injected for this profile
  }

  // Remove button if it's for a different profile
  if (existing && currentUsername !== username) {
    existing.remove();
  }

  currentUsername = username;

  // Find reference button (Message, Follow, Edit Profile, or Following)
  const reference = findReferenceButton();
  if (!reference) {
    if (retryCount < MAX_RETRIES) {
      retryCount++;
      console.log(
        `[Instafn Profile Comments] Reference button not found, retrying... (${retryCount}/${MAX_RETRIES})`
      );
      setTimeout(() => injectCommentsButton(onClickHandler), 500);
    } else {
      console.warn(
        "[Instafn Profile Comments] Max retries reached, giving up on button injection"
      );
      retryCount = 0;
    }
    return;
  }

  // Check if button already exists in this container
  if (reference.container.querySelector(`#${BUTTON_ID}`)) {
    retryCount = 0;
    return;
  }

  isInjecting = true;
  try {
    // Add instafn-button-container class to ensure equal flex distribution (same pattern as follow analyzer)
    reference.container.classList.add("instafn-button-container");

    // Create button wrapper matching the reference wrapper's style
    const buttonWrapper = createCommentsButton(reference.wrapper);

    // Attach click handler
    const button = buttonWrapper.querySelector('[role="button"]');
    if (button && onClickHandler) {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClickHandler();
      });
    }

    // Insert right after the reference wrapper (same pattern as follow analyzer)
    if (reference.wrapper.nextSibling) {
      reference.container.insertBefore(
        buttonWrapper,
        reference.wrapper.nextSibling
      );
    } else {
      reference.container.appendChild(buttonWrapper);
    }

    console.log("[Instafn Profile Comments] Button injected successfully");
    retryCount = 0;
  } finally {
    isInjecting = false;
  }
}

export function setButtonEnabled(enabled) {
  isEnabled = enabled;
  if (!enabled) {
    const existing = document.getElementById(BUTTON_ID);
    if (existing) existing.remove();
    currentUsername = null;
    retryCount = 0;
  }
}

export function getCurrentUsername() {
  return currentUsername;
}

export function resetRetryCount() {
  retryCount = 0;
}
