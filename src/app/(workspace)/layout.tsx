import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { DemoStoreProvider } from "@/components/app/demo-store";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { toWorkspaceView } from "@/lib/workspace-view";
import { AppError } from "@/server/errors";
import { getWorkspaceSnapshot } from "@/server/services/workspace-service";

export default async function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "development") {
      return <DemoStoreProvider><AppShell>{children}</AppShell></DemoStoreProvider>;
    }
    return <main className="flex min-h-screen items-center justify-center bg-background px-4"><div className="max-w-md rounded-lg border border-border bg-card p-7"><p className="section-label">Configuration required</p><h1 className="mt-3 text-xl font-semibold tracking-tight">Connect Supabase to continue</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Copy the values in <code>.env.example</code> to <code>.env.local</code> or your deployment environment, then apply the versioned migrations.</p><Link href="/sign-in" className="mt-5 inline-flex text-xs font-medium text-[var(--brand-accent)] hover:underline">Open sign-in</Link></div></main>;
  }

  let snapshot;
  try {
    snapshot = await getWorkspaceSnapshot();
  } catch (error) {
    if (error instanceof AppError && error.code === "unauthenticated") redirect("/sign-in");
    throw error;
  }
  return <DemoStoreProvider initialData={toWorkspaceView(snapshot)}><AppShell>{children}</AppShell></DemoStoreProvider>;
}
