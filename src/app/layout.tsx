import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app/app-shell";
import { DemoStoreProvider } from "@/components/app/demo-store";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Agentic Ops",
  description: "An operational workspace for autonomous sales research",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={cn("dark font-sans", geist.variable)}><body><TooltipProvider><DemoStoreProvider><AppShell>{children}</AppShell></DemoStoreProvider></TooltipProvider></body></html>;
}
