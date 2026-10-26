"use client";

import { useState } from "react";
import { Bookmark, Check, Share2 } from "lucide-react";
import { usePreferences } from "./preferences";

export function LocationActions({ id }: { id: string }) {
  const { saved, toggleSaved, t } = usePreferences();
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState("");
  async function share() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setFallback("");
    } catch {
      setFallback(window.location.href);
    }
  }
  return (
    <div className="location-actions">
      <button className="button" aria-pressed={saved.includes(id)} onClick={() => toggleSaved(id)}>
        <Bookmark size={15} fill={saved.includes(id) ? "currentColor" : "none"} />
        {saved.includes(id) ? t("unsave") : t("save")}
      </button>
      <button className="button" onClick={() => void share()}>
        {copied ? <Check size={15} /> : <Share2 size={15} />}
        {copied ? t("copied") : t("share")}
      </button>
      {fallback && (
        <label className="share-fallback">
          {t("copyFallback")}
          <input
            value={fallback}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t("copyFallback")}
          />
        </label>
      )}
    </div>
  );
}
