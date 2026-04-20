export const ACCESS_TOKEN_KEY = "eventmaster_access_token";
export const REFRESH_TOKEN_KEY = "eventmaster_refresh_token";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function storeSessionTokens(data) {
  if (typeof window === "undefined") return;
  if (data.accessToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
  }
  if (data.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
  }
}

/** @param {string|null|undefined} token */
export function bearerJsonHeaders(token) {
  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
