/** Browser-safe guard. A configured NEXT_PUBLIC key must never carry server authority. */
export function isSupabasePublicKey(value: string | undefined): boolean {
  const key = value?.trim();
  if (!key || key.startsWith("sb_secret_")) return false;
  if (!key.includes(".") && !key.startsWith("eyJ")) return true;
  const parts = key.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const decode = (part: string): unknown => JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    const header = decode(parts[0]); const payload = decode(parts[1]);
    return typeof header === "object" && header !== null && !Array.isArray(header)
      && typeof payload === "object" && payload !== null && !Array.isArray(payload)
      && "role" in payload && payload.role === "anon";
  } catch { return false; }
}
