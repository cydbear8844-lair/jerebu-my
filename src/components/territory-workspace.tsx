"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Snapshot } from "@/lib/types";
import { getRegion } from "@/lib/regions";
import { Overview } from "./overview";
import { RegionDashboard } from "./region-dashboard";

export function TerritoryWorkspace({
  initial,
  children,
}: {
  initial: Snapshot;
  children: ReactNode;
}) {
  const path = usePathname();
  const match = /^\/region\/([^/]+)\/?$/.exec(path);
  let region;
  try {
    region = match ? getRegion(decodeURIComponent(match[1])) : undefined;
  } catch {
    region = undefined;
  }
  const visible = path === "/" || Boolean(region);
  return (
    <>
      <div hidden={!visible} className="territory-persistent-shell">
        <Overview initial={initial} regionId={region?.id}>
          {region ? <RegionDashboard region={region} snapshot={initial} /> : null}
        </Overview>
      </div>
      {!visible && children}
    </>
  );
}
