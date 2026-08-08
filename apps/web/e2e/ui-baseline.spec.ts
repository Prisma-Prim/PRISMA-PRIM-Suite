import { expect, test } from "@playwright/test";

const viewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1200, height: 750 },
  { name: "mobile", width: 390, height: 844 },
] as const;

for (const viewport of viewports) {
  test(`renders the UI baseline without document overflow on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/ui-baseline#/dashboard");

    await expect(
      page.getByRole("heading", { name: "Décisions et performance" }),
    ).toBeVisible();

    const geometry = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));

    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  });
}

test("keeps the baseline navigation interactive", async ({ page }) => {
  await page.goto("/ui-baseline#/dashboard");
  await page
    .getByRole("button", { name: "Clients & contacts", exact: true })
    .click();

  await expect(page).toHaveURL(/\/ui-baseline#\/clients$/);
  await expect(
    page.getByRole("heading", { name: "Clients et contacts" }),
  ).toBeVisible();
});
