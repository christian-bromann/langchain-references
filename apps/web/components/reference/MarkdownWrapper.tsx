"use client";

/**
 * Markdown Wrapper Component
 *
 * Client component that wraps rendered markdown HTML and adds
 * copy buttons to code blocks. Styled like Mintlify.
 */

import { useEffect, useRef } from "react";
// Import markdown-specific styles only where needed to reduce critical CSS
import "@/app/markdown.css";

interface MarkdownWrapperProps {
  html: string;
  rawContent: string;
  className?: string;
  compact?: boolean;
}

const COPY_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-400 group-hover/copy-button:text-gray-500 dark:text-white/40 dark:group-hover/copy-button:text-white/60 copy-icon"><path d="M14.25 5.25H7.25C6.14543 5.25 5.25 6.14543 5.25 7.25V14.25C5.25 15.3546 6.14543 16.25 7.25 16.25H14.25C15.3546 16.25 16.25 15.3546 16.25 14.25V7.25C16.25 6.14543 15.3546 5.25 14.25 5.25Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M2.80103 11.998L1.77203 5.07397C1.61003 3.98097 2.36403 2.96397 3.45603 2.80197L10.38 1.77297C11.313 1.63397 12.19 2.16297 12.528 3.00097" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

const CHECK_ICON = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-green-500 dark:text-green-400 check-icon hidden"><path d="M15 4.5L6.75 12.75L3 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;

export function MarkdownWrapper({ html, className = "", compact = false }: MarkdownWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Find all pre elements and wrap them with copy buttons
    const preElements = containerRef.current.querySelectorAll("pre");

    preElements.forEach((pre) => {
      // Skip if already wrapped
      if (pre.parentElement?.classList.contains("code-block-wrapper")) return;

      const code = pre.textContent || "";

      // Create wrapper
      const wrapper = document.createElement("div");
      wrapper.className = "relative group code-block-wrapper";

      // Create copy button container
      const buttonContainer = document.createElement("div");
      buttonContainer.className =
        "absolute top-3 right-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10";

      buttonContainer.innerHTML = `
        <div class="relative select-none">
          <button
            class="copy-code-btn h-[26px] w-[26px] flex items-center justify-center rounded-md backdrop-blur group/copy-button cursor-pointer"
            aria-label="Copy code"
          >
            ${COPY_ICON}
            ${CHECK_ICON}
          </button>
          <div class="copy-tooltip absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 text-white rounded-lg px-1.5 py-0.5 text-xs bg-gray-900 dark:bg-gray-700 transition-opacity pointer-events-none">Copy</div>
        </div>
      `;

      // Add click handler
      const btn = buttonContainer.querySelector(".copy-code-btn") as HTMLButtonElement;
      if (btn) {
        // Show tooltip on hover
        btn.addEventListener("mouseenter", () => {
          const tooltip = buttonContainer.querySelector(".copy-tooltip");
          if (tooltip) tooltip.classList.remove("opacity-0");
        });
        btn.addEventListener("mouseleave", () => {
          const tooltip = buttonContainer.querySelector(".copy-tooltip");
          if (tooltip) tooltip.classList.add("opacity-0");
        });

        btn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(code);
            const copyIcon = btn.querySelector(".copy-icon");
            const checkIcon = btn.querySelector(".check-icon");
            const tooltip = buttonContainer.querySelector(".copy-tooltip");

            copyIcon?.classList.add("hidden");
            checkIcon?.classList.remove("hidden");
            if (tooltip) tooltip.textContent = "Copied!";

            setTimeout(() => {
              copyIcon?.classList.remove("hidden");
              checkIcon?.classList.add("hidden");
              if (tooltip) tooltip.textContent = "Copy";
            }, 2000);
          } catch (err) {
            // oxlint-disable-next-line no-console
            console.error("Failed to copy:", err);
          }
        });
      }

      // Wrap the pre element
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
      wrapper.appendChild(buttonContainer);
    });
  }, [html]);

  return (
    <div
      ref={containerRef}
      className={`markdown-content ${compact ? "markdown-compact" : ""} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
