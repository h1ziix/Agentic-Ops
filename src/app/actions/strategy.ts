"use server";

import { revalidatePath } from "next/cache";
import { AppError } from "@/server/errors";
import { listStrategy, strategyService } from "@/server/services/strategy-service";
import type { StrategyResult } from "@/types/strategy";

async function perform<T>(operation: () => Promise<T>, mutation = true): Promise<StrategyResult<T>> {
  try {
    const data = await operation();
    if (mutation) {
      revalidatePath("/icps"); revalidatePath("/templates"); revalidatePath("/workflows"); revalidatePath("/intelligence"); revalidatePath("/activity");
    }
    return { data };
  } catch (error) {
    return { error: error instanceof AppError ? error.message : "The strategy could not be saved. Please try again." };
  }
}
export async function listStrategyAction(includeArchived = false) {
  return perform(() => listStrategy(includeArchived === true), false);
}
export async function saveIcpAction(input: unknown, id?: string) {
  return perform(async () => (await strategyService()).saveIcp(input, id));
}
export async function duplicateIcpAction(id: string) {
  return perform(async () => (await strategyService()).duplicateIcp(id));
}
export async function archiveIcpAction(id: string) {
  return perform(async () => ({ id: (await (await strategyService()).archiveIcp(id)).id }));
}
export async function saveTemplateAction(input: unknown, id?: string) {
  return perform(async () => (await strategyService()).saveTemplate(input, id));
}
export async function duplicateTemplateAction(id: string) {
  return perform(async () => (await strategyService()).duplicateTemplate(id));
}
export async function archiveTemplateAction(id: string) {
  return perform(async () => ({ id: (await (await strategyService()).archiveTemplate(id)).id }));
}
