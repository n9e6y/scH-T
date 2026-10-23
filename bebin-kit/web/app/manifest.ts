import type { MetadataRoute } from "next";

// PWA manifest (F14, M7). Icon: the mascot head with glasses on soil (design/exports/assets/icons).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ببین، از ترب",
    short_name: "ببین",
    description: "دستیار خرید حضوری در تهران: قبل از رفتن، ببین.",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "fa",
    background_color: "#F7F8F6",
    theme_color: "#1B2420",
    icons: [
      { src: "/icons/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
