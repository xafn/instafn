/**
 * Story / highlight download button.
 *
 * Injected like the "Mark as seen" button: scope to the story reply bar (the row
 * with the Like + Send buttons), clone the *bare Send button* and drop the clone
 * in right before Send. Cloning only the send button (not the whole row-item)
 * matters — the row-item is the [Like][Send] cluster, and cloning that left an
 * intact Send icon inside our copy, which the next scan re-matched and re-cloned
 * (runaway duplicate buttons). A bare clone has its single icon fully swapped to
 * the download glyph and every aria-label rewritten, so nothing re-matches it.
 *
 * Only one story is ever open, so we keep exactly one button document-wide and
 * resolve the media id from the /stories/.../<id>/ URL at CLICK time — which also
 * means the single persistent button always targets the story currently on
 * screen as you tap through, with no re-injection needed.
 */

import { resolveMediaById } from "./ig-api.js";
import { resolveVisibleStory } from "./story-source.js";
import { runDownload } from "./downloader.js";
import {
  findSendButton,
  injectDownloadBeforeSend,
  ITEM_CLASS,
} from "./inject-common.js";

const STORY_SELECTOR = `.${ITEM_CLASS}[data-dl-surface="story"]`;

// Last numeric segment of a /stories/... path — the media id for regular
// stories. Often absent on the FIRST story of a tray (the URL is just
// /stories/{username}/ until you navigate), and on highlights it's the reel id,
// not a media pk — so this is only the fast path, backed by the tray resolver.
function storyMediaIdFromUrl() {
  if (!location.pathname.startsWith("/stories/")) return null;
  if (location.pathname.startsWith("/stories/highlights/")) return null;
  const nums = location.pathname.match(/\d{6,}/g);
  return nums ? nums[nums.length - 1] : null;
}

// Resolve the on-screen story: try the URL's media id first (fast, no extra
// request), then fall back to the reel-tray API matched to the visible media —
// which works even when the URL has no pk yet (first story) or is a highlight.
async function resolveStory() {
  const id = storyMediaIdFromUrl();
  if (id) {
    try {
      const list = await resolveMediaById(id);
      if (list && list.length) return list;
    } catch (_) {
      /* fall through to the tray resolver */
    }
  }
  return resolveVisibleStory();
}

function isStoryContext() {
  if (location.pathname.startsWith("/stories/")) return true;
  const hasReply = !!document.querySelector('textarea[placeholder*="Reply to"]');
  const hasDialog =
    !!document.querySelector('[role="dialog"]') ||
    !!document.querySelector('article[role="presentation"]');
  return hasReply && hasDialog;
}

// The open story viewer (dialog on desktop, presentation article on the
// /stories/ route).
function storyViewer() {
  return (
    document.querySelector('[role="dialog"]') ||
    document.querySelector('article[role="presentation"]') ||
    null
  );
}

// Where to anchor the button. Prefer the reply bar: climb from the viewer's
// reply textarea (language-agnostic — the story viewer has only the one) to the
// nearest ancestor that also holds the Send/Direct button. Fall back to the
// viewer itself when there's no reply box but it carries a Send/Share control.
function findReplyBar() {
  const viewer = storyViewer();
  const reply = (viewer || document).querySelector("textarea");
  if (reply) {
    let node = reply;
    for (let i = 0; i < 8 && node; i++) {
      if (findSendButton(node)) return node;
      node = node.parentElement;
    }
  }
  return viewer && findSendButton(viewer) ? viewer : null;
}

export function injectStoryButton() {
  if (!isStoryContext()) {
    removeStoryButton();
    return;
  }

  const bar = findReplyBar();
  const sendBtn = bar ? findSendButton(bar) : null;
  if (!sendBtn) return; // no anchor on this story (e.g. own story without share)

  // Self-heal across navigation: IG re-renders the reply bar per story, so a
  // single persistent button goes stale (this is why a "keep the first one"
  // guard left ONLY the first story with a button). Keep our button only if it
  // already lives in the CURRENT story's bar; otherwise drop any strays and
  // re-inject into this story.
  const existing = document.querySelector(STORY_SELECTOR);
  if (existing && bar.contains(existing)) return;
  removeStoryButton();

  // No `row` arg → clone the bare Send button (single icon, fully relabeled).
  injectDownloadBeforeSend(sendBtn, {
    label: "Download story",
    surface: "story",
    onClick: () => runDownload(resolveStory, "story"),
  });
}

export function removeStoryButton() {
  document.querySelectorAll(STORY_SELECTOR).forEach((el) => el.remove());
}
