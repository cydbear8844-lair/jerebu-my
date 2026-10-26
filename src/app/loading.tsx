"use client";

import { usePreferences } from "@/components/preferences";

export default function Loading() {
  const { lang } = usePreferences();
  return (
    <main id="main" className="empty-page" role="status">
      <h1>{lang === "en" ? "Loading dashboard…" : "Memuatkan papan pemuka…"}</h1>
      <p>
        {lang === "en"
          ? "Preparing regional observations and geography."
          : "Menyediakan pemerhatian wilayah dan geografi."}
      </p>
    </main>
  );
}
