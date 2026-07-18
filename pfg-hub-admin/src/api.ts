import { createAdminApiClient } from "@pfg/admin-ui-core/api";

const configuredApiUrl = import.meta.env.VITE_PFG_HUB_API_URL?.trim() || "/api";

export const AUTH_STORAGE_KEY = "pfg-hub-admin.identity";

const client = createAdminApiClient({
  authStorageKey: AUTH_STORAGE_KEY,
  baseApiUrl: configuredApiUrl,
});

export const hubApiUrl = client.baseApiUrl;
export const adminApiUrl = client.adminApiUrl;
export const getAdminToken = client.getAdminToken;
export const adminRequest = client.adminRequest;
export const hubRequest = client.apiRequest;
