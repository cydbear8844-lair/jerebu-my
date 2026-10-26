"use client";

import { categoryFor, indexDefinition } from "@/lib/domain";
import { usePreferences } from "./preferences";

export function Category({
  value,
  scale = "MY_IPU",
  compact = false,
}: {
  value: number | null;
  scale?: string;
  compact?: boolean;
}) {
  const { lang, t } = usePreferences();
  const category = categoryFor(value, scale);
  return (
    <span
      className={`category ${compact ? "compact" : ""}`}
      style={{ "--category-color": category?.color ?? "#A4B7B7" } as React.CSSProperties}
    >
      <span className="category-square" aria-hidden="true" />
      {category ? (lang === "bm" ? category.labelBm : category.label) : t("unavailable")}
    </span>
  );
}

export function Reading({
  value,
  scale = "MY_IPU",
  size = "large",
}: {
  value: number | null;
  scale?: string;
  size?: "large" | "small";
}) {
  const category = categoryFor(value, scale);
  return (
    <span className={`reading reading-${size}`} style={{ color: category?.color ?? "#A4B7B7" }}>
      {value ?? "—"}
      <small>{indexDefinition(scale).unit}</small>
    </span>
  );
}
