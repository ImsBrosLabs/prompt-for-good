import { defineConfig } from "vitest/config";

const runDbTests = process.env.RUN_DB_TESTS === "true";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
    pool: "forks",
    fileParallelism: !runDbTests,
    testTimeout: 30000,
  },
});
