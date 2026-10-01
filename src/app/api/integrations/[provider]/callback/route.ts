import { providerSchema } from "@/lib/validation/execution";
import { completeConnection } from "@/server/services/integration-service";
import { appOrigin } from "@/server/integrations/config";
import { IntegrationError } from "@/server/integrations/http";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  const target = new URL("/settings", appOrigin()); target.searchParams.set("integration", provider);
  try { await completeConnection(providerSchema.parse(provider), new URL(request.url).searchParams); target.searchParams.set("oauth", "connected"); }
  catch (e) { target.searchParams.set("oauth", e instanceof IntegrationError ? e.code : "connection_failed"); }
  return NextResponse.redirect(target);
}
