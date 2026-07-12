import { expect, test, type Page } from "@playwright/test";

// Guards the public entry point against the render loop that previously blanked it.
test("renders the login screen without a React update loop", async ({
  page,
}) => {
  const renderLoopErrors: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Maximum update depth exceeded")) {
      renderLoopErrors.push(message.text());
    }
  });

  await page.goto("/");

  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View public dashboard" })).toBeVisible();
  await expect(
    page.locator(".MuiOutlinedInput-root").filter({
      has: page.getByRole("textbox", { name: "Admin key" }),
    }),
  ).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  expect(renderLoopErrors).toEqual([]);
});

test("opens the public dashboard from login without authenticating", async ({
  page,
}) => {
  await routePublicDashboard(page);

  await page.goto("/");
  await page.getByRole("link", { name: "View public dashboard" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Public hub dashboard" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("keeps the public dashboard usable when public repositories are unavailable", async ({
  page,
}) => {
  await routePublicDashboard(page, { repositoriesStatus: 404 });

  await page.goto("/");
  await page.getByRole("link", { name: "View public dashboard" }).click();

  await expect(
    page.getByRole("heading", { name: "Public hub dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("No repositories found.")).toBeVisible();
  await expect(page.getByText(/failed with status 404/)).toHaveCount(0);
});

test("persists theme changes made before signing in", async ({ page }) => {
  await page.route("**/admin/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [], total: 0 }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Toggle light/dark mode" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("RaStore.theme")))
    .toBe('"dark"');
  await expect(page.locator("#root > div").first()).toHaveCSS(
    "background-color",
    "rgb(16, 22, 21)",
  );

  await page.getByRole("textbox", { name: "Admin key" }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/#\/repositories/);
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(16, 22, 21)",
  );
});

// Exercises placeholder authentication and the first protected resource end to end.
test("signs in and opens the admin workspace", async ({ page }) => {
  await page.route("**/admin/**", async (route) => {
    expect(route.request().headers()["x-admin-token"]).toBe("password");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [], total: 0 }),
    });
  });

  await page.goto("/");
  await page.getByRole("textbox", { name: "Admin key" }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/#\/repositories/);
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(
    page.getByText("Repositories", { exact: true }).first(),
  ).toBeVisible();
});

test("toggles the admin workspace between light and dark mode", async ({
  page,
}) => {
  await page.route("**/admin/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [], total: 0 }),
    });
  });

  await page.goto("/");
  await page.getByRole("textbox", { name: "Admin key" }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/#\/repositories/);
  await expect(
    page.getByRole("button", { name: "Toggle light/dark mode" }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(243, 246, 245)",
  );

  await page.getByRole("button", { name: "Toggle light/dark mode" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("RaStore.theme")))
    .toBe('"dark"');
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(16, 22, 21)",
  );

  await page.getByRole("button", { name: "Toggle light/dark mode" }).click();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("RaStore.theme")))
    .toBe('"light"');
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(243, 246, 245)",
  );
});

