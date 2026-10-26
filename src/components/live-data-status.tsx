"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import type { Snapshot } from "@/lib/types";
import { formatMYT, indexDefinition } from "@/lib/domain";
import { usePreferences } from "./preferences";

export function CurrentObservationsNote() {
  const { lang } = usePreferences();
  return (
    <p className="history-availability">
      {lang === "en" ? "Current observations only." : "Pemerhatian terkini sahaja."}{" "}
      <Link href="/about#history" prefetch={false}>
        {lang === "en" ? "History & coverage" : "Sejarah & liputan"}
      </Link>
    </p>
  );
}

export function LiveDataStatus({ snapshot }: { snapshot: Snapshot }) {
  const { lang } = usePreferences();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section
      className="live-data-status panel"
      aria-label={lang === "en" ? "Observation source" : "Sumber pemerhatian"}
    >
      <div>
        <strong>{indexDefinition(snapshot.indexScale).label}</strong>
        <p>
          {lang === "en" ? "Retrieved" : "Diperoleh"}: {formatMYT(snapshot.asOf)} MYT
        </p>
        <p>
          {lang === "en"
            ? "Provider locations; physical monitoring-site identity is not independently verified. Freshness uses an application policy of two hours, not a provider cadence guarantee."
            : "Lokasi pembekal; identiti stesen fizikal belum disahkan secara bebas. Polisi aplikasi menggunakan tetingkap kesegaran dua jam, bukan jaminan jadual pembekal."}
        </p>
        {snapshot.coverage && (
          <p>
            {lang === "en" ? "Coverage" : "Liputan"}: {snapshot.stations.length} /{" "}
            {snapshot.coverage.discovered}{" "}
            {lang === "en"
              ? "discovered locations included. Missing regions remain unavailable; coverage is not nationwide certification."
              : "lokasi ditemui disertakan. Wilayah tanpa bacaan kekal tidak tersedia."}
          </p>
        )}
      </div>
      <button
        className="button button-outline"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw size={16} className={pending ? "is-refreshing" : undefined} aria-hidden="true" />
        {pending
          ? lang === "en"
            ? "Requesting observations…"
            : "Meminta pemerhatian…"
          : lang === "en"
            ? "Refresh observations"
            : "Muat semula pemerhatian"}
      </button>
      <CurrentObservationsNote />
    </section>
  );
}
