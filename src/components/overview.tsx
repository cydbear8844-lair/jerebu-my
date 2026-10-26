"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowUpRight, Bookmark, Search, SlidersHorizontal } from "lucide-react";
import { REGIONS, getRegion } from "@/lib/regions";
import { categoryFor, formatMYT, observationStatus, indexDefinition } from "@/lib/domain";
import type { Snapshot } from "@/lib/types";
import { usePreferences } from "./preferences";
import { Category, Reading } from "./reading";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { WorkspaceSnapshot } from "./workspace-snapshot";
import { useSnapshotPlayback } from "@/lib/playback";
import { PlaybackTimeline } from "./playback-timeline";
import { useNearMe, NearMeButton, NearMeCard } from "./near-me";
import { RegionInformation } from "./region-information";
import { LiveDataStatus } from "./live-data-status";
import { WindControls, useWind } from "./wind/controls";

const MalaysiaMap = dynamic(() => import("./malaysia-map").then((m) => m.MalaysiaMap), {
  ssr: false,
  loading: () => <div className="map-shell map-loading">Loading map…</div>,
});

export function Overview({
  initial,
  regionId,
  children,
}: {
  initial: Snapshot;
  regionId?: string;
  children?: ReactNode;
}) {
  const playback = useSnapshotPlayback(initial);
  const snapshot = initial.mode === "demo" ? playback.snapshot : initial;
  const wind = useWind(snapshot.asOf, snapshot.mode === "demo", playback.busy);
  const index = indexDefinition(snapshot.indexScale);
  const location = useNearMe(snapshot);
  const [search, setSearch] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ id: string; path: string } | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const trigger = useRef<HTMLElement | null>(null);
  const triggerPath = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const selected = selection?.path === pathname ? selection.id : null;
  if (selection && selection.path !== pathname) setSelection(null);
  const { t, lang, saved, toggleSaved } = usePreferences();
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const previewId = selected ?? hovered;
  const previewRegion = previewId ? getRegion(previewId) : null;
  const previewSummary = snapshot.summaries.find((s) => s.regionId === previewId);
  const highest = [...snapshot.summaries]
    .filter((s) => s.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))[0];
  const fresh = snapshot.summaries.reduce((total, summary) => total + summary.freshCount, 0);
  const noFresh = snapshot.summaries.filter((summary) => summary.freshCount === 0).length;
  const regions = REGIONS.filter(
    (r) =>
      `${r.name} ${r.nameBm}`.toLowerCase().includes(search.toLowerCase()) &&
      (!savedOnly || saved.includes(r.id)),
  );

  function selectRegion(id: string, event?: React.MouseEvent) {
    if (window.matchMedia("(max-width: 700px)").matches) {
      event?.preventDefault();
      location.cancel();
      trigger.current = document.activeElement as HTMLElement;
      triggerPath.current = pathname;
      setSelection({ id, path: pathname });
    } else {
      event?.preventDefault();
      openRegion(id);
    }
  }
  function openRegion(id: string) {
    playback.pause();
    location.cancel();
    setPendingRegion(id);
    setHovered(null);
    router.push(`/region/${id}`, { scroll: false });
  }
  const pause = playback.pause;
  const cancelPlayback = playback.cancelPending;
  const cancelLocation = location.cancel;
  useEffect(() => {
    const frame = requestAnimationFrame(() => setPendingRegion(null));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
  useEffect(() => {
    pause();
    cancelPlayback();
    cancelLocation();
  }, [pathname, pause, cancelPlayback, cancelLocation]);
  useEffect(() => {
    cancelLocation();
  }, [snapshot.asOf, cancelLocation]);

  const preview = previewRegion && (
    <>
      <span className="section-label">{t(previewRegion.kind)}</span>
      <h2>{lang === "bm" ? previewRegion.nameBm : previewRegion.name}</h2>
      <div className="preview-reading">
        <Reading value={previewSummary?.value ?? null} scale={snapshot.indexScale} />
        <Category value={previewSummary?.value ?? null} scale={snapshot.indexScale} />
      </div>
      <p className="preview-contributor">{previewSummary?.contributor?.name ?? t("noEligible")}</p>
      <dl className="compact-dl">
        <div>
          <dt>{t("coverage")}</dt>
          <dd>
            {previewSummary?.freshCount ?? 0} / {previewSummary?.stationCount ?? "?"}
          </dd>
        </div>
        <div>
          <dt>{t("observation")}</dt>
          <dd>
            {previewSummary?.contributorObservedAt
              ? formatMYT(previewSummary.contributorObservedAt)
              : "—"}
          </dd>
        </div>
      </dl>
      <span className="source-caption">
        {snapshot.sourceId} · {index.label} ·{" "}
        {previewSummary?.status === "stale"
          ? t("stale")
          : previewSummary?.status === "invalid"
            ? t("invalid")
            : previewSummary?.status === "missing"
              ? t("missing")
              : t(snapshot.mode === "demo" ? "snapshot" : "sourceSnapshot")}
      </span>
    </>
  );

  return (
    <WorkspaceSnapshot.Provider value={snapshot}>
      <main
        id={pathname === "/" || regionId ? "main" : undefined}
        className={`overview-page ${regionId ? "region-is-open" : ""}`}
        data-snapshot-at={snapshot.asOf}
      >
        <section className="overview-heading">
          <div>
            <div className="heading-kicker">
              JEREBU / MY <span>01 — 16</span>
            </div>
            {regionId ? <h2>{t("title")}</h2> : <h1>{t("title")}</h1>}
            <p>{t("subtitle")}</p>
          </div>
          <div className="snapshot-stamp">
            <span>
              {snapshot.mode !== "demo"
                ? snapshot.status === "available"
                  ? lang === "en"
                    ? "Latest observations"
                    : "Pemerhatian terkini"
                  : t("noLive")
                : snapshot.asOf !== initial.asOf
                  ? t("historical")
                  : t("snapshot")}
            </span>
            <strong>{formatMYT(snapshot.asOf)} MYT</strong>
            {snapshot.mode === "demo" && <small>{t("demoClock")}</small>}
          </div>
        </section>
        {snapshot.status !== "available" && (
          <div className="notice" role="status">
            {snapshot.message} <Link href="/about">{t("sources")}</Link>
          </div>
        )}
        <div className="national-strip">
          <div>
            <span>{t("reporting")}</span>
            <strong>
              {fresh}
              <small> / {snapshot.stations.length || "?"}</small>
            </strong>
          </div>
          <div className="highest-summary">
            <span>{t("highest")}</span>
            <div className="highest-summary-body">
              <strong style={{ color: categoryFor(highest?.value, snapshot.indexScale)?.color }}>
                {highest?.value ?? "—"}
                <small> {index.unit}</small>
              </strong>
              <div>
                <Category value={highest?.value ?? null} scale={snapshot.indexScale} />
                <span>{getRegion(highest?.regionId ?? "")?.name ?? t("unavailable")}</span>
              </div>
            </div>
            <span>
              {highest?.contributor?.name} ·{" "}
              {highest?.contributorObservedAt
                ? `${formatMYT(highest.contributorObservedAt)} MYT`
                : "—"}
            </span>
          </div>
          <div>
            <span>{t("noFresh")}</span>
            <strong>
              {noFresh}
              <small> / 16</small>
            </strong>
          </div>
          <NearMeButton
            controller={location}
            onBeforeLocate={() => {
              playback.cancelPending();
              setView("map");
              if (window.matchMedia("(max-width: 700px)").matches) {
                requestAnimationFrame(() =>
                  document.querySelector(".map-stage")?.scrollIntoView({
                    block: "start",
                    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
                      ? "instant"
                      : "smooth",
                  }),
                );
              }
            }}
          />
        </div>
        <div className="mobile-view-switch">
          <button aria-pressed={view === "map"} onClick={() => setView("map")}>
            {t("map")}
          </button>
          <button aria-pressed={view === "list"} onClick={() => setView("list")}>
            {t("list")} · 16
          </button>
        </div>
        <section className={`overview-workspace mobile-${view}`}>
          <aside className="region-rail" id="region-list" aria-label={t("regions")}>
            <div className="rail-heading">
              <h2>
                {t("regions")} <span>16</span>
              </h2>
              <button
                className="icon-button"
                onClick={() => setSavedOnly(!savedOnly)}
                aria-pressed={savedOnly}
                aria-label={savedOnly ? t("all") : t("saved")}
              >
                <Bookmark size={16} fill={savedOnly ? "currentColor" : "none"} />
              </button>
            </div>
            <div className="search-field">
              <Search size={15} />
              <input
                aria-label={t("searchRegions")}
                placeholder={t("searchRegions")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="rail-column-label">
              <span>{t("state")} / W.P.</span>
              <span>{index.unit}</span>
            </div>
            <div className="region-list">
              {regions.map((region) => {
                const summary = snapshot.summaries.find((s) => s.regionId === region.id);
                const category = categoryFor(summary?.value ?? null, snapshot.indexScale);
                return (
                  <Link
                    prefetch={false}
                    key={region.id}
                    href={`/region/${region.slug}`}
                    onClick={(e) => selectRegion(region.id, e)}
                    onMouseEnter={() => setHovered(region.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(region.id)}
                    onBlur={() => setHovered(null)}
                    className={`region-row ${previewId === region.id ? "highlighted" : ""}`}
                    aria-current={regionId === region.id ? "page" : undefined}
                  >
                    <span
                      className="row-category"
                      style={{ background: category?.color ?? "#708084" }}
                      aria-hidden="true"
                    />
                    <span className="region-row-name">
                      {lang === "bm" ? region.nameBm : region.name}
                      {region.kind === "federal_territory" && <small>W.P.</small>}
                      {!summary?.freshCount && (
                        <small className="region-status">
                          {summary?.status === "stale"
                            ? t("stale")
                            : summary?.status === "invalid"
                              ? t("invalid")
                              : snapshot.mode === "demo"
                                ? t("missing")
                                : t("unavailable")}
                        </small>
                      )}
                    </span>
                    <span className="row-value" style={{ color: category?.color ?? "#A4B7B7" }}>
                      {summary?.value ?? "—"}
                    </span>
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                );
              })}
              {regions.length === 0 && <p className="rail-empty">{t("noRegions")}</p>}
            </div>
            <div className="rail-foot">
              <SlidersHorizontal size={13} />
              <span>
                {lang === "en"
                  ? "Highest fresh station per region"
                  : "Stesen terkini tertinggi setiap wilayah"}
              </span>
            </div>
          </aside>
          <div className="map-column">
            <WindControls wind={wind} />
            <div className="map-stage">
              <MalaysiaMap
                indexScale={snapshot.indexScale}
                regionId={regionId}
                summaries={snapshot.summaries}
                highlightedId={regionId ?? previewId ?? pendingRegion}
                stations={regionId ? snapshot.stations.filter((s) => s.regionId === regionId) : []}
                location={location}
                wind={wind}
                onHover={setHovered}
                onSelect={selectRegion}
                onRequestList={() => {
                  setView("list");
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLInputElement>("#region-list input")?.focus(),
                  );
                }}
              />
              {!regionId && (
                <div className="map-intro">
                  <span className="section-label">{t("choose")}</span>
                  <p>{t("explore")}</p>
                </div>
              )}
              <NearMeCard controller={location} />
              {previewId && !regionId && (
                <aside className="map-preview" aria-label={t("preview")}>
                  {preview}
                </aside>
              )}
              <div className="map-legend" hidden={wind.preferences.mode === "wind"}>
                <h3>
                  {snapshot.indexScale === "MY_IPU" ? t("legend") : index.label}{" "}
                  <span>
                    {index.unit} · {t("reporting")}
                  </span>
                </h3>
                <div className="legend-categories">
                  {index.samples.map((value, band) => (
                    <div key={value}>
                      <Category value={value} scale={snapshot.indexScale} compact />
                      <small>
                        {index.thresholds[band]}{" "}
                        <b>
                          {" "}
                          stations ·{" "}
                          {
                            snapshot.observations.filter(
                              (o) =>
                                observationStatus(o, snapshot.asOf) === "fresh" &&
                                categoryFor(o.value, snapshot.indexScale)?.id ===
                                  categoryFor(value, snapshot.indexScale)?.id,
                            ).length
                          }
                        </b>
                      </small>
                    </div>
                  ))}
                  <div>
                    <Category value={null} compact />
                    <small>—</small>
                  </div>
                </div>
              </div>
            </div>
            <p className="legend-methodology">
              {wind.preferences.mode === "wind"
                ? lang === "bm"
                  ? "Warna angin menunjukkan km/j. Bacaan kualiti udara kekal dalam senarai wilayah."
                  : "Wind colours show km/h. Air-quality readings remain in the region list."
                : t("legendNote")}
              {wind.preferences.mode === "combined" &&
                (lang === "bm"
                  ? " Warna angin menunjukkan kelajuan (km/j)."
                  : " Wind colours show speed (km/h).")}
            </p>
          </div>
          <RegionInformation regionId={regionId}>{children}</RegionInformation>
        </section>
        {snapshot.mode === "demo" ? (
          <PlaybackTimeline playback={playback} />
        ) : (
          <LiveDataStatus snapshot={snapshot} />
        )}
        <Dialog
          open={selected !== null}
          onOpenChange={(open) => {
            if (!open) setSelection(null);
          }}
        >
          <DialogContent
            className="region-sheet"
            closeLabel={t("close")}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (
                triggerPath.current === pathname &&
                trigger.current?.isConnected &&
                !trigger.current.closest("[hidden]")
              )
                trigger.current.focus();
            }}
          >
            <DialogTitle className="sr-only">
              {t("preview")} — {previewRegion?.name}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("legendNote")}</DialogDescription>
            {preview}
            <div className="sheet-actions">
              <button className="button" onClick={() => selected && toggleSaved(selected)}>
                <Bookmark size={16} />
                {selected && saved.includes(selected) ? t("unsave") : t("save")}
              </button>
              <Link
                href={`/region/${selected ?? ""}`}
                className="button button-primary"
                onClick={(e) => {
                  e.preventDefault();
                  if (selected) openRegion(selected);
                  setSelection(null);
                  setView("map");
                }}
              >
                {t("open")}
                <ArrowUpRight size={16} />
              </Link>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </WorkspaceSnapshot.Provider>
  );
}
