/** Shared origin rules. Hosted deployments never use a loopback callback. */
export function canonicalAppOrigin(value: string | undefined, hosted = false): string {
  const raw = value?.trim() ?? "";
  try {
    const url = new URL(raw);
    const hostname = url.hostname.replace(/\.$/, "");
    const loopback = hostname === "localhost" || hostname.endsWith(".localhost") || /^127\.\d+\.\d+\.\d+$/.test(hostname)
      || hostname === "[::1]" || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/i.test(hostname);
    if (url.origin !== raw.replace(/\/$/, "") || url.username || url.password || url.search || url.hash
      || (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
      || (hosted && loopback)) throw new Error();
    return url.origin;
  } catch { throw new Error("Configure a canonical HTTPS origin without a path, credentials, query or fragment. Loopback is local-only."); }
}
