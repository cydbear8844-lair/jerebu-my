"use client";

import Link from "next/link";
import type { Snapshot } from "@/lib/types";
import { SourceBanner } from "./app-header";
import { usePreferences } from "./preferences";

export function StationUnavailable({ snapshot }: { snapshot: Snapshot }) {
  const { lang, t } = usePreferences();
  return (
    <>
      <SourceBanner
        snapshot={{
          ...snapshot,
          status: "unavailable",
          message:
            lang === "en"
              ? "The requested location is unavailable in the current provider response. No synthetic data is substituted."
              : "Lokasi yang diminta tidak tersedia dalam respons pembekal semasa. Tiada data sintetik digunakan sebagai gantian.",
        }}
      />
      <main id="main" className="empty-page">
        <h1>
          {lang === "en" ? "Station observations unavailable" : "Pemerhatian stesen tidak tersedia"}
        </h1>
        <p>
          {lang === "bm" && (
            <>
              <span>Butiran pembekal:</span>{" "}
            </>
          )}
          <span lang="en">{snapshot.message}</span>
        </p>
        <Link className="button button-outline" href="/">
          {t("back")}
        </Link>
      </main>
    </>
  );
}
