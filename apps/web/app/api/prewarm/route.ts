import { NextResponse } from "next/server";
import { getCrossProjectPackages, prewarmCorePackages } from "@/lib/ir/loader";
import type { Language } from "@/lib/config/languages";

/**
 * Pre-warming API route to populate caches during build or on-demand.
 *
 * This is called:
 * 1. During Vercel build (via vercel.json build hook)
 * 2. Optionally via Vercel cron to keep caches warm
 *
 * By pre-populating the unstable_cache during build, the first user request
 * after deployment doesn't need to wait for cache population (~7-10s → <100ms).
 */
export async function GET(request: Request) {
  const startTime = performance.now();

  // Allow specifying language, or prewarm all
  const url = new URL(request.url);
  const languageParam = url.searchParams.get("language");

  const languages: Language[] = languageParam
    ? [languageParam as Language]
    : ["python", "javascript"];

  console.log(`[prewarm] Starting cache prewarm for languages: ${languages.join(", ")}`);

  const results: Record<string, { packages: number; duration: number }> = {};

  // Prewarm each language in parallel
  await Promise.all(
    languages.map(async (language) => {
      const langStart = performance.now();

      // This populates the unstable_cache with cross-project data
      const packages = await getCrossProjectPackages(language);

      // Also prewarm core package routing maps
      await prewarmCorePackages(language);

      results[language] = {
        packages: packages.size,
        duration: Math.round(performance.now() - langStart),
      };

      console.log(`[prewarm] ${language}: ${packages.size} packages in ${results[language].duration}ms`);
    })
  );

  const totalDuration = Math.round(performance.now() - startTime);

  return NextResponse.json({
    success: true,
    duration: totalDuration,
    languages: results,
  });
}

// Increase timeout for this route since it fetches a lot of data
export const maxDuration = 60;
