import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  eyebrow?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="section-label mb-2">{eyebrow}</p>}
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-[28px]">{title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
