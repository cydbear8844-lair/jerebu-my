"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Bookmark, Globe2, Map, SlidersHorizontal } from "lucide-react";
import { usePreferences } from "./preferences";
import type { Snapshot } from "@/lib/types";
import { formatMYT } from "@/lib/domain";

export function AppHeader({ snapshot }: { snapshot: Snapshot }) {
  const { lang, t, setLanguage, saved } = usePreferences();
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = lang === "bm" ? "ms" : "en";
  }, [lang]);
  return (
    <>
      <a href="#main" className="skip-link">
        {lang === "en" ? "Skip to content" : "Langkau ke kandungan"}
      </a>
      <header className="app-header">
        <Link prefetch={false} href="/" className="brand" aria-label="JEREBU / MY home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            JEREBU<span className="brand-slash"> / </span>
            <span className="brand-country">MY</span>
          </span>
        </Link>
        <nav
          className="header-nav"
          aria-label={lang === "en" ? "Main navigation" : "Navigasi utama"}
        >
          <Link prefetch={false} className={pathname === "/" ? "active" : ""} href="/">
            <Map size={15} />
            {t("overview")}
          </Link>
          <Link prefetch={false} className={pathname === "/about" ? "active" : ""} href="/about">
            <SlidersHorizontal size={15} />
            {t("methodology")}
          </Link>
        </nav>
        <div className="header-tools">
          <Link prefetch={false} className="saved-link" href="/saved">
            <Bookmark size={16} />
            <span>{t("saved")}</span>
            <b>{saved.length.toString().padStart(2, "0")}</b>
          </Link>
          <div className="language-switch" aria-label="Language / Bahasa">
            <Globe2 size={14} />
            <button aria-pressed={lang === "en"} onClick={() => setLanguage("en")}>
              EN
            </button>
            <span>/</span>
            <button aria-pressed={lang === "bm"} onClick={() => setLanguage("bm")}>
              BM
            </button>
          </div>
        </div>
      </header>
      {!(snapshot.mode === "live" && pathname.startsWith("/station/")) && (
        <SourceBanner snapshot={snapshot} />
      )}
    </>
  );
}

export function SourceBanner({ snapshot }: { snapshot: Snapshot }) {
  const { mode, status } = snapshot;
  const { lang, t } = usePreferences();
  return (
    <>
      <div
        data-source-id={snapshot.sourceId}
        data-retrieved-at={snapshot.asOf}
        className={mode === "demo" ? "data-banner" : "data-banner source-unavailable"}
        role="status"
      >
        <strong>
          {mode === "demo" ? t("demo") : status === "available" ? "WAQI · AQI" : t("noLive")}
        </strong>
        <span>
          {mode === "demo"
            ? t("demoNote")
            : status === "available"
              ? lang === "en"
                ? `Latest observations · retrieved ${formatMYT(snapshot.asOf)} MYT · provider-reported, unvalidated`
                : `Pemerhatian terkini · diperoleh ${formatMYT(snapshot.asOf)} MYT · laporan pembekal, belum disahkan`
              : snapshot.message}
        </span>
        <Link prefetch={false} href="/about">
          {t("sources")} <span aria-hidden="true">↗</span>
        </Link>
      </div>
      {mode === "live" && status === "available" && (
        <div className="provider-attribution">
          <span>{lang === "en" ? "Data attribution:" : "Atribusi data:"}</span>{" "}
          {(snapshot.attribution ?? []).map((source, index) => (
            <span key={`${source.url}-${index}`}>
              {index > 0 && " · "}
              {source.url ? (
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.name}
                </a>
              ) : (
                source.name
              )}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
