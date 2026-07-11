import { expect, test, type Page } from "@playwright/test";

async function enterWorkspace(page: Page, role: "family" | "nurse") {
  await page.goto("/login");
  await page.getByRole("button", { name: role === "family" ? /家属端/ : /护士端/ }).click();
  await page.getByRole("button", { name: "登录并进入系统" }).click();
}

test("family users can enter the daily care workspace", async ({ page }) => {
  await enterWorkspace(page, "family");
  await expect(page).toHaveURL(/\/family$/);
  await expect(page.getByRole("heading", { name: "今日康复照护，一眼看清。" })).toBeVisible();
  await expect(page.getByText("家庭照护台 · 智能护膝在线")).toBeVisible();
});

test("nurses can enter the ward care workspace", async ({ page }) => {
  await enterWorkspace(page, "nurse");
  await expect(page).toHaveURL(/\/nurse$/);
  await expect(page.getByRole("heading", { name: "病区护理，一屏掌握。" })).toBeVisible();
  await expect(page.getByText("TKA 康复护士工作台")).toBeVisible();
});
