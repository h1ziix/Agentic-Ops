import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/app/app-shell";
import { DemoStoreProvider } from "@/components/app/demo-store";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

const themeBootstrap = `try {
  var choice = localStorage.getItem("agentic-ops-theme");
  var dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
} catch (_) { document.documentElement.classList.remove("dark"); }`;

export const metadata: Metadata = {
  title: "Agentic Ops",
  description: "An operational workspace for autonomous sales research",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("font-sans", geist.variable)}>
      <body>
        <Script id="theme-bootstrap" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <TooltipProvider>
          <DemoStoreProvider>
            <AppShell>{children}</AppShell>
          </DemoStoreProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
