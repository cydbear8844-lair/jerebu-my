"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Pause, Play, Settings2, Crosshair } from "lucide-react";
import { usePreferences } from "../preferences";
import { useWindField, type WindPreferences } from "@/lib/use-wind";
import { describeWind, sampleWind, type WindPosition, WIND_COLOR_STOPS } from "@/lib/wind";
import { formatMYT } from "@/lib/domain";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("jerebu-wind-preferences", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("jerebu-wind-preferences", callback);
  };
}
function stored() {
  try {
    return localStorage.getItem("jerebu-wind") ?? "";
  } catch {
    return "";
  }
}
const patterns = [
  "varied",
  "north",
  "east",
  "southwest",
  "gradient",
  "rotation",
  "calm",
  "holes",
] as const;
export function useWind(at: string, demo: boolean, pending: boolean) {
  const raw = useSyncExternalStore(subscribe, stored, () => "");
  const defaults: WindPreferences = {
    mode: "air",
    source: demo ? "demo" : "open-meteo",
    pattern: "varied",
    paused: false,
    opacity: 0.8,
    shading: false,
    quality: "balanced",
  };
  let preferences = defaults;
  try {
    const p = JSON.parse(raw);
    if (
      ["air", "wind", "combined"].includes(p.mode) &&
      ["demo", "open-meteo"].includes(p.source) &&
      patterns.includes(p.pattern) &&
      typeof p.paused === "boolean" &&
      typeof p.shading === "boolean" &&
      typeof p.opacity === "number" &&
      p.opacity >= 0.1 &&
      p.opacity <= 1 &&
      ["low", "balanced", "high"].includes(p.quality)
    )
      preferences = p;
  } catch {
    /* Display preferences may be absent or malformed. */
  }
  const [temporary, setTemporary] = useState<WindPreferences | null>(null);
  preferences = temporary ?? preferences;
  const update = (patch: Partial<WindPreferences>) => {
    const next = { ...preferences, ...patch };
    try {
      localStorage.setItem("jerebu-wind", JSON.stringify(next));
      setTemporary(null);
    } catch {
      setTemporary(next);
    }
    window.dispatchEvent(new Event("jerebu-wind-preferences"));
  };
  const weather = useWindField(at, preferences);
  const [inspecting, setInspecting] = useState(false);
  const [point, setPoint] = useState<WindPosition | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    const frame = requestAnimationFrame(change);
    media.addEventListener("change", change);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", change);
    };
  }, []);
  return {
    ...weather,
    field: pending ? null : weather.field,
    preferences,
    update,
    inspecting,
    setInspecting,
    point,
    setPoint,
    reduced,
    pending,
    at,
  };
}
export type WindController = ReturnType<typeof useWind>;

