import { createAdminApiClient } from "@pfg/admin-ui-core/api";

const configuredApiUrl =
  import.meta.env.VITE_PFG_AGENT_ADMIN_API_URL?.trim() || "http://localhost:8091";

export const AUTH_STORAGE_KEY = "pfg-agent-admin.identity";

const client = createAdminApiClient({
  authStorageKey: AUTH_STORAGE_KEY,
  baseApiUrl: configuredApiUrl,
});

export const agentAdminApiUrl = client.baseApiUrl;
export const adminApiUrl = client.adminApiUrl;
export const getAdminToken = client.getAdminToken;
export const adminRequest = client.adminRequest;
export const hubRequest = client.apiRequest;
