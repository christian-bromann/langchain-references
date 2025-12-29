# Specification: AI-Friendly Reference Documentation

**Spec ID**: `2025-12-29-ai-friendly-reference-docs`  
**Created**: December 29, 2025  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Content Negotiation](#2-content-negotiation)
3. [Copy Page as Markdown](#3-copy-page-as-markdown)
4. [Page Context Menu](#4-page-context-menu)
5. [MCP Server Integration](#5-mcp-server-integration)
6. [llms.txt Implementation](#6-llmstxt-implementation)
7. [Component Specifications](#7-component-specifications)
8. [API Routes](#8-api-routes)
9. [Testing Strategy](#9-testing-strategy)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

Make the LangChain API reference documentation AI-friendly by enabling:
- **Content Negotiation**: Serve markdown for programmatic access, HTML for browsers
- **Copy as Markdown**: Allow users to copy page content as markdown for LLMs
- **Context Menu**: Provide AI-focused actions (copy page, view markdown, open in ChatGPT/Claude)
- **MCP Server**: Enable Model Context Protocol integration for IDE assistants
- **llms.txt**: Provide a standardized index file for LLM crawlers

### 1.2 Design Reference

The implementation follows the Mintlify docs pattern, which includes:
- A "Copy page" button with dropdown menu in the header
- Options to copy as markdown, view as markdown, open llms.txt
- Integration with ChatGPT and Claude via URL schemes
- MCP server URL for IDE integration (Cursor, VS Code)

### 1.3 Scope

**In Scope (v1)**:
- Content negotiation based on Accept headers and User-Agent
- Copy page as markdown button on symbol pages
- Context menu with AI-focused actions
- MCP server endpoint returning page content
- llms.txt file generation

**Out of Scope (v1)**:
- Full MCP server with tool definitions
- Semantic search via MCP
- Chat interface embedding
- Custom prompt engineering per page

---

## 2. Content Negotiation

### 2.1 Overview

The API reference should intelligently serve content based on who's requesting it:
- **Browsers**: Full HTML with styling, JavaScript, and interactivity
- **LLMs/Agents**: Clean markdown optimized for token efficiency
- **Programmatic Access**: Markdown or JSON based on Accept header

### 2.2 Detection Strategy

```typescript
// lib/utils/content-negotiation.ts

export type ContentFormat = 'html' | 'markdown' | 'json';

interface RequestContext {
  headers: Headers;
  searchParams: URLSearchParams;
}

export function detectRequestedFormat(ctx: RequestContext): ContentFormat {
  const { headers, searchParams } = ctx;
  
  // 1. Explicit query parameter takes precedence
  const formatParam = searchParams.get('format');
  if (formatParam === 'md' || formatParam === 'markdown') return 'markdown';
  if (formatParam === 'json') return 'json';
  
  // 2. Check Accept header
  const accept = headers.get('accept') || '';
  if (accept.includes('text/markdown')) return 'markdown';
  if (accept.includes('application/json')) return 'json';
  
  // 3. Check User-Agent for known LLM/agent patterns
  const userAgent = headers.get('user-agent') || '';
  const llmPatterns = [
    'GPTBot',           // OpenAI's crawler
    'ChatGPT-User',     // ChatGPT browsing
    'Claude-Web',       // Anthropic's web access
    'Anthropic-AI',     // Anthropic crawlers
    'PerplexityBot',    // Perplexity
    'Google-Extended',  // Google Bard/Gemini
    'CCBot',            // Common Crawl (used by many LLMs)
    'Amazonbot',        // Amazon/Alexa
    'YouBot',           // You.com
    'cohere-ai',        // Cohere
    'Bytespider',       // ByteDance
    // IDE/Agent patterns
    'cursor',           // Cursor IDE
    'vscode',           // VS Code with extensions
    'copilot',          // GitHub Copilot
    'aider',            // Aider CLI
    'continue',         // Continue.dev
  ];
  
  const isLlmRequest = llmPatterns.some(pattern => 
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );
  
  if (isLlmRequest) return 'markdown';
  
  // 4. Check for curl/wget/httpie (CLI tools often used by developers)
  const cliPatterns = ['curl', 'wget', 'httpie', 'axios', 'node-fetch'];
  const isCliRequest = cliPatterns.some(pattern =>
    userAgent.toLowerCase().includes(pattern.toLowerCase())
  );
  
  // For CLI requests without Accept header, default to markdown
  if (isCliRequest && !accept.includes('text/html')) return 'markdown';
  
  // 5. Default to HTML for browsers
  return 'html';
}
```

### 2.3 Symbol Page Markdown Generation

```typescript
// lib/ir/markdown-generator.ts

import type { SymbolRecord } from '@langchain/ir-schema';

export interface MarkdownOptions {
  includeSourceLink?: boolean;
  includeExamples?: boolean;
  includeMemberDetails?: boolean;
  baseUrl?: string;
}

export function symbolToMarkdown(
  symbol: SymbolRecord,
  packageName: string,
  options: MarkdownOptions = {}
): string {
  const {
    includeSourceLink = true,
    includeExamples = true,
    includeMemberDetails = true,
    baseUrl = 'https://reference.langchain.com',
  } = options;
  
  const lines: string[] = [];
  
  // Title with kind badge
  lines.push(`# ${symbol.name}`);
  lines.push('');
  lines.push(`> **${getKindLabel(symbol.kind)}** in \`${packageName}\``);
  lines.push('');
  
  // Canonical URL
  const canonicalUrl = `${baseUrl}/${symbol.language === 'python' ? 'python' : 'javascript'}/${slugifyPackageName(packageName)}/${symbol.qualifiedName}`;
  lines.push(`📖 [View in docs](${canonicalUrl})`);
  lines.push('');
  
  // Summary
  if (symbol.docs?.summary) {
    lines.push(symbol.docs.summary);
    lines.push('');
  }
  
  // Signature
  if (symbol.signature) {
    const lang = symbol.language === 'python' ? 'python' : 'typescript';
    lines.push('## Signature');
    lines.push('');
    lines.push('```' + lang);
    lines.push(symbol.signature);
    lines.push('```');
    lines.push('');
  }
  
  // Description
  if (symbol.docs?.description) {
    lines.push('## Description');
    lines.push('');
    lines.push(symbol.docs.description);
    lines.push('');
  }
  
  // Parameters
  if (symbol.params && symbol.params.length > 0) {
    lines.push('## Parameters');
    lines.push('');
    lines.push('| Name | Type | Description |');
    lines.push('|------|------|-------------|');
    for (const param of symbol.params) {
      const required = param.required ? ' (required)' : '';
      const defaultVal = param.default ? ` Default: \`${param.default}\`` : '';
      const desc = (param.description || '') + defaultVal;
      lines.push(`| \`${param.name}\`${required} | \`${param.type}\` | ${desc.replace(/\n/g, ' ')} |`);
    }
    lines.push('');
  }
  
  // Returns
  if (symbol.returns) {
    lines.push('## Returns');
    lines.push('');
    lines.push(`\`${symbol.returns.type}\``);
    if (symbol.returns.description) {
      lines.push('');
      lines.push(symbol.returns.description);
    }
    lines.push('');
  }
  
  // Bases (inheritance)
  if (symbol.relations?.extends && symbol.relations.extends.length > 0) {
    lines.push('## Bases');
    lines.push('');
    lines.push(symbol.relations.extends.map(b => `- \`${b}\``).join('\n'));
    lines.push('');
  }
  
  // Members
  if (includeMemberDetails && symbol.members && symbol.members.length > 0) {
    const methods = symbol.members.filter(m => m.kind === 'method');
    const properties = symbol.members.filter(m => m.kind === 'property' || m.kind === 'attribute');
    
    if (properties.length > 0) {
      lines.push('## Properties');
      lines.push('');
      for (const prop of properties) {
        lines.push(`- \`${prop.name}\``);
      }
      lines.push('');
    }
    
    if (methods.length > 0) {
      lines.push('## Methods');
      lines.push('');
      for (const method of methods) {
        lines.push(`- \`${method.name}()\``);
      }
      lines.push('');
    }
  }
  
  // Examples
  if (includeExamples && symbol.docs?.examples && symbol.docs.examples.length > 0) {
    lines.push('## Examples');
    lines.push('');
    for (const example of symbol.docs.examples) {
      if (example.title) {
        lines.push(`### ${example.title}`);
        lines.push('');
      }
      const lang = example.language || (symbol.language === 'python' ? 'python' : 'typescript');
      lines.push('```' + lang);
      lines.push(example.code);
      lines.push('```');
      lines.push('');
    }
  }
  
  // Source link
  if (includeSourceLink && symbol.source) {
    const sourceUrl = symbol.source.line
      ? `https://github.com/${symbol.source.repo}/blob/${symbol.source.sha}/${symbol.source.path}#L${symbol.source.line}`
      : `https://github.com/${symbol.source.repo}/blob/${symbol.source.sha}/${symbol.source.path}`;
    lines.push('---');
    lines.push('');
    lines.push(`[View source on GitHub](${sourceUrl})`);
  }
  
  return lines.join('\n');
}

function getKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    class: 'Class',
    function: 'Function',
    method: 'Method',
    property: 'Property',
    interface: 'Interface',
    typeAlias: 'Type',
    module: 'Module',
    enum: 'Enum',
    variable: 'Variable',
  };
  return labels[kind] || kind;
}

function slugifyPackageName(name: string): string {
  return name.replace(/@/g, '').replace(/\//g, '-');
}
```

### 2.4 Route Handler Integration

```typescript
// apps/web/app/(ref)/[lang]/[package]/[...path]/page.tsx

import { headers } from 'next/headers';
import { detectRequestedFormat } from '@/lib/utils/content-negotiation';
import { symbolToMarkdown } from '@/lib/ir/markdown-generator';

export async function generateMetadata({ params, searchParams }) {
  // ... existing metadata logic
}

export default async function SymbolPage({ params, searchParams }) {
  const headersList = await headers();
  const format = detectRequestedFormat({
    headers: headersList,
    searchParams: new URLSearchParams(searchParams),
  });
  
  // Load symbol data
  const symbol = await loadSymbol(params);
  
  if (!symbol) {
    notFound();
  }
  
  // Return markdown for non-HTML requests
  if (format === 'markdown') {
    const markdown = symbolToMarkdown(symbol, params.package);
    return new Response(markdown, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  
  if (format === 'json') {
    return Response.json(symbol, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
  
  // Default: render HTML
  return <SymbolPageComponent symbol={symbol} ... />;
}
```

---

## 3. Copy Page as Markdown

### 3.1 Overview

A prominent "Copy page" button that copies the current page's content as markdown, optimized for pasting into LLM conversations.

### 3.2 Copy Button Component

```tsx
// components/reference/CopyPageButton.tsx

'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyPageButtonProps {
  /** Pre-generated markdown content */
  markdown: string;
  /** Optional className for styling */
  className?: string;
}

export function CopyPageButton({ markdown, className }: CopyPageButtonProps) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5",
        "text-sm font-medium",
        "rounded-l-xl border border-r-0",
        "border-gray-200 dark:border-white/[0.07]",
        "bg-background hover:bg-gray-600/5 dark:hover:bg-gray-200/5",
        "text-foreground-secondary hover:text-foreground",
        "transition-colors",
        className
      )}
      aria-label="Copy page as markdown"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-green-500" />
          <span>Copied!</span>
        </>
      ) : (
        <>
          <CopyIcon className="w-4 h-4" />
          <span>Copy page</span>
        </>
      )}
    </button>
  );
}

// Custom copy icon matching Mintlify style
function CopyIcon({ className }: { className?: string }) {
  return (
    <svg 
      width="18" 
      height="18" 
      viewBox="0 0 18 18" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path 
        d="M14.25 5.25H7.25C6.14543 5.25 5.25 6.14543 5.25 7.25V14.25C5.25 15.3546 6.14543 16.25 7.25 16.25H14.25C15.3546 16.25 16.25 15.3546 16.25 14.25V7.25C16.25 6.14543 15.3546 5.25 14.25 5.25Z" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
      <path 
        d="M2.80103 11.998L1.77203 5.07397C1.61003 3.98097 2.36403 2.96397 3.45603 2.80197L10.38 1.77297C11.313 1.63397 12.19 2.16297 12.528 3.00097" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

---

## 4. Page Context Menu

### 4.1 Overview

A dropdown menu adjacent to the Copy button providing AI-focused actions:
- Copy page (as markdown)
- View as Markdown (opens markdown URL)
- llms.txt link
- Open in ChatGPT
- Open in Claude
- Copy MCP Server URL
- Connect to Cursor
- Connect to VS Code

### 4.2 Context Menu Component

```tsx
// components/reference/PageContextMenu.tsx

'use client';

import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { 
  ChevronRight, 
  Check, 
  ExternalLink, 
  Copy,
  FileText,
  Link as LinkIcon,
} from 'lucide-react';

interface PageContextMenuProps {
  /** Current page URL */
  pageUrl: string;
  /** Markdown content of the page */
  markdown: string;
  /** MCP server URL */
  mcpServerUrl: string;
  /** llms.txt URL */
  llmsTxtUrl: string;
}

export function PageContextMenu({
  pageUrl,
  markdown,
  mcpServerUrl,
  llmsTxtUrl,
}: PageContextMenuProps) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  
  const markdownUrl = `${pageUrl}?format=md`;
  
  const copyToClipboard = async (text: string, itemId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedItem(itemId);
    setTimeout(() => setCopiedItem(null), 2000);
  };
  
  const openInChatGPT = () => {
    const prompt = encodeURIComponent(`Here's documentation I'd like to discuss:\n\n${markdown}`);
    window.open(`https://chat.openai.com/?q=${prompt}`, '_blank');
  };
  
  const openInClaude = () => {
    const prompt = encodeURIComponent(markdown);
    window.open(`https://claude.ai/new?q=${prompt}`, '_blank');
  };
  
  const connectToCursor = () => {
    // cursor://mcp/install?url=...
    const cursorUrl = `cursor://mcp/install?url=${encodeURIComponent(mcpServerUrl)}`;
    window.open(cursorUrl, '_blank');
  };
  
  const connectToVSCode = () => {
    // vscode://mcp/install?url=...
    const vscodeUrl = `vscode://mcp/install?url=${encodeURIComponent(mcpServerUrl)}`;
    window.open(vscodeUrl, '_blank');
  };
  
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            "inline-flex items-center justify-center",
            "px-3 py-1.5 aspect-square",
            "rounded-r-xl border",
            "border-gray-200 dark:border-white/[0.07]",
            "bg-background hover:bg-gray-600/5 dark:hover:bg-gray-200/5",
            "text-foreground-secondary hover:text-foreground",
            "transition-colors"
          )}
          aria-label="More actions"
        >
          <ChevronRight className="w-3 h-3 rotate-90" />
        </button>
      </DropdownMenu.Trigger>
      
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={5}
          className={cn(
            "z-50 min-w-[220px] p-1",
            "rounded-xl border shadow-xl",
            "border-gray-200 dark:border-white/[0.07]",
            "bg-background",
            "animate-in fade-in-0 zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2"
          )}
        >
          {/* Copy Page */}
          <MenuItem
            icon={<CopyIcon />}
            label="Copy page"
            description="Copy page as Markdown for LLMs"
            checked={copiedItem === 'copy'}
            onClick={() => copyToClipboard(markdown, 'copy')}
          />
          
          {/* View as Markdown */}
          <MenuItem
            icon={<MarkdownIcon />}
            label="View as Markdown"
            description="View this page as plain text"
            href={markdownUrl}
            external
          />
          
          {/* llms.txt */}
          <MenuItem
            icon={<FileText className="w-4 h-4" />}
            label="llms.txt"
            description="Open llms.txt for this site"
            href={llmsTxtUrl}
            external
          />
          
          <DropdownMenu.Separator className="h-px bg-border my-1" />
          
          {/* Open in ChatGPT */}
          <MenuItem
            icon={<OpenAIIcon />}
            label="Open in ChatGPT"
            description="Ask questions about this page"
            onClick={openInChatGPT}
            external
          />
          
          {/* Open in Claude */}
          <MenuItem
            icon={<AnthropicIcon />}
            label="Open in Claude"
            description="Ask questions about this page"
            onClick={openInClaude}
            external
          />
          
          <DropdownMenu.Separator className="h-px bg-border my-1" />
          
          {/* Copy MCP Server */}
          <MenuItem
            icon={<MCPIcon />}
            label="Copy MCP Server"
            description="Copy MCP Server URL to clipboard"
            checked={copiedItem === 'mcp'}
            onClick={() => copyToClipboard(mcpServerUrl, 'mcp')}
          />
          
          {/* Connect to Cursor */}
          <MenuItem
            icon={<CursorIcon />}
            label="Connect to Cursor"
            description="Install MCP Server on Cursor"
            onClick={connectToCursor}
            external
          />
          
          {/* Connect to VS Code */}
          <MenuItem
            icon={<VSCodeIcon />}
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

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  href?: string;
  external?: boolean;
  checked?: boolean;
  onClick?: () => void;
}

function MenuItem({ 
  icon, 
  label, 
  description, 
  href, 
  external, 
  checked,
  onClick 
}: MenuItemProps) {
  const content = (
    <>
      <div className="border border-border rounded-lg p-1.5">
        {icon}
      </div>
      <div className="flex flex-col px-1 flex-1">
        <div className="text-sm font-medium text-foreground flex items-center gap-1">
          {label}
          {external && <ExternalLink className="w-3 h-3 text-foreground-muted" />}
        </div>
        <div className="text-xs text-foreground-muted">{description}</div>
      </div>
      <Check 
        className={cn(
          "w-3.5 h-3.5 shrink-0 text-primary",
          checked ? "opacity-100" : "opacity-0"
        )} 
      />
    </>
  );
  
  const className = cn(
    "flex items-center gap-2 w-full px-1.5 py-1.5",
    "rounded-lg cursor-pointer select-none outline-none",
    "text-foreground-secondary",
    "hover:bg-gray-600/5 dark:hover:bg-gray-200/5",
    "hover:text-foreground",
    "transition-colors"
  );
  
  if (href) {
    return (
      <DropdownMenu.Item asChild>
        <a 
          href={href} 
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className={className}
        >
          {content}
        </a>
      </DropdownMenu.Item>
    );
  }
  
  return (
    <DropdownMenu.Item className={className} onSelect={onClick}>
      {content}
    </DropdownMenu.Item>
  );
}
```

### 4.3 Icon Components

```tsx
// components/icons/ai-icons.tsx

export function CopyIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <path d="M14.25 5.25H7.25C6.14543 5.25 5.25 6.14543 5.25 7.25V14.25C5.25 15.3546 6.14543 16.25 7.25 16.25H14.25C15.3546 16.25 16.25 15.3546 16.25 14.25V7.25C16.25 6.14543 15.3546 5.25 14.25 5.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.80103 11.998L1.77203 5.07397C1.61003 3.98097 2.36403 2.96397 3.45603 2.80197L10.38 1.77297C11.313 1.63397 12.19 2.16297 12.528 3.00097" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function MarkdownIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <path d="M15.25 3.75H2.75C1.64543 3.75 0.75 4.64543 0.75 5.75V12.25C0.75 13.3546 1.64543 14.25 2.75 14.25H15.25C16.3546 14.25 17.25 13.3546 17.25 12.25V5.75C17.25 4.64543 16.3546 3.75 15.25 3.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8.75 11.25V6.75H8.356L6.25 9.5L4.144 6.75H3.75V11.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11.5 9.5L13.25 11.25L15 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.25 11.25V6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" className={cn("w-4 h-4", className)}>
      <path d="M21.55 10.004a5.416 5.416 0 00-.478-4.501c-1.217-2.09-3.662-3.166-6.05-2.66A5.59 5.59 0 0010.831 1C8.39.995 6.224 2.546 5.473 4.838A5.553 5.553 0 001.76 7.496a5.487 5.487 0 00.691 6.5 5.416 5.416 0 00.477 4.502c1.217 2.09 3.662 3.165 6.05 2.66A5.586 5.586 0 0013.168 23c2.443.006 4.61-1.546 5.361-3.84a5.553 5.553 0 003.715-2.66 5.488 5.488 0 00-.693-6.497v.001zm-8.381 11.558a4.199 4.199 0 01-2.675-.954c.034-.018.093-.05.132-.074l4.44-2.53a.71.71 0 00.364-.623v-6.176l1.877 1.069c.02.01.033.029.036.05v5.115c-.003 2.274-1.87 4.118-4.174 4.123zM4.192 17.78a4.059 4.059 0 01-.498-2.763c.032.02.09.055.131.078l4.44 2.53c.225.13.504.13.73 0l5.42-3.088v2.138a.068.068 0 01-.027.057L9.9 19.288c-1.999 1.136-4.552.46-5.707-1.51h-.001zM3.023 8.216A4.15 4.15 0 015.198 6.41l-.002.151v5.06a.711.711 0 00.364.624l5.42 3.087-1.876 1.07a.067.067 0 01-.063.005l-4.489-2.559c-1.995-1.14-2.679-3.658-1.53-5.63h.001zm15.417 3.54l-5.42-3.088L14.896 7.6a.067.067 0 01.063-.006l4.489 2.557c1.998 1.14 2.683 3.662 1.529 5.633a4.163 4.163 0 01-2.174 1.807V12.38a.71.71 0 00-.363-.623zm1.867-2.773a6.04 6.04 0 00-.132-.078l-4.44-2.53a.731.731 0 00-.729 0l-5.42 3.088V7.325a.068.068 0 01.027-.057L14.1 4.713c2-1.137 4.555-.46 5.707 1.513.487.833.664 1.809.499 2.757h.001zm-11.741 3.81l-1.877-1.068a.065.065 0 01-.036-.051V6.559c.001-2.277 1.873-4.122 4.181-4.12.976 0 1.92.338 2.671.954-.034.018-.092.05-.131.073l-4.44 2.53a.71.71 0 00-.365.623l-.003 6.173v.002zm1.02-2.168L12 9.25l2.414 1.375v2.75L12 14.75l-2.415-1.375v-2.75z"/>
    </svg>
  );
}

