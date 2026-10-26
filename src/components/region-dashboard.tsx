"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { Region, Snapshot } from "@/lib/types";
import { formatMYT, indexDefinition } from "@/lib/domain";
import { usePreferences } from "./preferences";
import { Reading, Category } from "./reading";
import { StationTable } from "./station-table";
import { History } from "./history";
import { LocationActions } from "./location-actions";
import { useWorkspaceSnapshot } from "./workspace-snapshot";
const tabs = ["overviewTab", "stations", "history", "sources"] as const;

export function RegionDashboard({
  region,
  snapshot: initial,
}: {
  region: Region;
  snapshot: Snapshot;
}) {
  const snapshot = useWorkspaceSnapshot() ?? initial;
  const { t, lang } = usePreferences();
  const index = indexDefinition(snapshot.indexScale);
  const [tab, setTab] = useState<(typeof tabs)[number]>("overviewTab");
  const summary = snapshot.summaries.find((s) => s.regionId === region.id);
  const stations = snapshot.stations.filter((s) => s.regionId === region.id);
  const initialStation = summary?.contributor?.id ?? stations[0]?.id ?? "";
  return (
    <article className="detail-page embedded-region" data-region={region.id}>
      <Link href="/" className="back-link">
        <ArrowLeft size={14} />
        {t("back")}
      </Link>
      <header className="location-heading">
        <div>
          <span className="section-label">{t(region.kind)} / MALAYSIA</span>
          <h1>{lang === "bm" ? region.nameBm : region.name}</h1>
          <p>
            {snapshot.sourceId || t("noLive")} <span> / </span> {index.label} <span> / </span>{" "}
            {t(snapshot.mode === "demo" ? "snapshot" : "sourceSnapshot")}:{" "}
            {formatMYT(snapshot.asOf)}
          </p>
        </div>
        <LocationActions id={region.id} />
      </header>
      <nav className="detail-tabs" aria-label={region.name}>
        {tabs.map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            aria-current={tab === value ? "page" : undefined}
          >
            {t(value)}
            {value === "stations" && <span>{stations.length}</span>}
          </button>
        ))}
      </nav>
      {snapshot.status !== "available" && (
        <p className="notice" role="status">
          {snapshot.message}
        </p>
      )}
      {tab === "overviewTab" && (
        <>
          <div className="regional-overview">
            <section className="regional-metric panel">
              <span className="section-label">
                {t("highestIn")} {region.name}
              </span>
              <div className="metric-reading">
                <Reading value={summary?.value ?? null} scale={snapshot.indexScale} />
                <Category value={summary?.value ?? null} scale={snapshot.indexScale} />
              </div>
              <p className="metric-contributor">
                {summary?.contributor ? (
                  <Link prefetch={false} href={`/station/${summary.contributor.id}`}>
                    {summary.contributor.name}
                    <ArrowUpRight size={15} />
                  </Link>
                ) : (
                  t("noEligible")
                )}
              </p>
              <div className="metric-pair">
                <div>
                  <span>{t("range")}</span>
                  <strong>
                    {summary?.min ?? "—"} <small>—</small> {summary?.max ?? "—"}
                  </strong>
                </div>
                <div>
                  <span>{t("coverage")}</span>
                  <strong>
                    {summary?.freshCount ?? 0}
                    <small> / {summary?.stationCount ?? "?"}</small>
                  </strong>
                </div>
              </div>
              <dl className="compact-dl">
                <div>
                  <dt>{t("observation")}</dt>
                  <dd>
                    {summary?.contributorObservedAt
                      ? formatMYT(summary.contributorObservedAt)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{t("source")}</dt>
                  <dd>{snapshot.sourceId || "—"}</dd>
                </div>
              </dl>
              <p className="method-note">
                {t("legendNote")} {snapshot.mode === "demo" && t("demoClock")}
              </p>
            </section>
          </div>
          <History
            stations={stations}
            initialStationId={initialStation}
            asOf={snapshot.asOf}
            disabled={snapshot.mode !== "demo"}
          />
          <div className="section-heading station-section-heading">
            <h2>{t("stations")}</h2>
            <span className="source-caption">{t("allTimes")}</span>
          </div>
          <StationTable stations={stations} snapshot={snapshot} />
        </>
      )}
      {tab === "stations" && <StationTable stations={stations} snapshot={snapshot} />}
      {tab === "history" && (
        <History
          stations={stations}
          initialStationId={initialStation}
          asOf={snapshot.asOf}
          disabled={snapshot.mode !== "demo"}
        />
      )}
      {tab === "sources" && (
        <section className="source-panel panel">
          <h2>{t("dataQuality")}</h2>
          <dl className="compact-dl">
            <div>
              <dt>{t("source")}</dt>
              <dd>{snapshot.sourceId || t("noLive")}</dd>
            </div>
            <div>
              <dt>{t("indexScale")}</dt>
              <dd>
                {snapshot.mode === "demo"
                  ? "Malaysian IPU category definitions (synthetic values)"
                  : `${index.label} · provider-reported, unvalidated`}
              </dd>
            </div>
            <div>
              <dt>{t(snapshot.mode === "demo" ? "snapshot" : "sourceSnapshot")}</dt>
              <dd>{formatMYT(snapshot.asOf)} MYT</dd>
            </div>
            <div>
              <dt>{t("coverage")}</dt>
              <dd>
                {summary?.freshCount ?? 0} / {summary?.stationCount ?? "?"}
              </dd>
            </div>
          </dl>
          {snapshot.mode === "demo" && <p>{t("demoClock")}</p>}
          <p>{t("legendNote")}</p>
          <p>{t("noPollutants")}</p>
          <Link href="/about" className="button button-outline">
            {t("methodology")}
            <ArrowUpRight size={16} />
          </Link>
        </section>
      )}
    </article>
  );
}
