"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import type { Snapshot, Station } from "@/lib/types";
import { formatMYT, observationStatus, indexDefinition } from "@/lib/domain";
import { usePreferences } from "./preferences";
import { Category } from "./reading";

export function StationTable({ stations, snapshot }: { stations: Station[]; snapshot: Snapshot }) {
  const { t } = usePreferences();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const rows = stations
    .map((station) => ({
      station,
      observation: snapshot.observations.find((o) => o.stationId === station.id),
    }))
    .filter(({ station }) => station.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sort === "name"
        ? a.station.name.localeCompare(b.station.name)
        : (b.observation?.value ?? -1) - (a.observation?.value ?? -1),
    );
  return (
    <section className="station-table-panel">
      <div className="table-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            aria-label={t("searchStations")}
            placeholder={t("searchStations")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="sort-label">
          <span>{t("sort")}</span>
          <select aria-label={t("sort")} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">{t("name")}</option>
            <option value="value">{t("valueSort")}</option>
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <caption className="sr-only">
            {t("stations")} — {snapshot.sourceId}, {indexDefinition(snapshot.indexScale).label}
          </caption>
          <thead>
            <tr>
              <th>{t("station")}</th>
              <th>{indexDefinition(snapshot.indexScale).unit}</th>
              <th>{t("category")}</th>
              <th>{t("time")} (MYT)</th>
              <th>{t("freshness")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ station, observation }) => {
              const status = observationStatus(observation, snapshot.asOf);
              return (
                <tr key={station.id}>
                  <td>
                    <Link prefetch={false} href={`/station/${station.id}`}>
                      {station.name}
                      <ArrowUpRight size={14} />
                    </Link>
                  </td>
                  <td className="table-reading">{observation?.value ?? "—"}</td>
                  <td>
                    <Category
                      value={status === "fresh" ? (observation?.value ?? null) : null}
                      scale={snapshot.indexScale}
                    />
                  </td>
                  <td>{observation?.observedAt ? formatMYT(observation.observedAt) : "—"}</td>
                  <td>
                    <span className={`freshness freshness-${status}`}>
                      {t(
                        status === "fresh"
                          ? "fresh"
                          : status === "stale"
                            ? "stale"
                            : status === "invalid"
                              ? "invalid"
                              : status === "future"
                                ? "future"
                                : "missing",
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty-state">{t("noMatches")}</p>}
      </div>
    </section>
  );
}
