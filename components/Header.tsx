"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { GitHubIcon, AzDoIcon } from "@/components/icons";

export function Header() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const pathname = usePathname();
  const { github, azdo, oauthProviders, connectGitHub, connectAzDo, disconnectGitHub, disconnectAzDo } = useAuth();

  const [dropdownOpen, setDropdownOpen] = useState<"github" | "azdo" | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("reposhift-theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.classList.toggle("light", saved === "light");
    } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
      setTheme("light");
      document.documentElement.classList.add("light");
    }
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
    localStorage.setItem("reposhift-theme", next);
  };

  return (
    <header className="border-b border-border bg-surface-raised/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src="/logo.svg" alt="RepoShift" className="w-8 h-8 rounded-lg" />
              <span
                className="text-lg font-semibold tracking-tight text-text-primary"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Repo<span className="text-accent">Shift</span>
              </span>
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              {[
                { href: "/", label: "Home" },
                { href: "/scan", label: "Scan" },
                { href: "/cli", label: "CLI" },
              ].map(({ href, label }) => {
                const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-text-muted hover:text-text-primary hover:bg-surface-overlay"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2" ref={dropdownRef}>
            {/* GitHub Auth (shown only when connected) */}
            {github && (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(dropdownOpen === "github" ? null : "github")}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-surface-overlay hover:border-border-bright text-text-secondary text-xs font-medium transition-colors"
                >
                  {github.avatar ? (
                    <img src={github.avatar} alt="" className="w-4 h-4 rounded-full" />
                  ) : (
                    <GitHubIcon size={14} />
                  )}
                  <span className="hidden sm:inline max-w-[80px] truncate">{github.user}</span>
                </button>
                {dropdownOpen === "github" && (
                  <div className="absolute right-0 mt-1 w-48 rounded-lg border border-border bg-surface-raised shadow-lg py-1 z-50">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs text-text-muted">GitHub</p>
                      <p className="text-sm text-text-primary truncate">{github.user}</p>
                    </div>
                    <button
                      onClick={() => { disconnectGitHub(); setDropdownOpen(null); }}
                      className="w-full text-left px-3 py-2 text-xs text-critical hover:bg-surface-overlay transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Azure DevOps Auth (shown only when connected) */}
            {azdo && (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(dropdownOpen === "azdo" ? null : "azdo")}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-surface-overlay hover:border-border-bright text-text-secondary text-xs font-medium transition-colors"
                >
                  <AzDoIcon size={14} />
                  <span className="hidden sm:inline max-w-[80px] truncate">{azdo.user}</span>
                </button>
                {dropdownOpen === "azdo" && (
                  <div className="absolute right-0 mt-1 w-48 rounded-lg border border-border bg-surface-raised shadow-lg py-1 z-50">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs text-text-muted">Azure DevOps</p>
                      <p className="text-sm text-text-primary truncate">{azdo.user}</p>
                    </div>
                    <button
                      onClick={() => { disconnectAzDo(); setDropdownOpen(null); }}
                      className="w-full text-left px-3 py-2 text-xs text-critical hover:bg-surface-overlay transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="w-8 h-8 rounded-lg border border-border bg-surface-overlay hover:border-border-bright flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>

            {/* Mobile hamburger — rightmost on mobile */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="sm:hidden w-8 h-8 rounded-lg border border-border bg-surface-overlay hover:border-border-bright flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile nav menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-border bg-surface-raised/95 backdrop-blur-sm">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {[
              { href: "/", label: "Home" },
              { href: "/scan", label: "Scan" },
              { href: "/cli", label: "CLI" },
            ].map(({ href, label }) => {
              const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent/10 text-accent"
                      : "text-text-muted hover:text-text-primary hover:bg-surface-overlay"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}

