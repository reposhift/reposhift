"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";

interface ScanInputProps {
  repoUrl: string;
  githubToken: string;
  onRepoUrlChange: (url: string) => void;
  onGithubTokenChange: (token: string) => void;
  onScan: () => void;
  scanning: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

interface SearchResult {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  stars: number;
  language: string | null;
}

function detectProvider(url: string): "github" | "azure-devops" | null {
  if (url.includes("dev.azure.com") || url.includes("visualstudio.com"))
    return "azure-devops";
  if (url.includes("github.com") || /^[^/\s]+\/[^/\s]+$/.test(url.trim()))
    return "github";
  return null;
}

function isUrlLike(input: string): boolean {
  const trimmed = input.trim();
  return (
    trimmed.includes("github.com") ||
    trimmed.includes("dev.azure.com") ||
    trimmed.includes("visualstudio.com") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(trimmed)
  );
}

export function ScanInput({
  repoUrl,
  githubToken,
  onRepoUrlChange,
  onGithubTokenChange,
  onScan,
  scanning,
  disabled = false,
  autoFocus = false,
}: ScanInputProps) {
  const { github } = useAuth();
  const [showToken, setShowToken] = useState(false);
  const provider = useMemo(() => detectProvider(repoUrl), [repoUrl]);

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAzDo = provider === "azure-devops";

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search
  const doSearch = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (query.trim().length < 2 || isUrlLike(query)) {
        setSearchResults([]);
        setShowDropdown(false);
        setSearchError(null);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setSearchLoading(true);
        setSearchError(null);
        setShowDropdown(true);
        setSelectedIndex(-1);

        try {
          const headers: Record<string, string> = {};
          if (github?.token) {
            headers["Authorization"] = `Bearer ${github.token}`;
          }

          const res = await fetch(
            `/api/search-repos?q=${encodeURIComponent(query.trim())}`,
            { headers }
          );
          const data = await res.json();

          if (data.error) {
            setSearchError(data.error);
            setSearchResults([]);
          } else {
            setSearchResults(data.repos || []);
          }
        } catch {
          setSearchError("Search failed");
          setSearchResults([]);
        } finally {
          setSearchLoading(false);
        }
      }, 300);
    },
    [github?.token]
  );

  function handleInputChange(value: string) {
    onRepoUrlChange(value);
    doSearch(value);
  }

  function selectResult(repo: SearchResult) {
    onRepoUrlChange(repo.url);
    setShowDropdown(false);
    setSearchResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || searchResults.length === 0) {
      if (e.key === "Enter" && !scanning && !disabled) onScan();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        selectResult(searchResults[selectedIndex]);
      } else if (!scanning && !disabled) {
        setShowDropdown(false);
        onScan();
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  function formatStars(stars: number): string {
    if (stars >= 1000) return `${(stars / 1000).toFixed(stars >= 10000 ? 0 : 1)}k`;
    return stars.toString();
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="rounded-xl border border-border bg-surface-raised p-4 sm:p-5">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={repoUrl}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (searchResults.length > 0 && !isUrlLike(repoUrl)) setShowDropdown(true);
              }}
              placeholder={disabled ? "Add your API key above to start scanning" : "Search GitHub repos or paste a URL..."}
              className="w-full h-12 px-4 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors disabled:opacity-50"
              style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem" }}
              disabled={scanning || disabled}
              autoFocus={autoFocus}
            />
            {/* Provider badge */}
            {provider && repoUrl.trim() && (
              <span
                className={`absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                  isAzDo
                    ? "bg-blue-500/15 text-blue-400 border border-blue-500/20"
                    : "bg-accent-glow text-accent border border-accent/20"
                }`}
              >
                {isAzDo ? "Azure DevOps" : "GitHub"}
              </span>
            )}
          </div>
          <button
            onClick={() => { setShowDropdown(false); onScan(); }}
            disabled={scanning || !repoUrl.trim() || disabled}
            className="h-12 px-6 rounded-lg bg-accent hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center gap-2 shrink-0"
          >
            {scanning ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span className="hidden sm:inline">Scanning</span>
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Scan
              </>
            )}
          </button>
        </div>

        {/* Token section */}
        <div className="mt-3">
          <button
            onClick={() => setShowToken(!showToken)}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {showToken ? (
                <polyline points="18 15 12 9 6 15" />
              ) : (
                <polyline points="6 9 12 15 18 9" />
              )}
            </svg>
            {showToken ? "Hide token" : "Private repo? Add a token"}
          </button>

          {showToken && (
            <input
              type="password"
              value={githubToken}
              onChange={(e) => onGithubTokenChange(e.target.value)}
              placeholder={isAzDo ? "Azure DevOps PAT (Code: Read scope)" : "ghp_xxxx (GitHub Personal Access Token)"}
              className="mt-2 w-full h-10 px-4 rounded-lg bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-colors text-sm"
              style={{ fontFamily: "var(--font-mono)" }}
            />
          )}
        </div>
      </div>

      {/* Search dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-border bg-surface-raised search-dropdown z-50 overflow-hidden">
          {searchLoading && (
            <div className="px-4 py-3 flex items-center gap-2 text-sm text-text-muted">
              <span className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              Searching GitHub...
            </div>
          )}

          {searchError && !searchLoading && (
            <div className="px-4 py-3 text-sm text-warning">{searchError}</div>
          )}

          {!searchLoading && !searchError && searchResults.length === 0 && (
            <div className="px-4 py-3 text-sm text-text-muted">
              No repositories found
            </div>
          )}

          {!searchLoading &&
            searchResults.map((repo, idx) => (
              <button
                key={repo.url}
                onClick={() => selectResult(repo)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full text-left px-4 py-3 transition-colors border-b border-border/50 last:border-b-0 ${
                  idx === selectedIndex ? "bg-accent-glow" : "hover:bg-surface-overlay"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-primary truncate">
                    {repo.fullName}
                  </span>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {repo.language && (
                      <span className="text-[10px] text-text-muted">{repo.language}</span>
                    )}
                    {repo.stars > 0 && (
                      <span className="text-[10px] text-text-muted flex items-center gap-0.5">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-warning/70">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        {formatStars(repo.stars)}
                      </span>
                    )}
                  </div>
                </div>
                {repo.description && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">{repo.description}</p>
                )}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
