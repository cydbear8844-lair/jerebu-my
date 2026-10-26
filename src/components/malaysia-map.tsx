"use client";

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { FeatureCollection, Geometry } from "geojson";
import type { LngLatBoundsLike, PaddingOptions } from "maplibre-gl";
import { Maximize, Minus, Plus } from "lucide-react";
import { Map, MapGeoJSON, MapMarker, MarkerContent, useMap } from "./ui/map";
import { categoryFor } from "@/lib/domain";
import type { RegionSummary, Station } from "@/lib/types";
import { usePreferences } from "./preferences";
import { MapRegionLabels } from "./map-region-labels";
import { NearMeMapEffects, type NearMeController } from "./near-me";
import type { WindController } from "./wind/controls";

const WindMapLayer = dynamic(() => import("./wind/map-layer").then((m) => m.WindMapLayer), {
  ssr: false,
});

type Properties = { regionId: string; name: string; color?: string };
type Geography = FeatureCollection<Geometry, Properties>;
let geographyRequest: Promise<Geography> | undefined;

function getGeography() {
  geographyRequest ??= fetch("/data/malaysia-regions.geojson")
    .then(async (response) => {
      if (!response.ok) throw new Error("Boundary download failed");
      const json = (await response.json()) as Geography;
      if (json.type !== "FeatureCollection" || json.features.length !== 16)
        throw new Error("Invalid boundary dataset");
      return json;
    })
    .catch((error: unknown) => {
      geographyRequest = undefined;
      throw error;
    });
  return geographyRequest;
}

function boundsFor(geography: Geography, regionId?: string): LngLatBoundsLike {
  const positions: number[][] = [];
  function collect(value: unknown) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number")
      positions.push(value as number[]);
    else value.forEach(collect);
  }
  geography.features
    .filter((f) => !regionId || f.properties.regionId === regionId)
    .forEach((f) => {
      if ("coordinates" in f.geometry) collect(f.geometry.coordinates);
    });
  return [
    [Math.min(...positions.map((p) => p[0])), Math.min(...positions.map((p) => p[1]))],
    [Math.max(...positions.map((p) => p[0])), Math.max(...positions.map((p) => p[1]))],
  ];
}

function regionalPadding(): PaddingOptions {
  const panel = document.querySelector<HTMLElement>(".region-information");
  const panelWidth = window.innerWidth >= 1200 ? (panel?.getBoundingClientRect().width ?? 410) : 0;
  return { top: 85, bottom: 55, left: 45, right: panelWidth + 45 };
}

class MapBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function MapController({
  geography,
  regionId,
  onReady,
  location,
}: {
  geography: Geography;
  regionId?: string;
  onReady: () => void;
  location?: NearMeController;
}) {
  const { map, isLoaded } = useMap();
  const { t } = usePreferences();
  const previousRegion = useRef<string | undefined>(undefined);
  const mounted = useRef(false);
  const overviewCamera = useRef<{
    center: [number, number];
    zoom: number;
    padding: PaddingOptions;
  } | null>(null);
  const privateCamera = useRef(false);
  useEffect(() => {
    if (location?.state.position) privateCamera.current = true;
  }, [location?.state.position]);
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!map || !isLoaded) return;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    const container = map.getContainer();
    const shell = container.closest<HTMLElement>(".map-shell");
    if (regionId && !previousRegion.current && mounted.current)
      overviewCamera.current = {
        center: map.getCenter().toArray() as [number, number],
        zoom: map.getZoom(),
        padding: map.getPadding(),
      };
    const fit = (duration = 0) => {
      map.stop();
      shell?.setAttribute("data-camera-state", duration ? "moving" : "idle");
      const legend = container.closest(".map-stage")?.querySelector<HTMLElement>(".map-legend");
      const legendHeight =
        legend && getComputedStyle(legend).display !== "none"
          ? legend.getBoundingClientRect().height
          : 0;
      map.fitBounds(boundsFor(geography, regionId), {
        padding: regionId
          ? regionalPadding()
          : container.clientWidth < 500
            ? { top: 95, bottom: Math.max(155, legendHeight + 50), left: 18, right: 18 }
            : { top: 100, bottom: Math.max(155, legendHeight + 50), left: 48, right: 60 },
        duration,
        absolutePadding: true,
        bearing: 0,
        pitch: 0,
        maxZoom: regionId ? 10 : 6,
      });
    };
    const done = () => {
      shell?.setAttribute("data-camera-state", "idle");
      onReady();
    };
    const beginning = () => shell?.setAttribute("data-camera-state", "moving");
    map.on("movestart", beginning);
    map.on("moveend", done);
    if (!regionId && overviewCamera.current && mounted.current) {
      map.stop();
      shell?.setAttribute("data-camera-state", reducedMotion() ? "idle" : "moving");
      map.easeTo({
        ...overviewCamera.current,
        bearing: 0,
        pitch: 0,
        duration: reducedMotion() ? 0 : 650,
      });
    } else fit(mounted.current && !reducedMotion() ? 760 : 0);
    if (!regionId && !mounted.current) {
      try {
        const saved = sessionStorage.getItem("jerebu-camera");
        if (saved) {
          const camera = JSON.parse(saved);
          if (
            Array.isArray(camera.center) &&
            camera.center.length === 2 &&
            camera.center.every(Number.isFinite) &&
            Number.isFinite(camera.zoom) &&
            Number.isFinite(camera.width) &&
            Number.isFinite(camera.height) &&
            Math.abs(camera.width - container.clientWidth) <
              Math.max(30, container.clientWidth * 0.1) &&
            Math.abs(camera.height - container.clientHeight) <
              Math.max(30, container.clientHeight * 0.1)
          )
            map.jumpTo({ center: camera.center, zoom: camera.zoom, bearing: 0, pitch: 0 });
        }
      } catch {
        /* Camera restoration is optional when session storage is unavailable. */
      }
    }
    mounted.current = true;
    previousRegion.current = regionId;
    const ready = () => onReady();
    map.once("idle", ready);
    onReady();
    const safety = window.setTimeout(done, 1300);
    const remember = () => {
      if (regionId || privateCamera.current) return;
      try {
        sessionStorage.setItem(
          "jerebu-camera",
          JSON.stringify({
            center: map.getCenter().toArray(),
            zoom: map.getZoom(),
            width: container.clientWidth,
            height: container.clientHeight,
          }),
        );
      } catch {
        /* Storage is optional. */
      }
    };
    map.on("moveend", remember);
    let previousWidth = container.clientWidth;
    let previousHeight = container.clientHeight;
    const observer = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      map.resize();
      if (container.clientWidth !== previousWidth || container.clientHeight !== previousHeight) {
        const widthChanged = container.clientWidth !== previousWidth;
        previousWidth = container.clientWidth;
        previousHeight = container.clientHeight;
        if (widthChanged) fit();
      }
    });
    observer.observe(map.getContainer());
    return () => {
      window.clearTimeout(safety);
      map.off("moveend", done);
      map.off("movestart", beginning);
      map.off("idle", ready);
      map.off("moveend", remember);
      observer.disconnect();
    };
  }, [map, isLoaded, geography, regionId, onReady]);

  function frame(bounds: LngLatBoundsLike) {
    map?.fitBounds(bounds, {
      padding: regionId ? regionalPadding() : { top: 80, bottom: 110, left: 50, right: 50 },
      duration: reducedMotion() ? 0 : 400,
      absolutePadding: true,
      bearing: 0,
      pitch: 0,
      maxZoom: regionId ? 10 : 9,
    });
  }
  return (
    <>
      {!regionId && (
        <div className="map-views" aria-label="Map viewport">
          <button onClick={() => frame(boundsFor(geography))}>{t("allMalaysia")}</button>
          <button
            onClick={() =>
              frame([
                [99.55, 1.18],
                [104.7, 6.8],
              ])
            }
          >
            {t("peninsula")}
          </button>
          <button
            onClick={() =>
              frame([
                [109.4, 0.8],
                [119.4, 7.4],
              ])
            }
          >
            {t("borneo")}
          </button>
        </div>
      )}
      <div className="map-controls">
        <button
          className="icon-button"
          onClick={() => map?.zoomIn({ duration: reducedMotion() ? 0 : 180 })}
          aria-label={t("zoomIn")}
        >
          <Plus size={18} />
        </button>
        <button
          className="icon-button"
          onClick={() => map?.zoomOut({ duration: reducedMotion() ? 0 : 180 })}
          aria-label={t("zoomOut")}
        >
          <Minus size={18} />
        </button>
        <button
          className="icon-button"
          onClick={() => frame(boundsFor(geography, regionId))}
          aria-label={t("reset")}
        >
          <Maximize size={16} />
        </button>
      </div>
    </>
  );
}

