// Declutter assorted Instagram UI surfaces.
//
// This one feature handles every "hide a piece of IG chrome" toggle, because
// they share anchors and timing and only one observer should walk the (busy)
// DOM:
//   - hideHome    : the "Suggested for you" account list in the feed sidebar
//   - hideProfile : the "Suggested for you" carousel shown on profile pages
//   - hideFooter  : the About/Help/.../© Instagram footer text on the home feed
//   - hideSidebar : the entire right column (account switcher + suggestions +
//                   footer)
//   - hideStories : the stories tray strip across the top of the feed
//   - hideNotes   : the notes tray strip atop the Direct Messages inbox
//
// Both "Suggested for you" surfaces share the same heading text. We find every
// heading, walk up to the smallest ancestor that wraps the suggestion list (the
// lowest ancestor holding >= 2 "Follow" controls — a single card has one, and
// on the home feed each card also carries a "Suggested for you" subtitle, so
// matching the list is what stops us hiding individual cards), then climb past
// single-child wrappers so the module's outer padding collapses too.
//
// Hiding the home suggestion list leaves the account switcher flush against the
// footer, so when we hide it (and the footer is still shown) we add top spacing
// to the footer to keep the column breathing.
//
// To avoid any flash or layout shift, this runs at document_start: the
// MutationObserver is attached to <html> immediately (so it sees the modules the
// instant IG inserts them) and scans are coalesced into a requestAnimationFrame
// callback. Both MutationObserver and rAF callbacks fire before the browser
// paints, so a matched element is hidden before it's ever drawn.

let observer = null;
let scanScheduled = false;
let hideHome = false;
let hideProfile = false;
let hideFooter = false;
let hideSidebar = false;
let hideStories = false;
let hideNotes = false;

const HIDDEN_ATTR = "data-instafn-suggested-hidden";
const KIND_ATTR = "data-instafn-suggested-kind";
const SPACER_ATTR = "data-instafn-sidebar-spacer";
const STORIES_SPACER_ATTR = "data-instafn-stories-spacer";
const NOTES_SPACER_ATTR = "data-instafn-notes-spacer";

// Gap restored between the account switcher and footer when the home suggestion
// list is hidden, matching IG's usual sidebar rhythm.
const FOOTER_GAP = "24px";
// Top breathing room added above the feed when the stories tray is hidden, so
// the first post doesn't sit flush against the top.
const STORIES_GAP = "24px";
// Extra top margin on the DM "Messages" header when the notes tray above it is
// hidden, so the header isn't tight under the inbox title bar.
const NOTES_GAP = "16px";

// How many "Follow" buttons `el` wraps. A genuine suggestions module holds a
// list (>= 2); a single suggestion card holds exactly one.
function followButtonCount(el) {
  return Array.from(el.querySelectorAll('[role="button"], button')).filter(
    (b) => b.textContent.trim() === "Follow"
  ).length;
}

// From a heading element, find the module to hide: the lowest ancestor that
// wraps the suggestion list (>= 2 Follow buttons), then climb past single-child
// wrappers so the module's outer padding collapses too.
function resolveModule(heading) {
  let module = heading.parentElement;
  while (module && module !== document.body && followButtonCount(module) < 2) {
    module = module.parentElement;
  }
  if (!module || module === document.body) return null;

  while (
    module.parentElement &&
    module.parentElement !== document.body &&
    module.parentElement.children.length === 1
  ) {
    module = module.parentElement;
  }
  return module;
}

// "home" = feed sidebar suggestions (See all → /explore/people/),
// "profile" = the suggested-accounts carousel on a profile page.
function classifyModule(module) {
  return module.querySelector('a[href="/explore/people/"]')
    ? "home"
    : "profile";
}

function hideElement(el, kind) {
  if (el.getAttribute(HIDDEN_ATTR) === "true") return;
  el.setAttribute(HIDDEN_ATTR, "true");
  if (kind) el.setAttribute(KIND_ATTR, kind);
  el.style.setProperty("display", "none", "important");
}

function showElement(el) {
  el.removeAttribute(HIDDEN_ATTR);
  el.removeAttribute(KIND_ATTR);
  el.style.removeProperty("display");
}

// The home feed footer ("About · Help · …" + the © Instagram line). Its wrapper
// holds only the footer, so hiding the wrapper removes its spacing too.
function getFooter() {
  const footer = document.querySelector("._ab8b");
  if (!footer) return null;
  const wrapper = footer.parentElement;
  return wrapper && wrapper.children.length === 1 ? wrapper : footer;
}

// The stories tray strip at the top of the home feed. Its pagelet wrapper is a
// stable anchor; climb past single-child wrappers so its spacing collapses too.
function getStoriesTray() {
  const tray = document.querySelector('[data-pagelet="story_tray"]');
  if (!tray) return null;
  let el = tray;
  while (
    el.parentElement &&
    el.parentElement !== document.body &&
    el.parentElement.children.length === 1
  ) {
    el = el.parentElement;
  }
  return el;
}

// The DM inbox "Messages" header row (holds the title + Requests link). Anchor
// for the notes tray, which sits directly above it.
function getMessagesHeader() {
  const h1 = Array.from(document.querySelectorAll("h1")).find(
    (el) => el.textContent.trim() === "Messages"
  );
  return h1 ? h1.parentElement : null;
}

// The notes tray strip atop the DM inbox: the sibling right above the Messages
// header. Confirmed by the note bubbles' dialog triggers so we don't grab the
// inbox title bar instead.
function getNotesTray() {
  const header = getMessagesHeader();
  const candidate = header && header.previousElementSibling;
  if (!candidate || !candidate.querySelector('[aria-haspopup="dialog"]')) {
    return null;
  }
  return candidate;
}

