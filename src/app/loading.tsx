import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="space-y-6" role="status" aria-label="Loading workspace view">
    <div className="border-b border-border pb-6"><Skeleton className="h-3 w-28" /><Skeleton className="mt-3 h-8 w-64" /><Skeleton className="mt-3 h-4 w-[min(480px,100%)]" /></div>
    <div className="panel grid grid-cols-2 gap-4 p-5 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-3"><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-14" /><Skeleton className="h-3 w-28" /></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,1fr)]"><Skeleton className="h-72 rounded-lg" /><Skeleton className="h-72 rounded-lg" /></div>
    <span className="sr-only">Loading…</span>
  </div>;
}
