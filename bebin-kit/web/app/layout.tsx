import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted (CLAUDE.md: no Google Fonts / CDNs; unreliable in Iran).
const vazirmatn = localFont({ src: "./fonts/Vazirmatn-Variable.woff2", variable: "--font-vazirmatn", weight: "100 900", display: "swap" });
const lalezar = localFont({
  src: [{ path: "./fonts/Lalezar-Arabic.woff2" }, { path: "./fonts/Lalezar-Latin.woff2" }],
  variable: "--font-lalezar",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ببین",
  description: "دستیار خرید حضوری در تهران: قبل از رفتن، ببین.",
  applicationName: "ببین",
};

export const viewport: Viewport = {
  themeColor: "#1B2420",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} ${lalezar.variable}`}>
      <body>
        <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-flesh">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
