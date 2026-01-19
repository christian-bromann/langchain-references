"use client";

/**
 * Page Context Menu Component
 *
 * A dropdown menu with AI-focused actions for the reference documentation.
 * Includes options to copy as markdown, view raw, open in AI assistants,
 * and connect via MCP.
 */

import { useState, useCallback } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  CopyIcon,
  MarkdownIcon,
  FileIcon,
  OpenAIIcon,
  AnthropicIcon,
  MCPIcon,
  CursorIcon,
  VSCodeIcon,
  CheckIcon,
  ExternalLinkIcon,
} from "@/components/icons/ai-icons";
import { MCP_CONFIG } from "@/lib/config/mcp";

interface PageContextMenuProps {
  /** Current page URL */
  pageUrl: string;
  /** Markdown content of the page */
  markdown: string;
  /** MCP server URL */
  mcpServerUrl?: string;
  /** llms.txt URL */
  llmsTxtUrl?: string;
}

type CopiedItem = "page" | "mcp" | null;

export function PageContextMenu({
  pageUrl,
  markdown,
  mcpServerUrl = MCP_CONFIG.serverUrl,
  llmsTxtUrl = "/llms.txt",
}: PageContextMenuProps) {
  const [copiedItem, setCopiedItem] = useState<CopiedItem>(null);
  const [open, setOpen] = useState(false);

  // "View as Markdown" should point to the programmatic ref endpoint,
  // not the HTML page (which ignores `?format=md`).
  const markdownUrl = (() => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const url = new URL(pageUrl, origin);

      // Rewrite `/python/...` -> `/api/ref/python/...`
      if (!url.pathname.startsWith("/api/ref/")) {
        url.pathname = `/api/ref${url.pathname}`;
      }

      url.searchParams.set("format", "md");
      return url.toString();
    } catch {
      // Best-effort fallback for odd inputs
      const sep = pageUrl.includes("?") ? "&" : "?";
      const withFormat = `${pageUrl}${sep}format=md`;
      return withFormat.startsWith("/api/ref/") ? withFormat : `/api/ref${withFormat}`;
    }
  })();

  const copyToClipboard = useCallback(async (text: string, itemId: CopiedItem) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(itemId);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  const openInChatGPT = useCallback(() => {
    // ChatGPT doesn't support pre-filled prompts via URL in the same way
    // Instead, copy to clipboard and open ChatGPT
    navigator.clipboard.writeText(markdown);
    window.open("https://chat.openai.com/", "_blank");
  }, [markdown]);

  const openInClaude = useCallback(() => {
    // Claude also doesn't support pre-filled prompts
    // Copy to clipboard and open Claude
    navigator.clipboard.writeText(markdown);
    window.open("https://claude.ai/new", "_blank");
  }, [markdown]);

  const connectToCursor = useCallback(() => {
    const cursorUrl = MCP_CONFIG.cursorInstallUrl(mcpServerUrl);
    window.open(cursorUrl, "_blank");
  }, [mcpServerUrl]);

  const connectToVSCode = useCallback(() => {
    const vscodeUrl = MCP_CONFIG.vscodeInstallUrl(mcpServerUrl);
    window.open(vscodeUrl, "_blank");
  }, [mcpServerUrl]);

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            // Base styles - match height of CopyPageButton (text-sm has line-height 1.25rem + py-1.5)
            "inline-flex items-center justify-center",
            "h-[34px] px-3",
            // Border and shape - rounded on right to pair with copy button
            "rounded-r-xl border",
            "border-gray-200 dark:border-white/[0.07]",
            // Colors
            "bg-white dark:bg-gray-900",
            "text-gray-500 dark:text-gray-400",
            // Hover
            "hover:bg-gray-50 dark:hover:bg-gray-800",
            "hover:text-gray-700 dark:hover:text-gray-300",
            // Transition
            "transition-colors duration-150",
            // Focus
            "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1",
          )}
          aria-label="More actions"
        >
          <ChevronDown
            className={cn("w-4 h-4 transition-transform duration-200", open && "rotate-180")}
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          style={{ zIndex: 10000 }}
          className={cn(
            // Container
            "min-w-[260px] p-1.5",
            "rounded-xl border shadow-xl",
            "border-gray-200 dark:border-white/[0.07]",
            "bg-white dark:bg-gray-900",
            // Animation
            "animate-in fade-in-0 zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2",
            "data-[side=top]:slide-in-from-bottom-2",
          )}
        >
          {/* Copy Page */}
          <MenuItem
            icon={<CopyIcon className="w-4 h-4" />}
            label="Copy page"
            description="Copy page as Markdown for LLMs"
            checked={copiedItem === "page"}
            onClick={() => copyToClipboard(markdown, "page")}
          />

          {/* View as Markdown */}
          <MenuItemLink
            icon={<MarkdownIcon className="w-4 h-4" />}
            label="View as Markdown"
            description="View this page as plain text"
            href={markdownUrl}
            external
          />

          {/* llms.txt */}
          <MenuItemLink
            icon={<FileIcon className="w-4 h-4" />}
            label="llms.txt"
            description="Open llms.txt for this site"
            href={llmsTxtUrl}
            external
          />

          <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-white/[0.07] my-1.5" />

          {/* Open in ChatGPT */}
          <MenuItem
            icon={<OpenAIIcon className="w-4 h-4" />}
            label="Open in ChatGPT"
            description="Ask questions about this page"
            onClick={openInChatGPT}
            external
          />

          {/* Open in Claude */}
          <MenuItem
            icon={<AnthropicIcon className="w-4 h-4" />}
            label="Open in Claude"
            description="Ask questions about this page"
            onClick={openInClaude}
            external
          />

          <DropdownMenu.Separator className="h-px bg-gray-200 dark:bg-white/[0.07] my-1.5" />

          {/* Copy MCP Server */}
          <MenuItem
            icon={<MCPIcon className="w-4 h-4" />}
            label="Copy MCP Server"
            description="Copy MCP Server URL to clipboard"
            checked={copiedItem === "mcp"}
            onClick={() => copyToClipboard(mcpServerUrl, "mcp")}
          />

          {/* Connect to Cursor */}
          <MenuItem
            icon={<CursorIcon className="w-4 h-4" />}
            label="Connect to Cursor"
            description="Install MCP Server on Cursor"
            onClick={connectToCursor}
            external
          />

          {/* Connect to VS Code */}
          <MenuItem
            icon={<VSCodeIcon className="w-4 h-4" />}
            label="Connect to VS Code"
            description="Install MCP Server on VS Code"
            onClick={connectToVSCode}
            external
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * Menu item with click action
 */
interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked?: boolean;
  external?: boolean;
  onClick: () => void;
}

function MenuItem({ icon, label, description, checked, external, onClick }: MenuItemProps) {
  return (
    <DropdownMenu.Item
      className={cn(
        // Layout
        "flex items-center gap-3 w-full",
        "px-2 py-2 rounded-lg",
        // Colors
        "text-gray-700 dark:text-gray-300",
        // Hover
        "hover:bg-gray-100 dark:hover:bg-gray-800",
        "focus:bg-gray-100 dark:focus:bg-gray-800",
        // Cursor and outline
        "cursor-pointer select-none outline-none",
        // Transition
        "transition-colors duration-100",
      )}
      onSelect={onClick}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-white/[0.07] bg-gray-50 dark:bg-gray-800">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
          {label}
          {external && <ExternalLinkIcon className="w-3 h-3 text-gray-400 dark:text-gray-500" />}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{description}</div>
      </div>

      <CheckIcon
        className={cn(
          "w-4 h-4 shrink-0 text-green-500 dark:text-green-400",
          "transition-opacity duration-150",
          checked ? "opacity-100" : "opacity-0",
        )}
      />
    </DropdownMenu.Item>
  );
}

/**
 * Menu item that renders as a link
 */
interface MenuItemLinkProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  href: string;
  external?: boolean;
}

function MenuItemLink({ icon, label, description, href, external }: MenuItemLinkProps) {
  return (
    <DropdownMenu.Item asChild>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className={cn(
          // Layout
          "flex items-center gap-3 w-full",
          "px-2 py-2 rounded-lg",
          // Colors
          "text-gray-700 dark:text-gray-300",
          // Hover
          "hover:bg-gray-100 dark:hover:bg-gray-800",
          "focus:bg-gray-100 dark:focus:bg-gray-800",
          // Cursor and outline
          "cursor-pointer select-none outline-none",
          // Transition
          "transition-colors duration-100",
          // No underline
          "no-underline",
        )}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-white/[0.07] bg-gray-50 dark:bg-gray-800">
          {icon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-200">
            {label}
            {external && <ExternalLinkIcon className="w-3 h-3 text-gray-400 dark:text-gray-500" />}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{description}</div>
        </div>

        {/* Empty space to align with other items that have check icon */}
        <div className="w-4 h-4 shrink-0" />
      </a>
    </DropdownMenu.Item>
  );
}
