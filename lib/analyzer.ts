// ============================================================
// RepoShift — AI Analysis Engine (Claude API)
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  AuditCategory,
  CategoryScore,
  Finding,
  RepoFile,
  RepoTreeEntry,
  Severity,
  StackInfo,
} from "./types";

// Resolve API key: process.env may be overridden by parent shell (e.g. Claude Code
// sets ANTHROPIC_API_KEY to empty), so fall back to reading .env.local directly.
function resolveApiKey(): string {
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) return envKey;
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

const SERVER_API_KEY = resolveApiKey();

// Shared server client (used when a server key is configured)
const serverClient = SERVER_API_KEY
  ? new Anthropic({ apiKey: SERVER_API_KEY })
  : null;

/**
 * Get an Anthropic client — uses the server key if available,
 * otherwise uses a user-provided key (for hosted/BYOK mode).
 */
function getClient(userApiKey?: string): Anthropic {
  if (userApiKey) {
    return new Anthropic({ apiKey: userApiKey });
  }
  if (serverClient) {
    return serverClient;
  }
  throw new Error(
    "No API key available. Provide your Anthropic API key to continue."
  );
}

/** Check whether the server has a built-in API key */
export function hasApiKey(): boolean {
  return SERVER_API_KEY.length > 0;
}


// ----------------------------------------------------------
// Robust JSON extraction — handles markdown fences, preamble
// ----------------------------------------------------------

function extractJSON(text: string): string {
  // Try raw text first
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Find first { to last }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function safeParseJSON(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(extractJSON(text));
  } catch {
    return null;
  }
}

// ----------------------------------------------------------
// Prompt Builders
// ----------------------------------------------------------

function buildTreeSummary(tree: RepoTreeEntry[]): string {
  // Show folder structure (directories + key files, limit depth)
  const dirs = tree
    .filter((e) => e.type === "tree")
    .map((e) => e.path)
    .filter((p) => p.split("/").length <= 3);

  const keyBlobs = tree
    .filter(
      (e) =>
        e.type === "blob" &&
        (e.path.split("/").length <= 2 ||
          e.path.endsWith("package.json") ||
          e.path.endsWith("tsconfig.json") ||
          e.path.endsWith("angular.json"))
    )
    .map((e) => e.path);

  return [...dirs.map((d) => `${d}/`), ...keyBlobs].sort().join("\n");
}

function buildFileContext(files: RepoFile[], maxChars = 80000): string {
  let context = "";
  for (const f of files) {
    const entry = `\n--- FILE: ${f.path} ---\n${f.content}\n`;
    if (context.length + entry.length > maxChars) break;
    context += entry;
  }
  return context;
}

const SYSTEM_PROMPT = `You are RepoShift, a senior software architect analyzing a codebase. You produce precise, actionable audit findings.

RESPONSE FORMAT: You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no preamble. Just the JSON object.

The JSON must have this exact shape:
{
  "score": <number 0-100>,
  "summary": "<2-3 sentence summary>",
  "findings": [
    {
      "id": "<category>-<number>",
      "severity": "critical" | "warning" | "info",
      "title": "<short title>",
      "description": "<detailed explanation>",
      "file": "<filepath or null>",
      "suggestion": "<how to fix>"
    }
  ]
}

Scoring guide:
- 90-100: Excellent, minor suggestions only
- 70-89: Good, some issues to address
- 50-69: Needs work, significant improvements needed
- 0-49: Critical issues, major refactoring needed

CRITICAL ACCURACY RULES:
- ONLY report issues you can directly verify from the provided source code and file tree. Do NOT assume or infer issues.
- If you see a pattern handled correctly (e.g., try-catch blocks present, event listener cleanup in useEffect), do NOT claim it is missing.
- Every finding MUST reference a specific file path and describe the actual code, not what you assume might be there.
- Do NOT hallucinate file paths, variable names, or code patterns. If you cannot see it in the provided files, do not claim it exists or is missing.
- Do NOT report issues based on common patterns in similar projects — only report what you actually observe.
- If the code IS following best practices, say so and give a high score. Do not manufacture issues to fill the findings list.`;

