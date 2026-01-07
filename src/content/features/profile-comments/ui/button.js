import { BUTTON_ID } from "../config.js";
import { getProfileUsernameFromPath } from "../../follow-analyzer/logic.js";

let isEnabled = false;
let currentUsername = null;
let isInjecting = false;
let retryCount = 0;
const MAX_RETRIES = 5;

function createCommentsButton(referenceWrapper) {
  const buttonWrapper = document.createElement("div");
  buttonWrapper.className = referenceWrapper?.className || "html-div";
  buttonWrapper.id = BUTTON_ID;

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

function findReferenceButton() {
  const buttonTexts = [
    "Message",
    "Follow Back", // Profiles that follow you back
    "Follow",
    "View archive", // On own profile, inject after this
    "Edit profile",
    "Edit Profile",
    "Following",
  ];

  const header = document.querySelector("header");

  const sections = Array.from(document.querySelectorAll("section")).filter(
    (section) => {
      if (header && !header.contains(section)) {
        const headerRect = header.getBoundingClientRect();
        const sectionRect = section.getBoundingClientRect();
        if (sectionRect.top > headerRect.bottom + 500) {
          return false;
        }
      }

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
    const allButtons = Array.from(
      document.querySelectorAll("button, [role='button'], a[role='link']")
    );

    const buttons = allButtons.filter((el) => {
      const text = el.textContent?.trim();
      return text === buttonText;
    });

    if (buttons.length > 0) {
      for (const btn of buttons) {
        const container = targetContainers.find((c) => c.contains(btn));
        if (!container) continue;

        let wrapper = btn.closest(".html-div");
        if (!wrapper) continue;

        let current = wrapper.parentElement;
        let foundContainer = null;

        while (current && current !== document.body) {
          const buttonWrappers = Array.from(current.children || []).filter(
            (child) => child.classList && child.classList.contains("html-div")
          );

          if (buttonWrappers.length >= 1 && container.contains(current)) {
            foundContainer = current;
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

  const existing = document.getElementById(BUTTON_ID);
  if (existing && currentUsername === username) {
    return;
  }

  if (existing && currentUsername !== username) {
    existing.remove();
  }

  currentUsername = username;

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

  if (reference.container.querySelector(`#${BUTTON_ID}`)) {
    retryCount = 0;
    return;
  }

  isInjecting = true;
  try {
    reference.container.classList.add("instafn-button-container");

    const buttonWrapper = createCommentsButton(reference.wrapper);

    const button = buttonWrapper.querySelector('[role="button"]');
    if (button && onClickHandler) {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClickHandler();
      });
    }

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
