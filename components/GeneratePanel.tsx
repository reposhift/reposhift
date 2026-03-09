"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { AITool, CategoryScore, GeneratedFile, GenerationMode, GenerationOutput, RepoFile, RepoTreeEntry, StackInfo } from "@/lib/types";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { FileTree, buildFileTree } from "@/components/FileTree";
import { useApiKey } from "@/lib/api-key-context";
import { useScan } from "@/lib/scan-context";

interface GeneratePanelProps {
  stack: StackInfo;
  tree: RepoTreeEntry[];
  files: RepoFile[];
  auditFindings: CategoryScore[];
  repoName?: string;
}

const GENERATION_PHASES = [
  { phase: 1, label: "Analyzing patterns...", description: "Building the SSOT patterns document" },
  { phase: 2, label: "Building specialized files...", description: "Code review agent, architecture, guides, MCP" },
  { phase: 3, label: "Creating entry point...", description: "Generating AGENTS.md" },
  { phase: 4, label: "Building tool wrappers...", description: "Template-based wrapper files" },
  { phase: 5, label: "Planning remediation...", description: "Prioritized fix plan" },
  { phase: 6, label: "Adding skills...", description: "Skill templates" },
];

const AI_TOOLS: { key: AITool; label: string }[] = [
  { key: "claude", label: "Claude Code" },
  { key: "cursor", label: "Cursor" },
  { key: "copilot", label: "GitHub Copilot" },
  { key: "windsurf", label: "Windsurf" },
  { key: "codex", label: "OpenAI Codex" },
  { key: "gemini", label: "Gemini" },
];

// ---- Detection Constants ----

/** Core doc files that are always generated (tool-agnostic) */
const CORE_DOC_FILES = [
  "ai/patterns.md",
  "ai/agents/code-review.md",
  "ai/agents/doc-update.md",
  "ai/architecture/overview.md",
  "ai/guides/common-mistakes.md",
  "ai/guides/documentation-governance.md",
  "ai/mcp/recommendations.md",
  "ai/skills/create-pr/SKILL.md",
  "AGENTS.md",
  "REMEDIATION-PLAN.md",
];

/** Tool wrapper files (mapped to AI tool) */
const TOOL_FILE_MAP: Record<string, AITool> = {
  "CLAUDE.md": "claude",
  ".cursorrules": "cursor",
  ".github/copilot-instructions.md": "copilot",
  ".windsurfrules": "windsurf",
  "CODEX.md": "codex",
  "GEMINI.md": "gemini",
};

/** Directory patterns that indicate tool usage */
const TOOL_DIR_MAP: Record<string, AITool> = {
  ".claude/": "claude",
  ".cursor/": "cursor",
  ".windsurf/": "windsurf",
};

// ---- Detection Hook ----

function useDocDetection(tree: RepoTreeEntry[], files: RepoFile[]) {
  return useMemo(() => {
    const treePaths = new Set(tree.map((e) => e.path));

    // Detect existing core doc files
    const existingCoreFiles = CORE_DOC_FILES.filter((p) => treePaths.has(p));
    const missingCoreFiles = CORE_DOC_FILES.filter((p) => !treePaths.has(p));

    // Detect tools from wrapper files
    const detectedTools = new Set<AITool>();
    for (const [file, tool] of Object.entries(TOOL_FILE_MAP)) {
      if (treePaths.has(file)) detectedTools.add(tool);
    }
    // Detect tools from directories
    for (const [dirPrefix, tool] of Object.entries(TOOL_DIR_MAP)) {
      if (tree.some((e) => e.path.startsWith(dirPrefix))) detectedTools.add(tool);
    }

    // Detect existing tool wrapper files
    const existingToolFiles = Object.keys(TOOL_FILE_MAP).filter((p) => treePaths.has(p));

    // All existing doc files
    const allExisting = [...existingCoreFiles, ...existingToolFiles];

    // Gather existing file contents from fetched files
    const existingContents: Record<string, string> = {};
    for (const f of files) {
      if (allExisting.includes(f.path)) {
        existingContents[f.path] = f.content;
      }
    }

    return {
      existingCoreFiles,
      missingCoreFiles,
      existingToolFiles,
      detectedTools: Array.from(detectedTools),
      existingContents,
      hasExistingDocs: allExisting.length > 0,
      totalExisting: allExisting.length,
      totalExpected: CORE_DOC_FILES.length, // tool wrappers vary by selection
    };
  }, [tree, files]);
}

