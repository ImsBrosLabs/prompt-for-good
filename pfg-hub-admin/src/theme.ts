import type { RaThemeOptions } from "react-admin";

export const adminTheme: RaThemeOptions = {
  palette: {
    mode: "light",
    primary: {
      main: "#147565",
      dark: "#105f52",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#c95a32",
    },
    background: {
      default: "#f3f6f5",
      paper: "#ffffff",
    },
    text: {
      primary: "#17211f",
      secondary: "#64716e",
    },
    divider: "#e1e7e5",
  },
  sidebar: {
    width: 228,
    closedWidth: 60,
  },
  shape: {
    borderRadius: 6,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h6: {
      fontSize: "1rem",
      fontWeight: 700,
    },
    body1: {
      fontSize: "0.875rem",
    },
    body2: {
      fontSize: "0.8125rem",
    },
    button: {
      fontSize: "0.8125rem",
      fontWeight: 700,
      letterSpacing: 0,
      textTransform: "none",
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 6,
          boxShadow: "none",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid #e1e7e5",
          borderRadius: 6,
          boxShadow: "0 1px 2px rgba(23, 33, 31, 0.04)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: 48,
          backgroundColor: "#ffffff",
          borderRadius: 6,
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#8b9a96",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderWidth: 1,
          },
        },
        notchedOutline: {
          borderColor: "#cdd7d4",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#667572",
          fontSize: 14,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          height: 48,
          padding: "8px 14px",
          borderBottomColor: "#e8edeb",
          fontSize: 13,
        },
        head: {
          height: 42,
          color: "#61706c",
          backgroundColor: "#f7f9f8",
          fontSize: 11,
          fontWeight: 750,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:hover": {
            backgroundColor: "#f4f8f7",
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 5,
          fontWeight: 650,
        },
      },
    },
  },
};
