import { Skeleton } from "@/components/ui/skeleton";
export default function IntelligenceLoading() { return <div className="flex flex-col gap-6" role="status" aria-label="Loading intelligence"><Skeleton className="h-20" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div>; }
