import type { RaThemeOptions } from "react-admin";

const sidebar = {
  width: 228,
  closedWidth: 60,
};

const typography: RaThemeOptions["typography"] = {
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
};

export const adminLightTheme: RaThemeOptions = {
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
  sidebar,
  shape: {
    borderRadius: 6,
  },
  typography,
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

export const adminDarkTheme: RaThemeOptions = {
  ...adminLightTheme,
  palette: {
    mode: "dark",
    primary: {
      main: "#4db6a5",
      dark: "#2d8b7c",
      contrastText: "#061211",
    },
    secondary: {
      main: "#f08a62",
    },
    background: {
      default: "#101615",
      paper: "#17211f",
    },
    text: {
      primary: "#eff5f3",
      secondary: "#a7b5b1",
    },
    divider: "#2a3936",
  },
  sidebar,
  shape: adminLightTheme.shape,
  typography,
  components: {
    ...adminLightTheme.components,
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid #2a3936",
          borderRadius: 6,
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.32)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          minHeight: 48,
          backgroundColor: "#17211f",
          borderRadius: 6,
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "#73837f",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderWidth: 1,
          },
        },
        notchedOutline: {
          borderColor: "#394a46",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "#a7b5b1",
          fontSize: 14,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          height: 48,
          padding: "8px 14px",
          borderBottomColor: "#253431",
          fontSize: 13,
        },
        head: {
          height: 42,
          color: "#a7b5b1",
          backgroundColor: "#1d2926",
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
            backgroundColor: "#1c2a27",
          },
        },
      },
    },
  },
};
