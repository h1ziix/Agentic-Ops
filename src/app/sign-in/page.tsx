import { redirect } from "next/navigation";
import { AuthForm } from "./auth-form";
import { PixelMark } from "@/components/app/pixel-mark";
import { createServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string }> }) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  if (configured) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) redirect("/dashboard");
  }
  const mode = params.mode === "sign-up" ? "sign-up" : "sign-in";
  return <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background px-4 py-10 sm:px-6">
    <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" aria-hidden />
    <div className="relative flex items-center gap-2.5"><span className="flex size-9 items-center justify-center rounded-md bg-[var(--brand-mark-bg)] text-[var(--brand-mark-fg)]"><PixelMark /></span><span className="text-[19px] font-semibold tracking-[-0.055em]">agentic<span className="font-normal text-muted-foreground">/</span>ops<span className="text-[var(--brand-accent)]">.</span></span></div>
    <div className="relative flex w-full justify-center"><AuthForm key={mode} mode={mode} configured={configured} confirmationError={params.error === "confirmation"} /></div>
    <p className="relative text-center text-[11px] text-muted-foreground">Research, decisions, and audit history in one workspace.</p>
  </main>;
}
