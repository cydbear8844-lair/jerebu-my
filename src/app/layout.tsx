import type { Metadata } from "next";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import "./ui-refinement.css";
import "@/components/wind/wind.css";
import { AppHeader } from "@/components/app-header";
import { AppFooter } from "@/components/app-footer";
import { TerritoryWorkspace } from "@/components/territory-workspace";
import { getRequestSnapshot } from "@/server/request-snapshot";
import { projectSupportAvailable } from "@/lib/project-info";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "JEREBU / MY — Malaysia air quality", template: "%s | JEREBU / MY" },
  description:
    "Explore Malaysia's regions, source-labelled air-quality observations and explicit demo history, with licensed administrative boundaries.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const snapshot = await getRequestSnapshot();
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AppHeader snapshot={snapshot} />
        <TerritoryWorkspace initial={snapshot}>{children}</TerritoryWorkspace>
        <AppFooter supportAvailable={projectSupportAvailable(snapshot.mode)} />
      </body>
    </html>
  );
}
