import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

test.afterEach(async ({ page }) => {
  await page.goto("about:blank");
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 720 },
]) {
  test(`support navigation, original QR downloads and BM at ${viewport.width}px`, async ({
    page,
    context,
  }, info) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    const paymentRequests: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/(^|\.)paypal\.(com|me)$/.test(new URL(request.url()).hostname))
        paymentRequests.push(request.url());
    });
    await page.goto("/");
    await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
    const support = page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Support this project", exact: true });
    await support.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/support$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Support this project" }),
    ).toBeVisible();
    await expect(page.getByRole("main")).toContainText("Muhammad Faez Bin Sukri");
    await expect(page.getByRole("main").getByRole("img")).toHaveCount(2);
    for (const [name, file, hash] of [
      [
        "Save QR image",
        "paypal-download.png",
        "3b77d0b005ce498dff080e843efde33e5a89e08a914ae007c2d84f19bbe50184",
      ],
      [
        "Save Maybank QR",
        "maybank-download.png",
        "3c62064322420a832f2bfe3e26afb038fb9fecd7a83015976addb428132b265b",
      ],
    ]) {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("link", { name, exact: true }).click(),
      ]);
      const path = info.outputPath(file);
      await download.saveAs(path);
      expect(
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      ).toBe(hash);
    }
    for (const [src, expectedWidth, expectedHeight] of [
      ["/support/paypal-qr.png", 600, 600],
      ["/support/maybank-qr.png", 1320, 1831],
    ] as const) {
      const size = await page.evaluate(async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
      }, src);
      expect(size).toEqual({ width: expectedWidth, height: expectedHeight });
    }
    await page.screenshot({ path: info.outputPath("support-en.png"), fullPage: true });
    expect(paymentRequests).toEqual([]);
    const paypal = page.getByRole("link", { name: /Open PayPal/ });
    await expect(paypal).toHaveAttribute("href", "https://www.paypal.me/CydBear");
    await expect(paypal).toHaveAttribute("referrerpolicy", "no-referrer");
    await context.route("https://www.paypal.me/CydBear", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<title>Controlled PayPal destination</title>",
      }),
    );
    const [popup] = await Promise.all([context.waitForEvent("page"), paypal.click()]);
    await expect(popup).toHaveTitle("Controlled PayPal destination");
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await popup.close();
    await page.getByRole("button", { name: "BM", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sokong projek ini" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("support-bm.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole("link", { name: "Kembali ke peta", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator(".map-shell[data-map-loaded=true]")).toBeVisible();
    expect(errors).toEqual([]);
  });
}
