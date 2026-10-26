// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it } from "vitest";
import { projectInfo, projectSupportHref, projectSupportAvailable } from "@/lib/project-info";
import { AppFooter } from "./app-footer";
import { ProjectSupport } from "./project-support";
import { Privacy } from "./privacy";
import { SupportPage } from "./support-page";

const defaults = { ...projectInfo };
beforeEach(() => {
  localStorage.clear();
  Object.assign(projectInfo, defaults);
});
afterEach(() => {
  cleanup();
  Object.assign(projectInfo, defaults);
});

it.each([
  ["en", "Project information", "About", "Data & Credits", "Privacy"],
  ["bm", "Maklumat projek", "Tentang", "Data & Kredit", "Privasi"],
])(
  "renders %s footer ownership, navigation and separate attribution",
  (lang, nav, about, credits, privacy) => {
    localStorage.setItem("jerebu-language", lang);
    render(<AppFooter />);
    expect(screen.getByRole("navigation", { name: nav })).toBeVisible();
    expect(screen.getByRole("link", { name: about })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("link", { name: credits })).toHaveAttribute("href", "/about#credits");
    expect(screen.getByRole("link", { name: privacy })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("© 2026 CydBear. JEREBU / MY.");
    expect(screen.getByRole("link", { name: "CydBear" })).toHaveAttribute(
      "href",
      "https://github.com/cydbear8844-lair",
    );
    expect(
      screen.getByRole("link", {
        name: lang === "bm" ? "penyumbang OpenStreetMap" : "OpenStreetMap contributors",
      }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "ODbL 1.0" })).toBeVisible();
    expect(document.querySelector(".project-support")).toBeNull();
  },
);

it("keeps support hidden until both enabled and configured", () => {
  projectInfo.supportEnabled = false;
  projectInfo.supportUrl = "https://paypal.me/example";
  const view = render(<ProjectSupport available />);
  expect(view.container).toBeEmptyDOMElement();
  projectInfo.supportEnabled = true;
  projectInfo.supportUrl = "";
  view.rerender(<ProjectSupport available />);
  expect(view.container).toBeEmptyDOMElement();
});

it.each([
  "javascript:alert(1)",
  "http://paypal.me/example",
  "https://paypal.me.evil.test/example",
  "https://www.paypal.com/signin",
])("rejects an unsuitable support URL: %s", (supportUrl) => {
  expect(projectSupportHref({ ...projectInfo, supportEnabled: true, supportUrl })).toBeNull();
});

it.each(["en", "bm"])("renders configured %s support navigation without an embed", (lang) => {
  localStorage.setItem("jerebu-language", lang);
  projectInfo.supportEnabled = true;
  projectInfo.supportUrl = "https://paypal.me/example";
  render(<ProjectSupport available />);
  const link = screen.getByRole("link", {
    name: lang === "bm" ? /Sokong projek ini/ : /Support this project/,
  });
  expect(link).toHaveAttribute("href", "/support");
  expect(document.querySelector("iframe, script")).toBeNull();
});

it.each([
  ["demo", true],
  ["live", true],
  ["unconfigured", false],
])("controls support visibility in %s mode", (mode, expected) => {
  expect(projectSupportAvailable(String(mode))).toBe(expected);
});

it("can disable live support independently without hiding demo support", () => {
  expect(projectSupportAvailable("live", { ...projectInfo, supportInLive: false })).toBe(false);
  expect(projectSupportAvailable("demo", { ...projectInfo, supportInLive: false })).toBe(true);
  expect(projectSupportAvailable("demo", { ...projectInfo, supportEnabled: false })).toBe(false);
});

it.each(["en", "bm"])(
  "shows the original QR assets and direct PayPal destination in %s",
  (lang) => {
    localStorage.setItem("jerebu-language", lang);
    render(<SupportPage available />);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByRole("main")).toHaveTextContent(projectInfo.maybankRecipient);
    const paypal = screen.getByRole("link", {
      name: lang === "bm" ? /Buka PayPal/ : /Open PayPal/,
    });
    expect(paypal).toHaveAttribute("href", "https://www.paypal.me/CydBear");
    expect(paypal).toHaveAttribute("rel", "noopener noreferrer");
    expect(paypal).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(document.querySelectorAll("svg image")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: lang === "bm" ? "Simpan QR Maybank" : "Save Maybank QR" }),
    ).toHaveAttribute("download", "jerebu-my-maybank-qr.png");
  },
);

it("withholds payment images and destinations when support is unavailable", () => {
  render(<SupportPage available={false} />);
  expect(screen.getByRole("status")).toHaveTextContent("Support is not available right now.");
  expect(screen.queryByRole("img")).toBeNull();
  expect(document.querySelector("a[href*='paypal'], a[download]")).toBeNull();
});

it.each([
  ["en", "Privacy"],
  ["bm", "Privasi"],
])("renders %s privacy information", (lang, heading) => {
  localStorage.setItem("jerebu-language", lang);
  render(<Privacy />);
  expect(screen.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  expect(screen.getByRole("main")).toHaveTextContent("PayPal");
  expect(screen.getByRole("main")).toHaveTextContent(
    lang === "bm" ? "storan setempat" : "local storage",
  );
});
