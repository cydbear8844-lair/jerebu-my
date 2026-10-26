"use client";

import { useEffect, useRef } from "react";
import { REGIONS } from "@/lib/regions";
import type { RegionSummary } from "@/lib/types";
import { useMap } from "./ui/map";

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width + 8 &&
  a.x + a.width + 8 > b.x &&
  a.y < b.y + b.height + 6 &&
  a.y + a.height + 6 > b.y;

export function MapRegionLabels({
  activeId,
  regionId,
  summaries,
  onHover,
  onSelect,
  showValues = true,
}: {
  activeId: string;
  regionId?: string;
  summaries: RegionSummary[];
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  showValues?: boolean;
}) {
  const { map, isLoaded } = useMap();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!map || !isLoaded || !root.current) return;
    let frame = 0;
    function place() {
      if (!map || !root.current) return;
      const width = map.getContainer().clientWidth;
      const height = map.getContainer().clientHeight;
      root.current.dataset.detail = String(map.getZoom() >= 6.3);
      const containerRect = map.getContainer().getBoundingClientRect();
      const occupied: Box[] = [];
      root.current
        .closest(".map-stage")
        ?.querySelectorAll<HTMLElement>(".map-controls,.map-views,.map-legend")
        .forEach((control) => {
          if (getComputedStyle(control).display === "none") return;
          const rect = control.getBoundingClientRect();
          occupied.push({
            x: rect.left - containerRect.left,
            y: rect.top - containerRect.top,
            width: rect.width,
            height: rect.height,
          });
        });
      root.current.querySelectorAll<SVGLineElement>("[data-leader-id]").forEach((line) => {
        line.style.visibility = "hidden";
      });
      const regions = [...REGIONS].sort(
        (a, b) =>
          Number(b.id === activeId) - Number(a.id === activeId) ||
          Number(b.kind === "federal_territory") - Number(a.kind === "federal_territory") ||
          Number(b.id === "sabah" || b.id === "sarawak") -
            Number(a.id === "sabah" || a.id === "sarawak"),
      );
      for (const region of regions) {
        const el = root.current.querySelector<HTMLElement>(`[data-label-id="${region.id}"]`);
        if (!el) continue;
        const point = map.project(region.center);
        const federal = region.kind === "federal_territory";
        const w = el.offsetWidth,
          h = el.offsetHeight;
        const offsets = federal
          ? region.id === "putrajaya"
            ? [
                [50, 0],
                [50, -45],
                [50, 45],
              ]
            : [
                [-w - 35, region.id === "labuan" ? -55 : -65],
                [-w - 35, -95],
              ]
          : [
              [-w / 2, -h / 2],
              [-w / 2, -h - 15],
              [-w / 2, 16],
              [18, -h / 2],
              [-w - 18, -h / 2],
            ];
        let placed: Box | undefined;
        for (const [dx, dy] of offsets) {
          const box = { x: point.x + dx, y: point.y + dy, width: w, height: h };
          if (
            box.x < 10 ||
            box.x + w > width - 14 ||
            box.y < 78 ||
            box.y + h > height - (regionId ? 35 : 150)
          )
            continue;
          if (occupied.some((other) => intersects(box, other))) continue;
          placed = box;
          break;
        }
        el.style.visibility = placed ? "visible" : "hidden";
        const line = root.current.querySelector<SVGLineElement>(`[data-leader-id="${region.id}"]`);
        if (line) line.style.visibility = placed ? "visible" : "hidden";
        if (!placed) continue;
        occupied.push(placed);
        el.style.transform = `translate(${placed.x}px, ${placed.y}px)`;
        if (line) {
          line.setAttribute("x1", String(point.x));
          line.setAttribute("y1", String(point.y));
          line.setAttribute("x2", String(placed.x + (placed.x > point.x ? 0 : w)));
          line.setAttribute("y2", String(placed.y + h / 2));
        }
      }
    }
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    map.on("move", schedule);
    map.on("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      map.off("move", schedule);
      map.off("resize", schedule);
    };
  }, [map, isLoaded, activeId, regionId, summaries, showValues]);
  return (
    <div ref={root} className="map-label-layer" aria-label="Visible map labels">
      <svg className="territory-leaders" aria-hidden="true">
        {REGIONS.filter((r) => r.kind === "federal_territory").map((r) => (
          <line key={r.id} data-leader-id={r.id} />
        ))}
      </svg>
      {REGIONS.filter((r) => !regionId || r.id === regionId).map((r) => (
        <button
          key={r.id}
          data-label-id={r.id}
          className={`${r.kind === "federal_territory" ? "territory-callout" : "map-region-label"} map-label-${r.id} ${r.id === activeId ? "label-selected" : ""}`}
          onMouseEnter={() => onHover?.(r.id)}
          onMouseLeave={() => onHover?.(null)}
          onFocus={() => onHover?.(r.id)}
          onBlur={() => onHover?.(null)}
          onClick={() => onSelect?.(r.id)}
          aria-label={r.name}
          tabIndex={-1}
        >
          {r.kind === "federal_territory" && <span className="anchor-point" aria-hidden="true" />}
          {r.name}
          {showValues && r.kind !== "federal_territory" && (
            <small>{summaries.find((s) => s.regionId === r.id)?.value ?? "—"}</small>
          )}
        </button>
      ))}
    </div>
  );
}