test("edits and resets grouped runtime configuration", async ({ page }) => {
  let issueRecord = runtimeConfigRecord({
    key: "issueMinScore",
    value: 60,
    source: "environment",
    category: "Issues",
    label: "Minimum issue score",
    valueType: "integer",
    env: "ISSUE_MIN_SCORE",
    environmentValue: "60",
  });
  const records = [
    issueRecord,
    runtimeConfigRecord({
      key: "githubIngestionEnabled",
      value: false,
      source: "default",
      category: "GitHub ingestion",
      label: "Scheduled GitHub ingestion",
      valueType: "boolean",
      env: "GITHUB_INGESTION_ENABLED",
      environmentValue: null,
    }),
    runtimeConfigRecord({
      key: "secretWebhook",
      value: "super-secret",
      source: "database",
      category: "Security",
      label: "Webhook secret",
      valueType: "string",
      env: "SECRET_WEBHOOK",
      secret: true,
      defaultValue: "fallback-secret",
      hasDatabaseOverride: true,
      environmentValue: null,
    }),
  ];
  let updateBody: unknown;
  let resetCalled = false;

  await page.route("**/admin/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ authenticated: true }),
    });
  });
  await page.route("**/admin/repositories**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [], total: 0 }),
    });
  });
  await page.route("**/admin/configuration?*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: records, total: records.length }),
    });
  });
  await page.route("**/admin/configuration/issueMinScore", async (route) => {
    if (route.request().method() === "PUT") {
      updateBody = route.request().postDataJSON();
      issueRecord = {
        ...issueRecord,
        value: 75,
        source: "database",
        hasDatabaseOverride: true,
        updatedBy: "admin",
      };
      records[0] = issueRecord;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(issueRecord),
      });
      return;
    }

    resetCalled = true;
    issueRecord = {
      ...issueRecord,
      value: 60,
      source: "environment",
      hasDatabaseOverride: false,
      updatedBy: null,
    };
    records[0] = issueRecord;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(issueRecord),
    });
  });

  await page.goto("/");
  await page.getByRole("textbox", { name: "Admin key" }).fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/#\/repositories/);

  await page.goto("/#/configuration");
  const mainContent = page.locator("#main-content");
  await expect(
    mainContent.getByRole("heading", { name: "Configuration" }),
  ).toBeVisible();
  await expect(mainContent.getByText("Issues", { exact: true })).toBeVisible();
  await expect(
    mainContent.getByText("GitHub ingestion", { exact: true }),
  ).toBeVisible();
  await expect(
    mainContent.getByText("Security", { exact: true }),
  ).toBeVisible();

  await expect(
    page.locator('input[aria-label="Scheduled GitHub ingestion"]'),
  ).not.toBeChecked();
  await expect(mainContent.getByText("Env value: 60")).toBeVisible();
  await expect(mainContent.getByText("Env value: Not set")).toBeVisible();
  await expect(mainContent.getByText("Env value: Hidden")).toBeVisible();
  await expect(
    page.locator('input[aria-label="Webhook secret"]'),
  ).toHaveAttribute("type", "password");
  await expect(page.locator('input[aria-label="Webhook secret"]')).toHaveValue(
    "",
  );
  await expect(page.getByText("super-secret")).toHaveCount(0);
  await expect(page.getByText("fallback-secret")).toHaveCount(0);

  await page
    .getByRole("spinbutton", { name: "Minimum issue score" })
    .fill("75");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect.poll(() => updateBody).toEqual({ value: 75 });

  const resetButton = page
    .getByRole("button", { name: "Restore default" })
    .first();
  await expect(resetButton).toBeEnabled();
  await resetButton.click();
  await expect.poll(() => resetCalled).toBe(true);
});

// Builds admin configuration records with the same envelope shape as the API.
function runtimeConfigRecord(input: {
  key: string;
  value: unknown;
  source: "database" | "environment" | "default";
  category: string;
  label: string;
  valueType: "boolean" | "integer" | "string";
  env: string;
  environmentValue?: string | null;
  secret?: boolean;
  defaultValue?: unknown;
  hasDatabaseOverride?: boolean;
}) {
  return {
    id: input.key,
    key: input.key,
    value: input.value,
    environmentValue: input.environmentValue ?? null,
    source: input.source,
    hasDatabaseOverride: input.hasDatabaseOverride ?? false,
    updatedAt: null,
    updatedBy: null,
    metadata: {
      env: input.env,
      label: input.label,
      description: `Description for ${input.label}`,
      category: input.category,
      secret: input.secret ?? false,
      valueType: input.valueType,
      defaultValue: input.defaultValue ?? input.value,
    },
  };
}

/** Fulfills public dashboard requests so navigation can be tested without a hub process. */
async function routePublicDashboard(
  page: Page,
  options: { repositoriesStatus?: number } = {},
) {
  await page.route(/\/stats(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        totalRepos: 0,
        eligibleRepos: 0,
        queueSize: 0,
        totalPrsOpened: 0,
        activeRunners: 0,
      }),
    });
  });
  await page.route(/\/repos(?:\?|$)/, async (route) => {
    if (options.repositoriesStatus) {
      await route.fulfill({
        status: options.repositoriesStatus,
        contentType: "application/json",
        body: JSON.stringify({ message: "Not Found" }),
      });
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [], total: 0 }),
    });
  });
  await page.route(/\/token-usage(?:\?|$)/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        totalTokensUsed: 0,
        successfulContributions: 0,
        failedContributions: 0,
      }),
    });
  });
}
