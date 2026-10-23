import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { preconnect } from "react-dom";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted (CLAUDE.md: no Google Fonts / CDNs; unreliable in Iran).
const vazirmatn = localFont({ src: "./fonts/Vazirmatn-Variable.woff2", variable: "--font-vazirmatn", weight: "100 900", display: "swap" });
const lalezar = localFont({
  src: [{ path: "./fonts/Lalezar-Arabic.woff2" }, { path: "./fonts/Lalezar-Latin.woff2" }],
  variable: "--font-lalezar",
  display: "swap",
  preload: false, // display face for a few headings; preloading its 67 KB delayed the product image (LCP)
});

export const metadata: Metadata = {
  title: "ببین",
  description: "دستیار خرید حضوری در تهران: قبل از رفتن، ببین.",
  applicationName: "ببین",
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" }],
    apple: "/icons/apple-touch-icon-180.png",
  },
  appleWebApp: { capable: true, title: "ببین", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1B2420",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Data and product images load client-side; opening both connections during HTML parse takes the DNS/TLS
  // round trips off the LCP path (Lighthouse, product page).
  preconnect(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000", { crossOrigin: "anonymous" });
  preconnect("https://image.torob.com");
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
