import { Suspense } from "react";
import { AutomationWorkspace } from "@/components/automation/automation-workspace";
import { Skeleton } from "@/components/ui/skeleton";

export default function AutomationPage() {
  return <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>}><AutomationWorkspace /></Suspense>;
}
