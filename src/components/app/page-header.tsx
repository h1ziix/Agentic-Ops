import type { ReactNode } from "react";
type PageHeaderProps = { title: string; description: string; eyebrow?: string; actions?: ReactNode };
export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">{eyebrow && <p className="section-label mb-3 inline-flex items-center gap-2"><span aria-hidden="true" className="size-1.5 rounded-sm bg-[var(--brand-accent)]" />{eyebrow}</p>}<h1 className="text-[30px] font-semibold leading-none tracking-[-0.055em] sm:text-[34px]">{title}</h1><p className="mt-3 max-w-2xl text-[13px] leading-5 text-muted-foreground">{description}</p></div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </header>;
}
