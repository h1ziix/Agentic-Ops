import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { DemoStoreProvider } from "@/components/app/demo-store";

export const metadata: Metadata = { title: "Demo · Agentic Ops", description: "Explore a fictional, safe sample of an auditable sales research workflow. No sign-in, API calls or external actions.", robots: { index: false, follow: false } };
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoStoreProvider><AppShell>{children}</AppShell></DemoStoreProvider>;
}
