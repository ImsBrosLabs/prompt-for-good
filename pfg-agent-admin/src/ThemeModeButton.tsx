import Brightness4OutlinedIcon from "@mui/icons-material/Brightness4Outlined";
import Brightness7OutlinedIcon from "@mui/icons-material/Brightness7Outlined";
import { IconButton, Tooltip } from "@mui/material";
import { useTheme as useRaTheme } from "react-admin";

/** Toggles the React-admin theme preference so every public and admin surface stays in sync. */
export function ThemeModeButton() {
  const [theme, setTheme] = useRaTheme("light");
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <Tooltip title="Toggle light/dark mode">
      <IconButton
        aria-label="Toggle light/dark mode"
        color="inherit"
        onClick={() => setTheme(nextTheme)}
      >
        {theme === "dark" ? (
          <Brightness7OutlinedIcon />
        ) : (
          <Brightness4OutlinedIcon />
        )}
      </IconButton>
    </Tooltip>
  );
}
