import assert from "node:assert/strict";
import test from "node:test";
import { getSupabaseEnv, isSupabaseConfigured } from "../supabase/env";

test("Supabase URL validation accepts HTTP(S) without requiring a colon in Zod's protocol", () => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    for (const url of ["https://test.supabase.co", "http://localhost:54321"]) {
      process.env.NEXT_PUBLIC_SUPABASE_URL = url;
      assert.equal(isSupabaseConfigured(), true);
      assert.equal(getSupabaseEnv().url, url);
    }
    process.env.NEXT_PUBLIC_SUPABASE_URL = "file:///secret";
    assert.equal(isSupabaseConfigured(), false);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
