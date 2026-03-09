import { NextRequest, NextResponse } from "next/server";

interface AzDoRepo {
  id: string;
  name: string;
  project: { name: string };
  defaultBranch?: string;
  webUrl: string;
  size: number;
}

interface AzDoOrg {
  accountId: string;
  accountName: string;
  accountUri: string;
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "No Azure DevOps token provided" },
      { status: 401 }
    );
  }

  try {
    // Step 1: Get user profile to find member ID
    const profileRes = await fetch(
      "https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1",
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!profileRes.ok) {
      return NextResponse.json(
        { error: `Azure DevOps profile error: ${profileRes.status}` },
        { status: profileRes.status }
      );
    }

    const profile = await profileRes.json();
    const memberId = profile.id;

    // Step 2: Get user's organizations
    const orgsRes = await fetch(
      `https://app.vssps.visualstudio.com/_apis/accounts?memberId=${memberId}&api-version=7.1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!orgsRes.ok) {
      return NextResponse.json(
        { error: `Azure DevOps orgs error: ${orgsRes.status}` },
        { status: orgsRes.status }
      );
    }

    const orgsData = await orgsRes.json();
    const orgs: AzDoOrg[] = orgsData.value || [];

    // Step 3: For each org, fetch repos
    const allRepos: {
      name: string;
      fullName: string;
      private: boolean;
      url: string;
      description: string | null;
      updatedAt: string | null;
      org: string;
      project: string;
    }[] = [];

    // Limit to first 5 orgs to avoid timeout
    for (const org of orgs.slice(0, 5)) {
      try {
        const reposRes = await fetch(
          `https://dev.azure.com/${org.accountName}/_apis/git/repositories?api-version=7.1`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!reposRes.ok) continue;

        const reposData = await reposRes.json();
        const repos: AzDoRepo[] = reposData.value || [];

        for (const r of repos) {
          allRepos.push({
            name: r.name,
            fullName: `${org.accountName}/${r.project.name}/${r.name}`,
            private: true, // Azure DevOps repos don't have a public/private flag in API
            url: r.webUrl,
            description: null,
            updatedAt: null,
            org: org.accountName,
            project: r.project.name,
          });
        }
      } catch {
        // Skip orgs we can't access
      }
    }

    return NextResponse.json({ repos: allRepos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch repos" },
      { status: 500 }
    );
  }
}
