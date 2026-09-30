import { z } from "zod";

const supabaseEnvSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  publishableKey: z.string().trim().min(1),
});

export function isSupabaseConfigured(): boolean {
  return supabaseEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }).success;
}

export function getSupabaseEnv(): z.infer<typeof supabaseEnvSchema> {
  const result = supabaseEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!result.success) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return result.data;
}
