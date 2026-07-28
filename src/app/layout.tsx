import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fiş Platformu — Dijital Fiş Yönetimi",
  description:
    "Müşteriler fiş fotoğraflarını yükler, sistem otomatik okur (OCR) ve muhasebeci Excel olarak indirir.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
