import type { AuthProvider, UserIdentity } from "react-admin";
import { adminApiUrl, adminRequest, AUTH_STORAGE_KEY } from "./api";

type StoredIdentity = UserIdentity & {
  fullName: string;
  adminToken: string;
};

/** Reads and validates the local placeholder identity used by React-admin. */
function getStoredIdentity(): StoredIdentity | null {
  const storedValue = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!storedValue) {
    return null;
  }

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

export const authProvider: AuthProvider = {
  /** Validates the local admin token before persisting the session. */
  login: async ({ adminKey }: { adminKey?: string }) => {
    const normalizedAdminKey = adminKey?.trim();
    if (!normalizedAdminKey) {
      throw new Error("Enter the local admin token to continue");
    }

    await adminRequest(`${adminApiUrl}/session`, {
      headers: new Headers({ "X-Admin-Token": normalizedAdminKey }),
    });

    const identity: StoredIdentity = {
      id: "admin",
      fullName: "Administrator",
      adminToken: normalizedAdminKey,
    };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(identity));
  },

  logout: async () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  },

  /** Rejects protected navigation when no placeholder identity is stored. */
  checkAuth: () =>
    getStoredIdentity() ? Promise.resolve() : Promise.reject(),

  /** Clears stale placeholder auth when the future API reports an auth failure. */
  checkError: async (error: { status?: number }) => {
    if (error.status === 401 || error.status === 403) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
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