function categoryPrompt(
  category: AuditCategory,
  stack: StackInfo,
  treeSummary: string,
  fileContext: string
): string {
  const prompts: Record<AuditCategory, string> = {
    structure: `Analyze the STRUCTURE & ORGANIZATION of this ${stack.framework} (${stack.language}) codebase.

Evaluate:
- Folder structure: Is it logical? Does it follow ${stack.framework} conventions?
- Module boundaries: Are concerns properly separated?
- File organization: Are files in the right places?
- Entry points: Are they clean and minimal?
- Barrel exports: Used appropriately or creating circular deps?
- Shared vs feature-specific code: Properly separated?

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    patterns: `Analyze the PATTERNS & CONSISTENCY of this ${stack.framework} (${stack.language}) codebase.

Evaluate:
- Naming conventions: Are files, variables, functions, classes named consistently?
- Architectural patterns: Is there a clear pattern (MVC, component-based, etc.)? Is it followed consistently?
- Code style: Consistent formatting, import ordering, export patterns?
- Error handling: Consistent approach across the codebase?
- State management: Consistent patterns for managing state?
- API patterns: Consistent approach to data fetching, services, etc.?

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    "hardcoded-values": `Analyze HARDCODED VALUES in this ${stack.framework} (${stack.language}) codebase.

Look for:
- Magic strings: Inline string literals that should be constants (status codes, role names, etc.)
- Magic numbers: Unexplained numeric literals (timeouts, limits, sizes)
- Hardcoded URLs: API endpoints, external service URLs embedded in source
- Inline configuration: Values that should be in config/environment variables
- Embedded credentials: Any secrets, keys, tokens in source code
- Repeated literals: Same string/number used in multiple places without a constant

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    dependencies: `Analyze the DEPENDENCIES & PACKAGES of this ${stack.framework} (${stack.language}) codebase.

Evaluate:
- Are there dependencies that appear unused (imported in package.json but not referenced)?
- Are there duplicate dependencies that serve the same purpose?
- Are there any known deprecated packages?
- Is the dependency count reasonable for the project size?
- Are dev dependencies properly separated from production dependencies?
- Are version ranges appropriate (too loose or too strict)?

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    "dead-code": `Analyze DEAD CODE in this ${stack.framework} (${stack.language}) codebase.

Look for:
- Unused exports: Functions, classes, or variables exported but never imported elsewhere
- Commented-out code blocks: Large sections of commented code
- Unused imports: Imported symbols that aren't used in the file
- Unreachable code: Code after return statements, impossible conditions
- Unused variables and parameters
- Empty files or placeholder files with no real content
- TODO/FIXME/HACK comments indicating unfinished work

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    security: `Analyze SECURITY BASICS of this ${stack.framework} (${stack.language}) codebase.

Look for:
- Exposed secrets: API keys, passwords, tokens in source code or config
- Missing input validation: User inputs not sanitized
- Unsafe patterns: eval(), innerHTML, SQL concatenation, etc.
- Missing authentication/authorization checks
- CORS misconfiguration
- Missing CSRF protection
- Insecure dependencies (known vulnerabilities patterns)
- Missing rate limiting
- Overly permissive file/API access

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,

    "runtime-stability": `Analyze RUNTIME & STABILITY of this ${stack.framework} (${stack.language}) codebase.

Look for:
- Memory leaks: Unsubscribed observables, event listeners not cleaned up, missing lifecycle cleanup
- Unhandled errors: Missing try-catch, unhandled promise rejections, missing error boundaries
- Race conditions: Concurrent state mutations, missing guards
- Performance issues: N+1 queries, unnecessary re-renders, missing memoization
- Missing cleanup: Timers not cleared, connections not closed
- Infinite loops potential: Recursive calls without base cases
- Resource exhaustion: Unbounded arrays, missing pagination

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}`,
  };

  return prompts[category];
}

// ----------------------------------------------------------
// Analysis Runner
// ----------------------------------------------------------

