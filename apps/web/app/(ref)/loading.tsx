/**
 * Loading Component
 *
 * Shown during page navigation while content is being fetched.
 * Provides visual feedback that the app is working.
 */

import { ReferenceLoadingSkeleton } from "@/components/reference/ReferenceLoadingSkeleton";

export default function Loading() {
  return <ReferenceLoadingSkeleton />;
}
