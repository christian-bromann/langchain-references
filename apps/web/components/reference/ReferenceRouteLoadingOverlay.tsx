"use client";

/**
 * Reference Route Loading Overlay
 *
 * Next.js' segment `loading.tsx` doesn't always show during slow RSC navigations
 * (especially when navigation is initiated by client code). This overlay provides
 * immediate feedback by showing the same skeleton used for hard reloads.
 *
 * Behavior:
 * - Starts on internal link clicks within the reference layout
 * - Also starts on a custom event (useful for router.push-driven navigations)
 * - Stops when pathname/search params change (navigation completed)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ReferenceLoadingSkeleton } from "@/components/reference/ReferenceLoadingSkeleton";

const START_EVENT = "lc:route-loading-start";
const MIN_VISIBLE_MS = 200;

export function ReferenceRouteLoadingOverlay() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentUrlKey = useMemo(() => {
    const qs = searchParams?.toString();
    return `${pathname}${qs ? `?${qs}` : ""}`;
  }, [pathname, searchParams]);

  const [active, setActive] = useState(false);
  const showTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  // Stop overlay when navigation completes
  useEffect(() => {
    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }

    const startedAt = startedAtRef.current;
    startedAtRef.current = null;

    // Avoid flicker: keep the overlay visible for a short minimum duration.
    if (active && startedAt) {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      if (remaining > 0) {
        const t = window.setTimeout(() => setActive(false), remaining);
        return () => window.clearTimeout(t);
      }
    }

    setActive(false);
  }, [currentUrlKey]);

  // Start overlay on internal link clicks (capture phase so it fires early)
  useEffect(() => {
    const start = () => {
      if (active) return;
      startedAtRef.current = Date.now();
      setActive(true);
    };

    const shouldStartForEventTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      const link = el?.closest?.("a");
      if (!link) return false;

      // Ignore new tab/window / downloads
      const targetAttr = link.getAttribute("target");
      if (targetAttr && targetAttr !== "_self") return false;
      if (link.hasAttribute("download")) return false;

      const href = link.getAttribute("href");
      if (!href) return false;
      if (!href.startsWith("/") || href.startsWith("//")) return false; // internal only
      if (href.startsWith("/api/")) return false; // ignore API links

      // Ignore hash-only changes
      const hrefNoHash = href.split("#")[0] || href;

      // If we're already on this exact URL (incl. query), don't show
      if (hrefNoHash === currentUrlKey) return false;

      return true;
    };

    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // PointerEvent doesn't reliably expose `button` for touch; keep it permissive.
      if (shouldStartForEventTarget(e.target)) start();
    };

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key !== "Enter") return;
      if (shouldStartForEventTarget(e.target)) start();
    };

    const onCustomStart = () => start();

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    document.addEventListener("keydown", onKeyDownCapture, true);
    document.addEventListener(START_EVENT, onCustomStart as EventListener);

    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      document.removeEventListener("keydown", onKeyDownCapture, true);
      document.removeEventListener(START_EVENT, onCustomStart as EventListener);
      if (showTimerRef.current) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
  }, [currentUrlKey, active]);

  if (!active) return null;

  return (
    <div className="absolute inset-0 z-50 bg-background">
      <ReferenceLoadingSkeleton />
    </div>
  );
}

export function dispatchReferenceRouteLoadingStart() {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new Event(START_EVENT));
}

