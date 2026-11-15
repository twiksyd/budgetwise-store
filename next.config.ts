import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // workers.dev previews do not have a zone-level /cdn-cgi/image endpoint.
    // Keep source images working directly on Cloudflare while leaving the
    // existing Vercel optimizer behavior unchanged.
    ...(process.env.CLOUDFLARE_BUILD === "1" ? { unoptimized: true } : {}),
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.rbxcdn.com",
      },
    ],
  },
};

export default nextConfig;