export function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg fill="currentColor" viewBox="0 0 256 257" className={cn("w-4 h-4", className)}>
      <path d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"/>
    </svg>
  );
}

export function MCPIcon({ className }: { className?: string }) {
  return (
    <svg fill="currentColor" viewBox="0 0 24 24" className={cn("w-4 h-4", className)}>
      <path d="M15.688 2.343a2.588 2.588 0 00-3.61 0l-9.626 9.44a.863.863 0 01-1.203 0 .823.823 0 010-1.18l9.626-9.44a4.313 4.313 0 016.016 0 4.116 4.116 0 011.204 3.54 4.3 4.3 0 013.609 1.18l.05.05a4.115 4.115 0 010 5.9l-8.706 8.537a.274.274 0 000 .393l1.788 1.754a.823.823 0 010 1.18.863.863 0 01-1.203 0l-1.788-1.753a1.92 1.92 0 010-2.754l8.706-8.538a2.47 2.47 0 000-3.54l-.05-.049a2.588 2.588 0 00-3.607-.003l-7.172 7.034-.002.002-.098.097a.863.863 0 01-1.204 0 .823.823 0 010-1.18l7.273-7.133a2.47 2.47 0 00-.003-3.537z"/>
      <path d="M14.485 4.703a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a4.115 4.115 0 000 5.9 4.314 4.314 0 006.016 0l7.12-6.982a.823.823 0 000-1.18.863.863 0 00-1.204 0l-7.119 6.982a2.588 2.588 0 01-3.61 0 2.47 2.47 0 010-3.54l7.12-6.982z"/>
    </svg>
  );
}

