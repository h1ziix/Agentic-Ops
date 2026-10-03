import { z } from "zod";

/** Explicit, stable pages for display history. Runtime reads do not opt into this window. */
export interface ReadWindow { offset: number; limit: number }
const readWindowSchema = z.object({ offset: z.number().int().min(0).max(1_000_000), limit: z.number().int().min(1).max(1000) }).strict();
export function readWindowRange(window: ReadWindow): [number, number] {
  const { offset, limit } = readWindowSchema.parse(window);
  return [offset, offset + limit - 1];
}
export function displayHistoryWindow(window: ReadWindow): ReadWindow {
  const parsed = readWindowSchema.parse(window);
  // Leave one row for a reliable hasMore probe within PostgREST's 1000-row maximum.
  return { ...parsed, limit: Math.min(parsed.limit, 999) };
}
