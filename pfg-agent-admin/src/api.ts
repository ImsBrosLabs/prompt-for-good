import { fetchUtils } from "react-admin";

const AUTH_STORAGE_KEY = "pfg-agent-admin.identity";
const configuredApiUrl =
  import.meta.env.VITE_PFG_AGENT_ADMIN_API_URL?.trim() ||
  "http://localhost:8091";
const apiUrl = configuredApiUrl.replace(/\/+$/, "");

export const agentAdminApiUrl = apiUrl;
export const adminApiUrl = `${agentAdminApiUrl}/admin`;

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
function authenticatedJsonRequest(
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

export function adminRequest(url: string, options: fetchUtils.Options = {}) {
  return authenticatedJsonRequest(url, options);
}

/** Calls a local API endpoint outside the /admin namespace with the admin credential. */
export function hubRequest(path: string, options: fetchUtils.Options = {}) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return authenticatedJsonRequest(`${agentAdminApiUrl}${normalizedPath}`, options);
}

export { AUTH_STORAGE_KEY };
