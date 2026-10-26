"use client";

import { useEffect, useState, type ReactNode } from "react";

export function RegionInformation({
  regionId,
  children,
}: {
  regionId?: string;
  children: ReactNode;
}) {
  const [retained, setRetained] = useState({ id: regionId, content: children });
  if (regionId && regionId !== retained.id) setRetained({ id: regionId, content: children });
  useEffect(() => {
    if (regionId || !retained.id) return;
    const timer = setTimeout(
      () => setRetained({ id: undefined, content: null }),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350,
    );
    return () => clearTimeout(timer);
  }, [regionId, retained.id]);
  if (!retained.id) return null;
  return (
    <div
      key={retained.id}
      className={`region-information ${regionId ? "" : "is-exiting"}`}
      inert={!regionId}
      aria-hidden={!regionId}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && !regionId)
          setRetained({ id: undefined, content: null });
      }}
    >
      {retained.content}
    </div>
  );
}
