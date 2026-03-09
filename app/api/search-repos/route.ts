import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ repos: [] });
  }

  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  const effectiveToken = token || process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "RepoShift/1.0",
  };
  if (effectiveToken) {
    headers["Authorization"] = `Bearer ${effectiveToken}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q.trim())}&per_page=8&sort=stars`,
      { headers }
    );

    if (!res.ok) {
      if (res.status === 403) {
        return NextResponse.json(
          { error: "GitHub rate limit reached. Connect your GitHub account for higher limits.", repos: [] },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: `GitHub search error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const repos = (data.items || []).map(
      (r: {
        name: string;
        full_name: string;
        html_url: string;
        description: string | null;
        stargazers_count: number;
        language: string | null;
      }) => ({
        name: r.name,
        fullName: r.full_name,
        url: r.html_url,
        description: r.description,
        stars: r.stargazers_count,
        language: r.language,
      })
    );

    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Search failed" },
      { status: 500 }
    );
  }
}
