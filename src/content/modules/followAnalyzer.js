const SCAN_STORAGE_KEY = "instafn_follow_snapshot";

async function safeFetchJson(url) {
  const csrftoken = (document.cookie.match(/(?:^|; )csrftoken=([^;]+)/) ||
    [])[1];
  const headers = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    Referer: "https://www.instagram.com/",
    "X-IG-App-ID": "936619743392459",
  };
  if (csrftoken) headers["X-CSRFToken"] = decodeURIComponent(csrftoken);

  const resp = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers,
  });
  if (!resp.ok) {
    if (resp.status === 429) {
      throw new Error(
        "Rate limited by Instagram (HTTP 429). Please try again in 2-3 hours."
      );
    }
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return resp.json();
}

export async function getCurrentUser() {
  try {
    const data = await safeFetchJson(
      "https://www.instagram.com/api/v1/accounts/edit/web_form_data/"
    );
    const username = data?.form_data?.username || data?.user?.username;
    const userId = String(data?.user?.pk || data?.user?.id || "");
    if (username && userId) return { username, userId };
  } catch (_) {}

  try {
    const data = await safeFetchJson(
      "https://www.instagram.com/api/v1/accounts/current_user/"
    );
    const username = data?.user?.username;
    const userId = String(data?.user?.pk || data?.user?.id || "");
    if (username && userId) return { username, userId };
  } catch (_) {}

  try {
    const path = window.location.pathname;
    const m = path.match(/^\/([^\/]+)\/?$/);
    if (m) {
      const username = m[1];
      const info = await safeFetchJson(
        `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
          username
        )}`
      );
      const userId = String(info?.data?.user?.id || "");
      if (username && userId) return { username, userId };
    }
  } catch (_) {}

  throw new Error("Instafn: Could not determine current user");
}

export async function fetchFriendList(userId, type) {
  const results = [];
  let cursor = null;
  let safety = 0;
  while (safety < 100) {
    safety++;
    const params = new URLSearchParams();
    params.set("count", "200");
    if (cursor) params.set("max_id", cursor);
    const url = `https://www.instagram.com/api/v1/friendships/${encodeURIComponent(
      userId
    )}/${type}/?${params.toString()}`;
    const data = await safeFetchJson(url);
    const users = data?.users || data?.profiles || [];
    for (const u of users) {
      const username = u?.username;
      const pk = String(u?.pk || u?.id || "");
      const profilePicUrl = u?.profile_pic_url || u?.profile_picture_url || "";
      const fullName = u?.full_name || "";
      const isPrivate = u?.is_private || false;
      const isVerified = u?.is_verified || false;
      const isFollowed = u?.followed_by_viewer || false;
      const isFollowing = u?.follows_viewer || false;

      if (username) {
        let profilePicBase64 = null;
        if (profilePicUrl) {
          try {
            profilePicBase64 = await convertImageToBase64(profilePicUrl);
          } catch (err) {}
        }
        results.push({
          username,
          id: pk,
          profilePicUrl,
          profilePicBase64,
          fullName,
          isPrivate,
          isVerified,
          isFollowed,
          isFollowing,
        });
      }
    }
    const next = data?.next_max_id || data?.next_max_id || null;
    if (!next) break;
    cursor = String(next);
  }
  return results;
}

// need to cache pfps to not reach the rate limit so fast
async function convertImageToBase64(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(blob);
    });
  } catch (_) {
    return null;
  }
}

function toSet(arr) {
  const s = new Set();
  for (const x of arr) s.add(x.username);
  return s;
}

export function extractUsernames(data) {
  if (!data || !Array.isArray(data)) return [];
  return data.map((u) => (typeof u === "string" ? u : u.username));
}

function processPreviousData(prev) {
  if (!prev || !prev.current)
    return { prevFollowers: new Set(), prevFollowing: new Set() };

  const prevFollowers = new Set(extractUsernames(prev.current.followers));
  const prevFollowing = new Set(extractUsernames(prev.current.following));

  return { prevFollowers, prevFollowing };
}

export function getProfilePicData(username, cachedData) {
  if (!cachedData) return null;
  const follower = cachedData.followers?.find((u) => u.username === username);
  if (follower) return follower;
  const following = cachedData.following?.find((u) => u.username === username);
  if (following) return following;
  return null;
}

