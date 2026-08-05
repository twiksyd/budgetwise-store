import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

// Powers Android/Chrome "Add to Home Screen" — iOS uses apple-icon.tsx
// instead, which it picks up automatically without a manifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name} — ${siteConfig.slogan}`,
    short_name: siteConfig.name,
    description: siteConfig.description,
    start_url: "/",
    display: "standalone",
    background_color: "#0b0614",
    theme_color: "#0b0614",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
    ],
  };
}
