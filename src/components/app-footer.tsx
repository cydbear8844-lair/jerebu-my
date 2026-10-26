"use client";

import Link from "next/link";
import { usePreferences } from "./preferences";
import { projectInfo } from "@/lib/project-info";
import { ProjectSupport } from "./project-support";

export function AppFooter({ supportAvailable = false }: { supportAvailable?: boolean }) {
  const { lang } = usePreferences();
  return (
    <footer className="app-footer">
      <div className="footer-project">
        <span className="footer-brand">JEREBU / MY</span>
        <span>
          {lang === "en" ? "Malaysia air-quality explorer" : "Peneroka kualiti udara Malaysia"}
        </span>
        {projectInfo.copyrightOwner.trim() && (
          <small className="footer-copyright">
            © {projectInfo.copyrightYear}{" "}
            <a href={projectInfo.copyrightOwnerUrl} target="_blank" rel="noreferrer">
              {projectInfo.copyrightOwner}
            </a>
            . JEREBU / MY.
          </small>
        )}
      </div>
      <nav
        className="footer-links"
        aria-label={lang === "en" ? "Project information" : "Maklumat projek"}
      >
        <Link prefetch={false} href="/about">
          {lang === "en" ? "About" : "Tentang"}
        </Link>
        <Link prefetch={false} href="/about#credits">
          {lang === "en" ? "Data & Credits" : "Data & Kredit"}
        </Link>
        <Link prefetch={false} href="/privacy">
          {lang === "en" ? "Privacy" : "Privasi"}
        </Link>
        <ProjectSupport available={supportAvailable} />
      </nav>
      <p className="footer-attribution">
        {lang === "en" ? "Boundary data © " : "Data sempadan © "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          {lang === "bm" ? "penyumbang OpenStreetMap" : "OpenStreetMap contributors"}
        </a>
        {" · "}
        <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">
          ODbL 1.0
        </a>
        {" · geoBoundaries"}
      </p>
    </footer>
  );
}
