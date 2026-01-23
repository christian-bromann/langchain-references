import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Manrope, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import { OfflineIndicator } from "@/components/layout/OfflineIndicator";
import { CacheProvider } from "@/components/cache/CacheProvider";
import { BASE_URL } from "@/lib/config/base-url";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-heading",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "LangChain Reference Docs",
    template: "%s | LangChain Reference",
  },
  description: "API reference documentation for LangChain, LangGraph, and LangSmith",
  // Important: this base is used to resolve relative OG image URLs (e.g. `/og/...`).
  // While the custom domain isn't wired up, use the current Vercel deployment URL.
  metadataBase: new URL(BASE_URL),
  icons: {
    // Using dark theme favicons as default (most users prefer dark mode)
    // This reduces the number of icon link tags and favicon requests
    icon: [
      {
        url: "/favicons/dark/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    shortcut: "/favicons/dark/favicon.ico",
    apple: {
      url: "/favicons/apple-touch-icon.png",
      sizes: "180x180",
      type: "image/png",
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "LangChain Reference Docs",
  },
  twitter: {
    card: "summary_large_image",
    creator: "@langaboratory",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${manrope.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Preconnect to external resources for faster loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* DNS prefetch for GitHub (source links) */}
        <link rel="dns-prefetch" href="https://github.com" />
        {/* Preconnect to Vercel Blob storage if configured */}
        {process.env.NEXT_PUBLIC_BLOB_URL && (
          <link rel="preconnect" href={new URL(process.env.NEXT_PUBLIC_BLOB_URL).origin} />
        )}
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <CacheProvider>
            <Suspense fallback={null}>
              <NavigationProgress />
            </Suspense>
            {children}
            <OfflineIndicator />
          </CacheProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
