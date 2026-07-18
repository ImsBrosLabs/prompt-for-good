import { fetchUtils } from "react-admin";

type StoredSession = {
  adminToken?: unknown;
};

export type AdminJsonResponse = {
  status: number;
  headers: Headers;
  body: string;
  json: any;
};

export type AdminApiClient = {
  authStorageKey: string;
  adminApiUrl: string;
  baseApiUrl: string;
  getAdminToken: () => string | null;
  adminRequest: (
    url: string,
    options?: fetchUtils.Options,
  ) => Promise<AdminJsonResponse>;
  apiRequest: (
    path: string,
    options?: fetchUtils.Options,
  ) => Promise<AdminJsonResponse>;
};

type AdminApiClientOptions = {
  authStorageKey: string;
  baseApiUrl: string;
};

/** Creates an authenticated JSON client shared by the admin frontends. */
export function createAdminApiClient(
  options: AdminApiClientOptions,
): AdminApiClient {
  const baseApiUrl = options.baseApiUrl.replace(/\/+$/, "");
  const adminApiUrl = `${baseApiUrl}/admin`;

  /** Reads the admin token only from a structurally valid stored session. */
  function getAdminToken(): string | null {
    const storedValue = localStorage.getItem(options.authStorageKey);
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
    requestOptions: fetchUtils.Options = {},
  ) {
    const headers = new Headers(requestOptions.headers);
    const adminToken = getAdminToken();
    headers.set("Accept", "application/json");
    if (requestOptions.body) headers.set("Content-Type", "application/json");
    if (adminToken && !headers.has("X-Admin-Token")) {
      headers.set("X-Admin-Token", adminToken);
    }

    return fetchUtils.fetchJson(url, {
      ...requestOptions,
      credentials: "include",
      headers,
    });
  }

  /** Calls an API endpoint outside the /admin namespace with the admin credential. */
  function apiRequest(path: string, requestOptions: fetchUtils.Options = {}) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return authenticatedJsonRequest(`${baseApiUrl}${normalizedPath}`, requestOptions);
  }

  return {
    authStorageKey: options.authStorageKey,
    adminApiUrl,
    baseApiUrl,
    getAdminToken,
    adminRequest: authenticatedJsonRequest,
    apiRequest,
  };
}
