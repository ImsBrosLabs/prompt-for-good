import { expect, test } from "@playwright/test";

// Guards the public entry point against the render loop that previously blanked it.
test("renders the login screen without a React update loop", async ({ page }) => {
  const renderLoopErrors: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Maximum update depth exceeded")) {
      renderLoopErrors.push(message.text());
    }
  });

  await page.goto("/");

  await expect(page).toHaveURL(/#\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  expect(renderLoopErrors).toEqual([]);
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
