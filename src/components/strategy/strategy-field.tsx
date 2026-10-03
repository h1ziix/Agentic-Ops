"use client";

import { useId, type ReactNode } from "react";
import { Field } from "@base-ui/react/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function StrategyField({ label, name, value, onChange, multiline = false, type = "text", min, max, help, invalid = false }: {
  label: string; name: string; value: string; onChange: (value: string) => void;
  multiline?: boolean; type?: string; min?: number; max?: number; help?: ReactNode; invalid?: boolean;
}) {
  const id = useId();
  const props = { id, name, value, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), "aria-invalid": invalid, "aria-describedby": help ? `${id}-help` : undefined };
  return <Field.Root invalid={invalid} className="flex min-w-0 flex-col gap-2">
    <Field.Label htmlFor={id} className="text-xs font-medium">{label}</Field.Label>
    {multiline ? <Textarea {...props} rows={3} /> : <Input {...props} type={type} min={min} max={max} />}
    {help && <Field.Description id={`${id}-help`} className="text-[11px] leading-5 text-muted-foreground">{help}</Field.Description>}
  </Field.Root>;
}

export function splitCriteria(value: string) {
  return value.split(/[\n;,]/).map((item) => item.trim()).filter(Boolean);
}
