import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return new NextResponse(renderHTML("error", "Missing code parameter"), {
      headers: { "Content-Type": "text/html" },
    });
  }

  const clientId = process.env.AZDO_CLIENT_ID;
  const clientSecret = process.env.AZDO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return new NextResponse(renderHTML("error", "Azure DevOps OAuth not configured"), {
      headers: { "Content-Type": "text/html" },
    });
  }

  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const redirectUri = `${baseUrl}/api/auth/azure-devops/callback`;

  try {
    // Exchange authorization code for access token
    const tokenRes = await fetch("https://app.vssps.visualstudio.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        client_assertion: clientSecret,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return new NextResponse(
        renderHTML("error", `Token exchange failed: ${tokenData.error_description || JSON.stringify(tokenData)}`),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const accessToken = tokenData.access_token;

    // Fetch user profile
    const profileRes = await fetch("https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const profile = await profileRes.json();
    const displayName = profile.displayName || profile.emailAddress || "Azure DevOps User";

    return new NextResponse(
      renderHTML("success", "", {
        provider: "azure-devops",
        token: accessToken,
        user: displayName,
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
  data?: { provider: string; token: string; user: string }
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
