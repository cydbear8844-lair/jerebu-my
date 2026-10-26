"use client";

import { useEffect, useState } from "react";
import { matchesWindTime, windHour, type DemoWindPattern, type WindField } from "./wind";

export type WindMode = "air" | "wind" | "combined";
export type WindQuality = "low" | "balanced" | "high";
export type WindPreferences = {
  mode: WindMode;
  source: "demo" | "open-meteo";
  pattern: DemoWindPattern;
  paused: boolean;
  opacity: number;
  shading: boolean;
  quality: WindQuality;
};

export function useWindField(at: string, preferences: WindPreferences) {
  const enabled = preferences.mode !== "air";
  const hour = windHour(at);
  const key = `${preferences.source}/${preferences.pattern}/${hour}`;
  const [result, setResult] = useState<{ key: string; field?: WindField; error?: string }>();
  useEffect(() => {
    if (!enabled || !hour) return;
    const controller = new AbortController();
    const query = new URLSearchParams({
      source: preferences.source,
      at: hour,
      scenario: preferences.pattern,
    });
    void fetch(`/api/wind?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Wind unavailable for this time.");
        if (!matchesWindTime(payload, at) || payload.source !== preferences.source)
          throw new Error("Wind response does not match the selected time/source.");
        if (!controller.signal.aborted) setResult({ key, field: payload });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setResult({ key, error: error instanceof Error ? error.message : "Wind unavailable." });
      });
    return () => controller.abort();
  }, [enabled, hour, key, at, preferences.source, preferences.pattern]);
  return {
    field: enabled && result?.key === key ? (result.field ?? null) : null,
    error:
      enabled && !hour
        ? "Invalid wind time."
        : enabled && result?.key === key
          ? result.error
          : undefined,
    loading: enabled && hour !== null && result?.key !== key,
  };
}
