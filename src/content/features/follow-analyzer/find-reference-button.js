// Locates a known profile action button (e.g. "Edit profile", "Follow",
// "Message") and returns it along with its wrapper and flex container, so other
// buttons can be injected alongside it. Mirrors Instagram's nested ".html-div"
// layout on profile headers.

const REFERENCE_BUTTON_LABELS = [
  "Message",
  "Follow Back",
  "Follow",
  "Requested",
  "View archive",
  "Edit profile",
  "Edit Profile",
  "Following",
];

export function findReferenceButton() {
  const header = document.querySelector("header");
  const sections = Array.from(document.querySelectorAll("section")).filter(
    (section) => {
      if (header && !header.contains(section)) {
        const headerRect = header.getBoundingClientRect();
        if (section.getBoundingClientRect().top > headerRect.bottom + 500) {
          return false;
        }
      }
      return !!section.querySelector("button, [role='button'], a[role='link']");
    }
  );

  const scopes = [];
  if (header) scopes.push(header);
  scopes.push(...sections);

  for (const label of REFERENCE_BUTTON_LABELS) {
    const matches = Array.from(
      document.querySelectorAll("button, [role='button'], a[role='link']")
    ).filter((el) => el.textContent?.trim() === label);
    if (matches.length === 0) continue;

    for (const button of matches) {
      const scope = scopes.find((s) => s.contains(button));
      if (!scope) continue;

      let wrapper = button.closest(".html-div");
      if (!wrapper) continue;

      let parent = wrapper.parentElement;
      let container = null;
      while (parent && parent !== document.body) {
        const htmlDivChildren = Array.from(parent.children || []).filter(
          (child) => child.classList && child.classList.contains("html-div")
        );
        if (htmlDivChildren.length >= 1 && scope.contains(parent)) {
          container = parent;
          // Walk the wrapper up so it is a direct child of the container.
          let candidate = wrapper;
          while (candidate && candidate.parentElement !== container) {
            const candidateParent = candidate.parentElement;
            if (
              candidateParent &&
              candidateParent.classList &&
              candidateParent.classList.contains("html-div")
            ) {
              candidate = candidateParent;
            } else {
              break;
            }
          }
          if (candidate && candidate.parentElement === container) {
            wrapper = candidate;
          }
          break;
        }
        parent = parent.parentElement;
      }

      if (container) return { button, wrapper, container };
    }
  }

  return null;
}