// The whole right column. Anchored on the footer, climb to the highest ancestor
// that doesn't contain a feed post (<article>); its parent is the row that also
// holds the feed. Guarded on a feed post existing so the boundary is real — if
// the feed hasn't rendered yet we skip and retry on the next mutation.
function findSidebarRoot() {
  const footer = document.querySelector("._ab8b");
  if (!footer || !document.querySelector("article")) return null;

  let node = footer;
  while (
    node.parentElement &&
    node.parentElement !== document.body &&
    node.parentElement.tagName !== "MAIN" &&
    !node.parentElement.querySelector("article")
  ) {
    node = node.parentElement;
  }
  return node;
}

function applyFooterSpacing(on) {
  const existing = document.querySelector(`[${SPACER_ATTR}="true"]`);
  if (existing && (!on || existing !== getFooter())) {
    existing.style.removeProperty("margin-top");
    existing.removeAttribute(SPACER_ATTR);
  }
  if (!on) return;

  const footer = getFooter();
  if (!footer || footer.getAttribute(HIDDEN_ATTR) === "true") return;
  if (footer.getAttribute(SPACER_ATTR) === "true") return;
  footer.style.setProperty("margin-top", FOOTER_GAP);
  footer.setAttribute(SPACER_ATTR, "true");
}

// Pad the top of the feed when the stories tray is hidden. The feed is the
// element right after the (now hidden) tray wrapper in the center column.
function applyStoriesSpacing(on) {
  const existing = document.querySelector(`[${STORIES_SPACER_ATTR}="true"]`);
  const tray = on ? getStoriesTray() : null;
  const target = tray ? tray.nextElementSibling : null;

  if (existing && existing !== target) {
    existing.style.removeProperty("padding-top");
    existing.removeAttribute(STORIES_SPACER_ATTR);
  }
  if (!on || !target) return;
  if (target.getAttribute(STORIES_SPACER_ATTR) === "true") return;
  target.style.setProperty("padding-top", STORIES_GAP);
  target.setAttribute(STORIES_SPACER_ATTR, "true");
}

// Push the DM "Messages" header down when the notes tray above it is hidden.
function applyNotesSpacing(on) {
  const existing = document.querySelector(`[${NOTES_SPACER_ATTR}="true"]`);
  const target = on && getNotesTray() ? getMessagesHeader() : null;

  if (existing && existing !== target) {
    existing.style.removeProperty("margin-top");
    existing.removeAttribute(NOTES_SPACER_ATTR);
  }
  if (!on || !target) return;
  if (target.getAttribute(NOTES_SPACER_ATTR) === "true") return;
  target.style.setProperty("margin-top", NOTES_GAP);
  target.setAttribute(NOTES_SPACER_ATTR, "true");
}

function processSidebar() {
  if (!document.body) return;

  // Removing the whole column subsumes every other hide.
  if (hideSidebar) {
    const root = findSidebarRoot();
    if (root) {
      hideElement(root, "sidebar");
      return;
    }
    // Feed not ready yet — fall through and apply the safe piecewise hides so
    // there's no flash; the next scan retries the full-column removal.
  }

  if (hideHome || hideProfile) {
    const headings = Array.from(
      document.querySelectorAll("h4, span")
    ).filter((el) => el.textContent.trim() === "Suggested for you");

    for (const heading of headings) {
      const module = resolveModule(heading);
      if (!module || module.getAttribute(HIDDEN_ATTR) === "true") continue;

      const kind = classifyModule(module);
      if (kind === "home" ? hideHome : hideProfile) hideElement(module, kind);
    }
  }

  if (hideFooter) {
    const footer = getFooter();
    if (footer) hideElement(footer, "footer");
  }

  if (hideStories) {
    const tray = getStoriesTray();
    if (tray) hideElement(tray, "stories");
  }

  if (hideNotes) {
    const notes = getNotesTray();
    if (notes) hideElement(notes, "notes");
  }

  // Keep the switcher off the footer when the home list is gone but the footer
  // (and column) remain.
  const homeHidden = !!document.querySelector(`[${KIND_ATTR}="home"]`);
  applyFooterSpacing(homeHidden && !hideFooter && !hideSidebar);

  // Keep the first post off the top edge when the stories tray is gone.
  applyStoriesSpacing(hideStories);

  // Give the DM Messages header room when the notes tray above it is gone.
  applyNotesSpacing(hideNotes);
}

// Coalesce mutation bursts into one scan per frame. rAF runs before paint, so
// anything hidden here is hidden before it's drawn — no flash, no shift.
function scheduleScan() {
  if (scanScheduled) return;
  scanScheduled = true;
  requestAnimationFrame(() => {
    scanScheduled = false;
    processSidebar();
  });
}

export function initHideSuggested(
  home = false,
  profile = false,
  footer = false,
  sidebar = false,
  stories = false,
  notes = false
) {
  hideHome = !!home;
  hideProfile = !!profile;
  hideFooter = !!footer;
  hideSidebar = !!sidebar;
  hideStories = !!stories;
  hideNotes = !!notes;

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  // Reveal anything a now-disabled toggle previously hid, and drop spacing.
  document
    .querySelectorAll(`[${HIDDEN_ATTR}="true"]`)
    .forEach((el) => showElement(el));
  applyFooterSpacing(false);
  applyStoriesSpacing(false);
  applyNotesSpacing(false);

  if (
    !hideHome &&
    !hideProfile &&
    !hideFooter &&
    !hideSidebar &&
    !hideStories &&
    !hideNotes
  )
    return;

  // Hide anything already present, then watch for pieces IG inserts later.
  // Observe <html> so this works even before <body> exists (document_start).
  processSidebar();

  observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
