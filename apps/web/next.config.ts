import type { NextConfig } from "next";

// Log environment variables at build time for debugging
console.log("[next.config] Build-time environment check:");
console.log("[next.config] BLOB_URL:", process.env.BLOB_URL ? "SET" : "NOT SET");
console.log("[next.config] NEXT_PUBLIC_BLOB_URL:", process.env.NEXT_PUBLIC_BLOB_URL ? "SET" : "NOT SET");
console.log("[next.config] NODE_ENV:", process.env.NODE_ENV);
console.log("[next.config] VERCEL:", process.env.VERCEL);

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

  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;