export function CursorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("w-4 h-4", className)}>
      <path d="M11.925 24l10.425-6-10.425-6L1.5 18l10.425 6z" fill="url(#cursor-fill-0)"/>
      <path d="M22.35 18V6L11.925 0v12l10.425 6z" fill="url(#cursor-fill-1)"/>
      <path d="M11.925 0L1.5 6v12l10.425-6V0z" fill="url(#cursor-fill-2)"/>
      <path d="M22.35 6L11.925 24V12L22.35 6z" fill="currentColor" opacity="0.6"/>
      <path d="M22.35 6l-10.425 6L1.5 6h20.85z" fill="currentColor"/>
      <defs>
        <linearGradient id="cursor-fill-0" x1="11.925" x2="11.925" y1="12" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset=".16" stopColor="currentColor" stopOpacity=".39"/>
          <stop offset=".658" stopColor="currentColor" stopOpacity=".8"/>
        </linearGradient>
        <linearGradient id="cursor-fill-1" x1="22.35" x2="11.925" y1="6.037" y2="12.15" gradientUnits="userSpaceOnUse">
          <stop offset=".182" stopColor="currentColor" stopOpacity=".31"/>
          <stop offset=".715" stopColor="currentColor" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="cursor-fill-2" x1="11.925" x2="1.5" y1="0" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity=".6"/>
          <stop offset=".667" stopColor="currentColor" stopOpacity=".22"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export function VSCodeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" className={cn("w-4 h-4", className)}>
      <path fillRule="evenodd" clipRule="evenodd" d="M70.9119 99.3171C72.4869 99.9307 74.2828 99.8914 75.8725 99.1264L96.4608 89.2197C98.6242 88.1787 100 85.9892 100 83.5872V16.4133C100 14.0113 98.6243 11.8218 96.4609 10.7808L75.8725 0.873756C73.7862 -0.130129 71.3446 0.11576 69.5135 1.44695C69.252 1.63711 69.0028 1.84943 68.769 2.08341L29.3551 38.0415L12.1872 25.0096C10.589 23.7965 8.35363 23.8959 6.86933 25.2461L1.36303 30.2549C-0.452552 31.9064 -0.454633 34.7627 1.35853 36.417L16.2471 50.0001L1.35853 63.5832C-0.454633 65.2374 -0.452552 68.0938 1.36303 69.7453L6.86933 74.7541C8.35363 76.1043 10.589 76.2037 12.1872 74.9905L29.3551 61.9587L68.769 97.9167C69.3925 98.5406 70.1246 99.0104 70.9119 99.3171ZM75.0152 27.2989L45.1091 50.0001L75.0152 72.7012V27.2989Z"/>
    </svg>
  );
}
```

---

## 5. MCP Server Integration

### 5.1 Overview

Implement an MCP (Model Context Protocol) server endpoint that allows AI assistants in IDEs to query the API reference documentation.

### 5.2 MCP Endpoint

```typescript
// apps/web/app/mcp/route.ts

