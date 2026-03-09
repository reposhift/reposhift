"use client";

import Link from "next/link";
import { CATEGORY_META, AuditCategory } from "@/lib/types";
import { CATEGORY_ICONS } from "@/components/icons";

const CATEGORIES_TO_ANALYZE: AuditCategory[] = [
  "structure",
  "patterns",
  "hardcoded-values",
  "dependencies",
  "dead-code",
  "security",
  "runtime-stability",
];

/* ────────────────── Landing Sections ────────────────── */

function HeroSection() {
  return (
    <section className="pt-16 sm:pt-20 pb-12 text-center animate-fade-up">
      <h1
        className="text-3xl sm:text-5xl lg:text-6xl font-bold text-text-primary tracking-tight leading-tight"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Audit. Standardize.
        <br className="sm:hidden" />
        {" "}<span className="text-accent">Shift Forward.</span>
      </h1>
      <p className="mt-6 text-base sm:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
        AI-powered codebase analysis with senior architect-level intelligence.
        Scan any GitHub or Azure DevOps repository and get actionable standards,
        AI infrastructure configs, and remediation plans.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link
          href="/scan"
          className="px-6 py-3 rounded-xl bg-accent hover:bg-accent-dim text-white font-medium transition-colors text-sm"
        >
          Get Started
        </Link>
        <a
          href="#how-it-works"
          className="px-6 py-3 rounded-xl border border-border hover:border-border-bright text-text-secondary hover:text-text-primary font-medium transition-colors text-sm"
        >
          Learn More
        </a>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    { step: "1", title: "Search or Paste a URL", desc: "Search GitHub repos by name or paste a GitHub/Azure DevOps URL — public or private." },
    { step: "2", title: "AI Analyzes 7 Areas", desc: "Structure, patterns, security, dependencies, dead code, hardcoded values, and runtime stability." },
    { step: "3", title: "Generate Outputs", desc: "Standards docs, AI tool configs (Claude, Cursor, Copilot, Windsurf, Codex, Gemini), MCP recommendations, and remediation plans." },
  ];

  return (
    <section id="how-it-works" className="py-14 scroll-mt-20">
      <h2
        className="text-2xl sm:text-3xl font-bold text-text-primary text-center"
        style={{ fontFamily: "var(--font-display)" }}
      >
        How It Works
      </h2>
      <p className="mt-3 text-text-secondary text-center text-sm max-w-lg mx-auto">
        Three steps from repository URL to actionable improvement plan.
      </p>
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
        {steps.map((item, i) => (
          <div
            key={item.step}
            className="rounded-xl border border-border bg-surface-raised p-6 text-left card-glow animate-fade-up"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="w-10 h-10 rounded-xl bg-accent-glow border border-accent/20 flex items-center justify-center text-accent mb-4">
              <span className="text-lg font-bold" style={{ fontFamily: "var(--font-display)" }}>
                {item.step}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
            <p className="mt-2 text-xs text-text-muted leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhyRepoShiftSection() {
  const problems = [
    {
      title: "AI Generates Code Fast — Standards Don't Keep Up",
      desc: "Every AI prompt produces different patterns, naming conventions, and error handling approaches. Without enforced standards, codebases become a patchwork of conflicting styles that no single developer wrote.",
    },
    {
      title: "What Gets Lost",
      desc: "Structure drifts as modules grow unchecked. Magic strings and hardcoded URLs pile up. Dependencies go stale or duplicate. Dead code accumulates. Security gaps hide in plain sight. Runtime issues — memory leaks, unhandled errors, race conditions — go unnoticed until production.",
    },
    {
      title: "AI Tools Are Blind Without Context",
      desc: "Claude, Cursor, Copilot, and others generate better code when they know your project's rules. But someone has to write CLAUDE.md, .cursorrules, AGENTS.md. RepoShift audits your codebase and generates these files automatically.",
    },
  ];

  return (
    <section id="why" className="py-14 scroll-mt-20">
      <h2
        className="text-2xl sm:text-3xl font-bold text-text-primary text-center"
        style={{ fontFamily: "var(--font-display)" }}
      >
        The Problem
      </h2>
      <p className="mt-3 text-text-secondary text-center text-sm max-w-xl mx-auto">
        AI-assisted development is faster than ever — but speed without guardrails creates technical debt at scale. RepoShift closes the loop.
      </p>
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl mx-auto">
        {problems.map((item, i) => (
          <div
            key={item.title}
            className="rounded-xl border border-border bg-surface-raised p-6 card-glow animate-fade-up"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <h3 className="text-sm font-semibold text-text-primary">{item.title}</h3>
            <p className="mt-2 text-xs text-text-muted leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhatItAnalyzesSection() {
  return (
    <section id="categories" className="py-14 scroll-mt-20">
      <h2
        className="text-2xl sm:text-3xl font-bold text-text-primary text-center"
        style={{ fontFamily: "var(--font-display)" }}
      >
        What It Analyzes
      </h2>
      <p className="mt-3 text-text-secondary text-center text-sm max-w-lg mx-auto">
        Seven focused audit categories powered by Claude AI.
      </p>
      <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {CATEGORIES_TO_ANALYZE.map((cat, i) => {
          const meta = CATEGORY_META[cat];
          return (
            <div
              key={cat}
              className="rounded-xl border border-border bg-surface-raised p-5 card-glow animate-fade-up"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="text-accent mb-3">{CATEGORY_ICONS[meta.icon]}</div>
              <h3 className="text-sm font-semibold text-text-primary">{meta.label}</h3>
              <p className="mt-1.5 text-xs text-text-muted leading-relaxed">{meta.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ────────────────────── Main Page ────────────────────── */

export default function Home() {
  return (
    <main className="w-full mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-20">
      <HeroSection />
      <HowItWorksSection />
      <WhyRepoShiftSection />
      <WhatItAnalyzesSection />
    </main>
  );
}
