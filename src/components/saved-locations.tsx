"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import { REGIONS } from "@/lib/regions";
import type { Station } from "@/lib/types";
import { usePreferences } from "./preferences";

export function SavedLocations({ stations }: { stations: Station[] }) {
  const { t, lang, saved, toggleSaved } = usePreferences();
  const catalogue = [
    ...REGIONS.map((r) => ({
      id: r.id,
      name: lang === "bm" ? r.nameBm : r.name,
      href: `/region/${r.slug}`,
      kind: t(r.kind),
    })),
    ...stations.map((s) => ({
      id: s.id,
      name: s.name,
      href: `/station/${s.id}`,
      kind: t("station"),
    })),
  ];
  const locations = [...new Set(saved)].map(
    (id) =>
      catalogue.find((item) => item.id === id) ?? {
        id,
        name: id,
        href: `/station/${encodeURIComponent(id)}`,
        kind:
          lang === "en"
            ? "Unavailable in the current station catalogue"
            : "Tiada dalam katalog stesen semasa",
      },
  );
  return (
    <main id="main" className="detail-page">
      <header className="location-heading">
        <div>
          <span className="section-label">JEREBU / MY</span>
          <h1>{t("saved")}</h1>
          <p>
            {lang === "en"
              ? "Your locations, stored in this browser."
              : "Lokasi anda, disimpan dalam pelayar ini."}
          </p>
        </div>
        <Link href="/" className="button">
          {t("back")}
        </Link>
      </header>
      <div className="saved-list">
        {locations.map((location) => (
          <div className="saved-item" key={location.id}>
            <Link href={location.href}>
              <strong>{location.name}</strong>
              <span>{location.kind}</span>
            </Link>
            <button
              className="icon-button"
              aria-label={`${t("unsave")}: ${location.name}`}
              onClick={() => toggleSaved(location.id)}
            >
              <Bookmark size={18} fill="currentColor" />
            </button>
          </div>
        ))}
        {locations.length === 0 && <p className="empty-state panel">{t("noFavourites")}</p>}
      </div>
    </main>
  );
}
