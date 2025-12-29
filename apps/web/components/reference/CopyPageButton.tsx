"use client";

/**
 * Copy Page Button Component
 *
 * A button that copies the page content as markdown to clipboard.
 * Styled to match Mintlify's design with success feedback.
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils/cn";
import { CopyIcon, CheckIcon } from "@/components/icons/ai-icons";

interface CopyPageButtonProps {
  /** The markdown content to copy */
  markdown: string;
  /** Optional additional className */
  className?: string;
}

export function CopyPageButton({ markdown, className }: CopyPageButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [markdown]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        // Base styles
        "inline-flex items-center gap-2",
        "h-[34px] px-3",
        "text-sm font-medium",
        // Border and shape - rounded on left for pairing with menu
        "rounded-l-xl border border-r-0",
        "border-gray-200 dark:border-white/[0.07]",
        // Colors
        "bg-white dark:bg-gray-900",
        "text-gray-700 dark:text-gray-300",
        // Hover
        "hover:bg-gray-50 dark:hover:bg-gray-800",
        // Transition
        "transition-colors duration-150",
        // Focus
        "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1",
        className
      )}
      aria-label="Copy page as markdown"
    >
      {copied ? (
        <>
          <CheckIcon className="w-4 h-4 text-green-500 dark:text-green-400" />
          <span className="hidden sm:inline">Copied!</span>
        </>
      ) : (
        <>
          <CopyIcon className="w-4 h-4" />
          <span className="hidden sm:inline">Copy page</span>
        </>
      )}
    </button>
  );
}

