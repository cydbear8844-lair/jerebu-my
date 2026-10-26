"use client";

import Link from "next/link";
import { usePreferences } from "@/components/preferences";

export default function ErrorPage({ retry }: { retry: () => void }) {
  const { lang, t } = usePreferences();
  return (
    <main id="main" className="empty-page">
      <h1>
        {lang === "en" ? "The dashboard could not load." : "Papan pemuka tidak dapat dimuatkan."}
      </h1>
      <p>
        {lang === "en"
          ? "Check your connection and try again. No substitute readings have been inserted."
          : "Semak sambungan anda dan cuba lagi. Tiada bacaan gantian dimasukkan."}
      </p>
      <button className="button button-primary" onClick={retry}>
        {lang === "en" ? "Try again" : "Cuba lagi"}
      </button>
      <Link className="button" href="/">
        {t("back")}
      </Link>
    </main>
  );
}
