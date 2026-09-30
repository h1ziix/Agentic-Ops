import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/workflows/:path*",
    "/companies/:path*",
    "/leads/:path*",
    "/approvals/:path*",
    "/activity/:path*",
    "/settings/:path*",
    "/sign-in",
    "/auth/:path*",
  ],
};