export async function loadPreviousSnapshot() {
  try {
    const me = await getCurrentUser();
    return await new Promise((resolve) => {
      try {
        chrome.storage.local.get([SCAN_STORAGE_KEY], (obj) => {
          const current = obj?.[SCAN_STORAGE_KEY] || null;
          chrome.storage.local.get([`${SCAN_STORAGE_KEY}_prev`], (prevObj) => {
            const previous = prevObj?.[`${SCAN_STORAGE_KEY}_prev`] || null;
            const filteredCurrent =
              current && current.username === me.username ? current : null;
            const filteredPrevious =
              previous && previous.username === me.username ? previous : null;
            resolve({ current: filteredCurrent, previous: filteredPrevious });
          });
        });
      } catch (_) {
        resolve({ current: null, previous: null });
      }
    });
  } catch (_) {
    return { current: null, previous: null };
  }
}

export async function saveSnapshot(snapshot) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([SCAN_STORAGE_KEY], (obj) => {
        const current = obj?.[SCAN_STORAGE_KEY];
        if (current && current.username === snapshot.username) {
          chrome.storage.local.set(
            { [`${SCAN_STORAGE_KEY}_prev`]: current },
            () => {
              chrome.storage.local.set({ [SCAN_STORAGE_KEY]: snapshot }, () =>
                resolve()
              );
            }
          );
        } else {
          // check if its the same or different account
          chrome.storage.local.set({ [SCAN_STORAGE_KEY]: snapshot }, () =>
            resolve()
          );
        }
      });
    } catch (_) {
      resolve();
    }
  });
}

export async function computeFollowAnalysis() {
  const me = await getCurrentUser();
  const [followers, following] = await Promise.all([
    fetchFriendList(me.userId, "followers"),
    fetchFriendList(me.userId, "following"),
  ]);

  const followerSet = toSet(followers);
  const followingSet = toSet(following);

  const dontFollowYouBack = setDiff(followingSet, followerSet);
  const youDontFollowBack = setDiff(followerSet, followingSet);
  const mutuals = setInter(followerSet, followingSet);

  const prev = await loadPreviousSnapshot();

  let peopleYouFollowed = [];
  let peopleYouUnfollowed = [];
  let newFollowers = [];
  let lostFollowers = [];

  if (prev.current) {
    const { prevFollowers, prevFollowing } = processPreviousData(prev);

    peopleYouFollowed = setDiff(followingSet, prevFollowing);
    peopleYouUnfollowed = setDiff(prevFollowing, followingSet);
    newFollowers = setDiff(followerSet, prevFollowers);
    lostFollowers = setDiff(prevFollowers, followerSet);
  }

  const snapshot = {
    username: me.username,
    userId: me.userId,
    ts: Date.now(),
    followers,
    following,
    peopleYouFollowed,
    peopleYouUnfollowed,
    newFollowers,
    lostFollowers,
  };
  await saveSnapshot(snapshot);

  return {
    me,
    dontFollowYouBack,
    youDontFollowBack,
    mutuals,
    peopleYouFollowed,
    peopleYouUnfollowed,
    newFollowers,
    lostFollowers,
    hasPrev: !!prev.current,
    cachedSnapshot: snapshot,
  };
}

export async function scanFollowersAndFollowing() {
  const me = await getCurrentUser();
  const [followers, following] = await Promise.all([
    fetchFriendList(me.userId, "followers"),
    fetchFriendList(me.userId, "following"),
  ]);

  const followerSet = toSet(followers);
  const followingSet = toSet(following);

  const dontFollowYouBack = setDiff(followingSet, followerSet);
  const youDontFollowBack = setDiff(followerSet, followingSet);
  const mutuals = setInter(followerSet, followingSet);

  console.group("Instafn: Follow analysis");
  logSection("People who don't follow you back", dontFollowYouBack);
  logSection("People you don't follow back", youDontFollowBack);
  logSection("Mutual followers", mutuals);
  console.groupEnd();
}

function setDiff(a, b) {
  const out = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  return out.sort();
}

function setInter(a, b) {
  const out = [];
  for (const x of a) if (b.has(x)) out.push(x);
  return out.sort();
}

function logSection(title, items) {
  console.groupCollapsed(`${title} (${items.length})`);
  for (const it of items) console.log(it);
  console.groupEnd();
}
