/** Validate hosted production at server startup; offline /demo remains locally runnable. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production") {
    const { validateLaunchEnvironment } = await import("./server/config/launch");
    const result = validateLaunchEnvironment(process.env, { production: true });
    if (result.errors.length) throw new Error(`Production configuration invalid: ${result.errors.join("; ")}`);
  }
}
