import { createAdminAuthProvider } from "@pfg/admin-ui-core/authProvider";
import { adminApiUrl, adminRequest, AUTH_STORAGE_KEY } from "./api";

export const authProvider = createAdminAuthProvider({
  client: { adminApiUrl, adminRequest, authStorageKey: AUTH_STORAGE_KEY },
  missingCredentialMessage: "Enter the admin key to continue",
});
