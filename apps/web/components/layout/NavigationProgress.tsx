"use client";

/**
 * Navigation Progress Bar
 *
 * Shows a slim progress bar at the top of the page during navigation.
 * Provides immediate visual feedback when clicking links.
 * Similar to YouTube, GitHub, and other modern web apps.
 */

import { useEffect, useState, useTransition, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);

  // Track navigation by watching pathname changes
  useEffect(() => {
    // Reset when navigation completes
    setIsNavigating(false);
    setProgress(100);
    
    // Hide the bar after animation completes
    const timeout = setTimeout(() => {
      setProgress(0);
    }, 200);

    return () => clearTimeout(timeout);
  }, [pathname, searchParams]);

  // Listen for click events on links to start the progress bar immediately
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      
      if (link) {
        const href = link.getAttribute("href");
        // Only show progress for internal navigation links
        if (href && href.startsWith("/") && !href.startsWith("//")) {
          const currentPath = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : "");
          const targetPath = href.split("?")[0];
          
          // Don't show progress for same-page navigation
          if (targetPath !== pathname) {
            setIsNavigating(true);
            setProgress(30);
            
            // Simulate progress
            const interval = setInterval(() => {
              setProgress((prev) => {
                if (prev >= 90) {
                  clearInterval(interval);
                  return prev;
                }
                return prev + Math.random() * 10;
              });
            }, 200);

            // Store interval to clear on navigation complete
            return () => clearInterval(interval);
          }
        }
      }
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [pathname, searchParams]);

  if (progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 h-0.5 bg-transparent">
      <div
        className={cn(
          "h-full bg-primary transition-all duration-200 ease-out",
          isNavigating ? "opacity-100" : "opacity-0"
        )}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
