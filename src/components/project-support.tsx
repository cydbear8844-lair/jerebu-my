"use client";

import { ArrowUpRight, Coffee } from "lucide-react";
import Link from "next/link";
import { projectSupportHref } from "@/lib/project-info";
import { usePreferences } from "./preferences";

export function ProjectSupport({ available = false }: { available?: boolean }) {
  const { lang } = usePreferences();
  const href = projectSupportHref();
  if (!available || !href) return null;
  return (
    <Link className="project-support" href="/support" prefetch={false}>
      <Coffee size={16} aria-hidden="true" />
      {lang === "bm" ? "Sokong projek ini" : "Support this project"}
      <ArrowUpRight size={14} aria-hidden="true" />
    </Link>
  );
}
