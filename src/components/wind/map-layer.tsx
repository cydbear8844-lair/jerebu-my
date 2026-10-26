"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "../ui/map";
import { WindRenderer } from "./renderer";
import type { WindController } from "./controls";
import { usePreferences } from "../preferences";
import type { MapMouseEvent } from "maplibre-gl";

export function WindMapLayer({ wind }: { wind: WindController }) {
  const { map, isLoaded } = useMap();
  const renderer = useRef<WindRenderer | null>(null);
  const [error, setError] = useState("");
  const { lang } = usePreferences();
  const { preferences: p } = wind;
  const { inspecting, setPoint } = wind;
  const initial = useRef({
    paused: p.paused || wind.reduced,
    shading: p.shading,
    opacity: p.opacity,
    quality: p.quality,
  });
  useEffect(() => {
    if (!map || !isLoaded) return;
    let errorFrame = 0;
    try {
      renderer.current = new WindRenderer(map, initial.current);
    } catch (reason) {
      errorFrame = requestAnimationFrame(() =>
        setError(reason instanceof Error ? reason.message : "Wind renderer unavailable."),
      );
    }
    return () => {
      cancelAnimationFrame(errorFrame);
      renderer.current?.destroy();
      renderer.current = null;
    };
  }, [map, isLoaded]);
  useEffect(() => {
    renderer.current?.setField(wind.field);
  }, [wind.field, isLoaded]);
  useEffect(() => {
    renderer.current?.configure({
      paused: p.paused || wind.reduced,
      shading: p.shading,
      opacity: p.opacity,
      quality: p.quality,
    });
  }, [p.paused, wind.reduced, p.shading, p.opacity, p.quality, isLoaded]);
  useEffect(() => {
    if (!map || !inspecting) return;
    const inspect = (event: MapMouseEvent) =>
      setPoint({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    map.on("click", inspect);
    return () => {
      map.off("click", inspect);
    };
  }, [map, inspecting, setPoint]);
  return error ? (
    <p className="wind-renderer-error" role="status">
      {lang === "bm"
        ? "Animasi angin tidak tersedia. Gunakan Periksa angin untuk nilai angka."
        : error}
    </p>
  ) : null;
}
