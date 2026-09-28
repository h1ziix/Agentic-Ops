"use client";
import { motion, MotionConfig } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={{ type: "spring", duration: 0.3, bounce: 0 }}>{children}</MotionConfig>;
}
export function PageTransition({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return <motion.div initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.28, ease: [0.2, 0.8, 0.2, 1] }}>{children}</motion.div>;
}
export function SignalDot({ active = false, className }: { active?: boolean; className?: string }) {
  const reduced = useReducedMotion();
  return <span aria-hidden="true" className={cn("relative inline-flex size-1.5 shrink-0 rounded-full bg-current", className)}>{active && !reduced && <motion.span className="absolute inset-0 rounded-full bg-current" animate={{ opacity: [0.4, 0], transform: ["scale(1)", "scale(2.8)"] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }} />}</span>;
}
