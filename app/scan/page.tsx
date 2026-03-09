"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  AuditCategory,
  AuditReport,
  CategoryScore,
  CATEGORY_META,
  ScanPhase,
} from "@/lib/types";
import { ScoreRing } from "@/components/ScoreRing";
import { CategoryCard } from "@/components/CategoryCard";
import { FindingsPanel } from "@/components/FindingsPanel";
import { GeneratePanel } from "@/components/GeneratePanel";
import { ScanInput } from "@/components/ScanInput";
import { StackBadges } from "@/components/StackBadges";
import { ScanProgress } from "@/components/ScanProgress";
import { ApiKeyInput } from "@/components/ApiKeyInput";
import { RepoPicker } from "@/components/RepoPicker";
import { useApiKey } from "@/lib/api-key-context";
import { useAuth } from "@/lib/auth-context";
import { useScan } from "@/lib/scan-context";
import { GitHubIcon, AzDoIcon } from "@/components/icons";

const CATEGORIES_TO_ANALYZE: AuditCategory[] = [
  "structure",
  "patterns",
  "hardcoded-values",
  "dependencies",
  "dead-code",
  "security",
  "runtime-stability",
];

function ScanDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasEffectiveKey, getAuthHeaders } = useApiKey();
  const { github, azdo, oauthProviders, connectGitHub, connectAzDo, getRepoToken } = useAuth();

  // Persistent scan state from context
  const scan = useScan();

  // Local transient state (not persisted across navigation)
  const [githubToken, setGithubToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanPhase, setScanPhase] = useState<ScanPhase>("cloning");
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedCategory, setSelectedCategory] =
    useState<AuditCategory | null>(null);
  const [cliCopied, setCliCopied] = useState(false);

  // Local aliases for convenience
  const repoUrl = scan.repoUrl;
  const setRepoUrl = scan.setRepoUrl;

  const handleScan = useCallback(async (urlOverride?: string) => {
    const url = (urlOverride || repoUrl).trim();
    if (!url) return;

    if (urlOverride) setRepoUrl(url);

    window.scrollTo(0, 0);
    setScanning(true);
    setError(null);
    setSelectedCategory(null);
    setScanPhase("cloning");
    setScanProgress(5);
    setScanMessage("Connecting to repository...");

    try {
      setScanProgress(10);
      setScanMessage("Fetching repository contents...");

      const authHeaders = getAuthHeaders();
      const isAzDo = url.includes("dev.azure.com") || url.includes("visualstudio.com");
      const oauthToken = isAzDo ? getRepoToken("azure-devops") : getRepoToken("github");
      const storedToken = typeof window !== "undefined" ? sessionStorage.getItem("reposhift-token") : null;
      const effectiveToken = oauthToken || storedToken || githubToken || undefined;

      if (storedToken) sessionStorage.removeItem("reposhift-token");

      const scanRes = await fetch("/api/scan-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ url, token: effectiveToken }),
      });

      if (!scanRes.ok) {
        const err = await scanRes.json();
        throw new Error(err.error || "Failed to scan repository");
      }

      const scanData = await scanRes.json();

      // Save scan data to context (persists across navigation)
      scan.saveScanData({
        repoName: scanData.repoName,
        tree: scanData.tree,
        files: scanData.files,
        stack: scanData.stack,
        fileCount: scanData.fileCount,
      });

      setScanPhase("detecting-stack");
      setScanProgress(20);
      setScanMessage(
        `Detected: ${scanData.stack.framework} / ${scanData.stack.language} — ${scanData.fileCount} files`
      );

      const BATCH_SIZE = 3;
      let completed = 0;
      // Track results locally to avoid stale closure on context
      const localResults = new Map<AuditCategory, CategoryScore>();

      const analyzeOne = async (cat: AuditCategory) => {
        try {
          const analyzeRes = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({
              category: cat,
              stack: scanData.stack,
              tree: scanData.tree,
              files: scanData.files,
            }),
          });

          if (analyzeRes.ok) {
            const result: CategoryScore = await analyzeRes.json();
            localResults.set(cat, result);
            scan.saveCategoryResult(cat, result);
          } else {
            const errData = await analyzeRes.json().catch(() => ({ error: `Analysis failed (${analyzeRes.status})` }));
            if (analyzeRes.status >= 500 && errData.error) {
              setError(errData.error);
            }
          }
        } catch (catError) {
          console.error(`Failed to analyze ${cat}:`, catError);
        } finally {
          completed++;
          const progress = 20 + (completed / CATEGORIES_TO_ANALYZE.length) * 70;
          setScanProgress(progress);
        }
      };

      for (let i = 0; i < CATEGORIES_TO_ANALYZE.length; i += BATCH_SIZE) {
        const batch = CATEGORIES_TO_ANALYZE.slice(i, i + BATCH_SIZE);
        const labels = batch.map((cat) => CATEGORY_META[cat].label).join(", ");
        setScanMessage(`Analyzing ${labels}...`);
        setScanPhase("scoring");
        await Promise.all(batch.map(analyzeOne));
      }

      const finalCategories = Array.from(localResults.values());

      const overallScore = Math.round(
        finalCategories.reduce((sum, c) => sum + c.score, 0) /
          (finalCategories.length || 1)
      );
      const allFindings = finalCategories.flatMap((c) => c.findings);

      const finalReport: AuditReport = {
        repoUrl: url,
        repoName: scanData.repoName,
        scannedAt: new Date().toISOString(),
        stack: scanData.stack,
        overallScore,
        categories: finalCategories,
        totalFindings: allFindings.length,
        criticalCount: allFindings.filter((f) => f.severity === "critical").length,
        warningCount: allFindings.filter((f) => f.severity === "warning").length,
        infoCount: allFindings.filter((f) => f.severity === "info").length,
      };

      scan.saveReport(finalReport);
      setScanPhase("complete");
      setScanProgress(100);
      setScanMessage("Audit complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setScanPhase("error");
    } finally {
      setScanning(false);
    }
  }, [repoUrl, githubToken, getAuthHeaders, getRepoToken, setRepoUrl, scan]);

  // Auto-scan from URL query params
  const [autoScanTriggered, setAutoScanTriggered] = useState(false);
  useEffect(() => {
    const repoParam = searchParams.get("repo");
    if (repoParam && !autoScanTriggered && hasEffectiveKey) {
      setAutoScanTriggered(true);
      setRepoUrl(repoParam);
      handleScan(repoParam);
    } else if (repoParam && !autoScanTriggered && !hasEffectiveKey) {
      setRepoUrl(repoParam);
      setAutoScanTriggered(true);
    }
  }, [searchParams, autoScanTriggered, hasEffectiveKey, handleScan, setRepoUrl]);

  const hasResults = scan.hasScanResults;
  const showConnectButtons =
    (!github && oauthProviders.github) || (!azdo && oauthProviders.azdo);

  return (
    <main className="w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
      {/* No results yet — show scan input */}
      {!hasResults && !scanning && (
        <div className="pt-16 sm:pt-24 pb-12 animate-fade-up">
          <h1
            className="text-2xl sm:text-3xl font-bold text-text-primary text-center mb-8"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Scan a Repository
          </h1>

          <div className="max-w-3xl mx-auto">
            <ApiKeyInput />

            {showConnectButtons && (
              <div className="mt-6 flex flex-col sm:flex-row items-center gap-3 justify-center">
                {oauthProviders.github && !github && (
                  <button
                    onClick={connectGitHub}
                    className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl border border-border bg-surface-raised hover:border-border-bright text-text-primary font-medium transition-colors"
                  >
                    <GitHubIcon size={20} />
                    Connect GitHub
                  </button>
                )}
                {oauthProviders.azdo && !azdo && (
                  <button
                    onClick={connectAzDo}
                    className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl border border-border bg-surface-raised hover:border-border-bright text-text-primary font-medium transition-colors"
                  >
                    <AzDoIcon size={20} />
                    Connect Azure DevOps
                  </button>
                )}
              </div>
            )}

            <div className="mt-6">
              <RepoPicker onSelectRepo={(url) => { setRepoUrl(url); }} />
            </div>
          </div>

          <div className="mt-6">
            <ScanInput
              repoUrl={repoUrl}
              githubToken={githubToken}
              onRepoUrlChange={setRepoUrl}
              onGithubTokenChange={setGithubToken}
              onScan={() => handleScan()}
              scanning={scanning}
              disabled={!hasEffectiveKey}
              autoFocus
            />
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-critical/30 bg-critical/5 p-4 animate-fade-up flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="text-critical text-lg mt-0.5">&#x26A0;</span>
                <div>
                  <p className="text-critical font-medium">Scan Failed</p>
                  <p className="text-critical/80 text-sm mt-1">{error}</p>
                </div>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-critical/60 hover:text-critical transition-colors text-lg leading-none p-1"
              >
                &times;
              </button>
            </div>
          )}
        </div>
      )}

      {/* Scanning / Has Results */}
      {(hasResults || scanning) && (
        <>
          <div className="mt-8">
            <ScanInput
              repoUrl={repoUrl}
              githubToken={githubToken}
              onRepoUrlChange={setRepoUrl}
              onGithubTokenChange={setGithubToken}
              onScan={() => handleScan()}
              scanning={scanning}
              disabled={!hasEffectiveKey}
            />
          </div>

          {scanning && (
            <div className="mt-8 animate-fade-up">
              <ScanProgress
                phase={scanPhase}
                progress={scanProgress}
                message={scanMessage}
              />
            </div>
          )}

          {error && (
            <div className="mt-8 rounded-xl border border-critical/30 bg-critical/5 p-4 animate-fade-up flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="text-critical text-lg mt-0.5">&#x26A0;</span>
                <div>
                  <p className="text-critical font-medium">Scan Failed</p>
                  <p className="text-critical/80 text-sm mt-1">{error}</p>
                </div>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-critical/60 hover:text-critical transition-colors text-lg leading-none p-1"
              >
                &times;
              </button>
            </div>
          )}

          {scan.stack && !scanning && (
            <div className="mt-6 animate-fade-up flex items-start gap-3">
              <div className="flex-1">
                <StackBadges stack={scan.stack} fileCount={scan.fileCount} repoName={scan.repoName} />
              </div>
              <button
                onClick={() => {
                  scan.clearScan();
                }}
                className="mt-0.5 px-3 py-2 rounded-lg border border-border bg-surface-raised hover:border-border-bright text-text-secondary hover:text-text-primary text-xs font-medium transition-colors whitespace-nowrap"
              >
                Scan Another
              </button>
            </div>
          )}

          {scan.report && !scanning && (
            <div className="mt-4 animate-fade-up">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-surface-raised">
                <span className="text-text-muted text-xs whitespace-nowrap">CLI:</span>
                <code
                  className="flex-1 text-xs text-text-secondary font-mono truncate"
                  title={`npx reposhift audit --repo=${repoUrl.trim()}`}
                >
                  npx reposhift audit --repo={repoUrl.trim()}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`npx reposhift audit --repo=${repoUrl.trim()}`);
                    setCliCopied(true);
                    setTimeout(() => setCliCopied(false), 1500);
                  }}
                  className="px-2.5 py-1 rounded-md bg-surface-overlay border border-border text-text-muted hover:text-text-primary text-[10px] font-medium transition-colors whitespace-nowrap"
                >
                  {cliCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {hasResults && !scanning && (
            <>
              <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-3">
                  <div className="rounded-xl border border-border bg-surface-raised p-6 flex flex-col items-center card-glow animate-fade-up">
                    <ScoreRing score={scan.report?.overallScore || 0} size={160} />
                    <div className="mt-4 text-center">
                      <p className="text-text-secondary text-sm">Overall Health</p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-critical" />
                          {scan.report?.criticalCount || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-warning" />
                          {scan.report?.warningCount || 0}
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-info" />
                          {scan.report?.infoCount || 0}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="lg:col-span-9 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {CATEGORIES_TO_ANALYZE.map((cat, i) => {
                    const result = scan.categoryResults.get(cat);
                    return (
                      <CategoryCard
                        key={cat}
                        category={cat}
                        result={result}
                        isAnalyzing={false}
                        isSelected={selectedCategory === cat}
                        onClick={() =>
                          setSelectedCategory(selectedCategory === cat ? null : cat)
                        }
                        delay={i * 0.05}
                      />
                    );
                  })}
                </div>
              </div>

              {selectedCategory && scan.categoryResults.get(selectedCategory) && (
                <div className="mt-6 animate-fade-up">
                  <FindingsPanel
                    result={scan.categoryResults.get(selectedCategory)!}
                    onClose={() => setSelectedCategory(null)}
                  />
                </div>
              )}

              {scan.report && (
                <div className="mt-6 animate-fade-up">
                  <GeneratePanel
                    stack={scan.stack!}
                    tree={scan.tree}
                    files={scan.files}
                    auditFindings={scan.report.categories}
                    repoName={scan.repoName}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

// Wrap in Suspense for useSearchParams (Next.js App Router requirement)
export default function ScanPage() {
  return (
    <Suspense fallback={
      <main className="w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20 pt-16 text-center">
        <p className="text-text-muted">Loading...</p>
      </main>
    }>
      <ScanDashboard />
    </Suspense>
  );
}
