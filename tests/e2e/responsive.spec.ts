import { test, expect } from "@playwright/test";

test("changing from desktop to phone reframes both parts of Malaysia", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await page.getByRole("button", { name: "All Malaysia", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(sessionStorage.getItem("jerebu-camera"))))
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const map = document.querySelector("canvas.maplibregl-canvas")!.getBoundingClientRect();
        return ["johor", "sabah"].map((id) => {
          const label = document.querySelector(`.map-label-${id}`)!.getBoundingClientRect();
          const x = label.x + label.width / 2;
          const y = label.y + label.height / 2;
          return x >= map.left && x <= map.right && y >= map.top && y <= map.bottom;
        });
      }),
    )
    .toEqual([true, true]);
});

test("near-me uses consented position for distance without persisting coordinates", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ longitude: 101.69, latitude: 3.14 });
  await page.goto("/");
  await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
  const before = await page.evaluate(() => JSON.stringify(localStorage));
  await page.getByRole("button", { name: "Near me", exact: true }).click();
  await expect(page.locator(".near-me-card")).toContainText("Fictional demo station");
  await expect(page.locator(".near-me-card")).toContainText("straight-line distance");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(before);
});
