import { test, expect } from "@playwright/test";

test("smoke", async ({ page }) => {
  await page.goto("http://localhost:3000/auth/login");
  await expect(page).toHaveURL(/auth\/login/);
});
