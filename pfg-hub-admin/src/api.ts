import { fetchUtils } from "react-admin";

const AUTH_STORAGE_KEY = "pfg-hub-admin.identity";
const configuredApiUrl = import.meta.env.VITE_PFG_HUB_API_URL?.trim() || "/api";
const apiUrl = configuredApiUrl.replace(/\/+$/, "");

export const adminApiUrl = `${apiUrl}/admin`;

type StoredSession = {
  adminToken?: unknown;
};

/** Reads the admin token only from a structurally valid stored session. */
export function getAdminToken(): string | null {
  const storedValue = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!storedValue) return null;

  try {
    const session = JSON.parse(storedValue) as StoredSession;
    return typeof session.adminToken === "string" && session.adminToken
      ? session.adminToken
      : null;
  } catch {
    return null;
  }
}

/** Executes an API request with JSON defaults and the persisted admin credential. */
export function adminRequest(
  url: string,
  options: fetchUtils.Options = {},
) {
  const headers = new Headers(options.headers);
  const adminToken = getAdminToken();
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (adminToken && !headers.has("X-Admin-Token")) {
    headers.set("X-Admin-Token", adminToken);
  }

  return fetchUtils.fetchJson(url, {
    ...options,
    credentials: "include",
    headers,
  });
}

export { AUTH_STORAGE_KEY };
