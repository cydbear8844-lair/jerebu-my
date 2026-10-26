"use client";

import { useSyncExternalStore } from "react";
import { dictionary, type Language, type TranslationKey } from "@/lib/i18n";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("jerebu-preferences", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("jerebu-preferences", callback);
  };
}

function read(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences are optional in private or restricted storage. */
  }
  window.dispatchEvent(new Event("jerebu-preferences"));
}

export function usePreferences() {
  const storedLanguage = useSyncExternalStore(
    subscribe,
    () => read("jerebu-language", "en"),
    () => "en",
  );
  const storedSaved = useSyncExternalStore(
    subscribe,
    () => read("jerebu-saved", "[]"),
    () => "[]",
  );
  const lang: Language = storedLanguage === "bm" ? "bm" : "en";
  let saved: string[] = [];
  try {
    const parsed: unknown = JSON.parse(storedSaved);
    if (Array.isArray(parsed))
      saved = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    /* Ignore malformed browser preferences. */
  }
  return {
    lang,
    saved,
    t: (key: TranslationKey) => dictionary[lang][key],
    setLanguage: (value: Language) => write("jerebu-language", value),
    toggleSaved: (id: string) =>
      write(
        "jerebu-saved",
        JSON.stringify(saved.includes(id) ? saved.filter((value) => value !== id) : [...saved, id]),
      ),
  };
}