import { NextRequest } from 'next/server';
import { getManifestData, getSymbolData, getSymbols } from '@/lib/ir/loader';
import { symbolToMarkdown } from '@/lib/ir/markdown-generator';

// MCP Server responds to tool calls
export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Handle MCP protocol messages
  const { method, params, id } = body;
  
  switch (method) {
    case 'initialize':
      return Response.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'langchain-reference',
            version: '1.0.0',
          },
          capabilities: {
            tools: {},
            resources: {},
          },
        },
      });
    
    case 'tools/list':
      return Response.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'search_api',
              description: 'Search the LangChain API reference documentation',
              inputSchema: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Search query (class name, function name, or keyword)',
                  },
                  language: {
                    type: 'string',
                    enum: ['python', 'javascript'],
                    description: 'Programming language to search',
                  },
                },
                required: ['query'],
              },
            },
            {
              name: 'get_symbol',
              description: 'Get detailed documentation for a specific symbol',
              inputSchema: {
                type: 'object',
                properties: {
                  package: {
                    type: 'string',
                    description: 'Package name (e.g., langchain-core, @langchain/core)',
                  },
                  symbol: {
                    type: 'string',
                    description: 'Symbol name or qualified path (e.g., ChatOpenAI)',
                  },
                },
                required: ['package', 'symbol'],
              },
            },
          ],
        },
      });
    
    case 'tools/call':
      return handleToolCall(params, id);
    
    case 'resources/list':
      return Response.json({
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            {
              uri: 'langchain://llms.txt',
              name: 'LangChain API Reference Index',
              description: 'Index of all available API documentation',
              mimeType: 'text/plain',
            },
          ],
        },
      });
    
    case 'resources/read':
      return handleResourceRead(params, id);
    
    default:
      return Response.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      });
  }
}

