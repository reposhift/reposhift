"use client";

import { AuditCategory, CategoryScore, CATEGORY_META } from "@/lib/types";
import { CATEGORY_ICONS } from "@/components/icons";

interface CategoryCardProps {
  category: AuditCategory;
  result?: CategoryScore;
  isAnalyzing: boolean;
  isSelected: boolean;
  onClick: () => void;
  delay?: number;
}


export function CategoryCard({
  category,
  result,
  isAnalyzing,
  isSelected,
  onClick,
  delay = 0,
}: CategoryCardProps) {
  const meta = CATEGORY_META[category];
  const score = result?.score;
  const findingCount = result?.findings.length || 0;

  const scoreColor =
    score === undefined
      ? "text-text-muted"
      : score >= 80
        ? "text-success"
        : score >= 60
          ? "text-warning"
          : "text-critical";

  return (
    <button
      onClick={onClick}
      disabled={!result}
      className={`
        group text-left rounded-xl border p-4 transition-all duration-200 card-glow animate-fade-up
        ${isSelected
          ? "border-accent bg-accent-glow"
          : "border-border bg-surface-raised hover:border-border-bright"
        }
        ${!result && !isAnalyzing ? "opacity-40" : ""}
        disabled:cursor-default
      `}
      style={{ animationDelay: `${delay}s` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="text-text-secondary">{CATEGORY_ICONS[meta.icon]}</div>
        {isAnalyzing ? (
          <span className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        ) : score !== undefined ? (
          <span
            className={`text-2xl font-bold ${scoreColor}`}
            style={{ fontFamily: "var(--font-display)" }}
          >
            {score}
          </span>
        ) : null}
      </div>

      {/* Label */}
      <h3 className="mt-3 text-sm font-medium text-text-primary">
        {meta.label}
      </h3>

      {/* Summary or loading */}
      {isAnalyzing ? (
        <div className="mt-2 space-y-1.5">
          <div className="h-3 rounded shimmer w-full" />
          <div className="h-3 rounded shimmer w-3/4" />
        </div>
      ) : result ? (
        <>
          <p className="mt-1.5 text-xs text-text-muted line-clamp-2 leading-relaxed">
            {result.summary}
          </p>
          <div className="mt-2 flex items-center justify-between">
            {findingCount > 0 ? (
              <p className="text-xs text-text-secondary">
                {findingCount} finding{findingCount !== 1 ? "s" : ""}
              </p>
            ) : (
              <span />
            )}
            <span className={`text-[10px] font-medium flex items-center gap-0.5 transition-colors ${isSelected ? "text-accent" : "text-text-muted group-hover:text-text-secondary"}`}>
              {isSelected ? "Hide" : "View"}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={isSelected ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
              </svg>
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-text-muted">{meta.description}</p>
      )}
    </button>
  );
}