export async function analyzeCategory(
  category: AuditCategory,
  stack: StackInfo,
  tree: RepoTreeEntry[],
  files: RepoFile[],
  userApiKey?: string
): Promise<CategoryScore> {
  const treeSummary = buildTreeSummary(tree);
  const fileContext = buildFileContext(files);
  const prompt = categoryPrompt(category, stack, treeSummary, fileContext);
  const client = getClient(userApiKey);

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Parse JSON response (handles markdown fences, preamble)
    const parsed = safeParseJSON(text);
    if (!parsed) throw new Error("Failed to parse AI response as JSON");

    const findings: Finding[] = (parsed.findings as Record<string, unknown>[] || []).map(
      (f: Record<string, unknown>, i: number) => ({
        id: (f.id as string) || `${category}-${i + 1}`,
        category,
        severity: (f.severity as Severity) || "info",
        title: (f.title as string) || "Finding",
        description: (f.description as string) || "",
        file: (f.file as string) || undefined,
        suggestion: (f.suggestion as string) || undefined,
      })
    );

    return {
      category,
      score: Math.max(0, Math.min(100, (parsed.score as number) || 50)),
      findings,
      summary: (parsed.summary as string) || "Analysis complete.",
    };
  } catch (error) {
    console.error(`Analysis error for ${category}:`, error);
    return {
      category,
      score: 0,
      findings: [
        {
          id: `${category}-error`,
          category,
          severity: "warning",
          title: "Analysis Failed",
          description: `Could not analyze this category: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      summary: "Analysis could not be completed.",
    };
  }
}

// ----------------------------------------------------------
// Documentation Kit Generation (megadata-standards pattern)
// ----------------------------------------------------------

import {
  AITool,
  GeneratedFile,
  GenerationMode,
  GenerationOutput,
} from "./types";

const ACCURACY_RULES = `
CRITICAL ACCURACY RULES:
- ONLY document features, files, and patterns that ACTUALLY exist in the provided source code and file tree.
- Use the ACTUAL file tree to list project structure — do NOT omit files or invent ones that don't exist.
- If a feature is already implemented, document it as existing — do NOT claim it is "future" or "planned".
- When documenting naming conventions, use the ACTUAL file names from the tree.
- Do NOT hallucinate file paths, variable names, or code patterns. If you cannot see it in the provided files, do not claim it exists or is missing.
- Do NOT report issues based on common patterns in similar projects — only report what you actually observe.`;

function stripCodeFences(text: string): string {
  return text.replace(/^```(?:markdown|md)?\s*\n?/i, "").replace(/\n?\s*```\s*$/i, "").trim();
}

async function callClaude(
  client: Anthropic,
  system: string,
  user: string,
  maxTokens = 8192
): Promise<string> {
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    });
    let text = response.content[0].type === "text" ? response.content[0].text : "";
    text = stripCodeFences(text);
    if (response.stop_reason === "max_tokens" && text) {
      return text + "\n\n<!-- Content may be truncated due to length limits -->";
    }
    return text;
  } catch (error) {
    throw new Error(`Claude API error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// ---- Phase 1: ai/patterns.md (SSOT) ----

async function generatePatterns(
  client: Anthropic,
  stack: StackInfo,
  treeSummary: string,
  fileContext: string,
  findingsSummary: string,
  existingContent?: string
): Promise<string> {
  const updateContext = existingContent
    ? `\n\nEXISTING ai/patterns.md (update and improve this — preserve what's accurate, fix what's wrong, add what's missing):\n${existingContent}`
    : "";

  return callClaude(
    client,
    `You are RepoShift, generating ai/patterns.md — the Single Source of Truth (SSOT) for all code patterns, naming conventions, and architectural decisions in a project. This file is the foundation that all other AI documentation references. Write in clear, authoritative Markdown. Output ONLY the raw Markdown content.${ACCURACY_RULES}`,
    `${existingContent ? "Update" : "Generate"} **ai/patterns.md** for this ${stack.framework} (${stack.language}) project.

This is the SSOT (Single Source of Truth) for code patterns. Other files (agents, architecture docs, tool wrappers) will reference this instead of duplicating content.

Include these sections:
1. **Project Overview** — Brief description of the stack, architecture, and purpose
2. **Folder Structure** — MUST match the actual file tree. List real files, not hypothetical ones.
3. **Naming Conventions** — Use REAL examples from the source files. File naming, variable naming, component naming.
4. **Component/Module Patterns** — Extract from ACTUAL source code. Show canonical examples.
5. **State Management** — Document what the code ACTUALLY does.
6. **Error Handling Patterns** — Document the ACTUAL error handling approach.
7. **API/Service Patterns** — Document the ACTUAL API patterns.
8. **Testing Standards** — If no test framework is configured, state that clearly.
9. **Dependency Policy** — Key dependencies and their purpose.
10. **Environment & Configuration** — Environment variables, config files.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

AUDIT FINDINGS:
${findingsSummary}

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}${updateContext}`
  );
}

// ---- Phase 2: Specialized ai/ files (parallel) ----

async function generateCodeReviewAgent(
  client: Anthropic,
  stack: StackInfo,
  patternsContent: string,
  findingsSummary: string,
  existingContent?: string
): Promise<string> {
  const updateContext = existingContent
    ? `\n\nEXISTING ai/agents/code-review.md (update and improve this):\n${existingContent}`
    : "";

  return callClaude(
    client,
    `You are RepoShift, generating ai/agents/code-review.md — a code review agent definition following the megadata-standards format. Output ONLY the raw Markdown content.

The file MUST start with YAML frontmatter:
---
name: code-review
description: <one-line description>
---

Then provide the agent's instructions, review checklist, and output format. Reference ai/patterns.md as the source of truth for patterns and conventions.${ACCURACY_RULES}`,
    `${existingContent ? "Update" : "Generate"} **ai/agents/code-review.md** for this ${stack.framework} (${stack.language}) project.

The agent should:
1. Start with YAML frontmatter (name, description)
2. Describe the agent's purpose
3. List "Before Reviewing" prerequisites (read ai/patterns.md, etc.)
4. Provide a Review Checklist with checkboxes covering:
   - Naming conventions (per ai/patterns.md)
   - Architecture patterns compliance
   - Error handling consistency
   - Security basics
   - Performance considerations
   - Items derived from audit findings below
5. Define an Output Format template

Reference ai/patterns.md for all pattern details — do NOT duplicate patterns inline.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

AUDIT FINDINGS (derive checklist items from these):
${findingsSummary}

ai/patterns.md CONTENT (reference this, don't duplicate):
${patternsContent}${updateContext}`,
    4096
  );
}

async function generateArchitectureOverview(
  client: Anthropic,
  stack: StackInfo,
  treeSummary: string,
  fileContext: string,
  patternsContent: string,
  existingContent?: string
): Promise<string> {
  const updateContext = existingContent
    ? `\n\nEXISTING ai/architecture/overview.md (update and improve this):\n${existingContent}`
    : "";

  return callClaude(
    client,
    `You are RepoShift, generating ai/architecture/overview.md — a system architecture overview. Write clear, concise Markdown. Output ONLY the raw Markdown content. Reference ai/patterns.md for code patterns — focus here on high-level architecture, data flow, and key decisions.${ACCURACY_RULES}`,
    `${existingContent ? "Update" : "Generate"} **ai/architecture/overview.md** for this ${stack.framework} (${stack.language}) project.

Include:
1. **System Overview** — What the system does, high-level architecture diagram (ASCII)
2. **Key Components** — Major modules/services and their responsibilities
3. **Data Flow** — How data moves through the system
4. **Key Files** — The most important files and what they do
5. **Environment Variables** — Required config with descriptions
6. **Commands** — How to run, build, test
7. **Architecture Decisions** — Key choices and rationale (from what you can observe)

Reference ai/patterns.md for code-level patterns. This file focuses on the big picture.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

REPOSITORY TREE:
${treeSummary}

SOURCE FILES:
${fileContext}

ai/patterns.md CONTENT (reference, don't duplicate):
${patternsContent}${updateContext}`,
    4096
  );
}

async function generateCommonMistakes(
  client: Anthropic,
  stack: StackInfo,
  findingsDetail: string,
  fileContext: string,
  patternsContent: string,
  existingContent?: string
): Promise<string> {
  const updateContext = existingContent
    ? `\n\nEXISTING ai/guides/common-mistakes.md (update — add new mistakes, remove resolved ones):\n${existingContent}`
    : "";

  return callClaude(
    client,
    `You are RepoShift, generating ai/guides/common-mistakes.md — a guide of common mistakes found in the codebase with correct alternatives. Write clear Markdown with code examples. Output ONLY the raw Markdown content.${ACCURACY_RULES}`,
    `${existingContent ? "Update" : "Generate"} **ai/guides/common-mistakes.md** for this ${stack.framework} (${stack.language}) project.

Derive this from the audit findings below. For each mistake pattern found:
1. **What's wrong** — The anti-pattern or mistake
2. **Why it matters** — Impact on quality/security/performance
3. **Correct approach** — Show the right way, referencing ai/patterns.md conventions
4. **Example** — Show incorrect vs correct code (ONLY from actual codebase, not hypothetical)

Group related findings. Only include issues you can verify from the source files.

AUDIT FINDINGS:
${findingsDetail}

SOURCE FILES (verify findings against these):
${fileContext}

ai/patterns.md CONTENT (reference for correct patterns):
${patternsContent}${updateContext}`,
    4096
  );
}

async function generateMCPFile(
  client: Anthropic,
  stack: StackInfo,
  treeSummary: string,
  fileContext: string,
  existingContent?: string
): Promise<string> {
  const updateContext = existingContent
    ? `\n\nEXISTING ai/mcp/recommendations.md (update — verify current recommendations, add missing ones):\n${existingContent}`
    : "";

  return callClaude(
    client,
    `You are RepoShift, an expert on MCP (Model Context Protocol) servers for AI coding assistants. You recommend MCP servers that would benefit a specific project. Write in clear Markdown. Only recommend MCP servers that actually exist — do NOT fabricate server names or packages.`,
    `${existingContent ? "Update" : "Recommend"} MCP servers for this ${stack.framework} (${stack.language}) project. Write as **ai/mcp/recommendations.md**.

For each recommendation:
1. **Server name** — the actual MCP server name/package
2. **What it does** — brief description
3. **Why it's relevant** — specific to this project's stack
4. **Installation** — how to add it (npm package or config snippet)

Consider: framework, language, key libraries, database/ORM, CI/CD, testing, UI libraries, build tools.

Only recommend servers that actually exist. Note if verification is needed.

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

REPOSITORY TREE:
${treeSummary}

KEY FILES:
${fileContext}${updateContext}`,
    4096
  );
}

// ---- Phase 3: AGENTS.md (entry point) ----

async function generateAgentsEntry(
  client: Anthropic,
  stack: StackInfo,
  generatedFiles: GeneratedFile[]
): Promise<string> {
  const fileList = generatedFiles
    .map((f) => `- \`${f.path}\` — ${f.label}`)
    .join("\n");

  return callClaude(
    client,
    `You are RepoShift, generating AGENTS.md — the universal entry point for AI coding assistants. This file is a table of contents that routes AI tools to the correct documentation in the ai/ directory. Follow the megadata-standards format exactly. Output ONLY the raw Markdown content.${ACCURACY_RULES}`,
    `Generate **AGENTS.md** for this ${stack.framework} (${stack.language}) project.

This is the entry point that any AI assistant reads first. It should:
1. Start with a title: "# AI Development Standards — {project description}"
2. Brief project purpose (2-3 sentences)
3. A "Reference Documents" table routing tasks to the right file:
   | Your Task | Read This |
   |-----------|-----------|
   (map common tasks to ai/ files)
4. An "Agents & Skills" table:
   | Type | Name | Purpose |
   (list agents and skills with links)
5. Key conventions summary (3-5 bullet points — reference ai/patterns.md for details)
6. Commands section (how to run, build, test)
7. Critical reminders (important rules for AI assistants)

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

GENERATED FILES (route to these):
${fileList}`,
    4096
  );
}

// ---- Phase 4: Tool wrappers (template-based, 0 API calls) ----

const TOOL_WRAPPER_TEMPLATES: Record<AITool, { fileName: string; buildContent: (agentsContent: string) => string }> = {
  claude: {
    fileName: "CLAUDE.md",
    buildContent: (agentsContent: string) => {
      // Extract agents & skills table if present
      const agentsSection = agentsContent.match(/## Agents & Skills[\s\S]*?(?=\n## |\n---|\Z)/)?.[0] || "";
      const hasAgents = agentsSection.includes("code-review");

      let content = `# Claude Code Configuration

Read [\`AGENTS.md\`](AGENTS.md) first — it contains all project standards, architecture, and critical conventions.

This file adds Claude Code-specific invoke syntax.

---

## Agents & Skills (Claude Code)

| Type | Name | Invoke |
|------|------|--------|`;

      if (hasAgents) {
        content += `
| Agent | [\`ai/agents/code-review.md\`](ai/agents/code-review.md) | "Review my changes using ai/agents/code-review.md" |
| Agent | [\`ai/agents/doc-update.md\`](ai/agents/doc-update.md) | "Check what docs need updating using ai/agents/doc-update.md" |`;
      }
      content += `
| Skill | [\`ai/skills/create-pr/SKILL.md\`](ai/skills/create-pr/SKILL.md) | \`/create-pr\` |`;

      return content;
    },
  },
  cursor: {
    fileName: ".cursorrules",
    buildContent: () => `# Cursor Rules

Read AGENTS.md for full project standards and conventions.
Read ai/patterns.md for the single source of truth on code patterns.

## Key Rules
- Follow all conventions documented in ai/patterns.md
- Reference ai/agents/code-review.md checklist before submitting changes
- Check ai/architecture/overview.md for system architecture context
- See ai/guides/common-mistakes.md for anti-patterns to avoid
`,
  },
  copilot: {
    fileName: ".github/copilot-instructions.md",
    buildContent: () => `# GitHub Copilot Instructions

Read AGENTS.md for full project context and standards.
Read ai/patterns.md for code patterns and naming conventions.

## Code Generation Rules
- Follow naming conventions from ai/patterns.md
- Use error handling patterns documented in ai/patterns.md
- Reference ai/architecture/overview.md for architectural context
- Avoid anti-patterns listed in ai/guides/common-mistakes.md
`,
  },
  windsurf: {
    fileName: ".windsurfrules",
    buildContent: () => `# Windsurf Rules

Read AGENTS.md for full project context and standards.
Read ai/patterns.md for code patterns and naming conventions.

## Cascade AI Rules
- Follow all conventions in ai/patterns.md
- Check ai/architecture/overview.md for system design context
- Avoid patterns in ai/guides/common-mistakes.md
- Use ai/agents/code-review.md checklist for quality assurance
`,
  },
  codex: {
    fileName: "CODEX.md",
    buildContent: () => `# OpenAI Codex CLI Instructions

Read AGENTS.md for full project context and standards.
Read ai/patterns.md for the single source of truth on code patterns.

## Sandbox Notes
- Follow all conventions documented in ai/patterns.md
- Reference ai/architecture/overview.md for architecture decisions
- Avoid anti-patterns in ai/guides/common-mistakes.md
- Use ai/agents/code-review.md checklist before finalizing changes
`,
  },
  gemini: {
    fileName: "GEMINI.md",
    buildContent: () => `# Google Gemini Code Assist Instructions

Read AGENTS.md for full project context and standards.
Read ai/patterns.md for code patterns and naming conventions.

## Code Generation Rules
- Follow naming conventions from ai/patterns.md
- Reference ai/architecture/overview.md for architectural context
- Avoid anti-patterns listed in ai/guides/common-mistakes.md
- Use ai/agents/code-review.md checklist for validation
`,
  },
};

function buildToolWrappers(selectedTools: AITool[], agentsContent: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const tool of selectedTools) {
    const template = TOOL_WRAPPER_TEMPLATES[tool];
    files.push({
      path: template.fileName,
      content: template.buildContent(agentsContent),
      label: `${template.fileName} (${tool} wrapper)`,
      phase: 4,
    });
  }

  // Tool-specific directory wrappers for auto-discovery
  if (selectedTools.includes("claude")) {
    files.push({
      path: ".claude/agents/code-review.md",
      content: `# Code Review Agent

Read and follow the full agent definition in [\`ai/agents/code-review.md\`](../../ai/agents/code-review.md).

This file enables Claude Code auto-discovery. The source of truth is \`ai/agents/code-review.md\`.
`,
      label: ".claude/agents/ (auto-discovery)",
      phase: 4,
    });
    files.push({
      path: ".claude/agents/doc-update.md",
      content: `# Documentation Update Agent

Read and follow the full agent definition in [\`ai/agents/doc-update.md\`](../../ai/agents/doc-update.md).

This file enables Claude Code auto-discovery. The source of truth is \`ai/agents/doc-update.md\`.
`,
      label: ".claude/agents/ (auto-discovery)",
      phase: 4,
    });
    files.push({
      path: ".claude/skills/create-pr/SKILL.md",
      content: `# Create PR Skill

Read and follow the full skill definition in [\`ai/skills/create-pr/SKILL.md\`](../../../ai/skills/create-pr/SKILL.md).

This file enables Claude Code auto-discovery. The source of truth is \`ai/skills/create-pr/SKILL.md\`.
`,
      label: ".claude/skills/ (auto-discovery)",
      phase: 4,
    });
  }

  if (selectedTools.includes("cursor")) {
    files.push({
      path: ".cursor/rules/patterns.mdc",
      content: `---
description: Code patterns and conventions for this project
globs:
alwaysApply: true
---

Read and follow the patterns defined in [ai/patterns.md](../../ai/patterns.md).
Review checklist: [ai/agents/code-review.md](../../ai/agents/code-review.md).
Common mistakes to avoid: [ai/guides/common-mistakes.md](../../ai/guides/common-mistakes.md).
`,
      label: ".cursor/rules/ (auto-discovery)",
      phase: 4,
    });
  }

  if (selectedTools.includes("windsurf")) {
    files.push({
      path: ".windsurf/rules/patterns.md",
      content: `# Project Patterns

Read and follow the patterns defined in [ai/patterns.md](../../ai/patterns.md).
Review checklist: [ai/agents/code-review.md](../../ai/agents/code-review.md).
Common mistakes to avoid: [ai/guides/common-mistakes.md](../../ai/guides/common-mistakes.md).
`,
      label: ".windsurf/rules/ (auto-discovery)",
      phase: 4,
    });
  }

  return files;
}

// ---- Phase 5: Remediation Plan ----

async function generateRemediation(
  client: Anthropic,
  stack: StackInfo,
  treeSummary: string,
  fileContext: string,
  findingsDetail: string,
  existingContent?: string
): Promise<string> {
  const updateContext = existingContent
    ? `\n\nEXISTING REMEDIATION-PLAN.md (update — mark resolved items, add new ones):\n${existingContent}`
    : "";

  return callClaude(
    client,
    `You are RepoShift, generating a prioritized remediation plan that a tech lead could use for sprint planning. Write in clear, actionable Markdown. Focus on practical execution, not theory.

CRITICAL ACCURACY RULES:
- ONLY include remediation items for issues that are ACTUALLY present in the codebase. Verify each claim against the provided source files.
- If an audit finding claims something is missing but the source code shows it IS implemented, DROP that finding from the plan.
- Cross-check ALL audit findings against the actual source files before including them. The audit findings may contain false positives.
- Every remediation item must reference a REAL file path and describe ACTUAL code that needs changing.`,
    `${existingContent ? "Update the" : "Generate a"} PRIORITIZED REMEDIATION PLAN for this ${stack.framework} (${stack.language}) project.

IMPORTANT: Cross-check every audit finding against the actual SOURCE FILES provided. Drop any finding that is already addressed in the code.

Structure:
1. **Executive Summary** — 2-3 sentences on overall state and top priorities
2. **Quick Wins** (< 1 hour each) — Low-effort, high-impact fixes
3. **Sprint 1 Priorities** (1-2 days) — Most critical issues first
4. **Sprint 2 Priorities** (3-5 days) — Important but less urgent
5. **Tech Debt Backlog** — Longer-term items

For each item: What, Why, How, Files affected, Effort (XS/S/M/L/XL), Risk (Low/Medium/High).

DETECTED STACK: ${JSON.stringify(stack, null, 2)}

AUDIT FINDINGS:
${findingsDetail}

REPOSITORY TREE:
${treeSummary}

SOURCE FILES (verify findings against these):
${fileContext}${updateContext}`
  );
}

// ---- Phase 6: Skill template (static) ----

function buildSkillTemplate(): GeneratedFile {
  return {
    path: "ai/skills/create-pr/SKILL.md",
    content: `---
name: create-pr
description: Create a pull request with conventional commit message
---

# Create Pull Request

## Steps

1. **Check for changes**: Run \`git status\` to see what has changed.
2. **Stage changes**: Stage relevant files with \`git add\`.
3. **Create commit**: Write a conventional commit message:
   - \`feat:\` for new features
   - \`fix:\` for bug fixes
   - \`refactor:\` for code restructuring
   - \`docs:\` for documentation changes
   - \`chore:\` for maintenance tasks
4. **Push branch**: Push to remote with \`git push -u origin <branch>\`.
5. **Create PR**: Use \`gh pr create\` with a descriptive title and body.

## Commit Message Format

\`\`\`
<type>(<scope>): <short description>

<body — explain what changed and why>
\`\`\`

## PR Body Template

\`\`\`markdown
## Summary
- <bullet points describing changes>

## Test Plan
- [ ] <verification steps>
\`\`\`
`,
    label: "Create PR Skill",
    phase: 6,
  };
}

function buildDocUpdateAgent(): GeneratedFile {
  return {
    path: "ai/agents/doc-update.md",
    content: `---
name: doc-update
description: Detect and update documentation after code changes
---

# Documentation Update Agent

## Trigger
Run this agent after any code change to determine what documentation needs updating.

## Process

1. **Identify changed files**: Review the diff or changed file list.
2. **Map changes to docs**: For each changed file, determine which docs are affected:
   - Component/module changes → update \`ai/architecture/overview.md\`
   - New patterns or conventions → update \`ai/patterns.md\`
   - Bug fixes for known issues → update \`ai/guides/common-mistakes.md\`
   - New dependencies → update \`ai/architecture/overview.md\` and \`ai/mcp/recommendations.md\`
   - New API endpoints → update \`ai/architecture/overview.md\`
3. **Update affected docs**: Make the documentation changes.
4. **Verify cross-references**: Ensure \`AGENTS.md\` still accurately describes the \`ai/\` directory.

## Update Checklist

- [ ] \`ai/patterns.md\` — Are naming conventions or code patterns still accurate?
- [ ] \`ai/architecture/overview.md\` — Does the architecture description match?
- [ ] \`ai/guides/common-mistakes.md\` — Any new anti-patterns to document?
- [ ] \`ai/agents/code-review.md\` — Does the review checklist need new items?
- [ ] \`AGENTS.md\` — Does the file listing match the current \`ai/\` directory?

## Output
Commit documentation changes alongside code changes, or as a follow-up PR with the message:
\`docs: update ai/ documentation for <change description>\`
`,
    label: "Doc Update Agent",
    phase: 6,
  };
}

function buildDocGovernance(): GeneratedFile {
  return {
    path: "ai/guides/documentation-governance.md",
    content: `# Documentation Governance

## When to Update Documentation

### Trigger 1: Code Changes
When code changes, run the doc-update agent (\`ai/agents/doc-update.md\`) to identify which docs need updating.

### Trigger 2: New Patterns Discovered
When a new pattern emerges in the codebase:
1. Add it to \`ai/patterns.md\`
2. If it replaces an old pattern, add the old one to \`ai/guides/common-mistakes.md\`
3. Update \`ai/agents/code-review.md\` checklist if it affects review criteria

### Trigger 3: Dependency Changes
When adding, removing, or updating dependencies:
1. Update \`ai/architecture/overview.md\` if it changes system architecture
2. Update \`ai/mcp/recommendations.md\` if it affects tooling

## Maintenance Schedule

### After Each PR
- Run doc-update agent checklist
- Verify \`ai/patterns.md\` reflects any new conventions

### Monthly
- Review \`ai/guides/common-mistakes.md\` for resolved issues
- Check \`ai/architecture/overview.md\` accuracy
- Verify MCP recommendations are still current

### Quarterly
- Full documentation audit against codebase
- Review and update all agent definitions
- Check that tool wrappers (CLAUDE.md, .cursorrules, etc.) are in sync

## Agent-Assisted Updates

AI agents can:
- Detect which docs need updating after code changes (doc-update agent)
- Verify standards compliance (code-review agent)
- Draft documentation updates

Human decisions still required for:
- Architectural documentation changes
- Adding or removing documentation files
- Governance policy changes
`,
    label: "Documentation Governance",
    phase: 6,
  };
}

// ---- Orchestrator ----

export async function generateDocumentationKit(
  stack: StackInfo,
  tree: RepoTreeEntry[],
  files: RepoFile[],
  auditFindings: CategoryScore[],
  selectedTools: AITool[] = ["claude", "codex"],
  userApiKey?: string,
  mode: GenerationMode = "full",
  existingContents?: Record<string, string>
): Promise<GenerationOutput> {
  const treeSummary = buildTreeSummary(tree);
  const fileContext = buildFileContext(files, 40000);
  const smallFileContext = buildFileContext(files, 20000);
  const client = getClient(userApiKey);
  const ec = existingContents || {};

  // Helper: check if a file should be skipped in "missing" mode (already exists)
  const shouldSkip = (path: string) => mode === "missing" && ec[path];
  // Helper: get existing content for "update" mode
  const getExisting = (path: string) => mode === "update" ? ec[path] : undefined;

  const findingsSummary = auditFindings
    .map(
      (c) =>
        `## ${c.category} (Score: ${c.score}/100)\n${c.summary}\n${c.findings.map((f) => `- [${f.severity}] ${f.title}: ${f.description}`).join("\n")}`
    )
    .join("\n\n");

  const findingsDetail = auditFindings
    .map(
      (c) =>
        `## ${c.category} (Score: ${c.score}/100)\n${c.summary}\n${c.findings
          .map(
            (f) =>
              `- [${f.severity}] ${f.title}: ${f.description}${f.file ? ` (${f.file})` : ""}${f.suggestion ? `\n  Suggestion: ${f.suggestion}` : ""}`
          )
          .join("\n")}`
    )
    .join("\n\n");

  const generatedFiles: GeneratedFile[] = [];

  // Phase 1: ai/patterns.md (foundation — everything else depends on this)
  let patternsContent: string;
  if (shouldSkip("ai/patterns.md")) {
    patternsContent = ec["ai/patterns.md"];
    generatedFiles.push({
      path: "ai/patterns.md",
      content: patternsContent,
      label: "Code Patterns (SSOT)",
      phase: 1,
      source: "existing",
    });
  } else {
    patternsContent = await generatePatterns(client, stack, treeSummary, fileContext, findingsSummary, getExisting("ai/patterns.md"));
    generatedFiles.push({
      path: "ai/patterns.md",
      content: patternsContent,
      label: "Code Patterns (SSOT)",
      phase: 1,
      source: "generated",
    });
  }

  // Phase 2: Specialized files (parallel, all reference patterns.md)
  const phase2Tasks: { path: string; label: string; generate: () => Promise<string> }[] = [
    {
      path: "ai/agents/code-review.md",
      label: "Code Review Agent",
      generate: () => generateCodeReviewAgent(client, stack, patternsContent, findingsSummary, getExisting("ai/agents/code-review.md")),
    },
    {
      path: "ai/architecture/overview.md",
      label: "Architecture Overview",
      generate: () => generateArchitectureOverview(client, stack, treeSummary, smallFileContext, patternsContent, getExisting("ai/architecture/overview.md")),
    },
    {
      path: "ai/guides/common-mistakes.md",
      label: "Common Mistakes Guide",
      generate: () => generateCommonMistakes(client, stack, findingsDetail, smallFileContext, patternsContent, getExisting("ai/guides/common-mistakes.md")),
    },
    {
      path: "ai/mcp/recommendations.md",
      label: "MCP Recommendations",
      generate: () => generateMCPFile(client, stack, treeSummary, smallFileContext, getExisting("ai/mcp/recommendations.md")),
    },
  ];

  const phase2Results = await Promise.all(
    phase2Tasks.map(async (task) => {
      if (shouldSkip(task.path)) {
        return { path: task.path, content: ec[task.path], label: task.label, phase: 2, source: "existing" as const };
      }
      const content = await task.generate();
      return { path: task.path, content, label: task.label, phase: 2, source: "generated" as const };
    })
  );
  generatedFiles.push(...phase2Results);

  // Phase 3: AGENTS.md entry point (needs to know all ai/ files)
  let agentsContent: string;
  if (shouldSkip("AGENTS.md")) {
    agentsContent = ec["AGENTS.md"];
    generatedFiles.push({ path: "AGENTS.md", content: agentsContent, label: "AI Entry Point", phase: 3, source: "existing" });
  } else {
    agentsContent = await generateAgentsEntry(client, stack, generatedFiles);
    generatedFiles.push({ path: "AGENTS.md", content: agentsContent, label: "AI Entry Point", phase: 3, source: "generated" });
  }

  // Phase 4: Tool wrappers (template-based, 0 API calls)
  const wrappers = buildToolWrappers(selectedTools, agentsContent);
  for (const w of wrappers) {
    if (shouldSkip(w.path)) {
      generatedFiles.push({ ...w, content: ec[w.path], source: "existing" });
    } else {
      generatedFiles.push({ ...w, source: "generated" });
    }
  }

  // Phase 5: Remediation plan
  if (shouldSkip("REMEDIATION-PLAN.md")) {
    generatedFiles.push({
      path: "REMEDIATION-PLAN.md",
      content: ec["REMEDIATION-PLAN.md"],
      label: "Remediation Plan",
      phase: 5,
      source: "existing",
    });
  } else {
    const remediation = await generateRemediation(client, stack, treeSummary, smallFileContext, findingsDetail, getExisting("REMEDIATION-PLAN.md"));
    generatedFiles.push({
      path: "REMEDIATION-PLAN.md",
      content: remediation,
      label: "Remediation Plan",
      phase: 5,
      source: "generated",
    });
  }

  // Phase 6: Static templates (skills + doc-update agent + governance)
  const staticFiles = [buildSkillTemplate(), buildDocUpdateAgent(), buildDocGovernance()];
  for (const sf of staticFiles) {
    if (shouldSkip(sf.path)) {
      generatedFiles.push({ ...sf, content: ec[sf.path], source: "existing" });
    } else {
      generatedFiles.push({ ...sf, source: "generated" });
    }
  }

  return {
    files: generatedFiles,
    selectedTools,
    generatedAt: new Date().toISOString(),
    mode,
  };
}
