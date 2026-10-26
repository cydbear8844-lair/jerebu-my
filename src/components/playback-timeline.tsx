"use client";

import { useState, type CSSProperties } from "react";
import { PLAYBACK_HOUR, type SnapshotPlayback } from "@/lib/playback";
import { usePreferences } from "./preferences";
import "./playback-timeline.css";

export type { SnapshotPlayback } from "@/lib/playback";

function timeLabel(at: string, short = false, locale = "en-MY") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit",
    month: "short",
    ...(short ? {} : { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const }),
  }).format(new Date(at));
}

function TransportIcon({ name }: { name: "previous" | "next" | "play" | "pause" | "refresh" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {name === "play" ? (
        <path d="M6 3 16 10 6 17Z" fill="currentColor" />
      ) : name === "pause" ? (
        <path d="M5 3h3v14H5zm7 0h3v14h-3z" fill="currentColor" />
      ) : name === "refresh" ? (
        <path d="M16 7a6 6 0 1 0 .2 5M16 3v4h-4" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <path
          d={name === "previous" ? "M5 4v12M15 4l-8 6 8 6Z" : "M15 4v12M5 4l8 6-8 6Z"}
          stroke="currentColor"
          strokeWidth="1.5"
        />
      )}
    </svg>
  );
}

export function PlaybackTimeline({ playback: p }: { playback: SnapshotPlayback }) {
  const { lang } = usePreferences();
  const copy = (en: string, bm: string) => (lang === "bm" ? bm : en);
  const label = (at: string, short = false) =>
    timeLabel(at, short, lang === "bm" ? "ms-MY" : "en-MY");
  const [hoverAt, setHoverAt] = useState<string | null>(null);
  const [refreshOrigin, setRefreshOrigin] = useState<SnapshotPlayback["snapshot"] | null>(null);
  const refreshing = p.busy && refreshOrigin !== null && p.requestedAt === refreshOrigin.asOf;
  const refreshed =
    refreshOrigin !== null &&
    refreshOrigin !== p.snapshot &&
    refreshOrigin.asOf === p.snapshot.asOf &&
    !p.busy &&
    !p.error;
  const min = Date.parse(p.start);
  const max = Date.parse(p.end);
  const value = Math.min(max, Math.max(min, Date.parse(p.requestedAt)));
  const fraction = max > min ? (value - min) / (max - min) : 1;
  const frames =
    p.availability?.frames.filter(
      (frame) => Date.parse(frame.at) >= min && Date.parse(frame.at) <= max,
    ) ?? [];
  const available = new Map(frames.map((frame) => [Date.parse(frame.at), frame.freshCount]));
  const slots = Array.from(
    { length: Math.floor((max - min) / PLAYBACK_HOUR) + 1 },
    (_, i) => min + i * PLAYBACK_HOUR,
  );
  const disabled = p.snapshot.status !== "available" || max <= min;
  const ticks = Array.from({ length: 5 }, (_, i) =>
    new Date(min + ((max - min) * i) / 4).toISOString(),
  );
  const preview = hoverAt ?? p.requestedAt;

  return (
    <section
      className="playback-timeline"
      aria-label={copy("Observation timeline", "Garis masa pemerhatian")}
    >
      <div className="playback-heading">
        <div>
          <strong>{copy("Observation timeline", "Garis masa pemerhatian")}</strong>
          <span className="playback-mode">
            {p.snapshot.mode === "demo" ? "DEMO" : ""}
            {p.snapshot.asOf !== p.end ? copy(" / Historical", " / Sejarah") : ""}
          </span>
          <span>{copy("MYT · UTC+8 · hourly frames", "MYT · UTC+8 · setiap jam")}</span>
        </div>
        <div className="playback-ranges" aria-label={copy("Timeline range", "Julat garis masa")}>
          {([24, 168, 720] as const).map((hours, i) => (
            <button
              key={hours}
              aria-pressed={p.rangeHours === hours}
              onClick={() => p.setRangeHours(hours)}
              disabled={disabled}
            >
              {(lang === "bm" ? ["24j", "7h", "30h"] : ["24h", "7d", "30d"])[i]}
            </button>
          ))}
        </div>
      </div>
      <div
        className="playback-track"
        style={{ "--playhead": `${fraction * 100}%` } as CSSProperties}
      >
        <div
          className="playback-time-marker"
          style={{ left: `clamp(92px, ${fraction * 100}%, calc(100% - 92px))` }}
        >
          <span>
            {p.busy
              ? copy("Loading", "Memuatkan")
              : p.error
                ? copy("Requested", "Diminta")
                : copy("Selected", "Dipilih")}
          </span>{" "}
          {label(p.requestedAt)}
        </div>
        <div className="playback-ruler" aria-hidden="true">
          {Array.from({ length: 25 }, (_, i) => (
            <i key={i} className={i % 6 === 0 ? "major" : "minor"} />
          ))}
        </div>
        <div className="playback-playhead" aria-hidden="true" />
        <div className="playback-availability" aria-hidden="true">
          {slots.map((at) => (
            <span
              key={at}
              className={
                !p.availability ? "unknown" : (available.get(at) ?? 0) > 0 ? "available" : "gap"
              }
            />
          ))}
        </div>
        <input
          type="range"
          aria-label={copy("Observation time", "Masa pemerhatian")}
          aria-valuetext={`${label(p.requestedAt)} MYT${p.busy ? copy(", loading; previous snapshot displayed", ", memuatkan; paparan sebelumnya dikekalkan") : ""}`}
          min={min}
          max={max}
          step={PLAYBACK_HOUR}
          value={value}
          disabled={disabled}
          onPointerDown={p.pause}
          onKeyDown={p.pause}
          onChange={(event) => p.seek(new Date(Number(event.target.value)).toISOString())}
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const position = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            setHoverAt(
              new Date(
                Math.min(
                  max,
                  min + Math.round((position * (max - min)) / PLAYBACK_HOUR) * PLAYBACK_HOUR,
                ),
              ).toISOString(),
            );
          }}
          onPointerLeave={() => setHoverAt(null)}
        />
        <div className="playback-ticks" aria-hidden="true">
          {ticks.map((at) => (
            <span key={at}>
              {p.rangeHours === 24
                ? new Intl.DateTimeFormat(lang === "bm" ? "ms-MY" : "en-MY", {
                    timeZone: "Asia/Kuala_Lumpur",
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                  }).format(new Date(at))
                : label(at, true)}
            </span>
          ))}
        </div>
      </div>
      <div className="playback-details">
        <span>
          {hoverAt
            ? `${copy("Preview", "Pratonton")}: ${label(preview)} MYT`
            : `${copy("Displayed", "Dipaparkan")}: ${label(p.snapshot.asOf)} MYT`}
        </span>
        <span className="playback-availability-key">
          <i />
          {copy("Fresh station readings", "Bacaan stesen terkini")} <i className="gap" />
          {copy("No fresh readings", "Tiada bacaan terkini")}
        </span>
      </div>
      <div className="playback-controls">
        <div className="playback-transport">
          <button
            aria-label={copy("Previous hour", "Jam sebelumnya")}
            disabled={disabled || value <= min}
            onClick={() => p.seek(new Date(Math.max(min, value - PLAYBACK_HOUR)).toISOString())}
          >
            <TransportIcon name="previous" />
          </button>
          <button
            className="playback-play"
            aria-label={
              p.playing
                ? copy("Pause playback", "Jeda main balik")
                : copy("Play hourly observations", "Main pemerhatian setiap jam")
            }
            aria-pressed={p.playing}
            disabled={disabled}
            onClick={p.togglePlay}
          >
            <TransportIcon name={p.playing ? "pause" : "play"} />
            {p.playing ? copy("Pause", "Jeda") : copy("Play", "Main")}
          </button>
          <button
            aria-label={copy("Next hour", "Jam seterusnya")}
            disabled={disabled || value >= max}
            onClick={() => p.seek(new Date(Math.min(max, value + PLAYBACK_HOUR)).toISOString())}
          >
            <TransportIcon name="next" />
          </button>
          <label>
            {copy("Speed", "Kelajuan")}{" "}
            <select
              aria-label={copy("Playback speed", "Kelajuan main balik")}
              value={p.speed}
              onChange={(event) => p.setSpeed(Number(event.target.value))}
            >
              {[0.5, 1, 2].map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="playback-actions">
          <button
            disabled={p.busy || disabled}
            onClick={() => {
              setRefreshOrigin(p.snapshot);
              p.refresh();
            }}
            className={refreshing ? "playback-refresh is-refreshing" : "playback-refresh"}
          >
            <TransportIcon name="refresh" />
            {refreshing
              ? copy("Refreshing…", "Memuat semula…")
              : copy("Refresh observations", "Muat semula pemerhatian")}
          </button>
          <button
            onClick={p.latest}
            disabled={disabled || (!p.busy && p.snapshot.asOf === p.end)}
            className="playback-latest"
          >
            {copy("Latest available", "Terkini tersedia")}
          </button>
        </div>
      </div>
      <p className="playback-status" role="status">
        {(p.error
          ? copy(p.error, "Bingkai ini gagal dimuatkan. Paparan sebelumnya dikekalkan.")
          : "") ||
          (p.busy
            ? `${copy("Loading", "Memuatkan")} ${label(p.requestedAt)} MYT. ${copy("Previous snapshot remains displayed.", "Paparan sebelumnya dikekalkan.")}`
            : refreshed
              ? copy(
                  "Observations refreshed. Selected time retained.",
                  "Pemerhatian dimuat semula. Masa pilihan dikekalkan.",
                )
              : (p.availabilityError
                  ? copy(p.availabilityError, "Ketersediaan setiap jam gagal dimuatkan.")
                  : "") ||
                (!p.availability
                  ? copy("Loading hourly availability…", "Memuatkan ketersediaan setiap jam…")
                  : p.snapshot.mode === "demo"
                    ? copy(
                        "Synthetic demo history. Playback advances one hour per frame.",
                        "Sejarah demo sintetik. Main balik bergerak satu jam setiap bingkai.",
                      )
                    : copy(
                        "Playback advances one hour per frame.",
                        "Main balik bergerak satu jam setiap bingkai.",
                      )))}
      </p>
    </section>
  );
}