// ---- Mode descriptions ----

const MODE_OPTIONS: { key: GenerationMode; label: string; description: string }[] = [
  { key: "missing", label: "Generate Missing", description: "Only create files that don't exist yet" },
  { key: "update", label: "Update All", description: "Regenerate everything using existing content as context" },
  { key: "full", label: "Full Overwrite", description: "Generate everything from scratch" },
];

export function GeneratePanel({
  stack,
  tree,
  files,
  auditFindings,
  repoName,
}: GeneratePanelProps) {
  const { getAuthHeaders } = useApiKey();
  const { generationOutput, saveGenerationOutput } = useScan();

  // Detection
  const detection = useDocDetection(tree, files);

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<GenerationOutput | null>(generationOutput);
  const [selectedTools, setSelectedTools] = useState<Set<AITool>>(new Set(["claude", "codex"]));
  const [mode, setMode] = useState<GenerationMode>(detection.hasExistingDocs ? "missing" : "full");

  // Pre-select detected tools (once)
  const hasAppliedDetection = useRef(false);
  useEffect(() => {
    if (!hasAppliedDetection.current && detection.detectedTools.length > 0) {
      setSelectedTools(new Set(detection.detectedTools));
      hasAppliedDetection.current = true;
    }
  }, [detection.detectedTools]);

  // Update mode default when detection changes
  useEffect(() => {
    if (detection.hasExistingDocs) {
      setMode("missing");
    }
  }, [detection.hasExistingDocs]);

  // UI state
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [viewRaw, setViewRaw] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const toggleTool = (tool: AITool) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  };

  // Build file tree from generated output
  const fileTree = useMemo(() => {
    if (!output) return [];
    return buildFileTree(output.files.map((f) => ({ path: f.path, label: f.label })));
  }, [output]);

  // Get content for selected file
  const selectedContent = useMemo((): GeneratedFile | null => {
    if (!output || !selectedFile) return null;
    return output.files.find((f) => f.path === selectedFile) || null;
  }, [output, selectedFile]);

  // Count how many files will be generated based on mode
  const generationFileCount = useMemo(() => {
    if (mode === "full" || mode === "update") return "all";
    // "missing" — count how many core files are missing + selected tool wrappers that don't exist
    const missingCore = detection.missingCoreFiles.length;
    const selectedToolFiles = Array.from(selectedTools)
      .map((t) => Object.entries(TOOL_FILE_MAP).find(([, tool]) => tool === t)?.[0])
      .filter(Boolean) as string[];
    const missingToolFiles = selectedToolFiles.filter((f) => !detection.existingToolFiles.includes(f));
    return missingCore + missingToolFiles.length;
  }, [mode, detection, selectedTools]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);

    try {
      const authHeaders = getAuthHeaders();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          stack,
          tree,
          files,
          auditFindings,
          selectedTools: Array.from(selectedTools),
          mode,
          existingContents: mode !== "full" ? detection.existingContents : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Generation failed");
      }

      const data: GenerationOutput = await res.json();
      setOutput(data);
      saveGenerationOutput(data);
      // Auto-select first file
      if (data.files.length > 0) {
        setSelectedFile(data.files[0].path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }, [stack, tree, files, auditFindings, selectedTools, mode, detection.existingContents, getAuthHeaders, saveGenerationOutput]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1500);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = async () => {
    if (!output) return;

    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    for (const file of output.files) {
      zip.file(file.path, file.content);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repoName || "project"}-docs.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---- Pre-generation state ----
  if (!output && !generating) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        <div className="p-5">
          <h3 className="text-sm font-medium text-text-primary mb-1">Documentation Kit</h3>
          <p className="text-xs text-text-muted mb-4">
            Generate a complete AI-ready documentation structure following the two-layer pattern — patterns, agents, architecture guides, MCP recommendations, tool wrappers, and a remediation plan.
          </p>

          {/* Detection status */}
          {detection.hasExistingDocs && (
            <div className="mb-4 p-3 rounded-lg border border-accent/20 bg-accent/5">
              <div className="flex items-start gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent mt-0.5 shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <div>
                  <p className="text-xs font-medium text-text-primary">
                    Existing Documentation Detected
                  </p>
                  <p className="text-xs text-text-muted mt-1">
                    {detection.totalExisting} of {detection.totalExpected} core documentation files already exist in this repo.
                  </p>
                  {detection.detectedTools.length > 0 && (
                    <p className="text-xs text-text-muted mt-1">
                      Detected tools: {detection.detectedTools.map((t) =>
                        AI_TOOLS.find((at) => at.key === t)?.label || t
                      ).join(", ")}
                    </p>
                  )}

                  {/* Existing files list (collapsible) */}
                  <details className="mt-2">
                    <summary className="text-xs text-accent cursor-pointer hover:text-accent-dim">
                      Show file status
                    </summary>
                    <div className="mt-2 space-y-0.5">
                      {CORE_DOC_FILES.map((f) => {
                        const exists = detection.existingCoreFiles.includes(f);
                        return (
                          <div key={f} className="flex items-center gap-1.5 text-xs">
                            <span className={exists ? "text-green-400" : "text-text-muted"}>
                              {exists ? "\u2713" : "\u2717"}
                            </span>
                            <span className={exists ? "text-text-secondary" : "text-text-muted"} style={{ fontFamily: "var(--font-mono)" }}>
                              {f}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              </div>
            </div>
          )}

          {/* Tool selector */}
          <div className="mb-4">
            <p className="text-xs text-text-muted mb-2">
              Select AI tools to generate wrappers for:
              {detection.detectedTools.length > 0 && (
                <span className="text-accent ml-1">(auto-detected from repo)</span>
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              {AI_TOOLS.map((tool) => {
                const isDetected = detection.detectedTools.includes(tool.key);
                return (
                  <button
                    key={tool.key}
                    onClick={() => toggleTool(tool.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      selectedTools.has(tool.key)
                        ? "bg-accent text-white border-accent"
                        : "bg-surface text-text-muted border-border hover:border-border-bright"
                    }`}
                  >
                    {selectedTools.has(tool.key) ? "\u2713 " : ""}{tool.label}
                    {isDetected && !selectedTools.has(tool.key) ? " *" : ""}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-text-muted mt-2">AGENTS.md + ai/ directory are always generated.</p>
          </div>

          {/* Mode selector (only shown when existing docs detected) */}
          {detection.hasExistingDocs && (
            <div className="mb-4">
              <p className="text-xs text-text-muted mb-2">Generation mode:</p>
              <div className="space-y-1.5">
                {MODE_OPTIONS.map((opt) => (
                  <label
                    key={opt.key}
                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      mode === opt.key
                        ? "border-accent bg-accent/5"
                        : "border-border hover:border-border-bright"
                    }`}
                  >
                    <input
                      type="radio"
                      name="gen-mode"
                      checked={mode === opt.key}
                      onChange={() => setMode(opt.key)}
                      className="mt-0.5 accent-[var(--accent)]"
                    />
                    <div>
                      <span className="text-xs font-medium text-text-primary">{opt.label}</span>
                      {opt.key === "missing" && typeof generationFileCount === "number" && (
                        <span className="text-xs text-accent ml-1">({generationFileCount} files)</span>
                      )}
                      <p className="text-xs text-text-muted mt-0.5">{opt.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            className="w-full py-3 rounded-lg bg-accent hover:bg-accent-dim text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            {detection.hasExistingDocs
              ? mode === "missing"
                ? `Generate Missing Files${typeof generationFileCount === "number" ? ` (${generationFileCount})` : ""}`
                : mode === "update"
                  ? "Update Documentation Kit"
                  : "Overwrite Documentation Kit"
              : "Generate Documentation Kit"
            }
          </button>

          {error && (
            <div className="mt-3 p-3 rounded-lg border border-critical/30 bg-critical/5">
              <p className="text-sm text-critical">{error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Generating state ----
  if (generating) {
    return (
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        <div className="p-5">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            {mode === "missing" ? "Generating missing files..." : mode === "update" ? "Updating documentation..." : "Generating Documentation Kit..."}
          </h3>
          <div className="space-y-2">
            {GENERATION_PHASES.map((phase) => (
              <div key={phase.phase} className="flex items-center gap-3">
                <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                <div>
                  <p className="text-xs font-medium text-text-secondary">{phase.label}</p>
                  <p className="text-xs text-text-muted">{phase.description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted mt-4">This takes 30-60 seconds — 7 API calls running in optimized order...</p>
        </div>
      </div>
    );
  }

  // ---- Results state ----
  const generatedCount = output!.files.filter((f) => f.source !== "existing").length;
  const existingCount = output!.files.filter((f) => f.source === "existing").length;

  return (
    <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-text-primary">Documentation Kit</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {existingCount > 0
                ? `${generatedCount} generated, ${existingCount} existing`
                : `${output!.files.length} files generated`
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadAll}
              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-dim text-white text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download All (.zip)
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="px-3 py-1.5 rounded-lg bg-surface-overlay border border-border text-text-secondary hover:text-text-primary text-xs font-medium transition-colors"
            >
              Regenerate
            </button>
          </div>
        </div>
      </div>

      {/* Split panel: file tree + preview */}
      <div className="flex flex-col md:flex-row min-h-[400px]">
        {/* File tree sidebar */}
        <div className="md:w-64 md:min-w-[220px] border-b md:border-b-0 md:border-r border-border overflow-auto max-h-[500px] bg-surface">
          <FileTree
            nodes={fileTree}
            selectedPath={selectedFile}
            onSelect={setSelectedFile}
          />
        </div>

        {/* Preview panel */}
        <div className="flex-1 min-w-0 flex flex-col">
          {selectedContent ? (
            <>
              {/* File toolbar */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-text-primary truncate" style={{ fontFamily: "var(--font-mono)" }}>
                    {selectedContent.path}
                  </span>
                  <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-surface-overlay shrink-0">
                    {selectedContent.label}
                  </span>
                  {selectedContent.source === "existing" && (
                    <span className="text-[10px] text-green-400 px-1.5 py-0.5 rounded bg-green-400/10 shrink-0">
                      existing
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copyToClipboard(selectedContent.content)}
                    className="px-2.5 py-1 rounded-lg bg-surface-overlay border border-border text-text-secondary hover:text-text-primary text-xs font-medium transition-colors"
                  >
                    {copyFeedback ? "Copied!" : "Copy"}
                  </button>
                  <button
                    onClick={() => {
                      const filename = selectedContent.path.split("/").pop() || "file.md";
                      downloadFile(selectedContent.content, filename);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-surface-overlay border border-border text-text-secondary hover:text-text-primary text-xs font-medium transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewRaw(!viewRaw)}
                    className="px-2.5 py-1 rounded-lg text-text-muted hover:text-text-secondary text-xs font-medium transition-colors"
                  >
                    {viewRaw ? "Rendered" : "Raw"}
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto max-h-[450px]">
                {viewRaw ? (
                  <pre
                    className="p-4 text-sm text-text-secondary leading-relaxed whitespace-pre-wrap"
                    style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem" }}
                  >
                    {selectedContent.content}
                  </pre>
                ) : (
                  <div className="p-5">
                    <MarkdownRenderer content={selectedContent.content} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
              Select a file to preview
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 border-t border-border">
          <div className="p-3 rounded-lg border border-critical/30 bg-critical/5">
            <p className="text-sm text-critical">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
