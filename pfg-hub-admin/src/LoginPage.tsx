import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import PublicOutlinedIcon from "@mui/icons-material/PublicOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { type FormEvent, useState } from "react";
import { useLogin } from "react-admin";
import { useDocumentTitle } from "./pageTitles";
import { ThemeModeButton } from "./ThemeModeButton";

/** Renders the responsive branded login and delegates authentication to React-admin. */
export function LoginPage() {
  useDocumentTitle();

  const login = useLogin();
  const [adminKey, setAdminKey] = useState("");
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /** Submits credentials through React-admin and surfaces authentication errors. */
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      await login({ adminKey });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in",
      );
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(320px, 42%) 1fr" },
        gridTemplateRows: { xs: "190px minmax(0, 1fr)", md: "1fr" },
        color: "text.primary",
        backgroundColor: "background.default",
      }}
    >
      <Box
        component="section"
        sx={{
          position: "relative",
          minHeight: { xs: 190, md: "100dvh" },
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          px: { xs: 3, sm: 5, lg: 7 },
          py: { xs: 2.5, md: 5 },
          color: "text.primary",
          backgroundColor: (theme) =>
            alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.12 : 0.08),
          borderRight: { md: (theme) => `1px solid ${theme.palette.divider}` },
          borderBottom: { xs: (theme) => `1px solid ${theme.palette.divider}`, md: 0 },
          boxSizing: "border-box",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Box
            component="img"
            src="/pfg-logo.svg"
            alt="Prompt for Good"
            sx={{ width: { xs: 44, md: 56 }, height: { xs: 44, md: 56 } }}
          />
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 750, lineHeight: 1.2 }}>
              Prompt for Good
            </Typography>
            <Typography
              sx={{ mt: 0.35, color: "text.secondary", fontSize: 12, fontWeight: 550 }}
            >
              PFG Hub
            </Typography>
          </Box>
        </Box>

        <Box sx={{ py: { xs: 1.5, md: 6 }, maxWidth: 480 }}>
          <Typography
            sx={{
              color: "secondary.main",
              fontSize: 12,
              fontWeight: 750,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Administration
          </Typography>
          <Typography
            component="h1"
            sx={{
              display: { xs: "none", md: "block" },
              mt: 2,
              mb: 0,
              maxWidth: 440,
              color: "text.primary",
              fontSize: { md: 42, lg: 52 },
              fontWeight: 720,
              lineHeight: 1.08,
            }}
          >
            The workspace behind the work.
          </Typography>
        </Box>

        <Typography
          sx={{
            display: { xs: "none", md: "block" },
            color: "text.secondary",
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          PFG HUB / ADMIN
        </Typography>
      </Box>

      <Box
        component="main"
        sx={{
          position: "relative",
          display: "flex",
          alignItems: { xs: "flex-start", md: "center" },
          justifyContent: "center",
          px: { xs: 3, sm: 6 },
          py: { xs: 5, md: 8 },
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: { xs: 12, sm: 20 },
            right: { xs: 16, sm: 24 },
            color: "text.secondary",
          }}
        >
          <ThemeModeButton />
        </Box>

        <Box
          component="form"
          onSubmit={handleSubmit}
          sx={{ width: "100%", maxWidth: 390 }}
        >
          <Typography
            sx={{
              color: "primary.main",
              fontSize: 12,
              fontWeight: 750,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            Secure access
          </Typography>
          <Typography
            component="h2"
            sx={{
              mt: 1.25,
              mb: 1,
              color: "text.primary",
              fontSize: { xs: 30, md: 34 },
              fontWeight: 720,
              lineHeight: 1.2,
            }}
          >
            Sign in
          </Typography>
          <Typography sx={{ mb: 4, color: "text.secondary", fontSize: 14 }}>
            Enter the admin key configured on the PFG Hub.
          </Typography>

          {errorMessage ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errorMessage}
            </Alert>
          ) : null}

          <TextField
            label="Admin key"
            type={showAdminKey ? "text" : "password"}
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            fullWidth
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showAdminKey ? "Hide admin key" : "Show admin key"}
                      edge="end"
                      onClick={() => setShowAdminKey((visible) => !visible)}
                    >
                      {showAdminKey ? (
                        <VisibilityOffOutlinedIcon />
                      ) : (
                        <VisibilityOutlinedIcon />
                      )}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={loading}
            endIcon={
              loading ? (
                <CircularProgress color="inherit" size={18} />
              ) : (
                <ArrowForwardRoundedIcon />
              )
            }
            fullWidth
            sx={{ mt: 3, minHeight: 48 }}
          >
            Sign in
          </Button>

          <Button
            href="/dashboard"
            variant="outlined"
            size="large"
            startIcon={<PublicOutlinedIcon />}
            fullWidth
            sx={{ mt: 1.5, minHeight: 48 }}
          >
            View public dashboard
          </Button>
          <Typography
            sx={{
              mt: 1.25,
              color: "text.secondary",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            No admin key required.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
