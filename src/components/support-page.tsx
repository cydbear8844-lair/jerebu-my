"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Download } from "lucide-react";
import { projectInfo, projectSupportHref } from "@/lib/project-info";
import { usePreferences } from "./preferences";
import "./support.css";

export function SupportPage({ available }: { available: boolean }) {
  const { lang } = usePreferences();
  const bm = lang === "bm";
  const paypal = available ? projectSupportHref() : null;
  return (
    <main id="main" className="support-page">
      <Link className="back-link" href="/">
        <ArrowLeft size={16} aria-hidden="true" />
        {bm ? "Kembali ke peta" : "Back to the map"}
      </Link>
      <header className="support-heading">
        <span className="section-label">JEREBU / MY</span>
        <h1>{bm ? "Sokong projek ini" : "Support this project"}</h1>
        <p>
          {bm
            ? "JEREBU / MY percuma untuk digunakan. Sumbangan sukarela membantu pembangunan dan kos operasi. Semua ciri teras kekal tersedia kepada semua pengguna."
            : "JEREBU / MY is free to use. Optional contributions help with development and running costs. All core features remain available to everyone."}
        </p>
      </header>
      {!paypal ? (
        <p className="support-unavailable" role="status">
          {bm ? "Sokongan tidak tersedia buat masa ini." : "Support is not available right now."}
        </p>
      ) : (
        <>
          <div className="support-methods">
            <section className="support-method" aria-labelledby="paypal-title">
              <div className="support-method-heading">
                <span className="section-label">01 / PAYPAL</span>
                <h2 id="paypal-title">CydBear</h2>
                <p>PayPal.Me / CydBear</p>
              </div>
              <div className="support-qr-frame">
                <svg
                  role="img"
                  aria-label={
                    bm
                      ? "Kod QR PayPal yang diberikan oleh pemilik projek"
                      : "PayPal QR code supplied by the project owner"
                  }
                  viewBox="60 60 480 480"
                >
                  <image
                    href={projectInfo.paypalQrImage}
                    width="600"
                    height="600"
                    aria-hidden="true"
                  />
                </svg>
              </div>
              <div className="support-method-actions">
                <a
                  className="button support-paypal-link"
                  href={paypal}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                >
                  {bm ? "Buka PayPal" : "Open PayPal"}
                  <ArrowUpRight size={16} aria-hidden="true" />
                  <span className="sr-only">{bm ? "(tab baharu)" : "(new tab)"}</span>
                </a>
                <a
                  className="support-download"
                  href={projectInfo.paypalQrImage}
                  download="jerebu-my-paypal-qr.png"
                >
                  <Download size={15} aria-hidden="true" />
                  {bm ? "Simpan QR" : "Save QR image"}
                </a>
              </div>
            </section>
            <section className="support-method" aria-labelledby="maybank-title">
              <div className="support-method-heading">
                <span className="section-label">02 / MAYBANK QR</span>
                <h2 id="maybank-title">{bm ? "Pindahan bank" : "Bank transfer"}</h2>
                <p>{projectInfo.maybankRecipient}</p>
              </div>
              <div className="support-qr-frame">
                <svg
                  role="img"
                  aria-label={
                    bm
                      ? "Kod QR Maybank untuk Muhammad Faez Bin Sukri"
                      : "Maybank QR code for Muhammad Faez Bin Sukri"
                  }
                  viewBox="370 315 580 580"
                >
                  <image
                    href={projectInfo.maybankQrImage}
                    width="1320"
                    height="1831"
                    aria-hidden="true"
                  />
                </svg>
              </div>
              <div className="support-method-actions">
                <a
                  className="button"
                  href={projectInfo.maybankQrImage}
                  download="jerebu-my-maybank-qr.png"
                >
                  <Download size={16} aria-hidden="true" />
                  {bm ? "Simpan QR Maybank" : "Save Maybank QR"}
                </a>
                <a
                  className="support-download"
                  href={projectInfo.maybankQrImage}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {bm ? "Lihat imej asal" : "View original image"}
                  <ArrowUpRight size={15} aria-hidden="true" />
                  <span className="sr-only">{bm ? "(tab baharu)" : "(new tab)"}</span>
                </a>
              </div>
            </section>
          </div>
          <p className="support-payment-note">
            {bm
              ? "Sahkan penerima dan jumlah dalam aplikasi pembayaran anda sebelum menghantar. Pembayaran dikendalikan oleh PayPal atau bank anda; JEREBU / MY tidak memproses butiran pembayaran atau mengesahkan pindahan."
              : "Check the recipient and amount in your payment app before sending. PayPal or your bank handles the payment; JEREBU / MY does not process payment details or confirm transfers."}
          </p>
          <Link className="support-privacy" href="/privacy">
            {bm ? "Maklumat privasi" : "Privacy information"}
          </Link>
        </>
      )}
    </main>
  );
}
