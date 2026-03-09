"use client";

import { useState } from "react";

function CliSnippet({ label, command }: { label: string; command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-[10px] text-text-muted mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-surface-overlay rounded-lg px-3 py-2 border border-border">
        <span className="text-accent text-xs font-mono">$</span>
        <code className="flex-1 text-xs text-text-secondary font-mono truncate">
          {command}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="px-2 py-0.5 rounded bg-surface-raised border border-border text-text-muted hover:text-text-primary text-[10px] font-medium transition-colors whitespace-nowrap"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

const FLAGS = [
  ["--repo=<url>", "Repository URL (auto-detected from git remote if omitted)"],
  ["--token=<pat>", "Personal Access Token for private repos"],
  ["--api-key=<key>", "Anthropic API key (alternative to env var)"],
  ["--json", "Output raw JSON instead of formatted report"],
  ["--categories=<list>", "Comma-separated categories to analyze (default: all 7)"],
  ["--out=<dir>", "Output directory for generated files"],
  ["--generate=<list>", "Generate: standards, ai-infra, mcp, remediation, or all"],
  ["--tools=<list>", "AI tools for ai-infra: claude, cursor, copilot, windsurf, codex, gemini"],
];

export default function CliPage() {
  return (
    <main className="w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
      <section className="pt-16 sm:pt-20 pb-12">
        <h1
          className="text-2xl sm:text-4xl font-bold text-text-primary text-center"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Command Line Interface
        </h1>
        <p className="mt-3 text-text-secondary text-center text-sm max-w-lg mx-auto">
          Run RepoShift directly from your terminal. No URL needed inside a git repo.
        </p>

        <div className="mt-10 max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Start */}
          <div className="rounded-xl border border-border bg-surface-raised p-6 animate-fade-up">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Quick Start</h3>
            <div className="space-y-3">
              <CliSnippet label="From inside a git repo" command="npx reposhift audit" />
              <CliSnippet label="Specify a repo" command="npx reposhift audit --repo=owner/repo" />
              <CliSnippet label="Audit + generate everything" command="npx reposhift audit --generate=all" />
            </div>
          </div>

          {/* Generation Options */}
          <div className="rounded-xl border border-border bg-surface-raised p-6 animate-fade-up" style={{ animationDelay: "0.05s" }}>
            <h3 className="text-sm font-semibold text-text-primary mb-4">Generation Options</h3>
            <div className="space-y-3">
              <CliSnippet label="Standards only" command="npx reposhift audit --generate=standards" />
              <CliSnippet label="AI configs for specific tools" command="npx reposhift audit --generate=ai-infra --tools=claude,cursor" />
              <CliSnippet label="Output to a directory" command="npx reposhift audit --generate=all --out=./audit" />
              <CliSnippet label="JSON output" command="npx reposhift audit --json" />
            </div>
          </div>

          {/* Flags Reference (full width) */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-surface-raised p-6 animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <h3 className="text-sm font-semibold text-text-primary mb-4">All Options</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-muted border-b border-border">
                    <th className="pb-2 pr-4 font-medium text-xs">Flag</th>
                    <th className="pb-2 font-medium text-xs">Description</th>
                  </tr>
                </thead>
                <tbody className="text-text-secondary">
                  {FLAGS.map(([flag, desc]) => (
                    <tr key={flag} className="border-b border-border/50 last:border-b-0">
                      <td className="py-2 pr-4">
                        <code className="text-xs text-accent font-mono whitespace-nowrap">{flag}</code>
                      </td>
                      <td className="py-2 text-xs">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Env vars */}
            <h4 className="text-xs font-semibold text-text-primary mt-6 mb-2">Environment Variables</h4>
            <div className="space-y-1 text-xs text-text-muted">
              <p><code className="text-text-secondary font-mono">ANTHROPIC_API_KEY</code> — Required. Claude API key.</p>
              <p><code className="text-text-secondary font-mono">GITHUB_TOKEN</code> — Optional. GitHub PAT for private repos.</p>
              <p><code className="text-text-secondary font-mono">AZURE_DEVOPS_TOKEN</code> — Optional. Azure DevOps PAT.</p>
            </div>

            {/* Supported providers */}
            <h4 className="text-xs font-semibold text-text-primary mt-6 mb-2">Supported Providers</h4>
            <div className="space-y-1 text-xs text-text-muted">
              <p><strong className="text-text-secondary">GitHub:</strong> https://github.com/owner/repo or owner/repo</p>
              <p><strong className="text-text-secondary">Azure DevOps:</strong> https://dev.azure.com/org/project/_git/repo</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
