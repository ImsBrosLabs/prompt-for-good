import { type ReactNode } from "react";
import {
  localStorageStore,
  StoreContextProvider,
  ThemeProvider,
  ThemesContext,
} from "react-admin";
import { adminDarkTheme, adminLightTheme } from "./theme";

const publicStore = localStorageStore();

/** Provides the same React-admin theme store to public routes rendered outside <Admin>. */
export function PublicThemeScope({ children }: { children: ReactNode }) {
  return (
    <StoreContextProvider value={publicStore}>
      <ThemesContext.Provider
        value={{ lightTheme: adminLightTheme, darkTheme: adminDarkTheme }}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </ThemesContext.Provider>
    </StoreContextProvider>
  );
}
