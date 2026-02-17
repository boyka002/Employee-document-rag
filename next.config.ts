import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase the maximum body size for API routes to support PDF uploads up to 10MB
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Exclude pdf-parse and pdfjs-dist from the Next.js server bundle.
  // These packages use native canvas bindings (DOMMatrix, Path2D) that are
  // not available in the Next.js build worker — they must run as external CJS modules.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // Use an empty turbopack config to silence the Turbopack/webpack mismatch warning
  // (Next.js 16+ uses Turbopack by default)
  turbopack: {},
};

export default nextConfig;
