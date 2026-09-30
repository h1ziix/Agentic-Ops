"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { authenticate, type AuthActionState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

export function AuthForm({ mode, configured, confirmationError }: { mode: "sign-in" | "sign-up"; configured: boolean; confirmationError: boolean }) {
  const [state, formAction, pending] = useActionState(authenticate, initialState);
  const creating = mode === "sign-up";
  return <div className="w-full max-w-[410px] rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]">
    <div className="border-b border-border px-6 py-6">
      <p className="section-label flex items-center gap-2"><LockKeyhole className="size-3.5 text-[var(--brand-accent)]" /> Workspace access</p>
      <h1 className="mt-3 text-[22px] font-semibold tracking-[-0.04em]">{creating ? "Create your account" : "Sign in to Agentic Ops"}</h1>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{creating ? "Create a workspace to keep your workflows and decisions together." : "Continue to your operational workspace."}</p>
    </div>
    <div className="flex gap-5 border-b border-border px-6 pt-4 text-xs font-medium">
      <Link href="/sign-in" aria-current={!creating ? "page" : undefined} className={`border-b-2 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring ${creating ? "border-transparent text-muted-foreground hover:text-foreground" : "border-foreground"}`}>Sign in</Link>
      <Link href="/sign-in?mode=sign-up" aria-current={creating ? "page" : undefined} className={`border-b-2 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring ${creating ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>Create account</Link>
    </div>
    <form action={formAction} className="flex flex-col gap-5 px-6 py-6">
      <input type="hidden" name="mode" value={mode} />
      <div className="flex flex-col gap-2"><label htmlFor="auth-email" className="text-xs font-medium">Email address</label><Input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@company.com" disabled={!configured || pending} /></div>
      <div className="flex flex-col gap-2"><label htmlFor="auth-password" className="text-xs font-medium">Password</label><Input id="auth-password" name="password" type="password" autoComplete={creating ? "new-password" : "current-password"} required minLength={creating ? 8 : 1} maxLength={128} disabled={!configured || pending} /><p className="text-[11px] text-muted-foreground">{creating ? "At least 8 characters." : "Use the password for your workspace account."}</p></div>
      {!configured && <p role="status" className="rounded-md border border-[var(--warning-border)] bg-[var(--warning-bg)] p-3 text-xs leading-5 text-[var(--warning-fg)]">Supabase is not configured. Add the environment values from <code>.env.example</code> to enable authentication.</p>}
      {confirmationError && <p role="alert" className="text-xs text-destructive">The confirmation link could not be verified. Request a new link by creating your account again.</p>}
      {state.error && <p role="alert" className="text-xs text-destructive">{state.error}</p>}
      {state.message && <p role="status" className="text-xs text-[var(--success-fg)]">{state.message}</p>}
      <Button type="submit" disabled={!configured || pending} className="w-full">{pending ? "Please wait…" : creating ? "Create account" : "Sign in"}<ArrowRight data-icon="inline-end" /></Button>
    </form>
    <p className="border-t border-border px-6 py-4 text-[11px] leading-5 text-muted-foreground">External actions remain behind a human approval gate. No outreach is sent during this stage.</p>
  </div>;
}
