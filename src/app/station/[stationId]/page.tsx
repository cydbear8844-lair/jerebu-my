import { notFound } from "next/navigation";
import { getRequestSnapshot } from "@/server/request-snapshot";
import { getRegion } from "@/lib/regions";
import { StationDashboard } from "@/components/station-dashboard";
import { StationUnavailable } from "@/components/station-unavailable";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ stationId: string }> }) {
  const { stationId } = await params;
  const snapshot = await getRequestSnapshot();
  const station = snapshot.stations.find((s) => s.id === stationId);
  const incomplete =
    snapshot.coverage &&
    (snapshot.coverage.failed > 0 || snapshot.coverage.omitted > 0 || snapshot.coverage.limited);
  if (snapshot.status !== "available" || (!station && snapshot.mode === "live" && incomplete))
    return <StationUnavailable snapshot={snapshot} />;
  if (!station) notFound();
  const region = getRegion(station.regionId);
  if (!region) notFound();
  return <StationDashboard station={station} region={region} snapshot={snapshot} />;
}
