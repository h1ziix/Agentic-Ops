"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { workspaceHref } from "@/lib/workspace-path";

export function WorkspaceLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const pathname = usePathname();
  return <NextLink {...props} href={typeof href === "string" ? workspaceHref(href, pathname) : href} />;
}
