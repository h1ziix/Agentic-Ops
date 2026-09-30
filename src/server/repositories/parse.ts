import { z } from "zod";
import { AppError } from "../errors";

/** Never expose malformed database content through a server action error. */
export function parseDatabaseResult<T extends z.ZodType>(schema: T, value: unknown, operation: string): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    console.error("Unexpected database result", { operation });
    throw new AppError("database");
  }
  return parsed.data;
}