async function handleToolCall(params: any, id: string | number) {
  const { name, arguments: args } = params;
  
  switch (name) {
    case 'search_api': {
      const { query, language = 'python' } = args;
      const results = await searchSymbols(query, language);
      
      return Response.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: formatSearchResults(results),
            },
          ],
        },
      });
    }
    
    case 'get_symbol': {
      const { package: packageName, symbol: symbolName } = args;
      const symbol = await getSymbolByName(packageName, symbolName);
      
      if (!symbol) {
        return Response.json({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Symbol "${symbolName}" not found in package "${packageName}"`,
              },
            ],
          },
        });
      }
      
      const markdown = symbolToMarkdown(symbol, packageName);
      
      return Response.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: markdown,
            },
          ],
        },
      });
    }
    
    default:
      return Response.json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Unknown tool: ${name}`,
        },
      });
  }
}

async function handleResourceRead(params: any, id: string | number) {
  const { uri } = params;
  
  if (uri === 'langchain://llms.txt') {
    const llmsTxt = await generateLlmsTxt();
    return Response.json({
      jsonrpc: '2.0',
      id,
      result: {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: llmsTxt,
          },
        ],
      },
    });
  }
  
  return Response.json({
    jsonrpc: '2.0',
    id,
    error: {
      code: -32002,
      message: `Resource not found: ${uri}`,
    },
  });
}
```

### 5.3 MCP Server URL Configuration

```typescript
// lib/config/mcp.ts

