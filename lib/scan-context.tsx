"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import {
  AuditCategory,
  AuditReport,
  CategoryScore,
  GenerationOutput,
  RepoFile,
  RepoTreeEntry,
  StackInfo,
} from "@/lib/types";

interface ScanState {
  repoUrl: string;
  repoName: string;
  tree: RepoTreeEntry[];
  files: RepoFile[];
  stack: StackInfo | null;
  fileCount: number;
  report: AuditReport | null;
  categoryResults: Map<AuditCategory, CategoryScore>;
  generationOutput: GenerationOutput | null;
}

interface ScanContextValue extends ScanState {
  setRepoUrl: (url: string) => void;
  saveScanData: (data: {
    repoName: string;
    tree: RepoTreeEntry[];
    files: RepoFile[];
    stack: StackInfo;
    fileCount: number;
  }) => void;
  saveCategoryResult: (cat: AuditCategory, result: CategoryScore) => void;
  saveReport: (report: AuditReport) => void;
  saveGenerationOutput: (output: GenerationOutput) => void;
  clearScan: () => void;
  hasScanResults: boolean;
}

const ScanContext = createContext<ScanContextValue | null>(null);

const INITIAL_STATE: ScanState = {
  repoUrl: "",
  repoName: "",
  tree: [],
  files: [],
  stack: null,
  fileCount: 0,
  report: null,
  categoryResults: new Map(),
  generationOutput: null,
};

export function ScanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ScanState>(INITIAL_STATE);

  const setRepoUrl = useCallback((url: string) => {
    setState((prev) => ({ ...prev, repoUrl: url }));
  }, []);

  const saveScanData = useCallback(
    (data: {
      repoName: string;
      tree: RepoTreeEntry[];
      files: RepoFile[];
      stack: StackInfo;
      fileCount: number;
    }) => {
      setState((prev) => ({
        ...prev,
        repoName: data.repoName,
        tree: data.tree,
        files: data.files,
        stack: data.stack,
        fileCount: data.fileCount,
        // Clear previous results when new scan data arrives
        report: null,
        categoryResults: new Map(),
      }));
    },
    []
  );

  const saveCategoryResult = useCallback(
    (cat: AuditCategory, result: CategoryScore) => {
      setState((prev) => {
        const next = new Map(prev.categoryResults);
        next.set(cat, result);
        return { ...prev, categoryResults: next };
      });
    },
    []
  );

  const saveReport = useCallback((report: AuditReport) => {
    setState((prev) => ({ ...prev, report }));
  }, []);

  const saveGenerationOutput = useCallback((output: GenerationOutput) => {
    setState((prev) => ({ ...prev, generationOutput: output }));
  }, []);

  const clearScan = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const hasScanResults = state.categoryResults.size > 0 || state.report !== null;

  return (
    <ScanContext.Provider
      value={{
        ...state,
        setRepoUrl,
        saveScanData,
        saveCategoryResult,
        saveReport,
        saveGenerationOutput,
        clearScan,
        hasScanResults,
      }}
    >
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error("useScan must be used within ScanProvider");
  return ctx;
}
