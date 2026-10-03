"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AppError } from "@/server/errors";
import { getAppOrigin } from "@/server/config/env";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address.").trim().max(254),
  password: z.string().min(1, "Enter your password.").max(128),
  mode: z.enum(["sign-in", "sign-up"]),
});

export type AuthActionState = { error?: string; message?: string };

export async function authenticate(_state: AuthActionState, formData: FormData): Promise<AuthActionState> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured for this environment." };
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    mode: formData.get("mode"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };

  const { email, password, mode } = parsed.data;
  if (mode === "sign-up" && password.length < 8) return { error: "Use a password with at least 8 characters." };

  const supabase = await createServerClient();
  if (mode === "sign-up") {
    let appUrl: string;
    try { appUrl = getAppOrigin(); }
    catch { return { error: "Set NEXT_PUBLIC_APP_URL to the canonical application origin before creating an account." }; }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: new URL("/auth/callback", appUrl).toString() },
    });
    if (error) return { error: "Account creation could not be completed. Check your details and try again." };
    if (!data.session) return { message: "Check your email for a confirmation link, then sign in." };
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.warn("Sign-in rejected", { code: error.code ?? "unknown", status: error.status });
      if (error.code === "email_not_confirmed") return { error: "Confirm your email address, then sign in." };
      return { error: "Sign-in failed. Check your email and password." };
    }
  }

  redirect(mode === "sign-up" ? "/onboarding" : "/dashboard");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw new AppError("database", "Sign out could not be completed. Please try again.");
  }
  redirect("/sign-in");
}
