"use client";

import { Category } from "./reading";
import { usePreferences } from "./preferences";
import { projectInfo, projectSupportHref } from "@/lib/project-info";
import { ProjectSupport } from "./project-support";
import Link from "next/link";

export function About({ supportAvailable = false }: { supportAvailable?: boolean }) {
  const { lang, t } = usePreferences();
  const bm = lang === "bm";
  return (
    <main id="main" className="prose-page">
      <span className="section-label">JEREBU / MY</span>
      <h1>{t("methodology")}</h1>
      <p className="lede">
        {bm
          ? "Terokai 13 negeri dan tiga Wilayah Persekutuan Malaysia. Sepanduk sumber membezakan pemerhatian pembekal daripada mod demo yang dilabelkan."
          : "Explore Malaysia's 13 states and three federal territories. The source banner distinguishes provider observations from explicitly labelled demo data."}
      </p>
      <section id="project">
        <h2>{bm ? "Projek dan hak cipta" : "Project and copyright"}</h2>
        {projectInfo.copyrightOwner.trim() && (
          <p>
            © {projectInfo.copyrightYear}{" "}
            <a href={projectInfo.copyrightOwnerUrl} target="_blank" rel="noreferrer">
              {projectInfo.copyrightOwner}
            </a>
            . JEREBU / MY.
          </p>
        )}
        <p>
          {bm
            ? "Notis hak cipta projek hanya meliputi bahan asal yang dimiliki oleh pemilik projek. Kod pihak ketiga, fon, ikon, sempadan peta dan data pembekal tertakluk pada lesen serta hak masing-masing."
            : "The project copyright notice covers original materials owned by the project owner. Third-party code, fonts, icons, map boundaries and provider data retain their own licences and rights."}
        </p>
        <p>
          {bm ? "JEREBU / MY percuma untuk digunakan." : "JEREBU / MY is free to use."}
          {supportAvailable &&
            projectSupportHref() &&
            (bm
              ? " Sumbangan sukarela membantu pembangunan dan kos operasi. Semua ciri teras kekal tersedia kepada semua pengguna."
              : " Optional contributions help with development and running costs. All core features remain available to everyone.")}
        </p>
        <ProjectSupport available={supportAvailable} />
      </section>
      <section>
        <h2>{bm ? "Cara ringkasan dikira" : "How summaries are calculated"}</h2>
        <p>{t("legendNote")}</p>
        <p>
          {bm
            ? "Ringkasan menggunakan paling banyak satu pemerhatian layak setiap stesen daripada sumber dan takrif indeks yang sama. Pemerhatian tidak sah, masa depan, lapuk dan tiada dikecualikan. Sifar adalah sah. Wilayah tanpa bacaan layak tidak tersedia; ia tidak dikategorikan baik."
            : "Each summary uses at most one eligible observation per station from the same source and index definition. Invalid, future, stale and missing values are excluded. Zero is valid. A region with no eligible readings is unavailable, never categorised as good."}
        </p>
        <p>
          {bm
            ? "Peraturan demo: pelaporan sejam, kelewatan penerbitan 5 minit dan tetingkap kesegaran dua jam. Peraturan ini bukan jaminan suapan rasmi. Pemerhatian dan penerbitan mesti telah berlaku pada masa ulang tayang. Jika seri, ID stesen mengikut abjad menentukan penyumbang."
            : "Demo policy: hourly observations, a five-minute publication delay and a two-hour freshness window. This is not a claim about an official feed's cadence. Observations and their publication must be known at the replay time. Ties resolve by station ID in alphabetical order."}
        </p>
      </section>
      <section>
        <h2>{t("legend")}</h2>
        <p>
          {bm
            ? "Takrif kategori daripada Jabatan Alam Sekitar Malaysia. Nilai demonstrasi menggunakan julat kategori IPU, bukan US AQI."
            : "Category definitions follow Malaysia's Department of Environment. Demonstration values use Malaysian IPU ranges, not US AQI."}
        </p>
        <table>
          <thead>
            <tr>
              <th>IPU</th>
              <th>{t("category")}</th>
            </tr>
          </thead>
          <tbody>
            {[20, 75, 150, 250, 350].map((value, index) => (
              <tr key={value}>
                <td>{["0–50", "51–100", "101–200", "201–300", ">300"][index]}</td>
                <td>
                  <Category value={value} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href="https://eqms.doe.gov.my/APIMS/main" target="_blank" rel="noreferrer">
          Department of Environment / APIMS
        </a>
      </section>
      <section id="history">
        <h2>{bm ? "Sejarah, masa dan liputan" : "History, time and coverage"}</h2>
        <p>
          {bm
            ? "Sejarah dan ulang tayang tersedia dalam mod demo sahaja. Mod langsung memaparkan pemerhatian terkini."
            : "History and replay are available in demo mode only. Live mode shows latest observations."}
        </p>
        <p>
          {bm
            ? "UTC digunakan secara dalaman. Semua masa paparan ialah Asia/Kuala_Lumpur (MYT, UTC+8). Carta mengekalkan stesen yang dipilih apabila tempoh berubah. Jurang kekal sebagai jurang; tiada interpolasi, pelicinan atau data masa depan."
            : "UTC is used internally. Displayed times are Asia/Kuala_Lumpur (MYT, UTC+8). Charts keep the selected station fixed as the range changes. Gaps remain gaps; no interpolation, smoothing or future backfill is used."}
        </p>
        <p>
          {bm
            ? "Peta sejarah memaparkan pemerhatian yang layak pada masa dipilih. Liputan yang berkurang boleh menurunkan maksimum wilayah tanpa menunjukkan kualiti udara yang bertambah baik."
            : "Historical maps select observations eligible at the chosen time. Reduced station coverage can lower a regional maximum without demonstrating improved air quality."}
        </p>
      </section>
      <section id="credits">
        <h2>{bm ? "Geografi dan atribusi" : "Geography and attribution"}</h2>
        <p>
          geoBoundaries MYS ADM1 (MYS-ADM1-15666254), OpenStreetMap / Wambacher.{" "}
          {bm
            ? "Sempadan mewakili tahun 2017; versi sumber 19 Januari 2023. Semua 16 bentuk, pulau dan lubang wilayah dikekalkan. Sempadan ini untuk penerokaan, bukan tinjauan undang-undang."
            : "Boundaries represent 2017; source revision January 19, 2023. All 16 features, islands and territory holes are preserved. These boundaries are for exploration, not a legal survey."}
        </p>
        <p>
          ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap contributors
          </a>{" "}
          ·{" "}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noreferrer">
            ODbL 1.0
          </a>{" "}
          ·{" "}
          <a href="/data/malaysia-regions.geojson" download>
            {bm ? "Data sempadan terbitan" : "Derived boundary dataset"}
          </a>
          .
        </p>
        <p>
          {bm
            ? "Peta dibina dengan mapcn dan MapLibre GL JS. Fon Barlow Condensed dan IBM Plex Sans berlesen SIL OFL. Identiti visual asal diinspirasikan oleh suasana pemilihan wilayah Carbon; tiada logo, muzik atau aset permainan digunakan."
            : "The map uses mapcn and MapLibre GL JS. Barlow Condensed and IBM Plex Sans are SIL OFL fonts. Original visuals draw on Carbon's territory-selection atmosphere; no game logos, music or artwork are used."}
        </p>
        <ul>
          {[
            ["mapcn · MIT", "mapcn-MIT.txt"],
            ["MapLibre GL JS · BSD-3-Clause", "maplibre-BSD.txt"],
            ["Barlow Condensed · SIL OFL 1.1", "barlow-condensed-OFL.txt"],
            ["IBM Plex Sans · SIL OFL 1.1", "ibm-plex-sans-OFL.txt"],
            ["Lucide icons · ISC / MIT notices", "lucide-LICENSE.txt"],
          ].map(([name, file]) => (
            <li key={file}>
              <a href={`/licenses/${file}`}>{name}</a>
            </li>
          ))}
        </ul>
        <p>
          {bm
            ? "Lapisan angin pilihan menggunakan medan demo sintetik atau ECMWF melalui Open-Meteo, seperti yang dilabelkan pada peta. Sumber, masa sah dan resolusi pensampelan dipaparkan bersama lapisan."
            : "The optional wind layer uses synthetic demo fields or ECMWF through Open-Meteo, as labelled on the map. Its source, valid time and sampling resolution are shown with the layer."}{" "}
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
            Open-Meteo
          </a>
          {" · "}
          <a href="https://www.ecmwf.int/" target="_blank" rel="noreferrer">
            ECMWF
          </a>
          {" · "}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
            CC BY 4.0
          </a>
          .
        </p>
      </section>
      <section>
        <h2>{bm ? "Sumber langsung dan privasi" : "Live sources and privacy"}</h2>
        <p>
          {bm
            ? "Laluan pemerhatian WAQI memerlukan kunci pelayan sendiri. AQI WAQI berasaskan US EPA, bukan IPU Malaysia. Data pembekal belum disahkan dan lokasi pembekal tidak semestinya stesen fizikal. Tiada arkib langsung atau pengumpul sejarah diaktifkan. DOE menerbitkan terma data terbuka; kontrak suapan IPU masih diperlukan."
            : "The WAQI observation path requires a server-side account key. WAQI AQI is US-EPA-based, distinct from Malaysian IPU. Provider data is unvalidated and provider locations are not automatically verified physical stations. No live archive or history collector is enabled. DOE publishes open-data reuse terms; a working IPU feed contract is still needed."}{" "}
          <a href="https://aqicn.org/api/" target="_blank" rel="noreferrer">
            WAQI API terms
          </a>
          .
        </p>
        <p>
          <Link href="/privacy">
            {bm ? "Baca maklumat privasi" : "Read the privacy information"}
          </Link>
        </p>
        <p>
          {bm
            ? "Bahasa dan lokasi kegemaran disimpan dalam pelayar. Geolokasi hanya diminta selepas tindakan pengguna dan tidak disimpan. Tiada akaun diperlukan."
            : "Language and favourites are saved in your browser. Geolocation is requested only after your action and is not persisted. No account is required."}
        </p>
      </section>
    </main>
  );
}
