import { NextRequest, NextResponse } from "next/server";
import { generateDocumentationKit, hasApiKey } from "@/lib/analyzer";
import { AITool, CategoryScore, GenerationMode, RepoFile, RepoTreeEntry, StackInfo } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const userApiKey = req.headers.get("x-api-key") || undefined;

    const { stack, tree, files, auditFindings, selectedTools, mode, existingContents } = (await req.json()) as {
      stack: StackInfo;
      tree: RepoTreeEntry[];
      files: RepoFile[];
      auditFindings: CategoryScore[];
      selectedTools?: AITool[];
      mode?: GenerationMode;
      existingContents?: Record<string, string>;
    };

    if (!hasApiKey() && !userApiKey) {
      return NextResponse.json(
        { error: "No API key available. Please provide your Anthropic API key." },
        { status: 401 }
      );
    }

    const result = await generateDocumentationKit(
      stack,
      tree,
      files,
      auditFindings,
      selectedTools || ["claude", "codex"],
      userApiKey,
      mode || "full",
      existingContents
    );

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
