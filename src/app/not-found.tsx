import { WorkspaceLink as Link } from "@/components/app/workspace-link";
import { ArrowLeft, FileSearch } from "lucide-react";
import { PixelMark } from "@/components/app/pixel-mark";

export default function NotFound() {
  return <main className="flex min-h-[70vh] items-center justify-center px-5 py-12"><div className="flex max-w-md flex-col items-center text-center"><span className="mb-8 flex size-9 items-center justify-center rounded-md bg-[var(--brand-mark-bg)] text-[var(--brand-mark-fg)]"><PixelMark /></span><FileSearch aria-hidden className="size-7 text-muted-foreground" /><p className="section-label mt-5">404 / page not found</p><h1 className="mt-3 text-2xl font-semibold tracking-tight">This record isn’t here.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">The link may have changed, or this record may belong to a different workspace. Your saved work stays intact.</p><div className="mt-6 flex flex-wrap items-center justify-center gap-4"><Link href="/dashboard" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium hover:bg-muted"><ArrowLeft className="size-3.5" />Open overview</Link><Link href="/demo" className="text-xs font-medium text-[var(--brand-accent)] hover:underline">Explore the safe demo</Link></div></div></main>;
}