export const MCP_CONFIG = {
  // Base URL for the MCP server
  serverUrl: process.env.NEXT_PUBLIC_MCP_URL || 'https://reference.langchain.com/mcp',
  
  // Cursor deep link format
  cursorInstallUrl: (serverUrl: string) => 
    `cursor://mcp/install?url=${encodeURIComponent(serverUrl)}`,
  
  // VS Code deep link format
  vscodeInstallUrl: (serverUrl: string) =>
    `vscode://mcp/install?url=${encodeURIComponent(serverUrl)}`,
};
```

---

## 6. llms.txt Implementation

### 6.1 Overview

Implement the `llms.txt` standard for providing LLM-friendly documentation index.

### 6.2 llms.txt Route

```typescript
// apps/web/app/llms.txt/route.ts

import { NextRequest } from 'next/server';
import { getManifestData, getSymbols } from '@/lib/ir/loader';

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://reference.langchain.com';
  
  const lines: string[] = [
    '# LangChain API Reference',
    '',
    '> Comprehensive API documentation for LangChain Python and JavaScript libraries.',
    '',
    '## Overview',
    '',
    'This is the API reference for LangChain, a framework for building applications',
    'with large language models (LLMs). This reference covers:',
    '',
    '- **Python packages**: langchain, langchain-core, langchain-community, and integrations',
    '- **JavaScript packages**: @langchain/core, @langchain/community, and integrations',
    '',
    '## Quick Links',
    '',
  ];
  
  // Get manifest for package listing
  const manifest = await getManifestData();
  
  if (manifest) {
    // Group packages by language
    const pythonPackages = manifest.packages.filter(p => p.language === 'python');
    const jsPackages = manifest.packages.filter(p => p.language === 'typescript');
    
    if (pythonPackages.length > 0) {
      lines.push('### Python');
      lines.push('');
      for (const pkg of pythonPackages) {
        const pkgUrl = `${baseUrl}/python/${slugifyPackageName(pkg.publishedName)}`;
        lines.push(`- [${pkg.publishedName}](${pkgUrl}): ${pkg.stats.total} symbols`);
      }
      lines.push('');
    }
    
    if (jsPackages.length > 0) {
      lines.push('### JavaScript');
      lines.push('');
      for (const pkg of jsPackages) {
        const pkgUrl = `${baseUrl}/javascript/${slugifyPackageName(pkg.publishedName)}`;
        lines.push(`- [${pkg.publishedName}](${pkgUrl}): ${pkg.stats.total} symbols`);
      }
      lines.push('');
    }
  }
  
  lines.push('## Key Classes');
  lines.push('');
  lines.push('The most commonly used classes in LangChain:');
  lines.push('');
  
  // Add key classes (could be curated or auto-detected)
  const keyClasses = [
    { name: 'ChatOpenAI', pkg: 'langchain-openai', lang: 'python' },
    { name: 'ChatAnthropic', pkg: 'langchain-anthropic', lang: 'python' },
    { name: 'RunnableSequence', pkg: 'langchain-core', lang: 'python' },
    { name: 'ChatPromptTemplate', pkg: 'langchain-core', lang: 'python' },
    { name: 'ChatOpenAI', pkg: '@langchain/openai', lang: 'javascript' },
    { name: 'ChatAnthropic', pkg: '@langchain/anthropic', lang: 'javascript' },
  ];
  
  for (const cls of keyClasses) {
    const langPath = cls.lang === 'python' ? 'python' : 'javascript';
    const pkgSlug = slugifyPackageName(cls.pkg);
    const url = `${baseUrl}/${langPath}/${pkgSlug}/${cls.name}`;
    lines.push(`- [${cls.name}](${url}) (${cls.pkg})`);
  }
  
  lines.push('');
  lines.push('## API Access');
  lines.push('');
  lines.push('You can access any page as markdown by appending `?format=md` to the URL.');
  lines.push('');
  lines.push(`Example: ${baseUrl}/python/langchain-core/RunnableSequence?format=md`);
  lines.push('');
  lines.push('## MCP Server');
  lines.push('');
  lines.push(`This documentation is available as an MCP server: ${baseUrl}/mcp`);
  lines.push('');
  lines.push('Use this URL to connect from Cursor, VS Code, or other MCP-compatible tools.');
  
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

