"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LocateFixed, X } from "lucide-react";
import type { FeatureCollection, Geometry } from "geojson";
import type { Snapshot } from "@/lib/types";
import { categoryFor, formatMYT, indexDefinition } from "@/lib/domain";
import {
  nearestEligibleStation,
  pointInMalaysia,
  validPosition,
  type NearestStation,
  type UserPosition,
} from "@/lib/nearest-station";
import { MapMarker, MarkerContent, useMap } from "./ui/map";
import { usePreferences } from "./preferences";
import "./near-me.css";

const BM_COPY: Record<string, string> = {
  "Near me result": "Hasil berdekatan saya",
  "Dismiss location result": "Tutup hasil lokasi",
  "Finding your location…": "Mencari lokasi anda…",
  "Location found. Finding your nearest station…": "Lokasi ditemui. Mencari stesen terdekat…",
  "Moving to your nearest station…": "Bergerak ke stesen terdekat…",
  "Nearest eligible demo station": "Stesen demo layak terdekat",
  "Nearest eligible station": "Stesen layak terdekat",
  "away · straight-line distance": "dari anda · jarak garis lurus",
  "Fresh at selected time": "Terkini pada masa dipilih",
  "Fictional demo station and reading. ": "Stesen dan bacaan demo rekaan. ",
  "This is a station reading, not a reading at your location.":
    "Ini ialah bacaan stesen, bukan bacaan di lokasi anda.",
  "View station": "Lihat stesen",
  "Location accuracy": "Ketepatan lokasi",
  "Coordinates stay in this session.": "Koordinat hanya disimpan dalam sesi ini.",
  "Your location": "Lokasi anda",
  "Your approximate location": "Anggaran lokasi anda",
  "Nearest station": "Stesen terdekat",
  "Location is unavailable in this browser. Choose a region from the list.":
    "Lokasi tidak tersedia dalam pelayar ini. Pilih negeri atau wilayah daripada senarai.",
  "The browser returned an invalid location. Try again or choose a region.":
    "Pelayar mengembalikan lokasi yang tidak sah. Cuba lagi atau pilih negeri atau wilayah.",
  "No station has a fresh, compatible reading at the selected time. Choose another time or browse regions.":
    "Tiada stesen mempunyai bacaan terkini yang serasi pada masa dipilih. Pilih masa lain atau layari negeri dan wilayah.",
  "Your location is outside the mapped Malaysia boundaries. The map stays in Malaysia; choose a region to explore its stations.":
    "Lokasi anda berada di luar sempadan Malaysia pada peta. Peta kekal di Malaysia; pilih negeri atau wilayah untuk melihat stesennya.",
  "Location found, but the map boundaries could not be checked. Your nearest eligible station is listed below; the map has not moved.":
    "Lokasi ditemui, tetapi sempadan peta tidak dapat disemak. Stesen layak terdekat disenaraikan di bawah; peta belum bergerak.",
  "Location permission denied. Allow location in your browser to try again, or choose a region.":
    "Kebenaran lokasi ditolak. Benarkan lokasi dalam pelayar untuk mencuba lagi, atau pilih negeri atau wilayah.",
  "Location request timed out. Try again or choose a region.":
    "Permintaan lokasi tamat masa. Cuba lagi atau pilih negeri atau wilayah.",
  "Your location could not be determined. Try again or choose a region.":
    "Lokasi anda tidak dapat ditentukan. Cuba lagi atau pilih negeri atau wilayah.",
};

function useNearMeText() {
  const { lang } = usePreferences();
  return {
    lang,
    text: (english: string) => (lang === "bm" ? (BM_COPY[english] ?? english) : english),
  };
}

type Phase = "idle" | "locating" | "ping" | "flight" | "settled" | "error";
type LocationState = {
  phase: Phase;
  intent: number;
  position?: UserPosition;
  nearest?: NearestStation;
  message?: string;
  demo?: boolean;
};

