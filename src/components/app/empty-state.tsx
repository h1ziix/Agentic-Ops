import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-border bg-muted"><Icon className="size-4 text-muted-foreground" /></div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
