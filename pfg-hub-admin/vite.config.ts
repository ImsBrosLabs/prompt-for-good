import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Proxies browser API calls to the hub across native and Docker development modes.
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const env = { ...fileEnv, ...process.env };
  const proxyProtocol = env.HTTPS_ENABLED === "true" ? "https" : "http";
  const proxyHost = env.PFG_HUB_PROXY_HOST || "localhost";
  const defaultTarget = `${proxyProtocol}://${proxyHost}:8080`;

  return {
    plugins: [react()],
    server: {
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
