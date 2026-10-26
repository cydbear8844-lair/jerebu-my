import { test, expect } from "@playwright/test";

test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 720 },
]) {
  test(`copyright, credits and privacy navigation at ${viewport.width}px`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    const paymentRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (req) => {
      if (/paypal|buymeacoffee/i.test(req.url())) paymentRequests.push(req.url());
    });
    await page.goto("/");
    await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toContainText("© 2026 CydBear. JEREBU / MY.");
    await expect(footer.getByRole("link", { name: "CydBear" })).toHaveAttribute(
      "href",
      "https://github.com/cydbear8844-lair",
    );
    await expect(footer.locator(".project-support")).toHaveAttribute("href", "/support");
    await footer.screenshot({ path: info.outputPath("footer-en.png") });
    await footer.getByRole("link", { name: "Privacy", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy", level: 1 })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("does not send your position");
    await page.getByRole("button", { name: "BM", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Privasi", level: 1 })).toBeVisible();
    await page.screenshot({ path: info.outputPath("privacy-bm.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Data & Kredit", exact: true })
      .click();
    await expect(page).toHaveURL(/\/about#credits$/);
    await expect(page.locator("#credits")).toBeVisible();
    const licences = page.locator("#credits a[href^='/licenses/']");
    await expect(licences).toHaveCount(5);
    for (const href of await licences.evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")!),
    )) {
      const response = await request.get(href);
      expect(response.ok()).toBe(true);
      expect(await response.text()).toMatch(/Copyright|copyright/);
    }
    await page.getByRole("contentinfo").scrollIntoViewIfNeeded();
    await page.getByRole("contentinfo").screenshot({ path: info.outputPath("footer-bm.png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(paymentRequests).toEqual([]);
    expect(errors).toEqual([]);
  });
}
