"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "./types";

export const PLAYBACK_HOUR = 3_600_000;
export type TimelineAvailability = {
  start: string;
  end: string;
  frames: { at: string; freshCount: number }[];
};

export function clampPlaybackTime(at: string, start: string, end: string): string {
  const value = Date.parse(at);
  return new Date(
    Math.min(
      Date.parse(end),
      Math.max(Date.parse(start), Number.isFinite(value) ? value : Date.parse(end)),
    ),
  ).toISOString();
}

export function useSnapshotPlayback(initial: Snapshot) {
  const [snapshot, setSnapshot] = useState(initial);
  const [requestedAt, setRequestedAt] = useState(initial.asOf);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [speed, updateSpeed] = useState(1);
  const [rangeHours, updateRange] = useState(24);
  const [availability, setAvailability] = useState<TimelineAvailability | null>(null);
  const [availabilityError, setAvailabilityError] = useState("");
  const end = availability?.end ?? initial.asOf;
  const coverageStart =
    availability?.start ?? new Date(Date.parse(initial.asOf) - 720 * PLAYBACK_HOUR).toISOString();
  const start = new Date(
    Math.max(Date.parse(coverageStart), Date.parse(end) - rangeHours * PLAYBACK_HOUR),
  ).toISOString();
  const active = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const committed = useRef(initial);
  const pause = useCallback(() => setPlaying(false), []);
  const cancelPending = useCallback(() => {
    generation.current++;
    active.current?.abort();
    if (timer.current) clearTimeout(timer.current);
    setRequestedAt(committed.current.asOf);
    setBusy(false);
    setPlaying(false);
    setError("");
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (initial.mode !== "demo") return;
    const controller = new AbortController();
    void fetch("/api/overview?timeline=1", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Availability unavailable");
        const data = (await response.json()) as TimelineAvailability;
        if (
          !Array.isArray(data.frames) ||
          !Number.isFinite(Date.parse(data.start)) ||
          !Number.isFinite(Date.parse(data.end)) ||
          Date.parse(data.start) > Date.parse(data.end) ||
          Date.parse(data.end) > Date.parse(initial.asOf) ||
          data.frames.some(
            (frame) =>
              !Number.isFinite(Date.parse(frame.at)) ||
              Date.parse(frame.at) < Date.parse(data.start) ||
              Date.parse(frame.at) > Date.parse(data.end) ||
              !Number.isInteger(frame.freshCount) ||
              frame.freshCount < 0,
          )
        )
          throw new Error("Invalid availability");
        if (!controller.signal.aborted) setAvailability(data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailabilityError("Hourly availability could not load.");
      });
    const hide = () => {
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      controller.abort();
      active.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [initial.asOf, initial.mode, pause]);

  const request = useCallback(
    (at: string, delay: number) => {
      const target = clampPlaybackTime(at, coverageStart, end);
      const id = ++generation.current;
      active.current?.abort();
      if (timer.current) clearTimeout(timer.current);
      setRequestedAt(target);
      setBusy(true);
      setError("");
      timer.current = setTimeout(async () => {
        const controller = new AbortController();
        active.current = controller;
        try {
          const response = await fetch(`/api/overview?at=${encodeURIComponent(target)}`, {
            signal: controller.signal,
            cache: "no-store",
          });
          if (!response.ok) throw new Error("Snapshot unavailable");
          const next = (await response.json()) as Snapshot;
          if (
            next.asOf !== target ||
            next.mode !== initial.mode ||
            next.sourceId !== initial.sourceId ||
            next.indexScale !== initial.indexScale ||
            !Array.isArray(next.observations) ||
            !Array.isArray(next.summaries) ||
            !Array.isArray(next.stations) ||
            next.observations.some(
              (observation) =>
                !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(observation.observedAt) ||
                !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(observation.fetchedAt) ||
                !Number.isFinite(Date.parse(observation.observedAt)) ||
                !Number.isFinite(Date.parse(observation.fetchedAt)) ||
                Date.parse(observation.observedAt) > Date.parse(target) ||
                Date.parse(observation.fetchedAt) > Date.parse(target) ||
                observation.sourceId !== initial.sourceId ||
                observation.indexScale !== initial.indexScale,
            )
          )
            throw new Error("Invalid snapshot time");
          if (mounted.current && generation.current === id && !controller.signal.aborted) {
            committed.current = next;
            setSnapshot(next);
          }
        } catch {
          if (mounted.current && generation.current === id && !controller.signal.aborted) {
            setError("This frame could not load. The previous snapshot remains displayed.");
            setPlaying(false);
          }
        } finally {
          if (mounted.current && generation.current === id) setBusy(false);
        }
      }, delay);
    },
    [coverageStart, end, initial.mode, initial.sourceId, initial.indexScale],
  );

  const seek = useCallback(
    (at: string) => {
      pause();
      request(at, 100);
    },
    [pause, request],
  );
  const latest = useCallback(() => {
    pause();
    request(end, 0);
  }, [pause, request, end]);
  const refresh = useCallback(() => {
    pause();
    request(snapshot.asOf, 0);
  }, [pause, request, snapshot.asOf]);
  const setRangeHours = useCallback(
    (hours: number) => {
      if (![24, 168, 720].includes(hours)) return;
      pause();
      updateRange(hours);
      const boundary = new Date(
        Math.max(Date.parse(coverageStart), Date.parse(end) - hours * PLAYBACK_HOUR),
      ).toISOString();
      if (Date.parse(requestedAt) < Date.parse(boundary)) request(boundary, 0);
    },
    [coverageStart, end, pause, request, requestedAt],
  );
  const setSpeed = useCallback((value: number) => {
    if ([0.5, 1, 2].includes(value)) updateSpeed(value);
  }, []);
  const togglePlay = useCallback(() => {
    if (playing) {
      pause();
      return;
    }
    if (initial.status !== "available") return;
    if (Date.parse(snapshot.asOf) >= Date.parse(end)) request(start, 0);
    setPlaying(true);
  }, [playing, pause, initial.status, snapshot.asOf, end, request, start]);

  useEffect(() => {
    if (!playing || busy) return;
    const tick = setTimeout(() => {
      const next = Math.min(Date.parse(end), Date.parse(snapshot.asOf) + PLAYBACK_HOUR);
      if (next <= Date.parse(snapshot.asOf)) {
        pause();
        return;
      }
      request(new Date(next).toISOString(), 0);
      if (next === Date.parse(end)) pause();
    }, 1000 / speed);
    return () => clearTimeout(tick);
  }, [playing, busy, snapshot.asOf, speed, end, pause, request]);

  return {
    snapshot,
    requestedAt,
    busy,
    error,
    playing,
    speed,
    rangeHours,
    setRangeHours,
    seek,
    refresh,
    latest,
    pause,
    cancelPending,
    togglePlay,
    setSpeed,
    availability,
    availabilityError,
    start,
    end,
  };
}

export type SnapshotPlayback = ReturnType<typeof useSnapshotPlayback>;
