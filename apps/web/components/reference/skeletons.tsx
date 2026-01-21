/**
 * Skeleton Components for Streaming/Suspense
 *
 * These skeletons are shown while async content is loading.
 * They provide visual feedback and prevent layout shift.
 */

import { cn } from "@/lib/utils/cn";

/**
 * Animated pulse skeleton bar
 */
function SkeletonBar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("bg-gray-200 dark:bg-gray-700 rounded animate-pulse", className)}
      style={style}
    />
  );
}

/**
 * Skeleton for symbol page content (signature, description, members)
 */
export function SymbolContentSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Signature block skeleton */}
      <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
        <div className="space-y-2">
          <SkeletonBar className="h-5 w-3/4" />
          <SkeletonBar className="h-5 w-1/2" />
        </div>
      </div>

      {/* Description skeleton */}
      <div className="space-y-3">
        <SkeletonBar className="h-4 w-full" />
        <SkeletonBar className="h-4 w-5/6" />
        <SkeletonBar className="h-4 w-4/5" />
      </div>

      {/* Parameters section skeleton */}
      <div className="space-y-4">
        <SkeletonBar className="h-6 w-32" />
        <div className="space-y-3 pl-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <SkeletonBar className="h-5 w-24 shrink-0" />
              <SkeletonBar className="h-5 w-48" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for members section (methods, properties)
 */
export function MembersSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Section header */}
      <SkeletonBar className="h-6 w-24" />

      {/* Member cards */}
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-3">
              <SkeletonBar className="h-5 w-16" />
              <SkeletonBar className="h-5 w-32" />
            </div>
            <SkeletonBar className="h-4 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for inherited members section
 */
export function InheritedMembersSkeleton() {
  return (
    <div className="space-y-6 border-t border-border pt-6 animate-in fade-in duration-300">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <SkeletonBar className="h-5 w-28" />
        <SkeletonBar className="h-5 w-24" />
      </div>

      {/* Inherited member rows */}
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2 px-3">
            <SkeletonBar className="h-5 w-6" />
            <SkeletonBar className="h-4 w-24" />
            <SkeletonBar className="h-4 w-16" />
            <SkeletonBar className="h-4 w-48 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for package page symbol list
 */
export function PackageSymbolsSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Classes section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <SkeletonBar className="h-5 w-5" />
          <SkeletonBar className="h-6 w-20" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 p-4 rounded-lg border border-border">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <SkeletonBar className="h-5 w-14" />
                  <SkeletonBar className="h-5 w-32" />
                </div>
                <SkeletonBar className="h-4 w-3/4" />
              </div>
              <SkeletonBar className="h-5 w-5" />
            </div>
          ))}
        </div>
      </div>

      {/* Functions section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <SkeletonBar className="h-5 w-5" />
          <SkeletonBar className="h-6 w-24" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-4 p-4 rounded-lg border border-border">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <SkeletonBar className="h-5 w-16" />
                  <SkeletonBar className="h-5 w-28" />
                </div>
                <SkeletonBar className="h-4 w-2/3" />
              </div>
              <SkeletonBar className="h-5 w-5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for subpage content
 */
export function SubpageContentSkeleton() {
  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Markdown content skeleton */}
      <div className="prose space-y-4">
        <SkeletonBar className="h-4 w-full" />
        <SkeletonBar className="h-4 w-5/6" />
        <SkeletonBar className="h-4 w-4/5" />
        <SkeletonBar className="h-4 w-full" />
        <SkeletonBar className="h-4 w-3/4" />
      </div>

      {/* Symbol cards skeleton */}
      <div className="space-y-4">
        <SkeletonBar className="h-6 w-32" />
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-lg border border-border space-y-2">
              <div className="flex items-center gap-2">
                <SkeletonBar className="h-5 w-14" />
                <SkeletonBar className="h-5 w-24" />
              </div>
              <SkeletonBar className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for Table of Contents
 */
export function TOCSkeleton() {
  return (
    <aside className="hidden xl:flex flex-col w-64 shrink-0 animate-in fade-in duration-300">
      <div className="sticky top-24 space-y-4">
        <SkeletonBar className="h-4 w-24" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBar key={i} className="h-4" style={{ width: `${60 + (i % 3) * 15}%` }} />
          ))}
        </div>
      </div>
    </aside>
  );
}
