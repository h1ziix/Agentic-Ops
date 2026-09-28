"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeChoice = "system" | "light" | "dark";

const storageKey = "agentic-ops-theme";
const options = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

function storedChoice(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (value === "system" || value === "light" || value === "dark") return value;
  } catch { /* A private browser may block storage; the control still works for this visit. */ }
  return "dark";
}

export function ThemeSelector() {
  const [choice, setChoice] = useState<ThemeChoice>("dark");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- Read the browser preference after hydration. */
  useEffect(() => {
    setChoice(storedChoice());
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = choice === "dark" || (choice === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [choice, ready]);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const selected = ready ? options.find((option) => option.value === choice) ?? options[2] : options[0];
  const SelectedIcon = selected.icon;

  function select(value: ThemeChoice) {
    setChoice(value);
    try { window.localStorage.setItem(storageKey, value); } catch { /* Keep the in-memory selection. */ }
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={menuRef} className="relative" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ready ? `Appearance: ${selected.label}` : "Appearance"}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card/70 px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SelectedIcon aria-hidden="true" className="size-3.5" />
        <span className="hidden text-[11px] font-medium xl:inline">{ready ? selected.label : "Appearance"}</span>
        <ChevronDown aria-hidden="true" className={cn("hidden size-3 opacity-60 transition-transform xl:inline", open && "rotate-180")} />
      </button>
      {open && <div className="absolute right-0 top-full z-40 mt-1.5 w-40 rounded-md border border-border bg-popover p-1 shadow-lg shadow-black/10">
        <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Appearance</p>
        {options.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={ready && choice === value}
            onClick={() => select(value)}
            className={cn("flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", ready && choice === value ? "bg-accent text-foreground" : "text-muted-foreground")}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            <span className="flex-1">{label}</span>
            {ready && choice === value && <Check aria-hidden="true" className="size-3.5" />}
          </button>
        ))}
      </div>}
    </div>
  );
}
