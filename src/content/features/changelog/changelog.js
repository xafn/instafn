/**
 * Changelog data — the single source of truth for "What's New".
 *
 * How to ship an update:
 *   1. Bump "version" in src/manifest.json (semver, e.g. 1.1 -> 1.2).
 *   2. Add a new entry at the TOP of CHANGELOG below, with a matching version.
 *   3. That's it. The modal shows automatically to anyone updating from an
 *      older version (see ./index.js for the trigger logic).
 *
 * Entry shape:
 *   {
 *     version: "1.1",          // must match manifest.json
 *     date: "2026-06-24",      // YYYY-MM-DD, shown (in brackets) in the modal header
 *     title: "Optional headline shown under the version",
 *     changes: [
 *       { type: "new",      text: "..." },  // green  — brand new feature
 *       { type: "improved", text: "..." },  // blue   — changed / better
 *       { type: "fixed",    text: "..." },  // orange — bug fix
 *       { type: "removed",  text: "..." },  // red    — feature taken out
 *     ],
 *   }
 *
 * Changes are grouped by type in the modal: each type gets its label as a
 * header with the entries rendered as bullet points underneath. Order within a
 * type follows the order you list them here.
 *
 * Keep newest first. Whatever you write here is what users read.
 */
export const CHANGELOG = [
  {
    version: "1.1",
    date: "2026-06-24",
    title:
      "Hey everyone, thank you for using my extension. Apologies for the long wait, I have been busy with university and work, but hopefully the new features make up for it!",
    changes: [
      {
        type: "new",
        text: '<span class="instafn-changelog-feature">Native DM Themes:</span> You can see your themes set in chat on Instagram web now! Changes the background and colour scheme of chats, just like on mobile.',
      },
      {
        type: "new",
        text: '<span class="instafn-changelog-feature">Media Downloader:</span> long awaited feature! Hope you enjoy. Download buttons on posts, reels, stories, profile pictures, voice notes, and DM media.',
      },
      {
        type: "new",
        text: '<span class="instafn-changelog-feature">More hiding UI:</span> hide suggested accounts, footer, right sidebar, and more!',
      },
      {
        type: "new",
        text: '<span class="instafn-changelog-feature">Hold Video for 2x Speed:</span> hold down on a video to consume brainrot at 2x the speed!',
      },
      {
        type: "new",
        text: '<span class="instafn-changelog-feature">Drag Carousel Dots to Scrub:</span> you can now drag across a post’s dots to scrub through its carousel images, just like on mobile.',
      },
      {
        type: "new",
        text: '<span class="instafn-changelog-feature">Profile Grid Columns:</span> choose how many columns you want to see on a profile’s grid.',
      },
      {
        type: "new",
        text: '<span class="instafn-changelog-feature">Show Date on Post Hover:</span> hover over a post on a profile grid to see its date alongside the like and comment counts.',
      },
      {
        type: "new",
        text: '<span class="instafn-changelog-feature">Backup:</span> a new section to export and import all your settings.',
      },
      {
        type: "improved",
        text: '<span class="instafn-changelog-feature">Date displays</span> now support fully custom formats, plus several new built-in date styles.',
      },
      {
        type: "improved",
        text: '<span class="instafn-changelog-feature">Message Logger:</span> the button now shows an unread dot, and the log modal UI has been polished.',
      },
      {
        type: "fixed",
        text: '<span class="instafn-changelog-feature">Double-Tap to Like Messages</span>, <span class="instafn-changelog-feature">Quick Reply</span>, and <span class="instafn-changelog-feature">Quick Edit</span> now work again.',
      },
      {
        type: "fixed",
        text: '<span class="instafn-changelog-feature">Confirm Story Replies:</span> no longer triggers on the share sheet’s “Send” button or the DM message bar.',
      },
      {
        type: "fixed",
        text: '<span class="instafn-changelog-feature">Message Logger:</span> behaviour has been updated and is now working again.',
      },
      {
        type: "fixed",
        text: '<span class="instafn-changelog-feature">Message Logger:</span> group chat names now show up.',
      },
      {
        type: "fixed",
        text: '<span class="instafn-changelog-feature">Show Follow Status Indicator:</span> now shows when you click on a profile’s reels, tagged, or reposted section.',
      },
      {
        type: "removed",
        text: '<span class="instafn-changelog-feature">Profile Comments</span> has been removed (no one cares).',
      },
    ],
  },
];
