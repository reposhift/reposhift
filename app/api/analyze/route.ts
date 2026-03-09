import { NextRequest, NextResponse } from "next/server";
import { analyzeCategory, hasApiKey } from "@/lib/analyzer";
import { AuditCategory, RepoFile, RepoTreeEntry, StackInfo } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const userApiKey = req.headers.get("x-api-key") || undefined;

    const { category, stack, tree, files } = (await req.json()) as {
      category: AuditCategory;
      stack: StackInfo;
      tree: RepoTreeEntry[];
      files: RepoFile[];
    };

    if (!category || !stack || !tree || !files) {
      return NextResponse.json(
        { error: "Missing required fields: category, stack, tree, files" },
        { status: 400 }
      );
    }

    if (!hasApiKey() && !userApiKey) {
      return NextResponse.json(
        { error: "No API key available. Please provide your Anthropic API key." },
        { status: 401 }
      );
    }

    const result = await analyzeCategory(category, stack, tree, files, userApiKey);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