export function useNearMe(snapshot: Snapshot) {
  const [state, setState] = useState<LocationState>({ phase: "idle", intent: 0 });
  const intent = useRef(0);
  const pending = useRef(false);
  const stopMotion = useRef<(() => void) | null>(null);
  const request = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    intent.current += 1;
    pending.current = false;
    request.current?.abort();
    stopMotion.current?.();
    setState({ phase: "idle", intent: intent.current });
  }, []);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [cancel]);
  useEffect(
    () => () => {
      intent.current += 1;
      pending.current = false;
      request.current?.abort();
      stopMotion.current?.();
    },
    [],
  );
  const transition = useCallback((id: number, phase: Phase) => {
    if (id !== intent.current) return;
    setState((previous) => ({ ...previous, phase }));
    window.dispatchEvent(
      new CustomEvent("jerebu:location-phase", { detail: { phase, intent: id } }),
    );
  }, []);
  useEffect(() => {
    if (state.phase !== "ping") return;
    const timer = setTimeout(() => {
      if (!stopMotion.current) transition(state.intent, "settled");
    }, 1500);
    return () => clearTimeout(timer);
  }, [state.phase, state.intent, transition]);
  const locate = useCallback(() => {
    if (pending.current) return;
    cancel();
    const id = intent.current;
    const fail = (message: string) => {
      if (id !== intent.current) return;
      pending.current = false;
      setState({ phase: "error", intent: id, message });
    };
    if (!navigator.geolocation) {
      fail("Location is unavailable in this browser. Choose a region from the list.");
      return;
    }
    pending.current = true;
    setState({ phase: "locating", intent: id });
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (id !== intent.current) return;
        const position = {
          longitude: coords.longitude,
          latitude: coords.latitude,
          accuracy: coords.accuracy,
        };
        if (!validPosition(position)) {
          fail("The browser returned an invalid location. Try again or choose a region.");
          return;
        }
        const coordinates: [number, number] = [position.longitude, position.latitude];
        const nearest = nearestEligibleStation(snapshot, coordinates);
        const base = { intent: id, position, demo: snapshot.mode === "demo" };
        if (!nearest) {
          pending.current = false;
          setState({
            ...base,
            phase: "error",
            message:
              "No station has a fresh, compatible reading at the selected time. Choose another time or browse regions.",
          });
          return;
        }
        request.current = new AbortController();
        try {
          const response = await fetch("/data/malaysia-regions.geojson", {
            signal: request.current.signal,
          });
          if (!response.ok) throw new Error("Boundary unavailable");
          const geography = (await response.json()) as FeatureCollection<Geometry>;
          if (id !== intent.current) return;
          pending.current = false;
          if (!pointInMalaysia(coordinates, geography)) {
            setState({
              ...base,
              phase: "error",
              message:
                "Your location is outside the mapped Malaysia boundaries. The map stays in Malaysia; choose a region to explore its stations.",
            });
            return;
          }
          setState({ ...base, nearest, phase: "ping" });
        } catch {
          if (id !== intent.current) return;
          pending.current = false;
          setState({
            ...base,
            nearest,
            phase: "error",
            message:
              "Location found, but the map boundaries could not be checked. Your nearest eligible station is listed below; the map has not moved.",
          });
        }
      },
      (error) => {
        fail(
          error.code === 1
            ? "Location permission denied. Allow location in your browser to try again, or choose a region."
            : error.code === 3
              ? "Location request timed out. Try again or choose a region."
              : "Your location could not be determined. Try again or choose a region.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [cancel, snapshot]);
  return { state, locate, cancel, dismiss: cancel, transition, stopMotion };
}

export type NearMeController = ReturnType<typeof useNearMe>;

export function NearMeButton({
  controller,
  onBeforeLocate,
}: {
  controller: NearMeController;
  onBeforeLocate?: () => void;
}) {
  const { lang, t } = usePreferences();
  const locating = controller.state.phase === "locating";
  return (
    <button
      className="button near-me-button"
      data-location-phase={controller.state.phase}
      aria-busy={locating}
      disabled={locating}
      onClick={() => {
        onBeforeLocate?.();
        controller.locate();
      }}
    >
      <LocateFixed size={16} aria-hidden="true" />
      {locating ? (lang === "bm" ? "Mencari lokasi…" : "Locating…") : t("nearMe")}
    </button>
  );
}

export function NearMeCard({ controller }: { controller: NearMeController }) {
  const { lang, text } = useNearMeText();
  const { state } = controller;
  if (state.phase === "idle") return null;
  const result = state.nearest;
  const revealed = state.phase === "settled" || state.phase === "error";
  const category = result
    ? categoryFor(result.observation.value, result.observation.indexScale)
    : null;
  return (
    <section
      className="near-me-card"
      aria-label={text("Near me result")}
      data-location-phase={state.phase}
    >
      <button
        className="near-me-dismiss"
        aria-label={text("Dismiss location result")}
        onClick={controller.dismiss}
      >
        <X size={16} />
      </button>
      <div role="status" aria-live="polite">
        {state.phase === "locating" ? <p>{text("Finding your location…")}</p> : null}
        {state.phase === "ping" ? (
          <p>{text("Location found. Finding your nearest station…")}</p>
        ) : null}
        {state.phase === "flight" ? <p>{text("Moving to your nearest station…")}</p> : null}
        {state.message ? <p>{text(state.message)}</p> : null}
        {result ? (
          <div className="near-me-details" data-revealed={revealed} aria-hidden={!revealed}>
            <p className="near-me-eyebrow">
              {text(state.demo ? "Nearest eligible demo station" : "Nearest eligible station")}
            </p>
            <h3>{result.station.name}</h3>
            {result.station.recordType === "provider_location" && (
              <p>
                {lang === "en"
                  ? "Provider location; physical station identity unverified."
                  : "Lokasi pembekal; identiti stesen fizikal belum disahkan."}
              </p>
            )}
            <p>
              {result.distanceKm < 1
                ? `${Math.round(result.distanceKm * 1000)} m`
                : `${result.distanceKm.toFixed(1)} km`}{" "}
              {text("away · straight-line distance")}
            </p>
            <p className="near-me-reading">
              <strong style={{ color: category?.color }}>{result.observation.value}</strong>{" "}
              {lang === "bm" ? category?.labelBm : category?.label} ·{" "}
              {indexDefinition(result.observation.indexScale).label}
            </p>
            <p className="near-me-meta">
              {text("Fresh at selected time")} · {formatMYT(result.observation.observedAt)} MYT
            </p>
            <p>
              {state.demo ? text("Fictional demo station and reading. ") : ""}
              {text("This is a station reading, not a reading at your location.")}
            </p>
            <Link
              prefetch={false}
              className="near-me-link"
              tabIndex={revealed ? undefined : -1}
              href={`/station/${result.station.id}`}
            >
              {text("View station")}
            </Link>
          </div>
        ) : null}
        {state.position && revealed ? (
          <p className="near-me-accuracy">
            {text("Location accuracy")}: ±{Math.round(state.position.accuracy)} m.{" "}
            {text("Coordinates stay in this session.")}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function NearMeMapEffects({ controller }: { controller: NearMeController }) {
  const { text } = useNearMeText();
  const { map, isLoaded } = useMap();
  const { state, transition, stopMotion: stopMotionRef } = controller;
  const position = state.position;
  const nearest = state.nearest;
  const id = state.intent;
  const ringRef = useRef<SVGCircleElement>(null);
  const cancel = controller.cancel;
  useEffect(() => {
    if (!map || state.phase !== "locating") return;
    const container = map.getContainer();
    container.addEventListener("pointerdown", cancel);
    container.addEventListener("wheel", cancel, { passive: true });
    container.addEventListener("keydown", cancel);
    return () => {
      container.removeEventListener("pointerdown", cancel);
      container.removeEventListener("wheel", cancel);
      container.removeEventListener("keydown", cancel);
    };
  }, [map, state.phase, cancel]);
  useEffect(() => {
    if (!map || !isLoaded || !position || !nearest || state.phase !== "ping") return;
    let active = true;
    let moving = false;
    let completionGuard: ReturnType<typeof setTimeout> | undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = getComputedStyle(document.documentElement);
    const milliseconds = (value: string, fallback: number) => {
      const numeric = parseFloat(value);
      return Number.isFinite(numeric)
        ? numeric * (value.trim().endsWith("ms") ? 1 : 1000)
        : fallback;
    };
    const lead = Math.min(
      250,
      Math.max(150, milliseconds(motion.getPropertyValue("--motion-ping-lead"), 200)),
    );
    const duration = Math.min(
      1200,
      Math.max(800, milliseconds(motion.getPropertyValue("--motion-camera"), 1000)),
    );
    const finish = () => {
      if (!active) return;
      moving = false;
      stop();
      transition(id, "settled");
    };
    const stop = () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(completionGuard);
      map.off("moveend", finish);
      container.removeEventListener("pointerdown", manual);
      container.removeEventListener("wheel", manual);
      container.removeEventListener("keydown", manual);
      if (moving) {
        moving = false;
        map.stop();
      }
    };
    stopMotionRef.current = stop;
    const manual = () => {
      stop();
      if (ringRef.current) ringRef.current.style.animation = "none";
      transition(id, "settled");
    };
    const container = map.getContainer();
    container.addEventListener("pointerdown", manual);
    container.addEventListener("wheel", manual, { passive: true });
    container.addEventListener("keydown", manual);
    window.dispatchEvent(
      new CustomEvent("jerebu:location-phase", { detail: { phase: "ping", intent: id } }),
    );
    const timer = setTimeout(
      () => {
        if (!active) return;
        transition(id, "flight");
        moving = true;
        map.on("moveend", finish);
        const mapRect = container.getBoundingClientRect();
        const card = document.querySelector<HTMLElement>(".near-me-card");
        const cardRect = card?.getBoundingClientRect();
        const detailsRect = card
          ?.querySelector<HTMLElement>(".near-me-details")
          ?.getBoundingClientRect();
        const narrow = container.clientWidth < 600;
        const cardOverlaps =
          cardRect &&
          cardRect.right > mapRect.left &&
          cardRect.left < mapRect.right &&
          cardRect.bottom > mapRect.top &&
          cardRect.top < mapRect.bottom;
        const occupiedWidth = cardOverlaps ? Math.max(0, mapRect.right - cardRect.left) + 24 : 45;
        const occupiedHeight = cardOverlaps
          ? Math.max(cardRect.height, (detailsRect?.height ?? 0) + 64) +
            Math.max(0, mapRect.bottom - cardRect.bottom) +
            24
          : 60;
        map.fitBounds(
          [
            [
              Math.min(position.longitude, nearest.station.coordinates[0]),
              Math.min(position.latitude, nearest.station.coordinates[1]),
            ],
            [
              Math.max(position.longitude, nearest.station.coordinates[0]),
              Math.max(position.latitude, nearest.station.coordinates[1]),
            ],
          ],
          {
            bearing: 0,
            pitch: 0,
            duration: reduced ? 0 : duration,
            maxZoom: 12,
            padding: narrow
              ? {
                  top: 150,
                  bottom: Math.min(occupiedHeight, container.clientHeight * 0.55 || occupiedHeight),
                  left: 45,
                  right: 45,
                }
              : {
                  top: 110,
                  bottom: 175,
                  left: 80,
                  right: Math.min(occupiedWidth, container.clientWidth * 0.5),
                },
            absolutePadding: true,
          },
        );
        if (!map.isMoving()) finish();
        else
          completionGuard = setTimeout(() => {
            map.stop();
            finish();
          }, duration + 500);
      },
      reduced ? 0 : lead,
    );
    return () => {
      stop();
      if (stopMotionRef.current === stop) stopMotionRef.current = null;
      container.removeEventListener("pointerdown", manual);
      container.removeEventListener("wheel", manual);
      container.removeEventListener("keydown", manual);
    };
    // One motion lifecycle per intent; phase transitions must not stop its camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, id, position, nearest, transition, stopMotionRef]);
  if (!position || !map || !isLoaded) return null;
  return (
    <>
      <MapMarker longitude={position.longitude} latitude={position.latitude} anchor="center">
        <MarkerContent>
          <div
            className="near-me-user"
            data-location-phase={state.phase}
            role="img"
            aria-label={text("Your approximate location")}
          >
            <svg key={id} className="near-me-ping" viewBox="0 0 80 80" aria-hidden="true">
              <circle ref={ringRef} className="near-me-ring" cx="40" cy="40" r="12" />
              <circle cx="40" cy="40" r="6" className="near-me-dot" />
            </svg>
            <span className="near-me-user-label">{text("Your location")}</span>
          </div>
        </MarkerContent>
      </MapMarker>
      {nearest ? (
        <MapMarker
          longitude={nearest.station.coordinates[0]}
          latitude={nearest.station.coordinates[1]}
          anchor="center"
        >
          <MarkerContent>
            <span
              className="near-me-station"
              role="img"
              aria-label={`${text("Nearest station")}: ${nearest.station.name}`}
            >
              S
            </span>
          </MarkerContent>
        </MapMarker>
      ) : null}
    </>
  );
}
