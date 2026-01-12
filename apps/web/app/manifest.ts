/**
 * Web App Manifest
 *
 * Defines the web app manifest for PWA support.
 * Enables "Add to Home Screen" functionality and better mobile experience.
 */

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LangChain Reference Docs",
    short_name: "LangChain Ref",
    description:
      "API reference documentation for LangChain, LangGraph, and LangSmith",
    start_url: "/",
    display: "standalone",
    background_color: "#0A1A1A",
    theme_color: "#1C3C3C",
    icons: [
      {
        src: "/favicons/light/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        src: "/favicons/light/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/favicons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
