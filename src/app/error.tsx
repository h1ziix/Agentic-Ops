"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorView({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="panel flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center" role="alert">
    <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-[#704444] bg-[#3a2222] text-[#e48787]"><AlertTriangle className="size-5" /></div>
    <h1 className="text-lg font-semibold tracking-tight">This view could not load</h1>
    <p className="mt-2 max-w-md text-[13px] leading-6 text-muted-foreground">The workspace encountered an unexpected error. Try loading the view again or return to the dashboard.</p>
    <div className="mt-5 flex flex-wrap items-center justify-center gap-2"><Button onClick={reset}><RotateCcw className="size-3.5" />Try again</Button><Link href="/dashboard" className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-muted">Dashboard</Link></div>
  </div>;
}
