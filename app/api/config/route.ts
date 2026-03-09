import { NextResponse } from "next/server";
import { hasApiKey } from "@/lib/analyzer";

export async function GET() {
  return NextResponse.json({
    hasServerKey: hasApiKey(),
    providers: ["github", "azure-devops"],
    oauthProviders: {
      github: !!process.env.GITHUB_CLIENT_ID,
      azdo: !!process.env.AZDO_CLIENT_ID,
    },
  });
}
