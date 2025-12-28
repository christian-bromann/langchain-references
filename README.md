Awesome. I am tasked to build a single platform that helps us serve the Python (mkdocs) and the JS/TS docs (typedoc) within the same interface that matches the underlying Mintlify template. Do excessive research and find out how this can be approached. The ideal workflow:

- allow to pull the tarball of any repository at any sha , then generate a static page that matches the mintlify design
- let‘s not just create markdown and embed API docs into mintlify since this approach is likely not gonna scale due to limitations on Mintlify

Worked for 6m 49s
What I found in langchain-ai/docs (useful constraints + assets)
Mintlify “source of truth” for look & feel lives in langchain-ai/docs/src/docs.json:
theme: aspen
brand tokens: primary #2F6868, light #84C4C0, dark #1C3C3C
font: heading Manrope
GTM: GTM-MBBX68ST
Reference site deployment is already a separate static hosting surface:
langchain-ai/docs/reference/vercel.json serves dist/ as the output directory and routes /python/* and /javascript/* there.
Current generators are totally different:
Python: MkDocs Material + mkdocstrings/griffe → dist/python
JS/TS: TypeDoc (via reference/javascript/build.ts) → dist/javascript
So today they’re “two sites under one domain”, not “one interface”.
That’s consistent with your goal: build a single platform UI, not “stuff it into Mintlify”.

Goal restated (what “single platform” really means)
You want one shared “chrome” + information architecture that:

looks like Mintlify (LangChain’s Aspen theme + nav patterns),
can serve Python and JS/TS reference consistently,
and can build immutable static artifacts from any repo@sha.
The critical decision: do you treat MkDocs/TypeDoc as “final HTML generators” (then you wrap/transform their HTML), or do you treat them as “extractors” (then you render everything yourself with one design system)?

Recommended approach (scales + actually matches Mintlify): “Extract → Normalize → Render”
1) Use a shared intermediate representation (IR) for APIs
Create an internal “Reference IR” that is language-agnostic:

Packages: name, version, repo, sha, source paths
Symbols: kind (module/class/function/method/type), signature, docstring/JSDoc, params/returns, deprecations, source links, stability tags
Navigation: package → modules → members
Search index fields: title, breadcrumbs, symbol path, excerpt, URL
This is the key that lets you render Python + TS with the same UI.

2) Extract TS/JS into IR using TypeDoc JSON (not TypeDoc HTML)
TypeDoc already builds a reflection tree; you can generate JSON (Application.convert() then serializer.projectToObject() or CLI --json depending on version).
You still install deps for type resolution, but the final HTML is yours.
Why this wins:

You can make the UI match Mintlify precisely.
You can unify URL patterns and breadcrumbs across languages.
You can implement a single search system.
3) Extract Python into IR using griffe (prefer static, avoid imports)
Instead of relying on MkDocs’ runtime import model, use griffe directly on source trees:

parse docstrings + signatures + annotations without executing packages,
generate your IR (or griffe JSON then transform).
This is the main scalability win for “any sha”: you avoid “install the universe” dependency conflicts, and you can sandbox builds.

4) Render everything with one static site generator you control
Pick one renderer (Next.js SSG, Astro, Docusaurus custom, or even a minimal Vite+SSG) and implement a Mintlify-like layout:

Layout: top bar + left nav + content + right TOC (Mintlify pattern)
Design tokens: take from docs.json (colors/fonts/icons) and replicate Aspen spacing/typography
Search:
simplest scalable: Pagefind over generated HTML
most controllable: build your own JSON index from IR + a client-side search lib (FlexSearch) or host Meilisearch (if you want server search)
Output: a single static tree like:

dist/reference/{buildId}/python/...
dist/reference/{buildId}/javascript/... and “latest” aliases via redirects.
How to satisfy “pull tarball of any repo at any sha”
Fetching
Use the GitHub tarball endpoint for an immutable ref:

https://api.github.com/repos/{owner}/{repo}/tarball/{sha} (best)
or https://github.com/{owner}/{repo}/archive/{sha}.tar.gz
Cache by {repo}@{sha} directory (and a .sha marker like the current JS build does).

Build IDs and immutability
Make builds content-addressed: buildId = sha256(config + repo@sha list)
Store artifacts under dist/{buildId}/...
Keep dist/latest/ as a redirect/alias (never overwrite immutable builds)
Multi-repo support
Model “sources” like the current JS build script does, but extend it:

allow per-repo sha overrides (not just branch)
allow monorepo subdirectory packages (Python already needs that)
Alternative approaches (faster to ship, but less clean)
Option A (fastest): wrap existing HTML outputs in a shared Mintlify-like shell
Mechanics:

Build Python with MkDocs → HTML
Build JS with TypeDoc → HTML
Run an HTML transformer that:
strips their headers/nav
injects your shared header/nav/TOC container
scopes CSS to avoid collisions
Pros:

Minimal changes to existing build scripts. Cons:
CSS/JS collisions are inevitable (MkDocs Material and TypeDoc both assume they own the page).
Accessibility + search + routing become fragile.
Harder to reach “matches Mintlify” (you’re fighting two DOMs).
Option B: Use MkDocs as the unified platform (convert TS to markdown)
Generate TS markdown via typedoc-plugin-markdown
Build one MkDocs site with a Mintlify-like custom theme
Pros:

One generator, one nav/search. Cons:
TS API markdown quality and cross-linking can degrade at scale.
You’re still investing in a theme port to look like Mintlify.
Given your “don’t embed into Mintlify” constraint, Option B is acceptable, but it’s usually worse than “IR + custom renderer”.

Concrete “ideal workflow” that matches your bullets
Input
A build request config, e.g.:

sources: [{repo, sha, language, packages: [{name, path}]}]
ui: {tokens: docs.json subset, navMode, baseUrl}
output: {buildId, distDir}
Steps (deterministic)
Fetch tarballs for each repo@sha → work/remotes/...
Extract APIs:
TS: TypeDoc → JSON → IR
Python: griffe → IR
Render IR → static HTML using Mintlify-matching UI
Generate search index (Pagefind or JSON index)
Publish dist/{buildId} to CDN + set /latest redirect
This scales because:

builds are cached by sha,
extraction doesn’t require Mintlify,
rendering is unified and themeable.
If you want a pragmatic phased plan
Phase 1 (ship quickly): build a Mintlify-like “Reference UI” + wrap/host existing dist/python + dist/javascript (accept imperfect styling).
Phase 2 (make it correct): switch JS to TypeDoc JSON → render yourself.
Phase 3 (make it robust): switch Python to griffe extraction (no installs), unify search/nav, add per-sha build API + caching.
If you want, I can draft the IR schema (JSON), URL conventions, and a build config format that can cover langchain, langgraph, langsmith, integrations, versions, and “latest” aliases cleanly.

Let’s do that!
Reference IR (schema) + URL conventions + build config (draft v0.1)
Reference IR v0.1 (language-agnostic)
The IR is two files per build:

reference.manifest.json: build metadata + nav + packages (small, used at runtime)
reference.ir.jsonl (or chunked JSON): symbols/modules/types (big, used at build-time; optionally partially loaded for search)
reference.manifest.json
{
  "irVersion": "0.1",
  "build": {
    "buildId": "bld_2025-12-28_9f2c5c4b",
    "createdAt": "2025-12-28T00:00:00Z",
    "baseUrl": "https://reference.langchain.com",
    "canonicalRoot": "/",
    "ui": {
      "brand": {
        "theme": "aspen",
        "colors": { "primary": "#2F6868", "light": "#84C4C0", "dark": "#1C3C3C" },
        "fonts": { "heading": "Manrope", "body": "Inter", "mono": "JetBrains Mono" },
        "logo": { "light": "/assets/brand/logo-light.svg", "dark": "/assets/brand/logo-dark.svg" },
        "favicon": { "light": "/assets/brand/favicon.png", "dark": "/assets/brand/favicon.png" }
      },
      "integrations": { "gtm": { "tagId": "GTM-MBBX68ST" } }
    }
  },
  "sources": [
    { "repo": "langchain-ai/langchainjs", "sha": "abc123...", "fetchedFrom": "tarball" },
    { "repo": "langchain-ai/langchain", "sha": "def456...", "fetchedFrom": "tarball" }
  ],
  "packages": [
    {
      "packageId": "pkg_js_langchain",
      "displayName": "langchain",
      "language": "typescript",
      "ecosystem": "javascript",
      "version": "1.2.3",
      "repo": { "owner": "langchain-ai", "name": "langchainjs", "sha": "abc123..." },
      "entry": { "kind": "module", "refId": "sym_ts_module_langchain" },
      "nav": { "rootGroups": ["Modules", "Classes", "Functions", "Interfaces", "Types", "Enums"] }
    },
    {
      "packageId": "pkg_py_langchain_core",
      "displayName": "langchain-core",
      "language": "python",
      "ecosystem": "python",
      "version": "1.0.0",
      "repo": { "owner": "langchain-ai", "name": "langchain", "sha": "def456..." },
      "entry": { "kind": "module", "refId": "sym_py_module_langchain_core" },
      "nav": { "rootGroups": ["Modules", "Classes", "Functions"] }
    }
  ],
  "routing": {
    "compatRedirects": [
      { "from": "/javascript/modules/langchain.html", "to": "/javascript/langchain/" },
      { "from": "/python/langchain_core/", "to": "/python/langchain_core/" }
    ]
  }
}
reference.ir.jsonl record types
Each line is a JSON object with a recordType. The important ones:

SymbolRecord (the core unit)
{
  "recordType": "symbol",
  "id": "sym_ts_class_ChatOpenAI",
  "packageId": "pkg_js_langchain_openai",
  "language": "typescript",
  "kind": "class",
  "canonicalPath": "langchain_openai.ChatOpenAI",
  "display": { "name": "ChatOpenAI", "qualified": "langchain_openai.ChatOpenAI" },
  "docs": {
    "summary": "Chat model for OpenAI chat completions.",
    "remarks": "Longer markdown content…",
    "examples": [{ "title": "Basic usage", "code": "..." }],
    "deprecated": { "isDeprecated": false }
  },
  "signature": {
    "text": "class ChatOpenAI extends BaseChatModel",
    "params": [],
    "returns": null,
    "typeParams": []
  },
  "members": [
    { "name": "invoke", "refId": "sym_ts_method_ChatOpenAI_invoke" },
    { "name": "stream", "refId": "sym_ts_method_ChatOpenAI_stream" }
  ],
  "relations": {
    "extends": ["sym_ts_class_BaseChatModel"],
    "implements": [],
    "overloads": []
  },
  "source": {
    "repo": "langchain-ai/langchainjs",
    "sha": "abc123...",
    "path": "libs/providers/langchain-openai/src/chat_models.ts",
    "line": 123
  },
  "urls": {
    "canonical": "/javascript/langchain_openai/ChatOpenAI/",
    "anchors": { "invoke": "#invoke" }
  },
  "tags": {
    "stability": "stable",
    "visibility": "public"
  }
}
ModuleIndexRecord (used to build nav without loading all symbols)
{
  "recordType": "moduleIndex",
  "packageId": "pkg_js_langchain",
  "moduleId": "mod_langchain",
  "displayName": "langchain",
  "children": {
    "modules": ["mod_langchain.load", "mod_langchain.hub"],
    "classes": ["sym_ts_class_LLMChain"],
    "functions": ["sym_ts_fn_initChatModel"]
  }
}
SearchRecord (precomputed search entry)
{
  "recordType": "search",
  "id": "srch_sym_ts_class_ChatOpenAI",
  "url": "/javascript/langchain_openai/ChatOpenAI/",
  "title": "ChatOpenAI",
  "breadcrumbs": ["JavaScript", "langchain-openai", "ChatOpenAI"],
  "excerpt": "Chat model for OpenAI chat completions.",
  "keywords": ["OpenAI", "chat", "model", "invoke", "stream"],
  "kind": "class",
  "packageId": "pkg_js_langchain_openai"
}
Kinds and shared fields (recommended enums)
language: "python" | "typescript"
ecosystem: "python" | "javascript"
kind: "package" | "module" | "class" | "function" | "method" | "property" | "attribute" | "interface" | "typeAlias" | "enum" | "enumMember" | "variable" | "namespace" | "parameter"
visibility: "public" | "protected" | "private"
stability: "experimental" | "beta" | "stable" | "deprecated"
URL conventions (clean, Mintlify-like, stable)
Canonical goals
Human predictable
No .html
Language is the first segment (matches existing reference.langchain.com/python and /javascript)
Package is always explicit (prevents collisions)
Symbol pages are directories (trailing slash friendly)
Proposed canonical routing
JavaScript / TypeScript
Package landing:
/javascript/{packageSlug}/
e.g. /javascript/langchain/, /javascript/langchain_core/, /javascript/langchain_openai/
Symbol pages:
/javascript/{packageSlug}/{symbolKind}/{symbolPath}/
e.g. /javascript/langchain/classes/LLMChain/
e.g. /javascript/langchain/functions/hub/
Module pages:
/javascript/{packageSlug}/modules/{modulePath}/
e.g. /javascript/langchain/modules/load/serializable/
Python
Package landing:
/python/{importRoot}/
e.g. /python/langchain/, /python/langchain_core/, /python/langgraph/
Module pages:
/python/{importRoot}/modules/{modulePath}/
e.g. /python/langchain/modules/chat_models/
Symbol pages:
/python/{importRoot}/{symbolKind}/{symbolPath}/
e.g. /python/langchain_openai/classes/ChatOpenAI/
e.g. /python/langchain/functions/load_prompt/
Compatibility redirects (to avoid breaking existing links)
Current JS TypeDoc URLs like:
/javascript/modules/langchain.html
/javascript/classes/...html
Redirect them to the new structure via a generated mapping:
/javascript/modules/langchain.html → /javascript/langchain/ (or /javascript/langchain/modules/index/)
/javascript/classes/langchain.LLMChain.html → /javascript/langchain/classes/LLMChain/
This redirect map can be generated from IR and emitted as:

dist/_redirects (Netlify)
vercel.json redirects (Vercel)
or a static “redirect HTML pages” fallback.
Build config format (what you asked for: repo tarball at any sha)
Use a single config file per build request; JSON or YAML. Here’s YAML.

reference.build.yml
ui:
  # Pull these from Mintlify docs.json (langchain-ai/docs/src/docs.json)
  theme: aspen
  brand:
    colors:
      primary: "#2F6868"
      light: "#84C4C0"
      dark: "#1C3C3C"
    fonts:
      heading: Manrope
      body: Inter
      mono: JetBrains Mono
    logo:
      light: /assets/brand/langchain-docs-teal.svg
      dark: /assets/brand/langchain-docs-lilac.svg
    favicon:
      light: /assets/brand/docs-favicon.png
      dark: /assets/brand/docs-favicon.png
  integrations:
    gtm:
      tagId: GTM-MBBX68ST
 
output:
  distDir: dist
  canonicalRoot: /
  trailingSlash: true
 
routing:
  mount:
    python: /python
    javascript: /javascript
  compatRedirects: true
 
sources:
  # Any repo at any sha (immutable)
  - repo: langchain-ai/langchainjs
    sha: "cc502e1b6..."       # exact sha, not branch
    language: typescript
    fetch:
      mode: github-tarball
    workspaces:
      # Each entry produces a package in the IR
      - package: langchain
        path: libs/langchain
      - package: "@langchain/core"
        path: libs/langchain-core
      - package: "@langchain/openai"
        path: libs/providers/langchain-openai
    extract:
      typedoc:
        tsconfigPath: tsconfig.json
        entryStrategy: packages
        # install step required for type resolution; controlled + cached
        install:
          manager: pnpm
          cwd: .
        options:
          excludePrivate: true
          excludeInternal: true
          skipErrorChecking: true
 
  - repo: langchain-ai/langchain
    sha: "def456..."
    language: python
    fetch:
      mode: github-tarball
    python:
      # describe what “packages” mean in a monorepo
      packages:
        - importRoot: langchain
          path: libs/langchain_v1/langchain
        - importRoot: langchain_core
          path: libs/core/langchain_core
    extract:
      python:
        mode: griffe
        # no-import mode preferred
        preferStatic: true
        docstringStyle: google
        excludeGlobs:
          - "**/tests/**"
          - "**/_private/**"
 
search:
  mode: pagefind        # or "json"
  languages: [python, javascript]
Build ID + caching rules (deterministic)
Build ID = hash of:
normalized config
all repo@sha
extractor versions (typedoc/griffe)
renderer version
Cache directories:
cache/tarballs/{owner_repo}/{sha}.tar.gz
cache/unpacked/{owner_repo}/{sha}/...
cache/extract/{buildId}/typedoc.json + griffe.json
dist/{buildId}/... immutable output
Output layout (single platform, one “Mintlify-like” UI)
Produce one static tree that Vercel can serve from dist/:

dist/
  reference.manifest.json
  assets/...
  javascript/
    index.html
    langchain/
      index.html
      classes/LLMChain/index.html
      modules/load/serializable/index.html
    langchain_openai/...
  python/
    index.html
    langchain_core/
      index.html
      modules/language_models/index.html
      classes/BaseChatModel/index.html
  _redirects (optional)
  sitemap.xml
  robots.txt
  search/ (pagefind or JSON index)
This gives you the “single interface” (one header/nav/search/theme) while still mounting /python and /javascript exactly like today.

Immediate next step (so we can start implementing cleanly)
Pick the rendering stack (affects how we package the IR):

Astro (simple, fast static pages, easy templating)
Next.js SSG (if you want React components matching Mintlify-ish UI patterns)
Vite + SSG (custom)
If you tell me your preferred renderer (Astro vs Next), I’ll adapt the IR “chunking” and the routing/search plan to match it (especially important for build times and memory).

Let‘s use Next.js.

Worked for 1m 9s
Next.js architecture (App Router) for a Mintlify-matching unified Reference UI
Core idea
Treat TypeDoc + Python parsing as extractors that produce a Reference IR.
Use Next.js to render a single shared UI shell (Mintlify-like) for both /python/* and /javascript/*.
Store extracted IR in content-addressed object storage keyed by {buildId} (derived from repo@sha inputs + tool versions).
Build + serving model (scales beyond “next export”)
If you try to pre-render every symbol page with output: 'export', you’ll likely hit build-time limits as packages grow.

Use Next.js ISR + on-demand revalidation instead (still produces static HTML pages, cached by Vercel/CDN):

First request to a page: server renders from IR → cached HTML
Subsequent requests: served as static from cache
New buildId: immutable; no invalidation needed
This matches your “generate a static page” goal while scaling to “any sha” and millions of symbols.

URL + versioning conventions in Next.js
Use build IDs as an explicit version boundary (immutable, cache-friendly):

Latest pointers:
/python/... → internally resolves to the current “latest build” for python
/javascript/... → resolves to latest JS build
Pinned builds:
/b/{buildId}/python/...
/b/{buildId}/javascript/...
This lets you:

keep stable “latest” URLs,
support reproducible links for PRs/releases,
safely cache forever per build.
Next.js route map (App Router)
Example folder structure:

app/(ref)/layout.tsx – shared Mintlify-like chrome (top nav, left nav, search modal)
app/(ref)/python/[...slug]/page.tsx
app/(ref)/javascript/[...slug]/page.tsx
app/b/[buildId]/python/[...slug]/page.tsx
app/b/[buildId]/javascript/[...slug]/page.tsx
Each page.tsx:

resolves {buildId} (explicit from URL, or via “latest resolver”)
resolves slug → refId via a small manifest index
fetches the symbol/module record(s) from IR storage
renders the same React components regardless of language
Set:

export const dynamic = "force-static" (for ISR caching behavior)
export const revalidate = false (immutable pages) for /b/{buildId}/...
for /python/... “latest”, use revalidate = <short> or resolve to pinned build and redirect.
IR storage + chunking (optimized for Next server + fast lookups)
Use three tiers (prevents loading a giant JSON at request time):

Manifest (tiny, always loaded)

reference.manifest.json
contains package list, nav metadata, and lookup table pointers
Routing index (small, key-value)

routing/{ecosystem}/{packageId}.json
maps URL slugs to refId + page type
ex: ["classes","ChatOpenAI"] -> sym_py_class_langchain_openai.ChatOpenAI
Content shards (medium, fetched on demand)

symbols/{shardId}.json where shard is e.g. hash prefix of refId
keeps each fetch small and cacheable
This makes per-request work:

fetch 1 routing file + 1 symbol shard (both CDN-cacheable).
Search (Mintlify-like UX, but your own index)
Two solid options:

Option A: Pagefind (simple, static-first)

After ISR warmup or periodic crawling, run Pagefind over HTML.
Great relevance, minimal infra, but harder with ISR if pages aren’t prebuilt.
Option B (recommended): JSON index from IR

Generate search/index.{buildId}.json (or shards)
Client-side search via FlexSearch / MiniSearch
Enables instant “Cmd+K” modal across both languages, consistent ranking.
Because you already have symbol metadata in IR, building search entries is straightforward and deterministic.

Mintlify look & feel (practical approach)
You won’t “reuse Mintlify components” directly, but you can match the design by:

Token ingestion: read docs.json (colors/fonts/logo) and generate a tokens.ts
Tailwind + CSS variables: mirror Aspen spacing/typography and dark mode behavior
Layout parity: implement the same primitives users expect:
left nav with product/package grouping
right TOC
breadcrumb eyebrow
consistent callouts, codeblocks, copy buttons, anchor links
top “Ask AI / GitHub / CTA” bar (from docs.json navbar)
This yields a unified interface that visually matches Mintlify, without Mintlify’s scaling constraints.

Build service (tarball@sha → IR → publish)
Implement a separate “builder” (can live in the same repo or a worker service):

Input: reference.build.yml (repo@sha + package paths)
Steps:
download GitHub tarball by sha
extract
TS: run TypeDoc to JSON (no HTML), transform → IR
Py: run griffe on source tree, transform → IR
write manifest + routing + shards + search index to object storage under /ir/{buildId}/...
update “latest pointers” (a small JSON file like /ir/latest.json)
Next.js reads from that storage at request time.

What I need from you to finalize the spec
Hosting: Vercel-only, or Vercel + external object storage (S3/R2)? (recommended: Vercel + R2/S3)
Page volume target: are we okay with ISR-on-demand, or do you require fully pre-rendered exports?
If you answer those two, I’ll produce the concrete Next.js data-loading contract (exact file paths, response types), plus the page component API for rendering Python vs TS symbols with the same UI.

I want to host this on Vercel. I am expecting about 10000 daily unique users.

Worked for 33s
Vercel-ready plan (10k DAU) — single Mintlify-like interface, multi-language, any repo@sha
Target architecture (2 Vercel projects, or 1 monorepo with 2 deployments)
reference-web (Next.js App Router): serves /python/*, /javascript/*, and pinned builds /b/{buildId}/*
reference-builder (Vercel serverless, plus Cron): fetches tarballs at exact SHAs, extracts APIs, emits IR + search index to storage
This separation keeps the web app fast and cheap, and keeps builds from impacting request latency.

Storage choices on Vercel (recommended)
Vercel Blob: store the immutable IR artifacts (manifest, routing, shards, search index) under /ir/{buildId}/...
Vercel KV: store tiny mutable pointers + state
latest:python -> buildId
latest:javascript -> buildId
build status: build:{buildId} -> {state, startedAt, completedAt, sources...}
This supports “any sha” builds, immutability, and low-latency lookups.

Request path + caching strategy (works great at 10k DAU)
URLs
Pinned (immutable, cache forever):
/b/{buildId}/python/...
/b/{buildId}/javascript/...
Latest (stable, redirects to pinned):
/python/... → 307/308 to /b/{latestPython}/python/...
/javascript/... → 307/308 to /b/{latestJs}/javascript/...
Why this scales
Pinned pages are immutable → Vercel CDN can cache aggressively.
“Latest” becomes a cheap redirect based on a KV lookup (or cached JSON), avoiding rebuilding pages when “latest” moves.
Next.js routing contract (what the web app expects in Blob)
For each buildId:

Manifest: ir/{buildId}/reference.manifest.json
Per-package routing map (slug → refId):
ir/{buildId}/routing/{ecosystem}/{packageSlug}.json
Symbol shards (refId → symbol record):
ir/{buildId}/symbols/{prefix}/{refId}.json (or ir/{buildId}/symbols/{prefix}.json)
Search index:
ir/{buildId}/search/index.json (or sharded)
Web request flow:

Resolve buildId (from URL or KV latest pointer)
Load routing map for that package
Load symbol shard and render page
Everything fetched via fetch() with cache: "force-cache" for pinned builds.

Rendering model on Vercel (don’t do next export)
Use SSR + CDN caching for pinned builds (effectively static once cached):

Each page is deterministic given (buildId, slug)
Vercel caches the HTML response at the edge
First request pays the render cost; subsequent requests are “static-like”
This avoids prebuilding millions of pages and still meets your “static page” requirement in practice.

Builder workflow (“tarball of any repo at any sha”)
Builder endpoint accepts a config (or stores configs by name):

Fetch tarball at exact sha
GET https://api.github.com/repos/{owner}/{repo}/tarball/{sha}
Extract
Extract APIs → IR
TS/JS: TypeDoc → JSON → IR
Python: griffe → IR (static parse preferred)
Emit artifacts to Blob under ir/{buildId}/...
Write build status to KV
Optionally update latest:* pointers
With 10k DAU, you typically build on:

release events, nightly, and manual “build this sha” requests —not per user request.
Mintlify look & feel (practical parity)
Parse langchain-ai/docs/src/docs.json once at build time into a tokens.ts used by reference-web
Implement Mintlify-like chrome:
top navbar (Ask AI / GitHub / CTA)
left nav grouping by package/ecosystem
right-side TOC
Cmd/Ctrl+K search modal
Reuse GTM tag from docs.json (same GTM-MBBX68ST)
What I would do next (implementation spec)
If you want, I’ll produce:

the exact Blob directory layout + JSON types for manifest, routing, symbol, search
Next.js route handler code contract for resolving “latest” via KV + redirecting
a minimal builder API spec (POST /build with sources list + sha + package paths)
cache headers + edge behavior tuned for 10k DAU
At the end of the day user are interested into the API reference of a particular Python/NPM package, not the shasum of the repository. Let’s update the plan to ensure we translate the shasum to a particular package version.

Worked for 53s
Updated plan: make package versions the user-facing primitive (sha stays internal)
Key change
Users browse by {package}@{version} (or “latest”).
repo@sha is an implementation detail used only to reproduce/build the docs.
Version resolution (sha → version) during builds
JS/TS (npm)
For each workspace package we document (e.g. libs/langchain-core):

Read package.json at that path in the extracted tarball.
Use:
name (published npm package name)
version (the version users care about)
This gives an authoritative (packageName, packageVersion) for that exact repo@sha.

Python (PyPI)
For each Python package root we document (e.g. libs/core):

Read pyproject.toml at that package root.
Use:
project.name (published PyPI name, e.g. langchain-core)
project.version (or the tool-specific dynamic version strategy, if present)
If a package uses dynamic versioning, the builder should resolve it deterministically (e.g., via setuptools-scm) or fail the build with a clear error (so we don’t publish “unknown” versions).

Indices we’ll maintain (version → build → sha)
packageVersionIndex (KV)
Key: {ecosystem}:{packageName}:{version} → { buildId, repo, sha, packagePath }
Key: {ecosystem}:{packageName}:latest → { version, buildId }
This is what the web app uses to translate a user-visible version into a build.

buildManifest (Blob)
For each buildId, store:

all included packages + their detected versions
the exact repo SHAs used
the routing maps and symbol shards
This guarantees reproducibility.

URL conventions (version-first)
Canonical URLs
JS/TS
/javascript/{packageName}/{version}/…
/javascript/{packageName}/latest/… (redirects to resolved version)
Python
/python/{packageName}/{version}/…
/python/{packageName}/latest/…
Notes:

Use the published package name as the URL segment (langchain-core, @langchain/core becomes URL-safe @langchain/core → @langchain/core is awkward; we’ll use an encoded slug like langchain_core or @langchain_core consistently).
The UI can display the real name (@langchain/core) even if the slug is normalized.
Internal pinned build URLs (optional but useful)
/b/{buildId}/… remains available for debugging and immutable sharing, but it’s not the primary UX.
Build API changes (what you request/build)
Instead of “build this sha”, the platform supports both:

Build by version (preferred)
Input: {ecosystem, packageName, version}
Builder resolves to a source tarball (either repo tag/sha or registry sdist/tgz), then builds, then publishes.
Build by sha (still supported)
Input: {repo, sha, packagePaths…}
Builder computes (packageName, version) from source and publishes under those versions automatically.
Either way, the site always exposes docs under package versions.

What I’ll spec next (so implementation is unambiguous)
The exact slugging rules for npm scoped packages and PyPI names
The KV key schema + JSON payload types
Redirect rules: latest → {version} and legacy typedoc.html paths → versioned routes
