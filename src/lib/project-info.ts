export const projectInfo = {
  copyrightYear: 2026,
  copyrightOwner: "CydBear",
  copyrightOwnerUrl: "https://github.com/cydbear8844-lair",
  supportUrl: "https://www.paypal.me/CydBear",
  supportEnabled: true,
  supportInLive: true,
  paypalQrImage: "/support/paypal-qr.png",
  maybankQrImage: "/support/maybank-qr.png",
  maybankRecipient: "Muhammad Faez Bin Sukri",
};

export function projectSupportAvailable(mode: string, info = projectInfo): boolean {
  return (
    projectSupportHref(info) !== null &&
    (mode === "demo" || (mode === "live" && info.supportInLive))
  );
}

export function projectSupportHref(info = projectInfo): string | null {
  if (!info.supportEnabled || !info.supportUrl.trim()) return null;
  try {
    const url = new URL(info.supportUrl);
    if (
      url.protocol !== "https:" ||
      !["paypal.me", "www.paypal.me", "paypal.com", "www.paypal.com"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.port ||
      url.pathname === "/" ||
      (["paypal.com", "www.paypal.com"].includes(url.hostname) &&
        !/^\/(?:paypalme\/|donate(?:\/|$))/.test(url.pathname))
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
