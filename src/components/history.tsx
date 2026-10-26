"use client";

import { useEffect, useId, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2 } from "lucide-react";
import type { HistoryPoint, Station } from "@/lib/types";
import { formatMYT } from "@/lib/domain";
import { Category } from "./reading";
import { usePreferences } from "./preferences";
import { DEMO_START } from "@/lib/demo-time";
import { CurrentObservationsNote } from "./live-data-status";

type HistoryResponse = {
  points: HistoryPoint[];
  sourceId: string;
  indexScale: string;
  start: string;
  end: string;
};
function localInput(time: string) {
  return new Date(Date.parse(time) + 8 * 3600000).toISOString().slice(0, 16);
}

export function History({
  stations,
  initialStationId,
  asOf,
  disabled = false,
}: {
  stations: Station[];
  initialStationId: string;
  asOf: string;
  disabled?: boolean;
}) {
  const { t, lang } = usePreferences();
  const id = useId();
  const [stationId, setStationId] = useState(initialStationId);
  const [range, setRange] = useState("24h");
  const [start, setStart] = useState(new Date(Date.parse(asOf) - 24 * 3600000).toISOString());
  const [end, setEnd] = useState(asOf);
  const [customStart, setCustomStart] = useState(localInput(start));
  const [customEnd, setCustomEnd] = useState(localInput(asOf));
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!disabled);
  const [table, setTable] = useState(false);
  const [retry, setRetry] = useState(0);
  const queryEnd = range === "custom" && Date.parse(end) < Date.parse(asOf) ? end : asOf;
  const queryStart = new Date(
    Math.max(
      Date.parse(DEMO_START),
      range === "custom"
        ? Math.min(Date.parse(start), Date.parse(queryEnd))
        : Date.parse(queryEnd) - ({ "24h": 24, "7d": 168, "30d": 720 }[range] ?? 24) * 3600000,
    ),
  ).toISOString();
  useEffect(() => {
    if (disabled || !stationId) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ stationId, start: queryStart, end: queryEnd });
    fetch(`/api/history?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok)
          throw new Error(
            typeof payload.error === "string" ? payload.error : "History unavailable",
          );
        return payload as HistoryResponse;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setHistory(data);
        setError("");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setHistory(null);
          setError(reason instanceof Error ? reason.message : "History request failed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [stationId, queryStart, queryEnd, disabled, retry]);
  function changeRange(value: string) {
    setRange(value);
    if (value === "custom") return;
    setLoading(true);
    setError("");
    setRetry((value) => value + 1);
    setStart(
      new Date(
        Date.parse(asOf) - ({ "24h": 24, "7d": 168, "30d": 720 }[value] ?? 24) * 3600000,
      ).toISOString(),
    );
    setEnd(asOf);
  }
  const points = (history?.points ?? []).filter(
    (point) =>
      Date.parse(point.observedAt) <= Date.parse(queryEnd) &&
      Date.parse(point.observedAt) >= Date.parse(queryStart),
  );
  const rangePending =
    history !== null && (history.start !== queryStart || history.end !== queryEnd);
  const values = points.filter(
    (point): point is HistoryPoint & { value: number } => point.value !== null,
  );
  const peak = [...values].sort((a, b) => b.value - a.value)[0];
  const maximum = Math.max(100, Math.ceil((peak?.value ?? 100) / 50) * 50);
  if (disabled) return <CurrentObservationsNote />;
  return (
    <section className="history-panel" aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <div>
          <span className="section-label">{t("simulated")}</span>
          <h2 id={`${id}-title`}>{t("historyTitle")}</h2>
        </div>
        <button
          className="button button-ghost"
          onClick={() => setTable(!table)}
          aria-pressed={table}
        >
          <Table2 size={15} />
          {table ? t("chart") : t("dataTable")}
        </button>
      </div>
      <div className="history-toolbar">
        <label className="station-select">
          <span>{t("selectedStation")}</span>
          <select
            value={stationId}
            aria-label={t("selectedStation")}
            onChange={(event) => {
              setStationId(event.target.value);
              setLoading(true);
            }}
            disabled={disabled}
          >
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>
        <div className="range-controls" aria-label={t("history")}>
          {["24h", "7d", "30d", "custom"].map((value) => (
            <button
              key={value}
              aria-pressed={range === value}
              onClick={() => changeRange(value)}
              disabled={disabled}
            >
              {value === "custom" ? t("custom") : value}
            </button>
          ))}
        </div>
      </div>
      {range === "custom" && (
        <form
          className="custom-range"
          onSubmit={(event) => {
            event.preventDefault();
            const from = Date.parse(`${customStart}:00+08:00`),
              to = Date.parse(`${customEnd}:00+08:00`);
            if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
              setError(
                lang === "en"
                  ? "Start must be before end. Enter valid Malaysian times."
                  : "Masa mula mesti sebelum masa tamat.",
              );
              return;
            }
            setError("");
            setLoading(true);
            setRetry((value) => value + 1);
            setStart(new Date(from).toISOString());
            setEnd(new Date(to).toISOString());
          }}
        >
          <label>
            {t("from")}
            <input
              type="datetime-local"
              value={customStart}
              required
              onChange={(e) => setCustomStart(e.target.value)}
            />
          </label>
          <label>
            {t("to")}
            <input
              type="datetime-local"
              value={customEnd}
              required
              onChange={(e) => setCustomEnd(e.target.value)}
            />
          </label>
          <button className="button button-primary" type="submit">
            {t("apply")}
          </button>
        </form>
      )}
      <div className="history-meta">
        <span>
          {t("source")}: {history?.sourceId ?? "demo-mys-ipu"} · MY IPU · {t("hourly")}
        </span>
        <span>
          {formatMYT(queryStart)} — {formatMYT(queryEnd)} MYT
        </span>
      </div>
      <p className="source-caption history-time-basis">{t("historyTimeBasis")}</p>
      {disabled ? (
        <p className="empty-state">{t("noLive")}</p>
      ) : loading || rangePending ? (
        <div className="chart-state" role="status">
          {t("loading")}
        </div>
      ) : error ? (
        <div className="chart-state" role="alert">
          <p>{error}</p>
          <button
            className="button"
            onClick={() => {
              setLoading(true);
              setRetry((value) => value + 1);
            }}
          >
            {t("retry")}
          </button>
        </div>
      ) : values.length === 0 ? (
        <p className="chart-state">{t("historyUnavailable")}</p>
      ) : table ? (
        <div className="history-data-table table-scroll">
          <table>
            <caption className="sr-only">
              {t("simulated")} — {stations.find((s) => s.id === stationId)?.name}
            </caption>
            <thead>
              <tr>
                <th>{t("time")} (MYT)</th>
                <th>IPU</th>
                <th>{t("category")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.observedAt}>
                  <td>{formatMYT(point.observedAt)}</td>
                  <td>{point.value ?? "—"}</td>
                  <td>
                    <Category value={point.value} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          className="history-chart"
          data-testid="history-chart"
          data-point-count={points.length}
          data-station-id={stationId}
          data-gap-count={points.length - values.length}
          role="img"
          aria-label={`${stations.find((s) => s.id === stationId)?.name}: ${values.length}/${points.length} ${t("simulated")}. ${t("gaps")}`}
        >
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <LineChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke="#2B4145" strokeDasharray="2 5" />
              <ReferenceArea y1={0} y2={50} fill="#9AC46B" fillOpacity={0.055} strokeOpacity={0} />
              <ReferenceArea
                y1={50}
                y2={100}
                fill="#D9BD65"
                fillOpacity={0.045}
                strokeOpacity={0}
              />
              <XAxis
                dataKey="observedAt"
                minTickGap={65}
                tick={{ fill: "#A4B7B7", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value: string) =>
                  formatMYT(
                    value,
                    range === "24h"
                      ? { hour: "2-digit", minute: "2-digit" }
                      : { month: "short", day: "numeric" },
                  )
                }
              />
              <YAxis
                domain={[0, maximum]}
                tick={{ fill: "#A4B7B7", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#111A1D",
                  border: "1px solid #789593",
                  borderRadius: 0,
                  fontSize: 12,
                  color: "#EDF4F2",
                }}
                labelFormatter={(label) => `${formatMYT(String(label))} MYT`}
                formatter={(value) => [value, "IPU (demo)"]}
              />
              <Line
                type="linear"
                dataKey="value"
                name="IPU"
                stroke="#DCE7E5"
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 4, fill: "#69D9CD" }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="history-footnote">
        <p>
          {t("gaps")} {t("allTimes")}
        </p>
        {!loading && peak && (
          <span>
            {t("periodPeak")}: <strong>{peak.value} IPU</strong> · {formatMYT(peak.observedAt)}
          </span>
        )}
      </div>
      {!loading && history && (
        <span className="source-caption">
          {values.length} / {points.length}{" "}
          {lang === "en" ? "hourly observations available" : "pemerhatian sejam tersedia"}.{" "}
          {t("demoClock")}
        </span>
      )}
    </section>
  );
}
