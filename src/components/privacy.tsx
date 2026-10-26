"use client";

import Link from "next/link";
import { usePreferences } from "./preferences";

export function Privacy() {
  const { lang } = usePreferences();
  const bm = lang === "bm";
  return (
    <main id="main" className="prose-page privacy-page">
      <span className="section-label">JEREBU / MY</span>
      <h1>{bm ? "Privasi" : "Privacy"}</h1>
      <p className="lede">
        {bm
          ? "Cara JEREBU / MY menggunakan lokasi dan pilihan pelayar anda."
          : "How JEREBU / MY uses your location and browser preferences."}
      </p>
      <section>
        <h2>{bm ? "Pilihan dalam pelayar" : "Browser preferences"}</h2>
        <p>
          {bm
            ? "Bahasa, lokasi kegemaran dan tetapan paparan angin disimpan dalam storan setempat pelayar. Paparan peta boleh disimpan untuk sesi tab. Pilihan ini tidak memerlukan akaun dan boleh dibuang melalui tetapan data tapak dalam pelayar. Aplikasi ini tidak memasang kuki penjejakan atau perisian analitik."
            : "Language, favourites and wind display settings are kept in your browser's local storage. The map view may be saved for the tab session. These preferences require no account and can be removed through your browser's site-data settings. The application does not install tracking cookies or analytics software."}
        </p>
      </section>
      <section>
        <h2>{bm ? "Berdekatan saya" : "Near Me"}</h2>
        <p>
          {bm
            ? "Lokasi hanya diminta apabila anda memilih Berdekatan saya. Pelayar meminta kebenaran sebelum berkongsi lokasi. Koordinat digunakan dalam pelayar untuk mencari stesen layak terdekat. Aplikasi tidak menghantar koordinat lokasi anda ke pelayannya atau pembekal data, dan tidak memasukkannya dalam storan pelayar, URL atau analitik."
            : "Location is requested only when you choose Near Me. Your browser asks permission before sharing a position. Coordinates are used in the browser to find the nearest eligible station. The application does not send your position to its server or data providers, or put it in browser storage, URLs or analytics."}
        </p>
        <p>
          {bm
            ? "Anda boleh menolak atau membatalkan kebenaran melalui tetapan pelayar dan terus melayari wilayah serta stesen."
            : "You can deny or revoke permission in your browser settings and continue browsing regions and stations."}
        </p>
      </section>
      <section>
        <h2>{bm ? "Permintaan rangkaian" : "Network requests"}</h2>
        <p>
          {bm
            ? "Sempadan peta, fon dan fail pemapar peta disediakan bersama aplikasi ini. Pemerhatian kualiti udara dan angin, apabila diaktifkan, diminta oleh pelayan aplikasi daripada pembekal yang dilabelkan. Permintaan ini menggunakan lokasi pembekal atau grid cuaca, bukan kedudukan peribadi anda."
            : "Map boundaries, fonts and map-rendering files are served with this application. Air-quality and wind data, when enabled, are requested by the application server from the labelled providers. Those requests use provider locations or a weather grid, rather than your personal position."}
        </p>
        <p>
          {bm
            ? "Hos dan perkhidmatan data boleh memproses maklumat permintaan teknikal, seperti alamat IP, mengikut polisi masing-masing. Penyimpanan log bergantung pada konfigurasi hos."
            : "Hosting and data services may process technical request information, such as IP addresses, under their own policies. Log retention depends on the hosting configuration."}
        </p>
      </section>
      <section>
        <h2>{bm ? "Pautan luar dan sokongan" : "External links and support"}</h2>
        <p>
          {bm
            ? "Laman luar menggunakan polisi privasi masing-masing apabila anda mengikut pautan. Apabila tersedia, halaman sokongan menawarkan pautan PayPal dan QR Maybank yang diberikan oleh pemilik projek. PayPal atau bank anda mengendalikan pembayaran; aplikasi ini tidak membenamkan widget pembayaran, menerima butiran kad atau mengesahkan pindahan."
            : "External sites apply their own privacy policies when you follow a link. When available, the support page offers a PayPal link and Maybank QR supplied by the project owner. PayPal or your bank handles payments; this application does not embed a payment widget, receive card details or confirm transfers."}
        </p>
      </section>
      <Link href="/about#credits">{bm ? "Data & Kredit" : "Data & Credits"}</Link>
    </main>
  );
}
