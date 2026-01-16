# Final Verification: Legacy Reference URL Redirects

Date: 2026-01-13

## What was implemented

- **Legacy redirect mapping helpers**: `apps/web/lib/utils/legacy-redirects.ts`
  - Python legacy `.html` + underscore package slugs → canonical `/python/<package-slug>/...`
  - Python integrations namespace → canonical `/python/<package-slug>/...`
  - JavaScript TypeDoc paths (`/javascript/{modules|classes|interfaces|...}/...`) → canonical `/javascript/<package-slug>/...`
  - `/v0.3/python/**` best-effort mapping to `/python/**` with optional `?v=0.3.x` resolution
- **Edge middleware redirects**: `apps/web/middleware.ts`
  - Runs legacy mapping before older internal redirects to avoid collisions with TypeDoc `/javascript/classes/...` etc.
  - Adds a `/v0.3/python/:path*` matcher and handles `/python` + `/javascript` roots correctly.
  - Best-effort `?v=` resolution for v0.3 via changelog inspection (cached).

## Automated checks

- **Typecheck**: `pnpm -C apps/web typecheck` ✅
- **Unit tests (mapping helpers)**: `pnpm -C apps/web test` ✅
  - Covers representative Python + JS TypeDoc + v0.3 mappings.

## Manual URL verification checklist (expected redirects)

### Python

- `https://reference.langchain.com/python/` → `/python`
- `https://reference.langchain.com/python/langchain_core/messages.html` → `/python/langchain-core/messages`
- `https://reference.langchain.com/python/langchain_core/messages/message.html` → `/python/langchain-core/messages/message`
- `https://reference.langchain.com/python/integrations/langchain_openai/ChatOpenAI/` → `/python/langchain-openai/ChatOpenAI`
- `https://reference.langchain.com/v0.3/python/core/indexing/langchain_core.indexing.api.index.html` → `/python/langchain-core/indexing/api/index` (and `?v=0.3.x` when resolvable)

### JavaScript

- `https://reference.langchain.com/javascript/modules.html` → `/javascript`
- `https://reference.langchain.com/javascript/classes/_langchain_openai.ChatOpenAI.html` → `/javascript/langchain-openai/ChatOpenAI`
- `https://reference.langchain.com/javascript/interfaces/_langchain_core.runnables.RunnableConfig.html` → `/javascript/langchain-core/runnables/RunnableConfig`
- `https://reference.langchain.com/javascript/modules/_langchain_core.utils_math.html` → `/javascript/langchain-core/utils/math`

## Known limitations

- URL hash fragments (`#...`) cannot be preserved by edge redirects.
