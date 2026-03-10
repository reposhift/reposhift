# RepoShift CLI

AI-powered codebase audit and documentation generator. Audit. Standardize. Shift Forward.

## Install

```bash
# Run directly (no install needed)
npx reposhift audit

# Or install globally
npm install -g reposhift
```

Requires **Node.js 18+** and an [Anthropic API key](https://console.anthropic.com/).

## Quick Start

```bash
# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

# Audit the current git repo
reposhift audit

# Audit a specific repo
reposhift audit --repo=owner/repo

# Audit a private repo
reposhift audit --repo=owner/repo --token=<PAT>
```

## Features

- **7-category audit** — Structure, patterns, hardcoded values, dependencies, dead code, security, runtime stability
- **Remediation plan** — Sprint-ready fix list prioritized by impact
- **Documentation kit** — Full `ai/` directory with patterns, agents, architecture, guides + tool wrappers
- **Multi-provider** — GitHub and Azure DevOps repos
- **Zero dependencies** — Single file, native Node.js only

## Usage

### Audit

```bash
# Basic audit
reposhift audit --repo=owner/repo

# Compact output (default) — category summaries with critical/warning titles
reposhift audit --repo=owner/repo

# Verbose output — full descriptions, suggestions, file paths
reposhift audit --repo=owner/repo --verbose

# JSON output
reposhift audit --repo=owner/repo --json

# Specific categories only
reposhift audit --repo=owner/repo --categories=security,dependencies
```

### Generate

```bash
# Generate only the remediation plan (fast — 1 API call)
reposhift audit --repo=owner/repo --remediation

# Generate full documentation kit (ai/ directory + tool wrappers)
reposhift audit --repo=owner/repo --generate

# Generate for specific AI tools
reposhift audit --repo=owner/repo --generate --tools=claude,cursor

# Skip existing files
reposhift audit --repo=owner/repo --generate --mode=missing

# Update existing docs
reposhift audit --repo=owner/repo --generate --mode=update

# Output to a directory
reposhift audit --repo=owner/repo --generate --out=./docs
```

### Generated File Structure

```
your-project/
├── AGENTS.md                         # Entry point (table of contents)
├── CLAUDE.md                         # Claude Code wrapper
├── .cursorrules                      # Cursor wrapper
├── .github/copilot-instructions.md   # GitHub Copilot wrapper
├── ai/
│   ├── patterns.md                   # Code patterns (SSOT)
│   ├── agents/code-review.md         # Code review agent
│   ├── architecture/overview.md      # Architecture overview
│   ├── guides/common-mistakes.md     # Common mistakes guide
│   └── mcp/recommendations.md        # MCP server recommendations
└── REMEDIATION-PLAN.md               # Sprint-ready fix plan
```

## All Options

| Flag | Description |
|------|-------------|
| `--repo=<url>` | Repository URL (auto-detected from git remote if omitted) |
| `--token=<pat>` | Personal Access Token for private repos |
| `--api-key=<key>` | Anthropic API key (alternative to env var) |
| `--json` | Output raw JSON instead of formatted report |
| `--verbose` | Show full finding descriptions and suggestions |
| `--categories=<list>` | Comma-separated categories to analyze (default: all 7) |
| `--remediation` | Generate only the REMEDIATION-PLAN.md |
| `--generate` | Generate full AI documentation kit |
| `--tools=<list>` | AI tools: claude, cursor, copilot, windsurf, codex, gemini |
| `--mode=<mode>` | Generation mode: full, missing, or update |
| `--out=<dir>` | Output directory for generated files |
| `--help` | Show help message |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `GITHUB_TOKEN` | No | Default GitHub PAT for private repos |
| `AZURE_DEVOPS_TOKEN` | No | Default Azure DevOps PAT for private repos |

## Supported Providers

- **GitHub** — `https://github.com/owner/repo` or `owner/repo`
- **Azure DevOps** — `https://dev.azure.com/org/project/_git/repo`

## Web App

For a visual experience with interactive results, visit [reposhift.dev](https://reposhift.dev).

## License

MIT