export function MalaysiaMap({
  indexScale = "MY_IPU",
  summaries,
  regionId,
  highlightedId,
  stations = [],
  onHover,
  onSelect,
  onRequestList,
  location,
  wind,
}: {
  indexScale?: string;
  summaries: RegionSummary[];
  regionId?: string;
  highlightedId?: string | null;
  stations?: Station[];
  onHover?: (regionId: string | null) => void;
  onSelect?: (regionId: string) => void;
  onRequestList?: () => void;
  location?: NearMeController;
  wind?: WindController;
}) {
  const windMode = wind?.preferences.mode ?? "air";
  const [geography, setGeography] = useState<Geography | null>(null);
  const [error, setError] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { t } = usePreferences();
  useEffect(() => {
    let active = true;
    getGeography()
      .then((data) => {
        if (active) setGeography(data);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const colored = useMemo<Geography | null>(
    () =>
      geography
        ? {
            ...geography,
            features: geography.features.map((f) => ({
              ...f,
              properties: {
                ...f.properties,
                color:
                  windMode === "wind"
                    ? "#41575b"
                    : (categoryFor(
                        summaries.find((s) => s.regionId === f.properties.regionId)?.value ?? null,
                        indexScale,
                      )?.color ?? "#536568"),
              },
            })),
          }
        : null,
    [geography, summaries, indexScale, windMode],
  );
  const activeId = highlightedId ?? regionId ?? "";
  const fallback = (
    <div className="map-fallback" role="status">
      <h3>{t("map")}</h3>
      <p>{t("mapFailure")}</p>
      {regionId ? (
        <Link href="/" className="button button-outline">
          {t("list")}
        </Link>
      ) : (
        <button className="button button-outline" onClick={onRequestList}>
          {t("list")}
        </button>
      )}
    </div>
  );
  const onReady = useCallback(() => {
    shell.current?.setAttribute("data-map-loaded", "true");
  }, []);
  return (
    <div
      className={`map-shell ${regionId ? "regional-map" : ""}`}
      ref={shell}
      aria-label={regionId ? `${regionId} region map` : "Interactive Malaysia region map"}
    >
      <div className="map-coordinate top">
        07° N <span>MY / ADMINISTRATIVE REGIONS</span> 119° E
      </div>
      {error ? (
        fallback
      ) : !colored || !geography ? (
        <div className="map-loading" role="status">
          {t("loadingMap")}
        </div>
      ) : (
        <MapBoundary fallback={fallback}>
          <Map
            blank
            theme="dark"
            center={[109, 4]}
            zoom={4}
            minZoom={3}
            maxZoom={13}
            dragRotate={false}
            pitchWithRotate={false}
            touchPitch={false}
            maxPitch={0}
            attributionControl={false}
            scrollZoom
          >
            <MapController
              geography={geography}
              regionId={regionId}
              onReady={onReady}
              location={location}
            />
            {location && <NearMeMapEffects controller={location} />}
            <MapGeoJSON<Properties>
              id="regions"
              data={colored}
              promoteId="regionId"
              interactive={Boolean(onSelect) && !wind?.inspecting}
              fillPaint={{
                "fill-color": ["get", "color"],
                "fill-opacity": 0.28,
                "fill-color-transition": { duration: 0 },
              }}
              linePaint={{
                "line-color": ["case", ["==", ["get", "regionId"], activeId], "#69D9CD", "#789593"],
                "line-width": ["case", ["==", ["get", "regionId"], activeId], 2.3, 0.8],
                "line-opacity": 0.9,
              }}
              onHover={(event) => onHover?.(event?.feature.properties.regionId ?? null)}
              onClick={(event) => {
                if (!wind?.inspecting) onSelect?.(event.feature.properties.regionId);
              }}
            />
            {wind && windMode !== "air" && <WindMapLayer wind={wind} />}
            <MapRegionLabels
              activeId={activeId}
              regionId={regionId}
              summaries={summaries}
              onHover={onHover}
              onSelect={wind?.inspecting ? undefined : onSelect}
              showValues={windMode !== "wind"}
            />
            {stations.map((station) => (
              <MapMarker
                key={station.id}
                longitude={station.coordinates[0]}
                latitude={station.coordinates[1]}
              >
                <MarkerContent>
                  <button
                    className="station-marker"
                    title={station.name}
                    aria-label={station.name}
                    onClick={() => router.push(`/station/${station.id}`)}
                  >
                    <span />
                  </button>
                </MarkerContent>
              </MapMarker>
            ))}
            {!regionId && (
              <>
                <MapMarker longitude={107.1} latitude={4.4}>
                  <MarkerContent>
                    <span className="sea-label">SOUTH CHINA SEA</span>
                  </MarkerContent>
                </MapMarker>
                <MapMarker longitude={111.5} latitude={0.75}>
                  <MarkerContent>
                    <span className="geographic-label">BORNEO</span>
                  </MarkerContent>
                </MapMarker>
                <MapMarker longitude={99.5} latitude={2.75}>
                  <MarkerContent>
                    <span className="sea-label strait">STRAIT OF MALACCA</span>
                  </MarkerContent>
                </MapMarker>
              </>
            )}
          </Map>
        </MapBoundary>
      )}
      <span className="north-mark" aria-hidden="true">
        <b>N</b>
        <i />
      </span>
      <div className="map-attribution">
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          © OpenStreetMap contributors
        </a>{" "}
        · geoBoundaries ·{" "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">
          ODbL 1.0
        </a>{" "}
        · MapLibre
      </div>
    </div>
  );
}
