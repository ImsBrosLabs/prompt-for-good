import { Box, Typography } from "@mui/material";
import {
  AppBar,
  Layout,
  TitlePortal,
  type AppBarProps,
  type LayoutProps,
} from "react-admin";

function AdminAppBar(props: AppBarProps) {
  return (
    <AppBar
      {...props}
      color="inherit"
      elevation={0}
      sx={{
        color: "#17211f",
        backgroundColor: "rgba(255, 255, 255, 0.96)",
        borderBottom: "1px solid #e1e7e5",
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
            color: "#a64829",
            backgroundColor: "#fff0e9",
            border: "1px solid #f4d4c6",
            borderRadius: 1,
            fontSize: 10,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "0.08em",
          }}
        >
          ADMIN
        </Box>
      </Box>
      <Box
        sx={{
          display: { xs: "none", sm: "block" },
          width: "1px",
          height: 22,
          mx: 2,
          backgroundColor: "#dfe5e3",
        }}
      />
      <TitlePortal
        sx={{
          flex: 1,
          color: "#596763",
          fontSize: 14,
          fontWeight: 600,
        }}
      />
    </AppBar>
  );
}

export function AdminLayout(props: LayoutProps) {
  return (
    <Layout
      {...props}
      appBar={AdminAppBar}
      sx={{
        "& .RaLayout-content": {
          minWidth: 0,
          px: { xs: 1.5, sm: 2.5, lg: 3.5 },
          py: { xs: 1.5, sm: 2.5 },
        },
        "& .RaSidebar-paper": {
          backgroundColor: "#fbfcfc",
          borderRight: "1px solid #e1e7e5",
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
          backgroundColor: "#edf4f2",
        },
        "& .RaMenuItemLink-active": {
          color: "#105f52",
          backgroundColor: "#e3f0ed",
        },
        "& .RaMenuItemLink-active .RaMenuItemLink-icon": {
          color: "#147565",
        },
      }}
    />
  );
}
