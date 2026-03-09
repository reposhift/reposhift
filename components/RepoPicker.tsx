"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";

interface Repo {
  name: string;
  fullName: string;
  private: boolean;
  url: string;
  description: string | null;
  updatedAt: string | null;
  language?: string | null;
  stars?: number;
  org?: string;
  project?: string;
}

interface RepoPickerProps {
  onSelectRepo: (url: string) => void;
}

export function RepoPicker({ onSelectRepo }: RepoPickerProps) {
  const { github, azdo } = useAuth();

  const [activeTab, setActiveTab] = useState<"github" | "azdo">(
    github ? "github" : "azdo"
  );
  const [ghRepos, setGhRepos] = useState<Repo[] | null>(null);
  const [azdoRepos, setAzdoRepos] = useState<Repo[] | null>(null);
  const [ghLoading, setGhLoading] = useState(false);
  const [azdoLoading, setAzdoLoading] = useState(false);
  const [ghError, setGhError] = useState<string | null>(null);
  const [azdoError, setAzdoError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(true);

  // If neither provider is connected, don't render
  const hasAny = !!github || !!azdo;

  // Auto-switch to connected tab
  useEffect(() => {
    if (github && !azdo) setActiveTab("github");
    else if (azdo && !github) setActiveTab("azdo");
  }, [github, azdo]);

  // Fetch GitHub repos
  const fetchGhRepos = useCallback(async () => {
    if (!github?.token) return;
    setGhLoading(true);
    setGhError(null);
    try {
      const res = await fetch("/api/repos/github", {
        headers: { Authorization: `Bearer ${github.token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setGhRepos(data.repos);
    } catch (err) {
      setGhError(err instanceof Error ? err.message : "Failed to fetch repos");
    } finally {
      setGhLoading(false);
    }
  }, [github?.token]);

  // Fetch Azure DevOps repos
  const fetchAzdoRepos = useCallback(async () => {
    if (!azdo?.token) return;
    setAzdoLoading(true);
    setAzdoError(null);
    try {
      const res = await fetch("/api/repos/azure-devops", {
        headers: { Authorization: `Bearer ${azdo.token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setAzdoRepos(data.repos);
    } catch (err) {
      setAzdoError(err instanceof Error ? err.message : "Failed to fetch repos");
    } finally {
      setAzdoLoading(false);
    }
  }, [azdo?.token]);

  // Fetch repos on connect
  useEffect(() => {
    if (github?.token && ghRepos === null) fetchGhRepos();
  }, [github?.token, ghRepos, fetchGhRepos]);

  useEffect(() => {
    if (azdo?.token && azdoRepos === null) fetchAzdoRepos();
  }, [azdo?.token, azdoRepos, fetchAzdoRepos]);

  // Clear repos on disconnect
  useEffect(() => {
    if (!github) setGhRepos(null);
  }, [github]);

  useEffect(() => {
    if (!azdo) setAzdoRepos(null);
  }, [azdo]);

  if (!hasAny) return null;

  const repos = activeTab === "github" ? ghRepos : azdoRepos;
  const loading = activeTab === "github" ? ghLoading : azdoLoading;
  const error = activeTab === "github" ? ghError : azdoError;

  const filteredRepos = repos?.filter(
    (r) =>
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      r.description?.toLowerCase().includes(search.toLowerCase())
  );

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
  }

  return (
    <div className="mt-6 rounded-xl border border-border bg-surface-raised overflow-hidden animate-fade-up">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-overlay transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="text-sm font-medium text-text-primary">
            Your Repositories
          </span>
          {repos && (
            <span className="text-xs text-text-muted">
              ({repos.length})
            </span>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {/* Provider tabs */}
          {github && azdo && (
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab("github")}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  activeTab === "github"
                    ? "text-text-primary border-b-2 border-accent"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                GitHub
              </button>
              <button
                onClick={() => setActiveTab("azdo")}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  activeTab === "azdo"
                    ? "text-text-primary border-b-2 border-accent"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                Azure DevOps
              </button>
            </div>
          )}

          {/* Search */}
          <div className="px-3 py-2 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search repos..."
              className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          {/* Repo list */}
          <div className="max-h-64 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                <span className="ml-2 text-sm text-text-muted">Loading repos...</span>
              </div>
            )}

            {error && (
              <div className="px-4 py-3 text-sm text-critical">{error}</div>
            )}

            {filteredRepos && filteredRepos.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-text-muted">
                {search ? "No repos match your search" : "No repos found"}
              </div>
            )}

            {filteredRepos?.map((repo) => (
              <button
                key={repo.url}
                onClick={() => onSelectRepo(repo.url)}
                className="w-full text-left px-4 py-2.5 hover:bg-surface-overlay transition-colors border-b border-border last:border-b-0 group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary group-hover:text-accent transition-colors truncate">
                    {repo.fullName}
                  </span>
                  {repo.private && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full border border-border text-text-muted">
                      private
                    </span>
                  )}
                  {repo.language && (
                    <span className="shrink-0 text-[10px] text-text-muted">
                      {repo.language}
                    </span>
                  )}
                </div>
                {repo.description && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">
                    {repo.description}
                  </p>
                )}
                {repo.updatedAt && (
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Updated {timeAgo(repo.updatedAt)}
                  </p>
                )}
              </button>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-border bg-surface-overlay/50">
            <p className="text-[10px] text-text-muted text-center">
              Or paste a URL directly in the input below
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
