import { getSupabaseKey, getApiBaseUrl } from "./config.js";
import { getCSRFToken } from "./auth.js";

export function getInstagramHeaders() {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${getSupabaseKey()}`,
  };
  return headers;
}

export async function testSupabaseConnection() {
  try {
    const healthUrl = `${getApiBaseUrl()}/health`;
    console.log(
      `[Instafn Profile Comments] Testing Supabase connection: ${healthUrl}`
    );

    const response = await fetch(healthUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getSupabaseKey()}`,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log(
        "[Instafn Profile Comments] Supabase connection successful:",
        data
      );
      return true;
    } else {
      console.error(
        `[Instafn Profile Comments] Supabase health check failed: ${response.status}`
      );
      return false;
    }
  } catch (error) {
    console.error(
      "[Instafn Profile Comments] Supabase connection test failed:",
      error
    );
    console.error("[Instafn Profile Comments] API_BASE_URL:", getApiBaseUrl());
    console.error(
      "[Instafn Profile Comments] SUPABASE_KEY present:",
      !!getSupabaseKey()
    );
    return false;
  }
}

export async function safeFetchJson(url) {
  const csrftoken = getCSRFToken();
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