function slugifyPackageName(name: string): string {
  return name.replace(/@/g, '').replace(/\//g, '-');
}
```

### 6.3 llms-full.txt Route

A more comprehensive version with all symbol listings:

```typescript
// apps/web/app/llms-full.txt/route.ts

import { NextRequest } from 'next/server';
import { getManifestData, getSymbols } from '@/lib/ir/loader';

export async function GET(request: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://reference.langchain.com';
  
  const lines: string[] = [
    '# LangChain API Reference - Full Index',
    '',
    '> Complete listing of all symbols in the LangChain API reference.',
    '',
  ];
  
  const manifest = await getManifestData();
  
  if (manifest) {
    for (const pkg of manifest.packages) {
      const langPath = pkg.language === 'python' ? 'python' : 'javascript';
      const pkgSlug = slugifyPackageName(pkg.publishedName);
      
      lines.push(`## ${pkg.displayName}`);
      lines.push('');
      lines.push(`Package: \`${pkg.publishedName}\``);
      lines.push(`Language: ${pkg.language}`);
      lines.push('');
      
      // Get symbols for this package
      const symbolsResult = await getSymbols(pkg.packageId);
      
      if (symbolsResult?.symbols) {
        // Group by kind
        const classes = symbolsResult.symbols.filter(s => s.kind === 'class');
        const functions = symbolsResult.symbols.filter(s => s.kind === 'function');
        const interfaces = symbolsResult.symbols.filter(s => s.kind === 'interface');
        
        if (classes.length > 0) {
          lines.push('### Classes');
          lines.push('');
          for (const cls of classes.slice(0, 100)) { // Limit for size
            const url = `${baseUrl}/${langPath}/${pkgSlug}/${cls.qualifiedName}`;
            const summary = cls.docs?.summary ? `: ${cls.docs.summary.slice(0, 80)}` : '';
            lines.push(`- [${cls.name}](${url})${summary}`);
          }
          if (classes.length > 100) {
            lines.push(`- ... and ${classes.length - 100} more classes`);
          }
          lines.push('');
        }
        
        if (functions.length > 0) {
          lines.push('### Functions');
          lines.push('');
          for (const fn of functions.slice(0, 50)) {
            const url = `${baseUrl}/${langPath}/${pkgSlug}/${fn.qualifiedName}`;
            lines.push(`- [${fn.name}](${url})`);
          }
          if (functions.length > 50) {
            lines.push(`- ... and ${functions.length - 50} more functions`);
          }
          lines.push('');
        }
      }
    }
  }
  
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

---

## 7. Component Specifications

### 7.1 Integration with SymbolPage

The copy button and context menu should be integrated into the existing SymbolPage component:

```tsx
// apps/web/components/reference/SymbolPage.tsx (additions)

import { CopyPageButton } from './CopyPageButton';
import { PageContextMenu } from './PageContextMenu';
import { symbolToMarkdown } from '@/lib/ir/markdown-generator';

export async function SymbolPage({ language, packageId, packageName, symbolPath }: SymbolPageProps) {
  // ... existing symbol loading logic ...
  
  // Generate markdown for copy functionality
  const markdown = symbol ? symbolToMarkdown(toIRSymbol(symbol), packageName) : '';
  
  // Build URLs
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://reference.langchain.com';
  const langPath = language === 'python' ? 'python' : 'javascript';
  const packageSlug = slugifyPackageName(packageName);
  const pageUrl = `${baseUrl}/${langPath}/${packageSlug}/${symbolPath}`;
  const mcpServerUrl = `${baseUrl}/mcp`;
  const llmsTxtUrl = `${baseUrl}/llms.txt`;
  
  return (
    <div className="flex gap-8">
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8">
        {/* Header with copy button */}
        <div className="flex items-start justify-between gap-4">
          <div>
            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-sm text-foreground-secondary flex-wrap mb-4">
              {/* ... existing breadcrumbs ... */}
            </nav>
            
            {/* Title and badges */}
            <div className="flex items-center gap-3 mb-2">
              {/* ... existing badges ... */}
            </div>
            <h1 className="text-3xl font-bold text-foreground font-mono">
              {symbol.name}
            </h1>
          </div>
          
          {/* Copy button and context menu */}
          <div className="flex items-center shrink-0">
            <CopyPageButton markdown={markdown} />
            <PageContextMenu
              pageUrl={pageUrl}
              markdown={markdown}
              mcpServerUrl={mcpServerUrl}
              llmsTxtUrl={llmsTxtUrl}
            />
          </div>
        </div>
        
        {/* ... rest of the page ... */}
      </div>
      
      {/* Table of Contents sidebar */}
      <TableOfContents ... />
    </div>
  );
}
```

### 7.2 Responsive Behavior

On mobile devices, the copy button should be simplified:

```tsx
// components/reference/CopyPageButton.tsx

export function CopyPageButton({ markdown, className }: CopyPageButtonProps) {
  // ...
  
  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5",
        "text-sm font-medium",
        "rounded-l-xl border border-r-0",
        "border-gray-200 dark:border-white/[0.07]",
        "bg-background hover:bg-gray-600/5 dark:hover:bg-gray-200/5",
        "text-foreground-secondary hover:text-foreground",
        "transition-colors",
        // Hide text on small screens
        "sm:gap-2",
        className
      )}
      aria-label="Copy page as markdown"
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <CopyIcon className="w-4 h-4" />
      )}
      {/* Hide text on mobile */}
      <span className="hidden sm:inline">
        {copied ? 'Copied!' : 'Copy page'}
      </span>
    </button>
  );
}
```

---

## 8. API Routes

### 8.1 Route Summary

| Route | Method | Description |
|-------|--------|-------------|
| `/llms.txt` | GET | LLM-friendly documentation index |
| `/llms-full.txt` | GET | Complete symbol listing |
| `/mcp` | POST | MCP server endpoint |
| `/[lang]/[package]/[...path]?format=md` | GET | Markdown version of any page |

### 8.2 Headers and Caching

All markdown and llms.txt responses should include appropriate headers:

```typescript
const markdownHeaders = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  'X-Robots-Tag': 'noindex', // Don't index markdown versions in search engines
};

const llmsTxtHeaders = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
};
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
// lib/utils/__tests__/content-negotiation.test.ts

import { describe, it, expect } from 'vitest';
import { detectRequestedFormat } from '../content-negotiation';

describe('detectRequestedFormat', () => {
  it('should return markdown for format=md query param', () => {
    const result = detectRequestedFormat({
      headers: new Headers(),
      searchParams: new URLSearchParams('format=md'),
    });
    expect(result).toBe('markdown');
  });
  
  it('should return markdown for GPTBot user agent', () => {
    const result = detectRequestedFormat({
      headers: new Headers({ 'user-agent': 'GPTBot/1.0' }),
      searchParams: new URLSearchParams(),
    });
    expect(result).toBe('markdown');
  });
  
  it('should return html for browser user agent', () => {
    const result = detectRequestedFormat({
      headers: new Headers({
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'text/html',
      }),
      searchParams: new URLSearchParams(),
    });
    expect(result).toBe('html');
  });
  
  it('should return markdown for text/markdown Accept header', () => {
    const result = detectRequestedFormat({
      headers: new Headers({ 'accept': 'text/markdown' }),
      searchParams: new URLSearchParams(),
    });
    expect(result).toBe('markdown');
  });
});
```

### 9.2 Integration Tests

```typescript
// apps/web/app/(ref)/__tests__/markdown-response.test.ts

import { describe, it, expect } from 'vitest';
import { GET } from '../[lang]/[package]/[...path]/route';

describe('Markdown Response', () => {
  it('should return markdown content when format=md', async () => {
    const request = new Request(
      'http://localhost:3000/python/langchain-core/ChatOpenAI?format=md'
    );
    
    const response = await GET(request);
    
    expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    const text = await response.text();
    expect(text).toContain('# ChatOpenAI');
    expect(text).toContain('## Signature');
  });
});
```

### 9.3 E2E Tests

```typescript
// e2e/ai-friendly.spec.ts

import { test, expect } from '@playwright/test';

test.describe('AI-Friendly Features', () => {
  test('should display copy page button on symbol pages', async ({ page }) => {
    await page.goto('/python/langchain-core/ChatOpenAI');
    
    const copyButton = page.locator('button:has-text("Copy page")');
    await expect(copyButton).toBeVisible();
  });
  
  test('should copy markdown to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/python/langchain-core/ChatOpenAI');
    
    await page.click('button:has-text("Copy page")');
    
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('# ChatOpenAI');
  });
  
  test('should show context menu with AI options', async ({ page }) => {
    await page.goto('/python/langchain-core/ChatOpenAI');
    
    // Open dropdown
    await page.click('[aria-label="More actions"]');
    
    // Check menu items
    await expect(page.locator('text=Open in ChatGPT')).toBeVisible();
    await expect(page.locator('text=Open in Claude')).toBeVisible();
    await expect(page.locator('text=Copy MCP Server')).toBeVisible();
  });
  
  test('should serve markdown for curl requests', async ({ request }) => {
    const response = await request.get('/python/langchain-core/ChatOpenAI', {
      headers: {
        'User-Agent': 'curl/8.0.0',
        'Accept': '*/*',
      },
    });
    
    expect(response.headers()['content-type']).toContain('text/markdown');
  });
  
  test('llms.txt should be accessible', async ({ request }) => {
    const response = await request.get('/llms.txt');
    
    expect(response.ok()).toBe(true);
    const text = await response.text();
    expect(text).toContain('# LangChain API Reference');
    expect(text).toContain('## Quick Links');
  });
});
```

---

## 10. Acceptance Criteria

### 10.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Pages serve markdown when `?format=md` is appended | P0 |
| F2 | Pages serve markdown for known LLM user agents | P0 |
| F3 | Copy page button copies content as markdown | P0 |
| F4 | Context menu displays all AI-focused actions | P0 |
| F5 | llms.txt provides site index for LLMs | P0 |
| F6 | MCP endpoint responds to MCP protocol messages | P1 |
| F7 | Open in ChatGPT/Claude links work correctly | P1 |
| F8 | Cursor/VS Code deep links trigger IDE | P2 |
| F9 | Markdown output is optimized for token efficiency | P1 |
| F10 | Copy button shows success feedback | P0 |

### 10.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NF1 | Markdown generation latency | < 100ms |
| NF2 | Copy to clipboard success rate | > 99% |
| NF3 | llms.txt response time | < 500ms |
| NF4 | MCP response time | < 200ms |
| NF5 | Accessibility compliance | WCAG 2.1 AA |

### 10.3 Definition of Done

- [ ] All P0 functional requirements implemented
- [ ] Content negotiation working for all user agents
- [ ] Copy page button functional on all symbol pages
- [ ] Context menu with all actions implemented
- [ ] llms.txt accessible at site root
- [ ] MCP endpoint responds to basic queries
- [ ] Unit tests for content negotiation
- [ ] E2E tests for user-facing features
- [ ] Documentation for MCP integration

---

## Appendix A: User Agent Patterns

### Known LLM Crawlers

| Pattern | Service |
|---------|---------|
| GPTBot | OpenAI web crawler |
| ChatGPT-User | ChatGPT with browsing |
| Claude-Web | Claude web access |
| Anthropic-AI | Anthropic crawlers |
| PerplexityBot | Perplexity AI |
| Google-Extended | Google Bard/Gemini |
| YouBot | You.com |
| cohere-ai | Cohere |

### IDE/Agent Patterns

| Pattern | Tool |
|---------|------|
| cursor | Cursor IDE |
| copilot | GitHub Copilot |
| aider | Aider CLI |
| continue | Continue.dev |

---

## Appendix B: Markdown Format

### Symbol Page Template

```markdown
# {SymbolName}

> **{Kind}** in `{PackageName}`

📖 [View in docs]({CanonicalURL})

{Summary}

## Signature

```{language}
{Signature}
```

## Description

{Description}

## Parameters

| Name | Type | Description |
|------|------|-------------|
| `{name}` | `{type}` | {description} |

## Returns

`{ReturnType}`

{ReturnDescription}

## Examples

```{language}
{ExampleCode}
```

---

[View source on GitHub]({SourceURL})
```

---

*End of Specification*

