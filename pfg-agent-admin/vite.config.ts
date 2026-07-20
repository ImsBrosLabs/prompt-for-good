import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Builds dev server settings from env so native and Docker workflows can share one config.
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...fileEnv, ...process.env };
  const proxyProtocol = env.HTTPS_ENABLED === "true" ? "https" : "http";
  const proxyHost = env.PFG_HUB_PROXY_HOST || "localhost";
  const defaultTarget = `${proxyProtocol}://${proxyHost}:8080`;
  const usePolling =
    env.VITE_USE_POLLING === "true" || env.CHOKIDAR_USEPOLLING === "true";
  const pollInterval = Number(
    env.VITE_POLL_INTERVAL || env.CHOKIDAR_INTERVAL || 100,
  );

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@pfg/admin-ui-core": fileURLToPath(
          new URL("../pfg-admin-ui-core/src", import.meta.url),
        ),
        "@mui/icons-material": fileURLToPath(
          new URL("./node_modules/@mui/icons-material", import.meta.url),
        ),
        "@mui/material": fileURLToPath(
          new URL("./node_modules/@mui/material", import.meta.url),
        ),
        react: fileURLToPath(new URL("./node_modules/react", import.meta.url)),
        "react-admin": fileURLToPath(
          new URL("./node_modules/react-admin", import.meta.url),
        ),
      },
      dedupe: ["react", "react-dom", "react-admin", "@mui/material"],
    },
    server: {
      watch: usePolling
        ? {
            usePolling: true,
            interval: pollInterval,
          }
        : undefined,
      proxy: {
        "/api": {
          target: env.PFG_HUB_PROXY_TARGET || defaultTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
