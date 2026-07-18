import type { AuthProvider, UserIdentity } from "react-admin";
import type { AdminApiClient } from "./api";

type StoredIdentity = UserIdentity & {
  fullName: string;
  adminToken: string;
};

type AdminAuthProviderOptions = {
  client: Pick<AdminApiClient, "adminApiUrl" | "adminRequest" | "authStorageKey">;
  missingCredentialMessage: string;
  identityLabel?: string;
};

/** Builds the shared static-token React-admin auth provider. */
export function createAdminAuthProvider(
  options: AdminAuthProviderOptions,
): AuthProvider {
  const identityLabel = options.identityLabel ?? "Administrator";

  /** Reads and validates the local placeholder identity used by React-admin. */
  function getStoredIdentity(): StoredIdentity | null {
    const storedValue = localStorage.getItem(options.client.authStorageKey);
    if (!storedValue) return null;

    try {
      const identity = JSON.parse(storedValue) as Partial<StoredIdentity>;
      if (
        typeof identity.id !== "string" ||
        typeof identity.fullName !== "string" ||
        typeof identity.adminToken !== "string"
      ) {
        return null;
      }
      return {
        id: identity.id,
        fullName: identity.fullName,
        adminToken: identity.adminToken,
      };
    } catch {
      return null;
    }
  }

  return {
    /** Validates the static token before persisting the session. */
    login: async ({ adminKey }: { adminKey?: string }) => {
      const normalizedAdminKey = adminKey?.trim();
      if (!normalizedAdminKey) {
        throw new Error(options.missingCredentialMessage);
      }

      await options.client.adminRequest(`${options.client.adminApiUrl}/session`, {
        headers: new Headers({ "X-Admin-Token": normalizedAdminKey }),
      });

      const identity: StoredIdentity = {
        id: "admin",
        fullName: identityLabel,
        adminToken: normalizedAdminKey,
      };
      localStorage.setItem(
        options.client.authStorageKey,
        JSON.stringify(identity),
      );
    },

    logout: async () => {
      localStorage.removeItem(options.client.authStorageKey);
    },

    /** Rejects protected navigation when no placeholder identity is stored. */
    checkAuth: () => (getStoredIdentity() ? Promise.resolve() : Promise.reject()),

    /** Clears stale placeholder auth when the API reports an auth failure. */
    checkError: async (error: { status?: number }) => {
      if (error.status === 401 || error.status === 403) {
        localStorage.removeItem(options.client.authStorageKey);
        throw error;
      }
    },

    getIdentity: async () => {
      const identity = getStoredIdentity();
      if (!identity) {
        throw new Error("Authentication required");
      }
      return { id: identity.id, fullName: identity.fullName };
    },

    getPermissions: async () => [],
  };
}
