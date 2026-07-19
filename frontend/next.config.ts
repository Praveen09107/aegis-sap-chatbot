import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dockerfile copies .next/standalone into the runner image — required,
  // not optional, for the production container to start.
  output: "standalone",

  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [1280, 1440, 1920],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/admin",
        destination: "/admin/dashboard",
        permanent: false,
      },
    ];
  },

  // @react-pdf/renderer's browser bundle probes for an optional "canvas"
  // dependency it never actually needs client-side (PNG/JPEG embedding
  // only, unused by SessionDocument) — aliasing it out avoids a bundle
  // error. Two entries because next build/dev may run under either
  // bundler depending on flags; each has its own config surface.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias.canvas = false;
    }
    return config;
  },
  turbopack: {
    resolveAlias: {
      canvas: "./src/lib/empty-module.ts",
    },
  },

  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
    ],
  },
};

export default nextConfig;
