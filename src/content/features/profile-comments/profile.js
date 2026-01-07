import {
  PROFILE_PIC_CACHE_DURATION,
  USER_ID_CACHE_DURATION,
} from "./config.js";
import { safeFetchJson } from "./api.js";
import { getCSRFToken } from "./auth.js";

const profilePicCache = new Map();
const userIdCache = new Map();

export async function getUserProfilePic(username) {
  if (!username) return null;

  const cached = profilePicCache.get(username);
  if (cached) {
    const { url, timestamp } = cached;
    if (Date.now() - timestamp < PROFILE_PIC_CACHE_DURATION) {
      return url;
    }
    profilePicCache.delete(username);
  }

  try {
    const response = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
        username
      )}`,
      {
        credentials: "include",
        headers: {
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );

    if (response.status === 429) {
      console.warn(
        `[Instafn Profile Comments] Rate limited when fetching profile pic for ${username}`
      );
      return null;
    }

    if (response.ok) {
      const data = await response.json();
      const profilePic = data?.data?.user?.profile_pic_url || null;

      if (profilePic) {
        profilePicCache.set(username, {
          url: profilePic,
          timestamp: Date.now(),
        });
      }

      return profilePic;
    }
  } catch (e) {
    console.warn(
      `[Instafn Profile Comments] Error fetching profile pic for ${username}:`,
      e.message
    );
  }
  return null;
}

function tryExtractUserIdFromPage(username) {
  try {
    if (window.__additionalData) {
      const data = window.__additionalData;
      if (data?.user?.id || data?.user?.pk) {
        const userId = String(data.user.id || data.user.pk);
        if (data.user.username === username) {
          console.log(
            `[Instafn Profile Comments]  Extracted userId from window.__additionalData: ${userId}`
          );
          return userId;
        }
      }
    }

    if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
      const reactRoots = window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers;
      if (reactRoots) {
        for (const renderer of reactRoots.values()) {
          const roots = renderer.getFiberRoots?.(1);
          if (roots) {
            for (const root of roots.values()) {
              const fiber = root.current;
              if (fiber?.memoizedState) {
                const state = fiber.memoizedState;
                if (state?.user?.id || state?.user?.pk) {
                  const userId = String(state.user.id || state.user.pk);
                  if (state.user.username === username) {
                    console.log(
                      `[Instafn Profile Comments]  Extracted userId from React state: ${userId}`
                    );
                    return userId;
                  }
                }
              }
            }
          }
        }
      }
    }

    const metaUserId = document.querySelector('meta[property="og:url"]');
    if (metaUserId) {
      const url = metaUserId.getAttribute("content");
      const match = url?.match(/\/p\/([^\/]+)\//);
    }

    try {
      const cached =
        localStorage.getItem("ig_user_id") ||
        sessionStorage.getItem("ig_user_id");
      if (cached) {
        console.log(
          `[Instafn Profile Comments]  Found cached userId: ${cached} (may be stale)`
        );
        return cached;
      }
    } catch (e) {
      // Ignore storage errors
    }
  } catch (error) {
    console.warn(
      "[Instafn Profile Comments] Error extracting userId from page:",
      error
    );
  }
  return null;
}

export async function getVerifiedCurrentUser() {
  try {
    try {
      const data = await safeFetchJson(
        "https://www.instagram.com/api/v1/accounts/edit/web_form_data/"
      );

      const username = data?.form_data?.username || data?.user?.username;
      let userId = String(
        data?.user?.pk ||
          data?.user?.id ||
          data?.pk ||
          data?.id ||
          data?.form_data?.user_id ||
          data?.form_data?.pk ||
          ""
      );

      console.log("[Instafn Profile Comments] Extracted:", {
        username,
        userId,
        hasUser: !!data?.user,
        hasFormData: !!data?.form_data,
      });

      if (username && !userId) {
        const extractedUserId = tryExtractUserIdFromPage(username);
        if (extractedUserId) {
          userId = extractedUserId;
        }
      }

      if (username && username.trim() !== "" && userId) {
        return { username: username.trim(), userId };
      } else if (username && !userId) {
        try {
          const profileData = await safeFetchJson(
            `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
              username
            )}`
          );

          const fetchedUserId = String(
            profileData?.data?.user?.id ||
              profileData?.data?.user?.pk ||
              profileData?.user?.id ||
              profileData?.user?.pk ||
              ""
          );

          if (fetchedUserId) {
            try {
              localStorage.setItem("ig_user_id", fetchedUserId);
            } catch (e) {}
            return { username: username.trim(), userId: fetchedUserId };
          }
        } catch (e) {
          if (
            (e.message?.includes("429") ||
              e.message?.includes("Rate limited")) &&
            username &&
            username.trim() !== ""
          ) {
            console.warn(
              "[Instafn Profile Comments]  Rate limited - will attempt with username only. Backend will look up userId during verification."
            );
            return { username: username.trim(), userId: null };
          }
        }
      }
    } catch (e) {
      console.error("[Instafn Profile Comments]  Edit endpoint failed:", e);
    }

    try {
      const data = await safeFetchJson(
        "https://www.instagram.com/api/v1/accounts/current_user/"
      );

      const username = data?.user?.username;
      const userId = String(
        data?.user?.pk || data?.user?.id || data?.pk || data?.id || ""
      );

      if (username && userId) {
        return { username: username.trim(), userId };
      }
    } catch (e) {
      console.warn(
        "[Instafn Profile Comments]  current_user endpoint failed (this is normal):",
        e.message || e
      );
    }

    try {
      const csrftoken = getCSRFToken();
      const headers = {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://www.instagram.com/",
        "X-IG-App-ID": "936619743392459",
      };
      if (csrftoken) {
        headers["X-CSRFToken"] = decodeURIComponent(csrftoken);
      }

      const resp = await fetch(
        "https://www.instagram.com/api/v1/accounts/edit/web_form_data/",
        {
          method: "GET",
          credentials: "include",
          headers,
          cache: "no-store",
        }
      );

      if (resp.ok) {
        const data = await resp.json();
        const username = data?.form_data?.username || data?.user?.username;
        const userId = String(data?.user?.pk || data?.user?.id || "");

        if (username && userId) {
          return { username: username.trim(), userId };
        }
      }
    } catch (e) {
      console.error("[Instafn Profile Comments]  Final retry failed:", e);
    }

    throw new Error("Could not verify user identity - all methods failed");
  } catch (error) {
    console.error(
      "[Instafn Profile Comments]  Error getting verified user:",
      error
    );
    throw error;
  }
}

export async function getProfileUserId(username) {
  if (!username) {
    throw new Error("Username is required");
  }

  const cached = userIdCache.get(username);
  if (cached) {
    const { userId, timestamp } = cached;
    if (Date.now() - timestamp < USER_ID_CACHE_DURATION) {
      return userId;
    }
    userIdCache.delete(username);
  }

  try {
    const response = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
        username
      )}`,
      {
        credentials: "include",
        headers: {
          "X-IG-App-ID": "936619743392459",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );

    if (response.status === 429) {
      if (cached) {
        console.warn(
          `[Instafn Profile Comments] Rate limited, using expired cache for ${username}`
        );
        return cached.userId;
      }
      throw new Error(
        `HTTP 429: Rate limited. Please wait a few minutes and try again.`
      );
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const userId = String(data?.data?.user?.id || data?.data?.user?.pk || "");
    if (!userId) {
      throw new Error("Could not get profile user ID");
    }

    userIdCache.set(username, {
      userId,
      timestamp: Date.now(),
    });

    return userId;
  } catch (error) {
    console.error(
      "[Instafn Profile Comments] Error getting profile user ID:",
      error
    );

    if (cached) {
      console.warn(
        `[Instafn Profile Comments] Using expired cache as fallback for ${username}`
      );
      return cached.userId;
    }

    throw error;
  }
}
