import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function GET(request: NextRequest) {
  const appUrl = z.url({ protocol: /^https?$/ }).safeParse(process.env.NEXT_PUBLIC_APP_URL);
  if (!appUrl.success) return NextResponse.json({ error: "Authentication is not configured." }, { status: 500 });
  const code = request.nextUrl.searchParams.get("code");
  if (!isSupabaseConfigured() || !code || code.length > 2048) {
    return NextResponse.redirect(new URL("/sign-in?error=confirmation", appUrl.data));
  }
  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? "/sign-in?error=confirmation" : "/dashboard", appUrl.data));
}
