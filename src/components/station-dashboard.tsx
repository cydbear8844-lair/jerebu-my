"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import type { Region, Snapshot, Station } from "@/lib/types";
import { formatMYT, observationStatus, indexDefinition } from "@/lib/domain";
import { Reading, Category } from "./reading";
import { usePreferences } from "./preferences";
import { LocationActions } from "./location-actions";
import { History } from "./history";
import { SourceBanner } from "./app-header";

const MalaysiaMap = dynamic(() => import("./malaysia-map").then((m) => m.MalaysiaMap), {
  ssr: false,
});

export function StationDashboard({
  station,
  region,
  snapshot,
}: {
  station: Station;
  region: Region;
  snapshot: Snapshot;
}) {
  const { t, lang } = usePreferences();
  const observation = snapshot.observations.find((o) => o.stationId === station.id);
  const status = observationStatus(observation, snapshot.asOf);
  return (
    <>
      {snapshot.mode === "live" && <SourceBanner snapshot={snapshot} />}
      <main id="main" className="detail-page station-page" data-snapshot-at={snapshot.asOf}>
        <Link href={`/region/${region.slug}`} className="back-link">
          <ArrowLeft size={14} />
          {region.name}
        </Link>
        <header className="location-heading">
          <div>
            <span className="section-label">
              {t("station")} / {region.name}
            </span>
            <h1>{station.name}</h1>
            <p>
              {snapshot.mode !== "demo"
                ? lang === "en"
                  ? "Provider location. Physical monitoring-site identity has not been independently verified."
                  : "Lokasi pembekal. Identiti stesen fizikal belum disahkan secara bebas."
                : lang === "en"
                  ? "Fictional monitoring station. All readings are simulated."
                  : "Stesen pemantauan rekaan. Semua bacaan ialah simulasi."}
            </p>
          </div>
          <LocationActions id={station.id} />
        </header>
        <div className="station-detail-grid">
          <section className="panel station-reading-panel">
            <span className="section-label">
              {t("value")} / {indexDefinition(snapshot.indexScale).label}
            </span>
            <div className="metric-reading">
              <Reading value={observation?.value ?? null} scale={snapshot.indexScale} />
              <Category
                value={status === "fresh" ? (observation?.value ?? null) : null}
                scale={snapshot.indexScale}
              />
            </div>
            <span className={`freshness freshness-${status}`}>
              {status === "fresh"
                ? t("fresh")
                : status === "stale"
                  ? t("stale")
                  : status === "invalid"
                    ? t("invalid")
                    : status === "future"
                      ? t("future")
                      : t("missing")}
            </span>
            <dl className="compact-dl">
              <div>
                <dt>{t("observation")}</dt>
                <dd>{observation?.observedAt ? formatMYT(observation.observedAt) : "—"}</dd>
              </div>
              <div>
                <dt>{t("retrieved")}</dt>
                <dd>{observation?.fetchedAt ? formatMYT(observation.fetchedAt) : "—"}</dd>
              </div>
              <div>
                <dt>{t("coordinates")}</dt>
                <dd>
                  {station.coordinates[1].toFixed(4)}° N, {station.coordinates[0].toFixed(4)}° E
                </dd>
              </div>
              <div>
                <dt>{t("source")}</dt>
                <dd>{snapshot.sourceId || "—"}</dd>
              </div>
            </dl>
            {snapshot.mode === "demo" && <p>{t("demoClock")}</p>}
            {snapshot.mode === "live" && (
              <p>
                {lang === "en"
                  ? "Provider-reported, unvalidated AQI. Pollutant sub-indices are not concentrations."
                  : "AQI laporan pembekal, belum disahkan. Subindeks pencemar bukan kepekatan."}
              </p>
            )}
            <p>{t("noPollutants")}</p>
          </section>
          <MalaysiaMap
            indexScale={snapshot.indexScale}
            regionId={region.id}
            summaries={snapshot.summaries}
            stations={[station]}
          />
        </div>
        <History
          stations={[station]}
          initialStationId={station.id}
          asOf={snapshot.asOf}
          disabled={snapshot.mode !== "demo"}
        />
      </main>
    </>
  );
}
