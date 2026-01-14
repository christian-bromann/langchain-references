import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Configure image domains for external images
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },

  // Exclude ir-output directory from file tracing to avoid Turbopack warnings
  // The ir-output directory is only used for local development
  outputFileTracingExcludes: {
    "*": ["../../ir-output/**"],
  },

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // Inline critical CSS to reduce render-blocking resources
    // This uses Critters to extract and inline above-the-fold CSS
    optimizeCss: true,
    // Enable strict CSS chunking to ensure CSS is split per route
    cssChunking: "strict",
    // Tree-shake icon libraries to reduce bundle size
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;

