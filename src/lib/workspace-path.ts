const workspaceRoutes = /^\/(dashboard|workflows|companies|leads|approvals|activity|automation|intelligence|icps|templates|settings|onboarding)(\/|\?|#|$)/;

/** Demo navigation is explicit; it never changes authentication or API routing. */
export function workspaceHref(href: string, pathname: string): string {
  return pathname.startsWith("/demo") && workspaceRoutes.test(href) ? `/demo${href}` : href;
}

export function workspacePathname(pathname: string): string {
  return pathname.replace(/^\/demo(?=\/|$)/, "") || "/dashboard";
}
