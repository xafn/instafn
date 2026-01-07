export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6ZWFudmxhcHpreXJmc3RjeGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2NDYzNjUsImV4cCI6MjA4MzIyMjM2NX0.LM_garo2IY47HoxivYMEdOuw_Vu8wXddRRHNEJOcd0Q";
export const SUPABASE_FUNCTION_URL =
  "https://wzeanvlapzkyrfstcxhz.supabase.co/functions/v1/comments-api";

const INSTAFN_EXTENSION_SECRET_PARTS = [
  "instafn",
  "_sec",
  "_2024",
  "_v1",
  "_ext",
  "_only",
  "_auth",
  "_key",
];

export const INSTAFN_EXTENSION_SECRET = INSTAFN_EXTENSION_SECRET_PARTS.join("");
export const BUTTON_ID = "instafn-profile-comments-btn";
export const SIDEBAR_ID = "instafn-profile-comments-sidebar";
export const PROFILE_PIC_CACHE_DURATION = 24 * 60 * 60 * 1000;
export const USER_ID_CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

let API_BASE_URL = SUPABASE_FUNCTION_URL;
let SUPABASE_KEY = SUPABASE_ANON_KEY;

chrome.storage.sync.get(
  {
    profileCommentsApiUrl: SUPABASE_FUNCTION_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  },
  (result) => {
    API_BASE_URL = result.profileCommentsApiUrl || SUPABASE_FUNCTION_URL;
    SUPABASE_KEY = result.supabaseAnonKey || SUPABASE_ANON_KEY;
  }
);

export function getApiBaseUrl() {
  return API_BASE_URL;
}

export function getSupabaseKey() {
  return SUPABASE_KEY;
}
