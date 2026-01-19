# Contributing to LangChain Reference Documentation

Thank you for your interest in contributing to the LangChain Reference Documentation platform! This guide covers everything you need to know to get started.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Project Structure](#project-structure)
5. [Development Workflow](#development-workflow)
6. [Testing](#testing)
7. [Pull Request Process](#pull-request-process)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

---

## Code of Conduct

This project follows the [LangChain Code of Conduct](https://github.com/langchain-ai/langchain/blob/main/CODE_OF_CONDUCT.md). Please be respectful and inclusive in all interactions.

---

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 20+ (check `.nvmrc` for exact version)
- **pnpm** 10+
- **Python** 3.11+ (for Python extractor)
- **Java** 11+ (for Java extractor - optional)
- **Go** 1.21+ (for Go extractor - optional)
- **Git**

> **Note**: Java and Go are only required if you need to build IR for Java or Go packages (e.g., LangSmith Java/Go SDKs). The build pipeline will automatically skip languages if the tools are not installed.

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/langchain-ai/langchain-reference-docs.git
cd langchain-reference-docs

# Install Node.js dependencies
pnpm install

# Install Python dependencies (for Python extractor)
pip install griffe

# Optional: Verify Java installation (for Java extractor)
java -version  # Should show Java 11+

# Optional: Verify Go installation (for Go extractor)
go version  # Should show Go 1.21+

# Start development server
pnpm dev
```

The development server will be available at `http://localhost:3000`.

---

## Development Setup

### Environment Variables

For local development, you typically don't need environment variables. The app will use local IR data from `./ir-output/`.

For full functionality (cloud storage, builds), create a `.env.local` file:

```bash
# Vercel Blob (optional for local dev)
BLOB_READ_WRITE_TOKEN=your-blob-token

# GitHub (for tarball fetching)
GITHUB_TOKEN=your-github-token

# Build API (for triggering builds)
BUILD_API_TOKEN=your-secret-token
GITHUB_REPOSITORY=langchain-ai/langchain-reference-docs
```

### Building IR Data Locally

To work with documentation locally, you need to build the IR:

```bash
# Build TypeScript packages
pnpm build:ir:local --config configs/langchain-typescript.json

# Build Python packages (requires griffe)
pip install griffe
pnpm build:ir:local --config configs/langchain-python.json

# Build Java packages (requires Java 11+)
pnpm build:ir:local --config configs/langsmith-java.json

# Build Go packages (requires Go 1.21+)
pnpm build:ir:local --config configs/langsmith-go.json
```

This creates IR data in `./ir-output/` which the Next.js app reads.

> **Note**: If Java or Go are not installed, the build will skip those languages and log a warning.

### Editor Setup

We recommend VS Code with these extensions:

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript

---

## Project Structure

```txt
langchain-reference-docs/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/                # App Router pages
│       ├── components/         # React components
│       └── lib/                # Utilities
│
├── packages/
│   ├── ir-schema/              # TypeScript types for IR
│   ├── build-pipeline/         # Build orchestration
│   ├── extractor-python/       # Python extractor (griffe)
│   ├── extractor-typescript/   # TypeScript extractor (TypeDoc)
│   ├── extractor-java/         # Java extractor
│   └── extractor-go/           # Go extractor
│
├── scripts/                    # Build scripts
├── configs/                    # Build configurations
└── .github/workflows/          # CI/CD workflows
```

### Key Directories

| Directory                        | Description                   |
| -------------------------------- | ----------------------------- |
| `apps/web/app/(ref)/`            | Reference documentation pages |
| `apps/web/components/reference/` | Symbol rendering components   |
| `apps/web/components/layout/`    | Header, Sidebar, navigation   |
| `apps/web/lib/ir/`               | IR data loading utilities     |
| `packages/ir-schema/src/`        | IR type definitions           |
| `packages/build-pipeline/src/`   | IR build pipeline             |
| `configs/`                       | Package configurations        |
| `scripts/`                       | Build orchestration scripts   |

### Package Subpages

Packages can have curated subpages for domain-specific navigation (e.g., "Agents", "Middleware", "Models"). These are defined in the package configuration files.

#### Configuration Format

Add `subpages` to a package in `configs/*-python.json` or `configs/*-typescript.json`:

```json
{
  "name": "langchain",
  "path": "libs/langchain_v1",
  "displayName": "LangChain",
  "subpages": [
    {
      "slug": "agents",
      "title": "Agents",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain/agents.md"
    },
    {
      "slug": "middleware",
      "title": "Middleware",
      "source": "https://raw.githubusercontent.com/langchain-ai/docs/main/reference/python/docs/langchain/middleware.md"
    }
  ]
}
```

#### Subpage Properties

| Property | Description |
| -------- | ----------- |
| `slug`   | URL-safe identifier (lowercase, alphanumeric with dashes) |
| `title`  | Display title in navigation and page header |
| `source` | GitHub raw URL or relative path to markdown file |

#### Markdown File Format

Subpage markdown files have two sections:

1. **Markdown content** (before first `:::` directive) - Rendered as-is on the page
2. **Symbol references** (`:::` directives) - Used to create symbol cards

```markdown
# Middleware

Reference documentation for middleware classes.

| CLASS | DESCRIPTION |
| ----- | ----------- |
| `SummarizationMiddleware` | Auto-summarize conversation history |

::: langchain.agents.middleware.SummarizationMiddleware
    options:
        merge_init_into_class: true
::: langchain.agents.middleware.HumanInTheLoopMiddleware
```

The parser:

- Splits content at the first `:::` line
- Extracts qualified names from `:::` directives (ignoring options blocks)
- Resolves symbol references to catalog entries for display as cards

---

## Development Workflow

### Running the Dev Server

```bash
pnpm dev
```

This starts:

- Next.js dev server at `http://localhost:3000`
- Hot Module Replacement for instant updates

### Code Style

We use:

- **ESLint** for linting
- **Prettier** for formatting
- **TypeScript** for type checking

Run checks:

```bash
# Lint all packages
pnpm lint

# Type check all packages
pnpm typecheck

# Format code
pnpm prettier --write .
```

### Making Changes

1. **Components**: Edit files in `apps/web/components/`
2. **Pages**: Edit files in `apps/web/app/`
3. **IR Schema**: Edit files in `packages/ir-schema/src/`
4. **Extractors**: Edit files in `packages/extractor-*/src/`
5. **Build Scripts**: Edit files in `scripts/`

### Building for Production

```bash
# Build all packages
pnpm build

# Build just the web app
pnpm --filter @langchain/reference-web build
```

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests for specific package
pnpm --filter @langchain/reference-web test
```

### Test Structure

```txt
packages/*/src/__tests__/     # Unit tests
apps/web/app/**/__tests__/    # Page tests
```

### Writing Tests

- Place unit tests next to the code they test
- Use descriptive test names
- Mock external dependencies
- Test edge cases and error states

---

## Pull Request Process

### Before Submitting

1. **Fork** the repository
2. **Create a branch** from `main`:

   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes** with clear, atomic commits
4. **Run checks**:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   ```

5. **Update documentation** if needed

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```txt
feat: add new search filter
fix: resolve sidebar collapse issue
docs: update README with new build commands
chore: upgrade dependencies
```

### PR Guidelines

- **Title**: Clear, descriptive summary
- **Description**: Explain what and why
- **Screenshots**: Include for UI changes
- **Tests**: Add or update tests as needed
- **Breaking Changes**: Clearly document

### Review Process

1. Submit PR against `main`
2. Automated checks run (lint, types, tests)
3. Maintainer reviews code
4. Address feedback
5. Merge when approved

---

## Deployment

### Production Environment

The platform is deployed on Vercel with:

- **Vercel Blob**: IR artifact storage and build pointers
- **GitHub Actions**: Build automation

### Environment Variables (Production)

Configure in Vercel project settings:

| Variable                | Description                      | Required |
| ----------------------- | -------------------------------- | -------- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token        | Yes      |
| `GITHUB_TOKEN`          | GitHub PAT with `workflow` scope | Yes      |
| `GITHUB_REPOSITORY`     | Repository path                  | Yes      |
| `BUILD_API_TOKEN`       | Secret for `/api/build` endpoint | Yes      |

### GitHub Actions Secrets

Configure in repository settings:

| Secret                  | Description               |
| ----------------------- | ------------------------- |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob storage token |

### Vercel Setup

1. **Connect Repository**: Link GitHub repo at [vercel.com/import](https://vercel.com/import)
2. **Configure Settings**:
   - Framework: Next.js
   - Build Command: `pnpm turbo build --filter=@langchain/reference-web`
   - Output Directory: `apps/web/.next`
   - Install Command: `pnpm install`
3. **Add Environment Variables**
4. **Configure Domain** (e.g., `reference.langchain.com`)

### Vercel Blob Setup

1. Create Blob store in Vercel dashboard
2. Copy `BLOB_READ_WRITE_TOKEN`
3. IR builds upload automatically
4. Pointers are stored in Blob at `pointers/` path:
   - `pointers/latest-build.json` - Current build pointer
   - `pointers/latest-python.json` - Python build pointer
   - `pointers/latest-javascript.json` - JS build pointer
   - `pointers/packages/{ecosystem}/{name}.json` - Package version pointers

### Triggering Builds

#### Via GitHub Actions

1. Go to **Actions** → **Build IR**
2. Click **Run workflow**
3. Select language and optional SHA

#### Via API

```bash
curl -X POST https://reference.langchain.com/api/build \
  -H "Authorization: Bearer YOUR_BUILD_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"language": "both"}'
```

### Manual Build Process

```bash
# Set environment variables
export BLOB_READ_WRITE_TOKEN="your-token"
export GITHUB_TOKEN="your-token"

# Build and upload TypeScript IR
pnpm build:ir --config configs/typescript.json

# Build and upload Python IR
pnpm build:ir --config configs/python.json
```

### Build Options

| Option            | Description                               |
| ----------------- | ----------------------------------------- |
| `--config <path>` | Build configuration file                  |
| `--sha <sha>`     | Specific Git SHA                          |
| `--output <path>` | Output directory (default: `./ir-output`) |
| `--cache <path>`  | Cache directory (default: `./cache`)      |
| `--dry-run`       | Generate without uploading                |
| `--local`         | Skip all cloud uploads                    |
| `--skip-upload`   | Skip Vercel Blob upload                   |
| `-v, --verbose`   | Verbose output                            |

---

## Troubleshooting

### Common Issues

#### "No latest build found"

The Blob storage is missing the build pointer. Run a full build:

```bash
pnpm build:ir --config configs/typescript.json
pnpm build:ir --config configs/python.json
```

#### Python extractor: ModuleNotFoundError

Install griffe:

```bash
pip install griffe
```

#### TypeScript extractor fails

- Ensure Node.js 20+
- Check that source packages compile without errors

#### Java extractor fails

- Ensure Java 11+ is installed: `java -version`
- Verify `JAVA_HOME` is set correctly
- Check that source files have valid package declarations

#### Go extractor fails

- Ensure Go 1.21+ is installed: `go version`
- Verify Go is in your PATH
- Check that source files have valid package declarations

#### Build skips Java/Go packages

This is expected if Java or Go are not installed. Install the required tools:

```bash
# macOS
brew install openjdk@17
brew install go

# Ubuntu/Debian
sudo apt install openjdk-17-jdk
sudo apt install golang-go

# Windows (using scoop)
scoop install openjdk17
scoop install go
```

#### Upload fails with 401

- Verify `BLOB_READ_WRITE_TOKEN` is correct
- Ensure token has write permissions

### Viewing Logs

#### GitHub Actions

1. Go to **Actions** → **Build IR**
2. Click workflow run
3. Expand job steps

#### Vercel Function Logs

1. Open Vercel project
2. Click **Logs**
3. Filter by function name

### Debugging IR Data

Check Blob contents:

```typescript
import { list } from "@vercel/blob";

// List all blobs
const blobs = await list();
console.log("Blobs:", blobs);

// Check pointers
const pointersResponse = await fetch(`${process.env.BLOB_URL}/pointers/latest-build.json`);
const latestBuild = await pointersResponse.json();
console.log("Latest build:", latestBuild);
```

### Rollback

Update the build pointer to a previous build:

```typescript
import { put } from "@vercel/blob";

await put(
  "pointers/latest-build.json",
  JSON.stringify({
    buildId: "previous-build-id",
    updatedAt: new Date().toISOString(),
    packages: 0,
  }),
  { access: "public", allowOverwrite: true },
);
```

---

## Security

### Token Security

Generate secure tokens:

```bash
openssl rand -base64 32
```

### GitHub Token Scope

Use fine-grained PAT with minimal permissions:

- Repository access: This repository only
- Permissions: Actions (read/write), Contents (read)

### Project Environment Variables

- Mark sensitive vars as "Sensitive" in Vercel
- Never commit tokens to the repository
- Rotate tokens periodically

---

## Related Links

- [LangChain Python](https://github.com/langchain-ai/langchain)
- [LangChain JavaScript](https://github.com/langchain-ai/langchainjs)
- [LangChain Documentation](https://docs.langchain.com)
- [LangSmith](https://smith.langchain.com)
