import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET() {
  const clientId = process.env.AZDO_CLIENT_ID;
  if (!clientId) {
    return new NextResponse("Azure DevOps OAuth not configured", { status: 501 });
  }

  const state = randomBytes(16).toString("hex");

  const baseUrl = process.env.NEXTAUTH_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const redirectUri = `${baseUrl}/api/auth/azure-devops/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "Assertion",
    state,
    scope: "vso.code vso.profile",
    redirect_uri: redirectUri,
  });

  return NextResponse.redirect(
    `https://app.vssps.visualstudio.com/oauth2/authorize?${params.toString()}`
  );
}
