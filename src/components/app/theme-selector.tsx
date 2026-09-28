"use client";
import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
type ThemeChoice = "system" | "light" | "dark";
const storageKey = "agentic-ops-theme";
const changeEvent = "agentic-ops-appearance";
const options = [{ value: "light", label: "Light", icon: Sun }, { value: "dark", label: "Dark", icon: Moon }, { value: "system", label: "System", icon: Monitor }] as const;
function storedChoice(): ThemeChoice {
  try { const value = window.localStorage.getItem(storageKey); if (value === "system" || value === "light" || value === "dark") return value; } catch {}
  return "light";
}
export function ThemeSelector() {
  const [choice, setChoice] = useState<ThemeChoice>("light");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  /* eslint-disable react-hooks/set-state-in-effect -- The persisted preference is browser-only. */
  useEffect(() => {
    setChoice(storedChoice()); setReady(true);
    const sync = (event: Event) => {
      if (event instanceof CustomEvent && ["light", "dark", "system"].includes(event.detail)) setChoice(event.detail as ThemeChoice);
      else setChoice(storedChoice());
    };
    window.addEventListener(changeEvent, sync); window.addEventListener("storage", sync);
    return () => { window.removeEventListener(changeEvent, sync); window.removeEventListener("storage", sync); };
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", choice === "dark" || (choice === "system" && media.matches));
    apply(); media.addEventListener("change", apply); return () => media.removeEventListener("change", apply);
  }, [choice, ready]);
  const selected = options.find(option => option.value === choice) ?? options[0];
  const Icon = selected.icon;
  function select(value: unknown) {
    if (value !== "light" && value !== "dark" && value !== "system") return;
    setChoice(value);
    try { window.localStorage.setItem(storageKey, value); } catch {}
    window.dispatchEvent(new CustomEvent(changeEvent, { detail: value })); setOpen(false);
  }
  return <Menu.Root open={open} onOpenChange={setOpen}><Menu.Trigger aria-label={"Appearance: " + selected.label} className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><Icon className="size-3" /><span className="hidden text-[10px] xl:inline">{selected.label}</span><ChevronDown className="hidden size-2.5 xl:inline" /></Menu.Trigger>
    <AnimatePresence>{open && <Menu.Portal keepMounted><Menu.Positioner sideOffset={6} align="end" className="z-50"><Menu.Popup render={<motion.div initial={reduced ? false : { opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -3 }} transition={{ duration: .15 }} />} className="w-40 rounded-md border border-border bg-popover p-1 shadow-lg outline-none"><Menu.Group><Menu.GroupLabel className="px-2 py-2 text-[10px] text-muted-foreground">Appearance</Menu.GroupLabel><Menu.RadioGroup value={choice} onValueChange={select}>{options.map(({ value, label, icon: ChoiceIcon }) => <Menu.RadioItem key={value} value={value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs outline-none data-highlighted:bg-accent"><ChoiceIcon className="size-3.5 text-muted-foreground" /><span className="flex-1">{label}</span><Menu.RadioItemIndicator><Check className="size-3" /></Menu.RadioItemIndicator></Menu.RadioItem>)}</Menu.RadioGroup></Menu.Group></Menu.Popup></Menu.Positioner></Menu.Portal>}</AnimatePresence>
  </Menu.Root>;
}