export function WindControls({ wind }: { wind: WindController }) {
  const { lang } = usePreferences();
  const bm = lang === "bm";
  const { preferences: p, field } = wind;
  const enabled = p.mode !== "air";
  const vector = field && wind.point ? sampleWind(field, wind.point.lng, wind.point.lat) : null;
  const reading = vector ? describeWind(vector) : null;
  return (
    <section
      className="wind-toolbar"
      aria-label={bm ? "Lapisan peta" : "Map layers"}
      data-wind-mode={p.mode}
    >
      <div className="wind-control-row">
        <label>
          <span>{bm ? "Lapisan" : "Layers"}</span>
          <select
            aria-label={bm ? "Lapisan peta" : "Map layers"}
            value={p.mode}
            onChange={(e) => {
              wind.update({ mode: e.target.value as WindPreferences["mode"], shading: false });
              wind.setInspecting(false);
            }}
          >
            <option value="air">{bm ? "Kualiti udara" : "Air quality"}</option>
            <option value="wind">{bm ? "Angin" : "Wind"}</option>
            <option value="combined">{bm ? "Kualiti udara + angin" : "Air quality + wind"}</option>
          </select>
        </label>
        {enabled && (
          <>
            <button
              className="button button-outline"
              disabled={wind.reduced}
              aria-pressed={p.paused || wind.reduced}
              onClick={() => wind.update({ paused: !p.paused })}
            >
              {p.paused || wind.reduced ? <Play size={15} /> : <Pause size={15} />}
              {wind.reduced
                ? bm
                  ? "Anak panah statik"
                  : "Static wind arrows"
                : p.paused
                  ? bm
                    ? "Mainkan animasi angin"
                    : "Play wind animation"
                  : bm
                    ? "Jeda animasi angin"
                    : "Pause wind animation"}
            </button>
            <button
              className="button button-outline"
              aria-pressed={wind.inspecting}
              onClick={() => wind.setInspecting(!wind.inspecting)}
            >
              <Crosshair size={15} />
              {bm ? "Periksa angin" : "Inspect wind"}
            </button>
            <details className="wind-settings">
              <summary>
                <Settings2 size={16} />
                {bm ? "Tetapan angin" : "Wind settings"}
              </summary>
              <div className="wind-settings-panel">
                <label>
                  {bm ? "Sumber angin" : "Wind source"}
                  <select
                    aria-label={bm ? "Sumber angin" : "Wind source"}
                    value={p.source}
                    onChange={(e) =>
                      wind.update({ source: e.target.value as WindPreferences["source"] })
                    }
                  >
                    <option value="demo">
                      {bm ? "Angin demo sintetik" : "Synthetic demo wind"}
                    </option>
                    <option value="open-meteo">Open-Meteo · ECMWF</option>
                  </select>
                </label>
                {p.source === "demo" && (
                  <label>
                    {bm ? "Medan demo" : "Demo field"}
                    <select
                      aria-label={bm ? "Medan demo" : "Demo field"}
                      value={p.pattern}
                      onChange={(e) =>
                        wind.update({ pattern: e.target.value as WindPreferences["pattern"] })
                      }
                    >
                      {patterns.map((pattern) => (
                        <option key={pattern} value={pattern}>
                          {
                            {
                              varied: bm ? "Berubah mengikut masa" : "Time-varying",
                              north: bm ? "DARI utara" : "FROM north",
                              east: bm ? "DARI timur" : "FROM east",
                              southwest: bm ? "DARI barat daya" : "FROM southwest",
                              gradient: bm ? "Kecerunan kelajuan" : "Speed gradient",
                              rotation: bm ? "Putaran sintetik" : "Synthetic rotation",
                              calm: bm ? "Tenang" : "Calm",
                              holes: bm ? "Jurang data" : "Missing-data holes",
                            }[pattern]
                          }
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  {bm ? "Kelegapan jejak" : "Trail opacity"}
                  <input
                    aria-label={bm ? "Kelegapan jejak" : "Trail opacity"}
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={p.opacity}
                    onChange={(e) => wind.update({ opacity: Number(e.target.value) })}
                  />
                </label>
                <label>
                  {bm ? "Ketumpatan paparan" : "Rendering density"}
                  <select
                    aria-label={bm ? "Ketumpatan paparan" : "Rendering density"}
                    value={p.quality}
                    onChange={(e) =>
                      wind.update({ quality: e.target.value as WindPreferences["quality"] })
                    }
                  >
                    <option value="low">{bm ? "Rendah" : "Low"} · 240</option>
                    <option value="balanced">{bm ? "Seimbang" : "Balanced"} · 700</option>
                    <option value="high">{bm ? "Tinggi" : "High"} · 1400</option>
                  </select>
                </label>
                <label className="wind-shading">
                  <input
                    type="checkbox"
                    checked={p.shading}
                    onChange={(e) => wind.update({ shading: e.target.checked })}
                  />
                  {bm ? "Lorekan kelajuan angin" : "Wind-speed shading"}
                </label>
                <p>
                  {bm
                    ? "Ketumpatan dan kelegapan ialah tetapan paparan, bukan nilai cuaca."
                    : "Density and opacity control rendering, not weather values."}
                </p>
              </div>
            </details>
          </>
        )}
      </div>
      {enabled && (
        <>
          <div className="wind-status" role="status" data-wind-valid-at={field?.validAt ?? ""}>
            {wind.loading || wind.pending
              ? bm
                ? "Memuatkan angin untuk masa dipilih…"
                : "Loading wind for selected time…"
              : wind.error
                ? `${bm ? "Angin tidak tersedia untuk masa ini" : "Wind unavailable for this time"}: ${wind.error}`
                : field && (
                    <>
                      <strong>
                        {field.source === "demo"
                          ? bm
                            ? "ANGIN DEMO SINTETIK"
                            : "SYNTHETIC DEMO WIND"
                          : bm
                            ? "Angin model pada 10 m"
                            : "Modelled wind at 10 m"}
                      </strong>
                      <span>
                        {formatMYT(field.validAt)} MYT ·{" "}
                        {field.kind === "historical-forecast"
                          ? bm
                            ? "Ramalan berarkib"
                            : "Archived forecast"
                          : field.model}
                      </span>
                      <span>
                        {bm
                          ? "Animasi dibesarkan untuk kejelasan (6000×)"
                          : "Animation exaggerated for visibility (6000×)"}
                      </span>
                    </>
                  )}
          </div>
          {field && (
            <div
              className="wind-legend"
              aria-label={bm ? "Kelajuan angin · km/j" : "Wind speed · km/h"}
            >
              <strong>{bm ? "Kelajuan angin · km/j" : "Wind speed · km/h"}</strong>
              <div>
                <div className="wind-color-ramp" />
                <ol>
                  {WIND_COLOR_STOPS.map(([speed]) => (
                    <li key={speed}>{speed === 60 ? "60+" : speed}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}
          {field && (
            <p className="wind-resolution">
              {field.heightM} m · {field.resolution}
            </p>
          )}
          {field && (
            <p className="wind-attribution">
              {field.attribution.map((a, i) => (
                <span key={a.url}>
                  {i > 0 && " · "}
                  <a
                    href={a.url}
                    target={a.url.startsWith("https:") ? "_blank" : undefined}
                    rel="noreferrer"
                  >
                    {a.name}
                  </a>
                </span>
              ))}
            </p>
          )}
          {wind.inspecting && (
            <p className="wind-inspect-hint">
              {bm
                ? "Klik peta untuk sampel setempat. Matikan Periksa angin untuk memilih wilayah."
                : "Click the map to sample locally. Turn Inspect wind off to select regions."}
            </p>
          )}
          {field && wind.point && (
            <div className="wind-inspector" aria-label={bm ? "Sampel angin" : "Wind sample"}>
              <strong>
                {wind.point.lat.toFixed(2)}° N, {wind.point.lng.toFixed(2)}° E
              </strong>
              <span>
                {reading
                  ? `${reading.speedKmh.toFixed(1)} km/h · ${reading.directionFromDegrees === null ? (bm ? "Tenang" : "Calm") : `${bm ? "DARI" : "FROM"} ${reading.compass} ${reading.directionFromDegrees.toFixed(0)}°`}`
                  : bm
                    ? "Tiada data angin di sini"
                    : "No wind data here"}
              </span>
              <small>
                {field.source === "demo"
                  ? bm
                    ? "Sampel sintetik"
                    : "Synthetic sample"
                  : bm
                    ? "Anggaran model berinterpolasi"
                    : "Interpolated model estimate"}{" "}
                · {field.heightM} m · {formatMYT(field.validAt)} MYT
              </small>
            </div>
          )}
          {field && (
            <details className="wind-provenance">
              <summary>{bm ? "Sumber & resolusi angin" : "Wind source & resolution"}</summary>
              <p>
                {field.model} · {field.heightM} m · {field.resolution}
              </p>
              <p>
                {bm ? "Diperoleh" : "Retrieved"}: {formatMYT(field.fetchedAt)} MYT.{" "}
                {bm
                  ? "Interpelasi tidak memberikan ketepatan peringkat jalan."
                  : "Interpolation does not establish street-level accuracy."}
              </p>
            </details>
          )}
        </>
      )}
    </section>
  );
}
