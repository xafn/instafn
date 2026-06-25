/**
 * Shared thread display-name resolution for the message logger.
 *
 * Every ID here is an Instagram interop FBID — the same space used by a message's
 * sender_fbid, the viewer's own fbid, and a thread's participant fbids. That lets
 * us name a 1:1 DM as "the participant who isn't you", which is reliable. The old
 * approach scraped whatever conversation header happened to be on screen when a
 * WebSocket event arrived, which attributed the wrong thread to most messages.
 */

/**
 * @param {Object} args
 * @param {string|number} args.threadId        thread_fbid from the delta / stored message
 * @param {string|number} [args.senderFbid]    fbid of whoever sent the message
 * @param {Map<string,string[]>} [args.participantsMap]  threadKey -> participant fbids
 * @param {Map<string,string>}   [args.threadNameMap]    threadKey -> group name ("" = unnamed group)
 * @param {Map<string,string>}   [args.senderUsernameMap] fbid -> username
 * @param {string|number} [args.currentUserFbid]
 * @returns {string}
 */
export function resolveThreadDisplayName({
  threadId,
  senderFbid,
  participantsMap,
  threadNameMap,
  displayNameMap,
  senderUsernameMap,
  currentUserFbid,
}) {
  const tid = threadId == null ? "" : String(threadId);
  const me = currentUserFbid == null ? "" : String(currentUserFbid);
  const participants = participantsMap ? participantsMap.get(tid) : null;
  // Header text captured while this exact thread was open (see
  // captureOpenThreadDisplayName). Used as a fallback, never as a group/DM
  // signal, so it can't reintroduce the old misclassification.
  const headerName = displayNameMap ? displayNameMap.get(tid) : undefined;

  // Group vs DM. Post-migration the thread-name map only holds real group names
  // and "" markers, so any entry means "group". A participant count > 2 is an
  // extra signal. We OR them: a DM never has a name entry and never exceeds 2
  // participants, so this can't misclassify a DM as a group.
  const hasNameEntry = threadNameMap ? threadNameMap.has(tid) : false;
  const groupName = hasNameEntry ? threadNameMap.get(tid) : undefined;
  const isGroup =
    hasNameEntry || (Array.isArray(participants) && participants.length > 2);

  if (isGroup) {
    // A group with a custom name from GraphQL: show it.
    if (typeof groupName === "string" && groupName.trim() !== "") {
      return groupName;
    }
    // Otherwise the name we read from the conversation header (what Instagram
    // itself displays, including the member list for unnamed groups).
    if (headerName) return headerName;
    // Or reconstruct the member list from participant usernames.
    if (participants && participants.length) {
      const members = participants
        .filter((p) => String(p) !== me)
        .map((p) => senderUsernameMap && senderUsernameMap.get(String(p)))
        .filter(Boolean);
      if (members.length) return members.join(", ");
      return `Group (${participants.length} people)`;
    }
    return "Group chat";
  }

  // DM: name it after the other participant. Only trust this when we actually
  // know who "you" are — without currentUserFbid we can't tell the partner from
  // the viewer, so fall through to the sender-based path instead of guessing.
  if (participants && me) {
    const partner = participants.find((p) => String(p) !== me);
    if (partner != null) {
      const username = senderUsernameMap && senderUsernameMap.get(String(partner));
      if (username) return username;
    }
  }

  // Fallback for threads we never captured from a GraphQL inbox load: if the
  // deleted message came from the other person, that sender is the partner.
  if (senderFbid && String(senderFbid) !== me) {
    const username = senderUsernameMap && senderUsernameMap.get(String(senderFbid));
    if (username) return username;
  }

  // Last resort before the raw id: the header we saw while the thread was open.
  if (headerName) return headerName;

  // Nothing resolved — show the raw thread id rather than a wrong name.
  return tid || "Unknown";
}
