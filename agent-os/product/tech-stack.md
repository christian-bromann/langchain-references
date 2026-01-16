# LangChain Reference Docs — Tech Stack

## Overview

This document defines the technical architecture and tool choices for the unified API reference documentation platform.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Build Pipeline                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│   │   GitHub     │    │   TypeDoc    │    │   griffe     │              │
│   │   Tarball    │───▶│   JSON       │───▶│   (Python)   │              │
│   │   @sha       │    │   (TS/JS)    │    │              │              │
│   └──────────────┘    └──────────────┘    └──────────────┘              │
│          │                   │                   │                       │
│          └───────────────────┴───────────────────┘                       │
│                              │                                           │
│                              ▼                                           │
│                    ┌──────────────────┐                                  │
│                    │  Reference IR    │                                  │
│                    │  (Normalized)    │                                  │
│                    └──────────────────┘                                  │
│                              │                                           │
│          ┌───────────────────┼───────────────────┐                       │
│          ▼                   ▼                   ▼                       │
│   ┌────────────┐    ┌──────────────┐    ┌──────────────┐                │
│   │ Manifest   │    │   Symbols    │    │   Search     │                │
│   │ (nav/pkg)  │    │   (shards)   │    │   Index      │                │
│   └────────────┘    └──────────────┘    └──────────────┘                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Vercel Platform                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│   │ Vercel Blob  │    │  Vercel KV   │    │   Next.js    │              │
│   │ (IR storage) │    │  (pointers)  │    │   (render)   │              │
│   └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              CDN / Edge                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   /python/{pkg}/{version}/...     /javascript/{pkg}/{version}/...       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Technologies

### Frontend / Rendering

| Technology       | Version | Purpose                                  |
| ---------------- | ------- | ---------------------------------------- |
| **Next.js**      | 15.x    | React framework with App Router, SSR/ISR |
| **React**        | 19.x    | UI component library                     |
| **TypeScript**   | 5.x     | Type-safe development                    |
| **Tailwind CSS** | 4.x     | Utility-first styling                    |
| **Radix UI**     | latest  | Accessible component primitives          |

### Build & Extraction

| Technology  | Purpose                                     |
| ----------- | ------------------------------------------- |
| **TypeDoc** | Extract TypeScript/JavaScript APIs to JSON  |
| **griffe**  | Extract Python APIs without runtime imports |
| **pnpm**    | Fast, disk-efficient package manager        |
| **tsx**     | TypeScript execution for build scripts      |

### Storage & State

| Technology      | Purpose                                             |
| --------------- | --------------------------------------------------- |
| **Vercel Blob** | Immutable IR artifact storage (`/ir/{buildId}/...`) |
| **Vercel KV**   | Version pointers, build status, latest aliases      |

### Search

| Technology                       | Purpose                      |
| -------------------------------- | ---------------------------- |
| **FlexSearch** or **MiniSearch** | Client-side full-text search |
| JSON index built from IR         | Pre-computed search entries  |

### Hosting & Infrastructure

| Technology         | Purpose                            |
| ------------------ | ---------------------------------- |
| **Vercel**         | Hosting, CDN, serverless functions |
| **GitHub Actions** | CI/CD for builds and deployments   |

---

## Design System

### Brand Tokens (from Mintlify docs.json)

```typescript
export const tokens = {
  theme: "aspen",
  colors: {
    primary: "#2F6868",
    light: "#84C4C0",
    dark: "#1C3C3C",
  },
  fonts: {
    heading: "Manrope",
    body: "Inter", // Default body font
    mono: "JetBrains Mono",
  },
  logo: {
    light: "/images/brand/langchain-docs-teal.svg",
    dark: "/images/brand/langchain-docs-lilac.svg",
  },
  favicon: "/images/brand/docs-favicon.png",
} as const;
```

### Layout Patterns

| Component        | Mintlify Pattern                                       |
| ---------------- | ------------------------------------------------------ |
| **Top navbar**   | Ask AI, GitHub link, "Try LangSmith" CTA               |
| **Left nav**     | Product/package grouping, collapsible sections         |
| **Content area** | Symbol documentation, code blocks                      |
| **Right TOC**    | On-page navigation, sticky position                    |
| **Breadcrumbs**  | Eyebrow navigation (`styling.eyebrows: 'breadcrumbs'`) |

### Styling Conventions

- CSS custom properties for theme tokens
- Dark mode support via `appearance.default: 'system'`
- Tailwind for utility classes
- Component-scoped styles where needed

---

## Data Models

### Reference IR Schema

#### Manifest (`reference.manifest.json`)

```typescript
interface Manifest {
  irVersion: string;
  build: {
    buildId: string;
    createdAt: string;
    baseUrl: string;
  };
  sources: Array<{
    repo: string;
    sha: string;
  }>;
  packages: Array<{
    packageId: string;
    displayName: string;
    language: "python" | "typescript";
    version: string;
  }>;
}
```

#### Symbol Record

