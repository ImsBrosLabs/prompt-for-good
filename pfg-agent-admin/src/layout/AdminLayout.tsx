import { Box, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  AppBar,
  Layout,
  Menu,
  TitlePortal,
  type AppBarProps,
  type LayoutProps,
} from "react-admin";
import { useDocumentTitle } from "../pageTitles";

function AdminAppBar(props: AppBarProps) {
  return (
    <AppBar
      {...props}
      color="inherit"
      elevation={0}
      sx={{
        color: (theme) => theme.palette.text.primary,
        backgroundColor: (theme) =>
          alpha(theme.palette.background.paper, theme.palette.mode === "dark" ? 0.94 : 0.96),
        borderBottom: (theme) => `1px solid ${theme.palette.divider}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.1 }}>
        <Box
          component="img"
          src="/pfg-logo.svg"
          alt=""
          sx={{ width: 28, height: 28 }}
        />
        <Typography
          sx={{
            display: { xs: "none", sm: "block" },
            fontSize: 14,
            fontWeight: 750,
            whiteSpace: "nowrap",
          }}
        >
          Prompt for Good
        </Typography>
        <Box
          component="span"
          sx={{
            display: { xs: "none", md: "inline-flex" },
            px: 0.8,
            py: 0.3,
            color: (theme) => theme.palette.secondary.main,
            backgroundColor: (theme) => alpha(theme.palette.secondary.main, 0.12),
            border: (theme) => `1px solid ${alpha(theme.palette.secondary.main, 0.28)}`,
            borderRadius: 1,
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "0.08em",
          }}
        >
          AGENT
        </Box>
      </Box>
      <Box
        sx={{
          display: { xs: "none", sm: "block" },
          width: "1px",
          height: 22,
          mx: 2,
          backgroundColor: (theme) => theme.palette.divider,
        }}
      />
      <TitlePortal
        sx={{
          flex: 1,
          color: (theme) => theme.palette.text.secondary,
          fontSize: 14,
          fontWeight: 600,
        }}
      />
    </AppBar>
  );
}

export function AdminLayout(props: LayoutProps) {
  useDocumentTitle();

  return (
    <Layout
      {...props}
      appBar={AdminAppBar}
      menu={AdminMenu}
      sx={{
        "& .RaLayout-content": {
          minWidth: 0,
          px: { xs: 1.5, sm: 2.5, lg: 3.5 },
          py: { xs: 1.5, sm: 2.5 },
        },
        "& .RaSidebar-paper": {
          backgroundColor: (theme) => theme.palette.background.paper,
          borderRight: (theme) => `1px solid ${theme.palette.divider}`,
        },
        "& .RaMenu-root": {
          px: 1,
          py: 2,
        },
        "& .RaMenuItemLink-root": {
          minHeight: 42,
          mb: 0.5,
          borderRadius: 1.5,
          fontSize: 14,
          fontWeight: 550,
        },
        "& .RaMenuItemLink-root:hover": {
          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
        },
        "& .RaMenuItemLink-active": {
          color: (theme) => theme.palette.primary.main,
          backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.14),
        },
        "& .RaMenuItemLink-active .RaMenuItemLink-icon": {
          color: (theme) => theme.palette.primary.main,
        },
      }}
    />
  );
}

/** Keeps navigation focused on the local configuration resources. */
function AdminMenu() {
  return <Menu.ResourceItems />;
}
