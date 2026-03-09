# CLAUDE.md — RepoShift

## Project Overview
RepoShift is an AI-powered codebase audit and standardization tool. Users paste a GitHub or Azure DevOps repo URL, and it analyzes the codebase across 7 categories using Claude API, then generates a complete AI-ready documentation kit following the two-layer pattern (tool-agnostic `ai/` directory + thin tool wrappers).

**Live at:** `npm run dev` → http://localhost:3000
**Domain:** reposhift.dev
**Tagline:** "Audit. Standardize. Shift Forward."

## Tech Stack
- **Frontend:** Next.js 15 + React 19 + TypeScript + Tailwind CSS 4
- **Backend:** Next.js API routes (no separate server)
- **AI Engine:** Anthropic Claude API (`claude-sonnet-4-20250514`) via `@anthropic-ai/sdk`
- **Repo Access:** GitHub REST API + Azure DevOps REST API (RepoProvider pattern in `lib/github.ts`)
- **CLI:** Standalone Node.js script at `cli/reposhift.mjs` (zero dependencies, native fetch)
- **ZIP Export:** `jszip` for client-side ZIP download

## Architecture

### Routes
- `/` — Landing page with hero, features overview
- `/scan` — Scan dashboard (repo input, analysis, results, generation)
- `/cli` — CLI documentation page

### Analysis Pipeline
1. **Input** → `lib/github.ts` — `parseRepoUrl()` detects provider (GitHub/AzDo), `fetchRepoTree()` gets file tree, `fetchRepoFiles()` fetches key config + source files
2. **Detection** → `lib/stack-detect.ts` — Identifies framework, language, build tool, test framework, styling from config files
3. **Analysis** → `lib/analyzer.ts` — 7 category-specific Claude API calls, each with a focused prompt and JSON response format

### Generation Pipeline (6 phases, 7 API calls)
All generation happens via `generateDocumentationKit()` in `lib/analyzer.ts`, called by `POST /api/generate`.

| Phase | Output | API Calls | Description |
|-------|--------|-----------|-------------|
| 1 | `ai/patterns.md` | 1 | SSOT — code patterns, naming, architecture |
| 2 | `ai/agents/`, `ai/architecture/`, `ai/guides/`, `ai/mcp/` | 4 (parallel) | Specialized files referencing patterns.md |
| 3 | `AGENTS.md` | 1 | Entry point with table of contents |
| 4 | Tool wrappers (CLAUDE.md, .cursorrules, etc.) | 0 | Template-based, no API calls |
| 5 | `REMEDIATION-PLAN.md` | 1 | Prioritized fix plan |
| 6 | `ai/skills/create-pr/SKILL.md` | 0 | Static skill template |

Tool wrappers also generate auto-discovery directories when applicable:
- Claude → `.claude/agents/`, `.claude/skills/`
- Cursor → `.cursor/rules/`
- Windsurf → `.windsurf/rules/`

### Key Files
- `lib/types.ts` — All TypeScript types (`GeneratedFile`, `GenerationOutput`, `FileTreeNode`, `AITool`, category metadata)
- `lib/github.ts` — Multi-provider repo client (GitHub + Azure DevOps)
- `lib/stack-detect.ts` — Stack detection from config files
- `lib/analyzer.ts` — Claude API client, analysis functions, and 6-phase documentation generator
- `app/page.tsx` — Landing page
- `app/scan/page.tsx` — Scan dashboard (state management, scan flow)
- `app/cli/page.tsx` — CLI documentation
- `components/GeneratePanel.tsx` — Documentation kit generator UI with file tree + preview
- `components/FileTree.tsx` — Collapsible file tree component + `buildFileTree()` utility
- `components/ScanInput.tsx` — URL input with provider detection badge
- `cli/reposhift.mjs` — CLI tool

### Environment Variables (.env.local)
- `ANTHROPIC_API_KEY` — Required. Claude API key.
- `GITHUB_TOKEN` — Recommended. Prevents GitHub rate limiting.
- `AZURE_DEVOPS_TOKEN` — Required for Azure DevOps repos.

## Conventions
- kebab-case file names
- React components in `components/` with PascalCase names
- API routes follow Next.js App Router conventions
- All Claude API responses expect JSON — use `safeParseJSON()` helper in analyzer.ts to handle markdown fences
- CSS uses Tailwind v4 with custom theme variables defined in `app/globals.css`
- Dark theme throughout — colors defined as CSS custom properties (surface, border, accent, text-primary, etc.)

## Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run start        # Start production server
node cli/reposhift.mjs audit --repo=<url>  # CLI audit
```