```typescript
interface SymbolRecord {
  id: string;
  packageId: string;
  language: "python" | "typescript";
  kind: "class" | "function" | "method" | "interface" | "type" | "module";
  name: string;
  qualifiedName: string;
  signature: string;
  docs: {
    summary: string;
    description?: string;
    examples?: Array<{ code: string; title?: string }>;
    deprecated?: { message: string };
  };
  params?: Array<{
    name: string;
    type: string;
    description?: string;
    default?: string;
  }>;
  returns?: {
    type: string;
    description?: string;
  };
  source: {
    repo: string;
    sha: string;
    path: string;
    line: number;
  };
}
```

#### Search Record

```typescript
interface SearchRecord {
  id: string;
  url: string;
  title: string;
  breadcrumbs: string[];
  excerpt: string;
  kind: string;
  language: "python" | "typescript";
  packageId: string;
}
```

---

## URL Conventions

### Canonical Routes

| Pattern         | Example                                                |
| --------------- | ------------------------------------------------------ |
| Package landing | `/python/langchain/1.0.0/`                             |
| Class page      | `/python/langchain/1.0.0/classes/ChatOpenAI/`          |
| Function page   | `/javascript/langchain/0.3.0/functions/initChatModel/` |
| Module page     | `/python/langchain_core/1.0.0/modules/messages/`       |
| Latest alias    | `/python/langchain/latest/` → redirects to current     |

### Versioned vs Pinned Builds

| URL Type                      | Cache Behavior                  |
| ----------------------------- | ------------------------------- |
| `/python/{pkg}/{version}/...` | Immutable, cache forever        |
| `/python/{pkg}/latest/...`    | Short TTL, redirects to version |
| `/b/{buildId}/...`            | Immutable, internal debugging   |

---

## Storage Layout

### Vercel Blob (`/ir/{buildId}/`)

```
ir/{buildId}/
├── reference.manifest.json      # Build metadata, package list
├── routing/
│   ├── python/
│   │   ├── langchain.json       # URL slug → refId mapping
│   │   └── langchain_core.json
│   └── javascript/
│       ├── langchain.json
│       └── @langchain_core.json
├── symbols/
│   ├── a/                       # Sharded by refId prefix
│   │   └── sym_py_class_*.json
│   ├── b/
│   └── ...
└── search/
    └── index.json               # Full search index
```

### Vercel KV Keys

| Key Pattern                               | Value                            |
| ----------------------------------------- | -------------------------------- |
| `latest:python:{package}`                 | `{ version, buildId }`           |
| `latest:javascript:{package}`             | `{ version, buildId }`           |
| `version:{ecosystem}:{package}:{version}` | `{ buildId, sha }`               |
| `build:{buildId}`                         | `{ status, createdAt, sources }` |

---

## Build Pipeline

### Trigger Methods

1. **Release events**: GitHub Actions on tag push
2. **Nightly builds**: Scheduled workflow for latest main
3. **Manual API**: `POST /api/build` with package/version

### Build Steps

```
1. Fetch tarball
   └─▶ GET https://api.github.com/repos/{owner}/{repo}/tarball/{sha}

2. Extract to workspace
   └─▶ cache/unpacked/{owner_repo}/{sha}/

3. Generate IR
   ├─▶ TypeDoc: npx typedoc --json → transform
   └─▶ griffe: python -m griffe → transform

4. Upload artifacts
   └─▶ Vercel Blob: ir/{buildId}/...

5. Update pointers
   └─▶ Vercel KV: latest:*, version:*

6. Invalidate cache (if latest)
   └─▶ Vercel purge API
```

### Build ID Generation

```typescript
const buildId = crypto
  .createHash("sha256")
  .update(
    JSON.stringify({
      config: normalizedConfig,
      sources: sources.map((s) => `${s.repo}@${s.sha}`),
      extractorVersions: { typedoc: "0.x", griffe: "0.x" },
    }),
  )
  .digest("hex")
  .slice(0, 16);
```

---

## Integrations

### Analytics

| Tool                   | Purpose                             |
| ---------------------- | ----------------------------------- |
| **Google Tag Manager** | `GTM-MBBX68ST` (from Mintlify docs) |
| **Vercel Analytics**   | Core Web Vitals, page views         |

### External Links

| Link          | URL                               |
| ------------- | --------------------------------- |
| Ask AI        | `https://chat.langchain.com/`     |
| GitHub        | `https://github.com/langchain-ai` |
| Try LangSmith | `https://smith.langchain.com/`    |

---

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.11+ (for griffe)

### Quick Start

```bash
# Clone and install
git clone <repo>
cd langchain-reference-docs
pnpm install

# Development server
pnpm dev

# Build IR for a package
pnpm build:ir --package langchain --version 1.0.0

# Production build
pnpm build
```

### Environment Variables

```bash
# Vercel storage
BLOB_READ_WRITE_TOKEN=
KV_REST_API_URL=
KV_REST_API_TOKEN=

# GitHub (for tarball access)
GITHUB_TOKEN=

# Optional
VERCEL_ANALYTICS_ID=
```

---

## Security Considerations

- GitHub tarball downloads use authenticated requests (rate limits)
- Vercel Blob/KV accessed via server-side only
- No user-generated content in v1
- CSP headers configured for script/style sources
