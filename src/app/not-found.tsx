"use client";

import Link from "next/link";
import { usePreferences } from "@/components/preferences";

export default function NotFound() {
  const { lang, t } = usePreferences();
  return (
    <main id="main" className="empty-page">
      <span className="section-label">
        {lang === "en" ? "404 / LOCATION NOT FOUND" : "404 / LOKASI TIDAK DITEMUI"}
      </span>
      <h1>
        {lang === "en" ? "That location is not on this map." : "Lokasi itu tiada pada peta ini."}
      </h1>
      <p>
        {lang === "en"
          ? "Choose one of Malaysia's 16 regions or return to the overview."
          : "Pilih salah satu daripada 16 wilayah Malaysia atau kembali ke gambaran keseluruhan."}
      </p>
      <Link className="button button-primary" href="/">
        {t("back")}
      </Link>
    </main>
  );
}
