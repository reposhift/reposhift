import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "No GitHub token provided" },
      { status: 401 }
    );
  }

  try {
    const res = await fetch(
      "https://api.github.com/user/repos?sort=updated&per_page=50&type=all",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "RepoShift/1.0",
        },
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json(
        { error: `GitHub API error: ${res.status} — ${err}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    const repos = data.map(
      (r: {
        name: string;
        full_name: string;
        private: boolean;
        html_url: string;
        description: string | null;
        updated_at: string;
        language: string | null;
        stargazers_count: number;
      }) => ({
        name: r.name,
        fullName: r.full_name,
        private: r.private,
        url: r.html_url,
        description: r.description,
        updatedAt: r.updated_at,
        language: r.language,
        stars: r.stargazers_count,
      })
    );

    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch repos" },
      { status: 500 }
    );
  }
}
