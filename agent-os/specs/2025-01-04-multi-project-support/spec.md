# Specification: Multi-Project Reference Documentation Support

**Spec ID**: `2025-01-04-multi-project-support`  
**Created**: January 4, 2025  
**Status**: Ready for Implementation

---

## Table of Contents

1. [Overview](#1-overview)
2. [Project Registry](#2-project-registry)
3. [Header Navigation](#3-header-navigation)
4. [Routing Architecture](#4-routing-architecture)
5. [Configuration System](#5-configuration-system)
6. [Build Pipeline Updates](#6-build-pipeline-updates)
7. [Sidebar Updates](#7-sidebar-updates)
8. [UI Components](#8-ui-components)
9. [Implementation Plan](#9-implementation-plan)
10. [Acceptance Criteria](#10-acceptance-criteria)

---

## 1. Overview

### 1.1 Goal

Extend the existing reference documentation platform to support multiple LangChain ecosystem projects, each with Python and JavaScript variants:

- **LangChain** (Python & JavaScript) — _Already implemented_
- **LangGraph** (Python & JavaScript) — _To be added_
- **DeepAgent** (Python & JavaScript) — _To be added_

### 1.2 Scope

**In Scope (v1)**:

- Project navigation tabs in the header
- Separate configuration files per project
- Shared routing infrastructure supporting multiple projects
- Unified build pipeline for all projects
- Project-aware sidebar navigation
- Search scoped to current project and language

**Out of Scope (v1)**:

- Cross-project search
- Project comparison views
- Version history across projects

### 1.3 Project Repositories

| Project   | Language   | Repository                  |
| --------- | ---------- | --------------------------- |
| LangChain | Python     | `langchain-ai/langchain`    |
| LangChain | JavaScript | `langchain-ai/langchainjs`  |
| LangGraph | Python     | `langchain-ai/langgraph`    |
| LangGraph | JavaScript | `langchain-ai/langgraphjs`  |
| DeepAgent | Python     | `langchain-ai/deepagents`   |
| DeepAgent | JavaScript | `langchain-ai/deepagentsjs` |

---

## 2. Project Registry

### 2.1 Project Configuration Type

```typescript
// packages/ir-schema/src/project.ts

export interface ProjectConfig {
  /** Unique project identifier (e.g., "langchain", "langgraph", "deepagent") */
  id: string;

  /** Display name for UI */
  displayName: string;

  /** Short description */
  description: string;

  /** URL slug for routing (e.g., "/langchain", "/langgraph") */
  slug: string;

  /** Available language variants */
  variants: ProjectVariant[];

  /** Navigation order (lower = first) */
  order: number;

  /** Whether project is enabled */
  enabled: boolean;
}

export interface ProjectVariant {
  /** Language identifier */
  language: "python" | "javascript";

  /** GitHub repository */
  repo: string;

  /** Path to configuration file */
  configPath: string;

  /** Whether this variant is enabled */
  enabled: boolean;
}
```

### 2.2 Central Project Registry

```typescript
// apps/web/lib/config/projects.ts

import type { ProjectConfig } from "@langchain/ir-schema";

export const PROJECTS: ProjectConfig[] = [
  {
    id: "langchain",
    displayName: "LangChain",
    description: "Build context-aware reasoning applications",
    slug: "langchain",
    order: 1,
    enabled: true,
    variants: [
      {
        language: "python",
        repo: "langchain-ai/langchain",
        configPath: "configs/langchain-python.json",
        enabled: true,
      },
      {
        language: "javascript",
        repo: "langchain-ai/langchainjs",
        configPath: "configs/langchain-typescript.json",
        enabled: true,
      },
    ],
  },
  {
    id: "langgraph",
    displayName: "LangGraph",
    description: "Build resilient language agents as graphs",
    slug: "langgraph",
    order: 2,
    enabled: true,
    variants: [
      {
        language: "python",
        repo: "langchain-ai/langgraph",
        configPath: "configs/langgraph-python.json",
        enabled: true,
      },
      {
        language: "javascript",
        repo: "langchain-ai/langgraphjs",
        configPath: "configs/langgraph-typescript.json",
        enabled: true,
      },
    ],
  },
  {
    id: "deepagent",
    displayName: "Deep Agents",
    description: "Build advanced autonomous agents",
    slug: "deepagents",
    order: 3,
    enabled: true,
    variants: [
      {
        language: "python",
        repo: "langchain-ai/deepagents",
        configPath: "configs/deepagent-python.json",
        enabled: true,
      },
      {
        language: "javascript",
        repo: "langchain-ai/deepagentsjs",
        configPath: "configs/deepagent-typescript.json",
        enabled: true,
      },
    ],
  },
];

export function getEnabledProjects(): ProjectConfig[] {
  return PROJECTS.filter((p) => p.enabled).sort((a, b) => a.order - b.order);
}

export function getProjectBySlug(slug: string): ProjectConfig | undefined {
  return PROJECTS.find((p) => p.slug === slug && p.enabled);
}

export function getProjectById(id: string): ProjectConfig | undefined {
  return PROJECTS.find((p) => p.id === id && p.enabled);
}
```

---

## 3. Header Navigation

### 3.1 Design Reference (Mintlify)

The header should include project navigation tabs similar to the Mintlify implementation:

```html
<!-- Mintlify reference structure -->
<div class="hidden lg:flex px-4 h-10">
  <div class="nav-tabs h-full flex text-sm gap-x-6">
    <a class="nav-tabs-item active" href="/langchain/...">LangChain</a>
    <a class="nav-tabs-item" href="/langgraph/...">LangGraph</a>
    <a class="nav-tabs-item" href="/deepagents/...">Deep Agents</a>
  </div>
</div>
```

### 3.2 Header Component Update

The project tabs should be inserted at line 185 in `apps/web/components/layout/Header.tsx`:

```tsx
// apps/web/components/layout/Header.tsx

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getEnabledProjects } from "@/lib/config/projects";
import { cn } from "@/lib/utils/cn";
// ... other imports ...

export function Header() {
  const pathname = usePathname();
  const projects = getEnabledProjects();

  // Determine current project and language from pathname
  const currentProject = getCurrentProject(pathname, projects);
  const currentLanguage = getCurrentLanguage(pathname);

  // ... existing state and handlers ...

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm">
      <div className="z-10 mx-auto relative max-w-8xl px-0 lg:px-5">
        {/* Main header row */}
        <div className="flex items-center lg:px-4 h-14 min-w-0 px-4">
          {/* ... existing header content ... */}
        </div>

        {/* Project Navigation Tabs (NEW) */}
        <ProjectTabs
          projects={projects}
          currentProject={currentProject}
          currentLanguage={currentLanguage}
        />
      </div>

      {/* Search Modal */}
      <SearchModal open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}

// Helper to extract current project from pathname
function getCurrentProject(pathname: string, projects: ProjectConfig[]): ProjectConfig | null {
  // Match patterns like /python/langchain/... or /javascript/langgraph/...
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length >= 2) {
    const [lang, projectSlug] = segments;
    if (lang === "python" || lang === "javascript") {
      return projects.find((p) => p.slug === projectSlug) || projects[0];
    }
  }

  return projects[0]; // Default to first project
}

function getCurrentLanguage(pathname: string): "python" | "javascript" {
  if (pathname.startsWith("/javascript")) return "javascript";
  return "python";
}
```

### 3.3 ProjectTabs Component

```tsx
// apps/web/components/layout/ProjectTabs.tsx

"use client";

import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import type { ProjectConfig } from "@langchain/ir-schema";

interface ProjectTabsProps {
  projects: ProjectConfig[];
  currentProject: ProjectConfig | null;
  currentLanguage: "python" | "javascript";
}

export function ProjectTabs({ projects, currentProject, currentLanguage }: ProjectTabsProps) {
  return (
    <div className="hidden lg:flex px-4 h-10 border-t border-gray-200/50 dark:border-gray-800/50">
      <nav className="h-full flex text-sm gap-x-6" aria-label="Project navigation">
        {projects.map((project) => {
          const isActive = currentProject?.id === project.id;
          const href = `/${currentLanguage}/${project.slug}`;

          return (
            <Link
              key={project.id}
              href={href}
              className={cn(
                "group relative h-full gap-2 flex items-center font-medium transition-colors",
                isActive
                  ? "text-primary dark:text-primary-light [text-shadow:-0.2px_0_0_currentColor,0.2px_0_0_currentColor]"
                  : "text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100",
              )}
            >
              {project.displayName}

              {/* Active indicator */}
              <div
                className={cn(
                  "absolute bottom-0 w-full left-0 h-px transition-colors",
                  isActive
                    ? "bg-primary dark:bg-primary-light"
                    : "bg-transparent group-hover:bg-gray-200 dark:group-hover:bg-gray-700",
                )}
              />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
```

### 3.4 Mobile Project Navigation

For mobile devices, the project navigation should be accessible via the mobile menu:

```tsx
// apps/web/components/layout/MobileProjectMenu.tsx

"use client";

import { Fragment } from "react";
import Link from "next/link";
import { Dialog, Transition } from "@headlessui/react";
import { X, ChevronRight } from "lucide-react";
import type { ProjectConfig } from "@langchain/ir-schema";
import { cn } from "@/lib/utils/cn";

interface MobileProjectMenuProps {
  open: boolean;
  onClose: () => void;
  projects: ProjectConfig[];
  currentProject: ProjectConfig | null;
  currentLanguage: "python" | "javascript";
}

export function MobileProjectMenu({
  open,
  onClose,
  projects,
  currentProject,
  currentLanguage,
}: MobileProjectMenuProps) {
  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50 lg:hidden">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-200"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="w-screen max-w-sm">
                  <div className="flex h-full flex-col bg-background shadow-xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-800">
                      <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Projects
                      </Dialog.Title>
                      <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    {/* Project List */}
                    <div className="flex-1 overflow-y-auto">
                      <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                        {projects.map((project) => {
                          const isActive = currentProject?.id === project.id;
                          const href = `/${currentLanguage}/${project.slug}`;

                          return (
                            <li key={project.id}>
                              <Link
                                href={href}
                                onClick={onClose}
                                className={cn(
                                  "flex items-center justify-between px-4 py-4",
                                  isActive
                                    ? "bg-primary/5 text-primary dark:text-primary-light"
                                    : "text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-900",
                                )}
                              >
                                <div>
                                  <div className="font-medium">{project.displayName}</div>
                                  <div className="text-sm text-gray-500 dark:text-gray-400">
                                    {project.description}
                                  </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
```

---

## 4. Routing Architecture

### 4.1 URL Structure

The routing structure supports project-specific documentation:

```
/{language}/{project}/{...slug}

Examples:
/python/langchain/classes/ChatOpenAI
/javascript/langchain/functions/invoke
/python/langgraph/classes/StateGraph
/javascript/langgraph/interfaces/GraphConfig
/python/deepagents/classes/Agent
/javascript/deepagents/functions/createAgent
```

### 4.2 Updated Page Route

```tsx
// apps/web/app/(ref)/[lang]/[project]/[...slug]/page.tsx

import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/config/projects";
import { getRoutingMap, getSymbol } from "@/lib/ir/loader";
import { ClassPage } from "@/components/reference/ClassPage";
import { FunctionPage } from "@/components/reference/FunctionPage";
import { ModulePage } from "@/components/reference/ModulePage";

interface PageProps {
  params: Promise<{
    lang: "python" | "javascript";
    project: string;
    slug: string[];
  }>;
}

export default async function ProjectReferencePage({ params }: PageProps) {
  const { lang, project, slug } = await params;

  // Validate language
  if (!["python", "javascript"].includes(lang)) {
    notFound();
  }

  // Validate project
  const projectConfig = getProjectBySlug(project);
  if (!projectConfig) {
    notFound();
  }

  // Check if the language variant is enabled for this project
  const variant = projectConfig.variants.find((v) => v.language === lang && v.enabled);
  if (!variant) {
    notFound();
  }

  // Load routing map for this project/language combination
  const routing = await getRoutingMap(lang, project);
  if (!routing) {
    notFound();
  }

  // Find the symbol entry
  const slugKey = slug.join("/");
  const entry = routing.slugs[slugKey];
  if (!entry) {
    notFound();
  }

  // Load the symbol
  const symbol = await getSymbol(entry.refId);
  if (!symbol) {
    notFound();
  }

  // Render based on page type
  const PageComponent = getPageComponent(entry.pageType);

  return <PageComponent symbol={symbol} project={projectConfig} language={lang} />;
}

function getPageComponent(pageType: string) {
  switch (pageType) {
    case "class":
      return ClassPage;
    case "function":
      return FunctionPage;
    case "module":
      return ModulePage;
    default:
      return ModulePage;
  }
}

// Generate metadata for the page
export async function generateMetadata({ params }: PageProps) {
  const { lang, project, slug } = await params;
  const projectConfig = getProjectBySlug(project);

  if (!projectConfig) {
    return { title: "Not Found" };
  }

  return {
    title: `${slug.join(" / ")} | ${projectConfig.displayName} ${lang === "python" ? "Python" : "JavaScript"} API Reference`,
    description: `API documentation for ${projectConfig.displayName}`,
  };
}

// Enable ISR with revalidation
export const revalidate = 3600;
```

### 4.3 Project Index Page

```tsx
// apps/web/app/(ref)/[lang]/[project]/page.tsx

import { notFound } from "next/navigation";
import { getProjectBySlug } from "@/lib/config/projects";
import { getManifest } from "@/lib/ir/loader";
import { PackageList } from "@/components/reference/PackageList";

interface PageProps {
  params: Promise<{
    lang: "python" | "javascript";
    project: string;
  }>;
}

export default async function ProjectIndexPage({ params }: PageProps) {
  const { lang, project } = await params;

  const projectConfig = getProjectBySlug(project);
  if (!projectConfig) {
    notFound();
  }

  const manifest = await getManifest(lang, project);
  if (!manifest) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-12">
      <header className="mb-12">
        <h1 className="text-4xl font-bold font-heading text-gray-900 dark:text-gray-100">
          {projectConfig.displayName}
        </h1>
        <p className="mt-4 text-xl text-gray-600 dark:text-gray-400">{projectConfig.description}</p>
        <div className="mt-4 flex items-center gap-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
            {lang === "python" ? "Python" : "JavaScript"}
          </span>
          <span className="text-sm text-gray-500">{manifest.packages.length} packages</span>
        </div>
      </header>

      <PackageList packages={manifest.packages} lang={lang} project={project} />
    </div>
  );
}
```

### 4.4 Backwards Compatibility

To maintain backwards compatibility with existing URLs, add redirect rules:

```typescript
// apps/web/middleware.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirect old /python/... and /javascript/... URLs to include default project
  // e.g., /python/classes/ChatOpenAI → /python/langchain/classes/ChatOpenAI
  const legacyPatterns = [
    /^\/python\/(classes|functions|modules)\//,
    /^\/javascript\/(classes|functions|interfaces)\//,
  ];

  for (const pattern of legacyPatterns) {
    if (pattern.test(pathname)) {
      const newPath = pathname.replace(/^\/(python|javascript)\//, "/$1/langchain/");
      return NextResponse.redirect(new URL(newPath, request.url), 301);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/python/(classes|functions|modules)/:path*",
    "/javascript/(classes|functions|interfaces)/:path*",
  ],
};
```

---

## 5. Configuration System

### 5.1 Project-Specific Config Files

Create separate configuration files for each project/language combination:

```
configs/
├── langchain-python.json       # Existing (rename from python.json)
├── langchain-typescript.json   # Existing (rename from typescript.json)
├── langgraph-python.json       # NEW
├── langgraph-typescript.json   # NEW
├── deepagent-python.json       # NEW
├── deepagent-typescript.json   # NEW
└── config-schema.json          # Shared schema
```

### 5.2 LangGraph Python Configuration

```json
// configs/langgraph-python.json
{
  "$schema": "./config-schema.json",
  "project": "langgraph",
  "language": "python",
  "repo": "langchain-ai/langgraph",
  "packages": [
    {
      "name": "langgraph",
      "path": "libs/langgraph",
      "displayName": "LangGraph"
    },
    {
      "name": "langgraph_sdk",
      "path": "libs/sdk-py",
      "displayName": "LangGraph SDK"
    },
    {
      "name": "langgraph_checkpoint",
      "path": "libs/checkpoint",
      "displayName": "LangGraph Checkpoint"
    },
    {
      "name": "langgraph_checkpoint_sqlite",
      "path": "libs/checkpoint-sqlite",
      "displayName": "LangGraph Checkpoint SQLite"
    },
    {
      "name": "langgraph_checkpoint_postgres",
      "path": "libs/checkpoint-postgres",
      "displayName": "LangGraph Checkpoint Postgres"
    }
  ]
}
```

### 5.3 LangGraph TypeScript Configuration

```json
// configs/langgraph-typescript.json
{
  "$schema": "./config-schema.json",
  "project": "langgraph",
  "language": "typescript",
  "repo": "langchain-ai/langgraphjs",
  "packages": [
    {
      "name": "@langchain/langgraph",
      "path": "libs/langgraph",
      "entryPoints": ["auto"],
      "displayName": "LangGraph"
    },
    {
      "name": "@langchain/langgraph-sdk",
      "path": "libs/sdk-js",
      "entryPoints": ["auto"],
      "displayName": "LangGraph SDK"
    },
    {
      "name": "@langchain/langgraph-checkpoint",
      "path": "libs/checkpoint",
      "entryPoints": ["auto"],
      "displayName": "LangGraph Checkpoint"
    }
  ]
}
```

### 5.4 DeepAgent Python Configuration

```json
// configs/deepagent-python.json
{
  "$schema": "./config-schema.json",
  "project": "deepagent",
  "language": "python",
  "repo": "langchain-ai/deepagents",
  "packages": [
    {
      "name": "deepagents",
      "path": "libs/deepagents",
      "displayName": "Deep Agents"
    }
  ]
}
```

### 5.5 DeepAgent TypeScript Configuration

```json
// configs/deepagent-typescript.json
{
  "$schema": "./config-schema.json",
  "project": "deepagent",
  "language": "typescript",
  "repo": "langchain-ai/deepagentsjs",
  "packages": [
    {
      "name": "@langchain/deepagents",
      "path": "libs/deepagents",
      "entryPoints": ["auto"],
      "displayName": "Deep Agents"
    }
  ]
}
```

### 5.6 Updated Config Schema

```json
// configs/config-schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Project Configuration",
  "type": "object",
  "required": ["project", "language", "repo", "packages"],
  "properties": {
    "project": {
      "type": "string",
      "description": "Project identifier (langchain, langgraph, deepagent)"
    },
    "language": {
      "type": "string",
      "enum": ["python", "typescript"],
      "description": "Programming language"
    },
    "repo": {
      "type": "string",
      "description": "GitHub repository (owner/name)"
    },
    "packages": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "path"],
        "properties": {
          "name": {
            "type": "string",
            "description": "Package name as published"
          },
          "path": {
            "type": "string",
            "description": "Path within the repository"
          },
          "displayName": {
            "type": "string",
            "description": "Human-readable display name"
          },
          "entryPoints": {
            "type": "array",
            "items": { "type": "string" },
            "description": "TypeScript entry points (optional)"
          }
        }
      }
    }
  }
}
```

---

## 6. Build Pipeline Updates

### 6.1 Updated Build Orchestrator

```typescript
// scripts/build-ir.ts

import { program } from "commander";
import path from "path";
import fs from "fs/promises";
import { PROJECTS } from "../apps/web/lib/config/projects";

interface BuildOptions {
  project?: string;
  language?: "python" | "typescript";
  all?: boolean;
  dryRun?: boolean;
}

async function main() {
  program
    .option("--project <id>", "Build specific project (langchain, langgraph, deepagent)")
    .option("--language <lang>", "Build specific language (python, typescript)")
    .option("--all", "Build all projects")
    .option("--dry-run", "Don't upload, just generate locally")
    .parse();

  const opts = program.opts<BuildOptions>();

  // Determine which builds to run
  const builds = determineBuildMatrix(opts);

  console.log(`🔧 Building ${builds.length} configuration(s)...`);

  for (const build of builds) {
    console.log(`\n📦 Building ${build.project} (${build.language})...`);

    try {
      await buildProject(build.configPath, opts.dryRun);
      console.log(`✅ ${build.project} (${build.language}) complete`);
    } catch (error) {
      console.error(`❌ ${build.project} (${build.language}) failed:`, error);
      if (!opts.all) throw error;
    }
  }

  console.log("\n🎉 All builds complete!");
}

interface BuildTarget {
  project: string;
  language: "python" | "typescript";
  configPath: string;
}

function determineBuildMatrix(opts: BuildOptions): BuildTarget[] {
  const builds: BuildTarget[] = [];

  for (const project of PROJECTS) {
    if (opts.project && project.id !== opts.project) continue;
    if (!project.enabled) continue;

    for (const variant of project.variants) {
      if (opts.language && variant.language !== opts.language) continue;
      if (!variant.enabled) continue;

      builds.push({
        project: project.id,
        language: variant.language,
        configPath: variant.configPath,
      });
    }
  }

  return builds;
}

async function buildProject(configPath: string, dryRun?: boolean) {
  // ... existing build logic, but with project-aware output paths
}

main().catch(console.error);
```

### 6.2 Updated GitHub Actions Workflow

```yaml
# .github/workflows/build.yml

name: Build IR

on:
  workflow_dispatch:
    inputs:
      project:
        description: "Project to build"
        required: true
        type: choice
        options:
          - langchain
          - langgraph
          - deepagent
          - all
      language:
        description: "Language to build"
        required: true
        type: choice
        options:
          - python
          - typescript
          - both
      sha:
        description: "Git SHA (leave empty for latest main)"
        required: false
        type: string

jobs:
  build-matrix:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.set-matrix.outputs.matrix }}
    steps:
      - id: set-matrix
        run: |
          # Build matrix based on inputs
          matrix=[]

          if [ "${{ inputs.project }}" == "all" ]; then
            projects=("langchain" "langgraph" "deepagent")
          else
            projects=("${{ inputs.project }}")
          fi

          if [ "${{ inputs.language }}" == "both" ]; then
            languages=("python" "typescript")
          else
            languages=("${{ inputs.language }}")
          fi

          for project in "${projects[@]}"; do
            for lang in "${languages[@]}"; do
              matrix+=("{\"project\":\"$project\",\"language\":\"$lang\"}")
            done
          done

          echo "matrix={\"include\":[$(IFS=,; echo "${matrix[*]}")]}" >> $GITHUB_OUTPUT

  build:
    needs: build-matrix
    runs-on: ubuntu-latest
    strategy:
      matrix: ${{ fromJson(needs.build-matrix.outputs.matrix) }}
      fail-fast: false
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - uses: pnpm/action-setup@v2
        with:
          version: 9

      - if: matrix.language == 'python'
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install dependencies
        run: |
          pnpm install
          if [ "${{ matrix.language }}" == "python" ]; then
            pip install griffe
          fi

      - name: Build IR
        run: |
          pnpm build:ir \
            --project ${{ matrix.project }} \
            --language ${{ matrix.language }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
          KV_REST_API_URL: ${{ secrets.KV_REST_API_URL }}
          KV_REST_API_TOKEN: ${{ secrets.KV_REST_API_TOKEN }}
```

### 6.3 Project-Aware IR Storage

Update the IR storage structure to be project-aware:

```
ir-output/
├── langchain/
│   ├── python/
│   │   └── {buildId}/
│   │       ├── reference.manifest.json
│   │       ├── packages/
│   │       └── search/
│   └── javascript/
│       └── {buildId}/
│           └── ...
├── langgraph/
│   ├── python/
│   │   └── {buildId}/
│   └── javascript/
│       └── {buildId}/
└── deepagent/
    ├── python/
    │   └── {buildId}/
    └── javascript/
        └── {buildId}/
```

---

## 7. Sidebar Updates

### 7.1 Project-Aware Sidebar

```tsx
// apps/web/components/layout/Sidebar.tsx

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import type { Package as PackageType } from "@langchain/ir-schema";
import type { ProjectConfig } from "@langchain/ir-schema";
import { cn } from "@/lib/utils/cn";

interface SidebarProps {
  project: ProjectConfig;
  language: "python" | "javascript";
  packages: PackageType[];
}

export function Sidebar({ project, language, packages }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:block w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800">
      <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-6 px-4">
        {/* Project Header */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {project.displayName}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {language === "python" ? "Python" : "JavaScript"} API Reference
          </p>
        </div>

        {/* Package Navigation */}
        <nav className="space-y-2">
          {packages.map((pkg) => (
            <PackageSection
              key={pkg.packageId}
              package={pkg}
              project={project}
              language={language}
              isActive={pathname.includes(pkg.packageId)}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}

interface PackageSectionProps {
  package: PackageType;
  project: ProjectConfig;
  language: "python" | "javascript";
  isActive: boolean;
}

function PackageSection({ package: pkg, project, language, isActive }: PackageSectionProps) {
  const [expanded, setExpanded] = useState(isActive);
  const basePath = `/${language}/${project.slug}/${pkg.packageId}`;

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          isActive
            ? "bg-primary/10 text-primary dark:text-primary-light"
            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800",
        )}
      >
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          <span>{pkg.displayName}</span>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      {expanded && (
        <ul className="ml-4 pl-4 border-l border-gray-200 dark:border-gray-700 space-y-1">
          <li>
            <Link
              href={`${basePath}/classes`}
              className="block px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Classes ({pkg.stats.classes})
            </Link>
          </li>
          <li>
            <Link
              href={`${basePath}/functions`}
              className="block px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Functions ({pkg.stats.functions})
            </Link>
          </li>
          {language === "javascript" && (
            <li>
              <Link
                href={`${basePath}/interfaces`}
                className="block px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                Interfaces ({pkg.stats.types || 0})
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
```

---

## 8. UI Components

### 8.1 Project Breadcrumbs

```tsx
// apps/web/components/reference/ProjectBreadcrumbs.tsx

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ProjectConfig } from "@langchain/ir-schema";

interface ProjectBreadcrumbsProps {
  project: ProjectConfig;
  language: "python" | "javascript";
  items: Array<{
    label: string;
    href?: string;
  }>;
}

export function ProjectBreadcrumbs({ project, language, items }: ProjectBreadcrumbsProps) {
  const allItems = [
    { label: project.displayName, href: `/${language}/${project.slug}` },
    { label: language === "python" ? "Python" : "JavaScript" },
    ...items,
  ];

  return (
    <nav className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-6">
      {allItems.map((item, index) => (
        <span key={index} className="flex items-center">
          {index > 0 && <ChevronRight className="h-4 w-4 mx-2" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-primary dark:hover:text-primary-light">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-700 dark:text-gray-300">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

### 8.2 Project-Aware Search

Update the search to scope results to the current project:

```tsx
// apps/web/components/search/SearchModal.tsx (updated)

interface SearchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentProject?: string;
  currentLanguage?: "python" | "javascript";
}

export function SearchModal({
  open,
  onOpenChange,
  currentProject,
  currentLanguage = "python",
}: SearchModalProps) {
  // ... existing state ...
  const [projectFilter, setProjectFilter] = useState(currentProject || "all");

  // Search with project filter
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const searchResults = await search(query, currentLanguage, {
        project: projectFilter !== "all" ? projectFilter : undefined,
      });
      setResults(searchResults);
      setSelectedIndex(0);
      setLoading(false);
    }, 150);

    return () => clearTimeout(timer);
  }, [query, currentLanguage, projectFilter]);

  // ... rest of component with project filter dropdown ...
}
```

---

## 9. Implementation Plan

### 9.1 Phase 1: Foundation (Days 1-2)

1. **Update IR Schema**
   - Add `ProjectConfig` type to `packages/ir-schema`
   - Update `Manifest` type to include project information
   - Export new types

2. **Create Project Registry**
   - Implement `apps/web/lib/config/projects.ts`
   - Add helper functions for project lookup

3. **Create Configuration Files**
   - Rename existing configs to include project prefix
   - Create new config files for LangGraph and DeepAgent

### 9.2 Phase 2: Routing (Days 3-4)

4. **Update App Router Structure**
   - Create new route structure: `[lang]/[project]/[...slug]`
   - Implement project index pages
   - Add backwards compatibility redirects in middleware

5. **Update IR Loader**
   - Modify `getRoutingMap` to accept project parameter
   - Update `getManifest` for project-aware loading
   - Update symbol loading for project-specific paths

### 9.3 Phase 3: UI Components (Days 5-6)

6. **Implement Header Navigation**
   - Create `ProjectTabs` component
   - Update `Header` component to include tabs
   - Implement mobile project menu

7. **Update Sidebar**
   - Make sidebar project-aware
   - Update package navigation for current project

8. **Update Search**
   - Add project filter to search
   - Update search index loading for projects

### 9.4 Phase 4: Build Pipeline (Days 7-8)

9. **Update Build Scripts**
   - Modify `build-ir.ts` for multi-project support
   - Update output directory structure
   - Update upload scripts for project-aware paths

10. **Update GitHub Actions**
    - Add project selection to workflow
    - Implement build matrix for parallel builds

### 9.5 Phase 5: Testing & Polish (Days 9-10)

11. **Testing**
    - Unit tests for new components
    - Integration tests for routing
    - E2E tests for navigation flow

12. **Documentation**
    - Update README with multi-project information
    - Document build process for new projects

---

## 10. Acceptance Criteria

### 10.1 Functional Requirements

| ID  | Requirement                                           | Priority |
| --- | ----------------------------------------------------- | -------- |
| F1  | Project tabs visible in header navigation             | P0       |
| F2  | Clicking project tab navigates to that project's docs | P0       |
| F3  | Current project tab is visually highlighted           | P0       |
| F4  | URL structure supports `/[lang]/[project]/[...slug]`  | P0       |
| F5  | Sidebar shows packages for current project only       | P0       |
| F6  | Search results are scoped to current project          | P0       |
| F7  | Breadcrumbs include project name                      | P1       |
| F8  | Mobile project navigation via menu                    | P1       |
| F9  | Build pipeline supports all three projects            | P0       |
| F10 | Backwards compatibility for existing URLs             | P1       |

### 10.2 Non-Functional Requirements

| ID  | Requirement                             | Target       |
| --- | --------------------------------------- | ------------ |
| NF1 | Project tab click response time         | < 100ms      |
| NF2 | No layout shift when switching projects | CLS < 0.1    |
| NF3 | Project tabs accessible via keyboard    | Full support |
| NF4 | Build time per project                  | < 3 minutes  |

### 10.3 Definition of Done

- [ ] All P0 functional requirements implemented
- [ ] Project tabs render correctly in light and dark mode
- [ ] All existing LangChain URLs continue to work
- [ ] Build pipeline successfully builds all projects
- [ ] Unit tests for ProjectTabs component
- [ ] E2E test for project navigation
- [ ] Mobile project menu implemented
- [ ] Documentation updated

---

## Appendix A: File Changes Summary

### New Files

```
apps/web/
├── lib/config/projects.ts
├── components/layout/ProjectTabs.tsx
├── components/layout/MobileProjectMenu.tsx
├── components/reference/ProjectBreadcrumbs.tsx
└── app/(ref)/[lang]/[project]/
    ├── page.tsx
    └── [...slug]/page.tsx

configs/
├── langgraph-python.json
├── langgraph-typescript.json
├── deepagent-python.json
└── deepagent-typescript.json

packages/ir-schema/src/project.ts
```

### Modified Files

```
apps/web/
├── components/layout/Header.tsx
├── components/layout/Sidebar.tsx
├── components/search/SearchModal.tsx
├── lib/ir/loader.ts
└── middleware.ts

configs/
├── config-schema.json
├── python.json → langchain-python.json
└── typescript.json → langchain-typescript.json

scripts/
├── build-ir.ts
└── upload-ir.ts

.github/workflows/build.yml
```

---

_End of Specification_
