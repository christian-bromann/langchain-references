/**
 * Loading Component
 *
 * Shown during page navigation while content is being fetched.
 * Provides visual feedback that the app is working.
 */

export default function Loading() {
  return (
    <div className="flex-1 min-w-0">
      <div className="px-6 py-8">
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2 text-sm mb-6">
          <div className="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Kind badge and version skeleton */}
        <div className="flex items-center gap-3 mb-4">
          <div className="h-6 w-16 bg-primary/20 rounded-full animate-pulse" />
          <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Title skeleton */}
        <div className="h-10 w-64 bg-gray-300 dark:bg-gray-600 rounded animate-pulse mb-6" />

        {/* Description skeleton */}
        <div className="space-y-2 mb-8">
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>

        {/* Code block skeleton */}
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-8">
          <div className="space-y-2">
            <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>

        {/* Section skeleton */}
        <div className="space-y-4">
          <div className="h-6 w-32 bg-gray-300 dark:bg-gray-600 rounded animate-pulse" />
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="h-5 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-4">
              <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-56 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </div>
            <div className="flex items-center gap-4">
              <div className="h-5 w-28 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-40 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
