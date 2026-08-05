import { expect, test, type BrowserContext, type Page } from "@playwright/test";

async function createProject(page: Page, name: string) {
  await page.goto("/");
  await page.getByLabel("Project name").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const serviceWorker = await page.evaluate(async () => {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.state ?? "missing";
    } catch (error) {
      return String(error);
    }
  });
  expect(serviceWorker).toBe("activated");
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

async function openSecondTab(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByText("Read-only: another tab is editing")).toBeVisible();
  return page;
}

test.describe("offline, single-writer projects", () => {
  test("reloads a local project while Chrome is offline", async ({ context, page }) => {
    await createProject(page, "Offline reload home");
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Offline reload home" })).toBeVisible();
  });

  test("keeps a second Chrome tab read-only and flushes before takeover", async ({ context, page }) => {
    await createProject(page, "Writer home");
    const second = await openSecondTab(context);
    await page.getByLabel("Rename project").fill("Flushed writer home");
    await page.getByLabel("Rename project").blur();
    await second.getByRole("button", { name: "Take over editing" }).click();
    await expect(second.getByText("Editing in this tab")).toBeVisible();
    await second.reload();
    await expect(second.getByRole("heading", { name: "Flushed writer home" })).toBeVisible();
  });

  test("recovers the writer lock after the active tab is abandoned", async ({ context, page }) => {
    await createProject(page, "Recovery home");
    const second = await openSecondTab(context);
    await page.close();
    await expect(second.getByText("Editing in this tab")).toBeVisible({ timeout: 5_000 });
  });
});
