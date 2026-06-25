/**
 * Post download button — feed posts, permalink (/p/, /reel/, /tv/) pages and the
 * post lightbox dialog. All render the standard action bar (Like / Comment /
 * Share … Save).
 *
 * We clone the Share (send) button and drop the clone in right before it, so the
 * button lines up pixel-for-pixel with the native icons and the like/comment
 * counts are never touched. Carousels resolve to every child automatically.
 *
 * Two container shapes exist:
 *  - Classic: the post is an <article> with the action bar inside it (feed,
 *    lightbox dialog).
 *  - Redesigned permalink: there is NO <article> — the media and the action bar
 *    live in separate columns under a shared wrapper, and the action bar is a
 *    bare <section> (it also carries inline counts + a Repost button). We anchor
 *    on that <section> directly.
 */

import { extractShortcode, resolveByShortcode } from "./ig-api.js";
import { handlePostDownload } from "./carousel.js";
import {
  findSendButton,
  buildDownloadClone,
  commonAncestor,
  rowItem,
  ITEM_CLASS,
} from "./inject-common.js";

const FLAG = "data-instafn-dl-post";

// The post's own shortcode: prefer the permalink that wraps the timestamp, then
// any post link inside the scope, then the page URL on permalink routes.
// `scope` may be an <article>, a <section>, or document — extractShortcode pulls
// the post code even out of a comment permalink (/p/<code>/c/<id>/).
function shortcodeForScope(scope) {
  const timeLink = scope.querySelector(
    'a:has(time)[href*="/p/"], a:has(time)[href*="/reel/"], a:has(time)[href*="/tv/"]'
  );
  let code = extractShortcode(timeLink?.getAttribute("href"));
  if (code) return code;

  const anyLink = scope.querySelector(
    'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]'
  );
  code = extractShortcode(anyLink?.getAttribute("href"));
  if (code) return code;

  return extractShortcode(location.pathname);
}

// The element used to detect which carousel slide is on screen. In the classic
// layout the <article> contains the media; in the redesigned permalink the media
// sits in a sibling column, so climb from the action bar to the nearest ancestor
// that also contains the carousel (its dot strip `._acnc`). Single-media posts
// have no dots — `root` is unused for them, so falling back to `scope` is safe.
function carouselRootFor(scope) {
  let node = scope;
  for (let i = 0; node && node !== document.body && i < 12; i++) {
    if (node.querySelector?.("._acnc")) return node;
    node = node.parentElement;
  }
  return scope;
}

// Place the download button inside an already-located action bar.
//  - `scope`: element to flag for dedup + search the action buttons within.
//  - `root`:  element for carousel slide detection (see carouselRootFor).
//  - `code`:  the post shortcode.
function injectIntoActionBar(scope, root, code) {
  if (!scope || scope.getAttribute(FLAG) === "1") return;
  if (scope.querySelector(`.${ITEM_CLASS}`)) {
    scope.setAttribute(FLAG, "1");
    return;
  }

  // Anchor on Comment — it's present even when likes (and with them the Share
  // button) are hidden. The download slot is "right after Comment", which is
  // exactly before Share when Share exists, and the natural Share slot when it
  // doesn't. Fall back to Like if a post somehow has no comment button.
  const commentBtn = scope
    .querySelector('svg[aria-label="Comment"]')
    ?.closest('[role="button"]');
  const likeBtn = scope
    .querySelector('svg[aria-label="Like"], svg[aria-label="Unlike"]')
    ?.closest('[role="button"]');
  const anchorBtn = commentBtn || likeBtn;
  if (!anchorBtn) return; // action bar not rendered yet
  if (!code) return;

  const opts = {
    label: "Download post",
    surface: "post",
    // Pass the carousel root so a carousel can detect which slide is on screen.
    onClick: () => handlePostDownload(() => resolveByShortcode(code), root),
  };

  const sendBtn = findSendButton(scope);
  let row, template, before;
  if (sendBtn) {
    // Exact: clone the Share row-item and insert it right before Share.
    row = commonAncestor(anchorBtn, sendBtn) || sendBtn.parentNode;
    template = rowItem(row, sendBtn);
    before = template;
  } else {
    // No Share (e.g. likes hidden): clone the Comment row-item and append it to
    // the END of the action group. Appending (rather than inserting right after
    // Comment) avoids landing between the Comment icon and its inline count span
    // — IG renders the comment count as a sibling right after the button.
    row =
      (likeBtn && commentBtn && commonAncestor(likeBtn, commentBtn)) ||
      anchorBtn.parentElement;
    template = rowItem(row, anchorBtn);
    before = null; // append to the end of the action group
  }
  if (!row || !template) return;

  // Guard against an over-climbed template. A real action-bar item wraps a
  // single control; in the redesigned permalink the row-item heuristic can
  // resolve to the whole action block (every icon + the post timestamp). Cloning
  // that rewrites EVERY svg to the download glyph and ghosts the entire bar
  // below. If the template spans more than one button — or carries a <time> —
  // fall back to cloning just the anchor button and appending it to the anchor's
  // own tight parent (the icon group), where a single download icon belongs.
  if (
    template !== anchorBtn &&
    (template.querySelector("time") ||
      template.querySelectorAll('[role="button"], button').length > 1)
  ) {
    template = anchorBtn;
    row = anchorBtn.parentNode;
    before = null;
  }
  if (!row || !template) return;

  const item = buildDownloadClone(template, opts);
  row.insertBefore(item, before);

  scope.setAttribute(FLAG, "1");
}

// Classic layout: each post is an <article> wrapping its own action bar.
function injectIntoArticle(article) {
  injectIntoActionBar(article, article, shortcodeForScope(article));
}

// Redesigned permalink layout: no <article>. The action bar is a bare <section>;
// the media lives in a sibling column. Skip any section nested in an <article> —
// those are the classic layout, handled above.
//
// Identify the action bar by Like OR Comment, not Comment alone: when the author
// disables comments IG drops the Comment button entirely, so gating on Comment
// skipped those posts (no download button, or it fell through to the wrong
// node). Accepting Like too means we only miss a post that hides BOTH.
function injectIntoBareSection(section) {
  if (section.closest("article")) return;
  if (
    !section.querySelector(
      'svg[aria-label="Comment"], svg[aria-label="Like"], svg[aria-label="Unlike"]'
    )
  )
    return;
  injectIntoActionBar(
    section,
    carouselRootFor(section),
    shortcodeForScope(document)
  );
}

export function injectPostButtons() {
  document.querySelectorAll("article").forEach(injectIntoArticle);
  document.querySelectorAll("section").forEach(injectIntoBareSection);
}

export function removePostButtons() {
  document
    .querySelectorAll(`[${FLAG}="1"]`)
    .forEach((el) => el.removeAttribute(FLAG));
  document
    .querySelectorAll(`.${ITEM_CLASS}[data-dl-surface="post"]`)
    .forEach((el) => el.remove());
}
