import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return new NextResponse("Missing code parameter", { status: 400 });
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new NextResponse("GitHub OAuth not configured", { status: 501 });
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new NextResponse(
        renderHTML("error", `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const accessToken = tokenData.access_token;

    // Fetch user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "RepoShift/1.0",
      },
    });

    const user = await userRes.json();

    // Return HTML that posts message to opener and closes
    return new NextResponse(
      renderHTML("success", "", {
        provider: "github",
        token: accessToken,
        user: user.login || "",
        avatar: user.avatar_url || "",
      }),
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    return new NextResponse(
      renderHTML("error", `OAuth exchange failed: ${err instanceof Error ? err.message : "Unknown error"}`),
      { headers: { "Content-Type": "text/html" } }
    );
  }
}

function renderHTML(
  status: "success" | "error",
  errorMessage: string,
  data?: { provider: string; token: string; user: string; avatar: string }
): string {
  if (status === "error") {
    return `<!DOCTYPE html>
<html><head><title>RepoShift — Auth Error</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0f;color:#e0e0e6;}
.card{text-align:center;padding:2rem;border-radius:1rem;border:1px solid #2a2a35;background:#13131a;max-width:400px;}
h2{color:#f87171;margin:0 0 0.5rem;}p{color:#a0a0b0;margin:0;}</style></head>
<body><div class="card"><h2>Authentication Failed</h2><p>${errorMessage}</p><p style="margin-top:1rem"><a href="#" onclick="window.close()" style="color:#818cf8">Close this window</a></p></div></body></html>`;
  }

  return `<!DOCTYPE html>
<html><head><title>RepoShift — Connected</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0f;color:#e0e0e6;}
.card{text-align:center;padding:2rem;border-radius:1rem;border:1px solid #2a2a35;background:#13131a;max-width:400px;}
h2{color:#34d399;margin:0 0 0.5rem;}p{color:#a0a0b0;margin:0;}</style></head>
<body><div class="card"><h2>Connected!</h2><p>You can close this window.</p></div>
<script>
if (window.opener) {
  window.opener.postMessage(${JSON.stringify(data)}, window.location.origin);
}
setTimeout(() => window.close(), 1500);
</script></body></html>`;
}
