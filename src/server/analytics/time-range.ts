import type { IntelligenceFilters } from "@/types/intelligence";

export function localDay(timestamp: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp);
  return ["year", "month", "day"].map((key) => parts.find((part) => part.type === key)!.value).join("-");
}
/** UTC boundaries of calendar days in the configured workspace zone, including DST transitions. */
export function startOfLocalDay(day: string, timeZone: string): Date {
  const desired = Date.parse(`${day}T00:00:00Z`);
  let instant = desired;
  for (let index = 0; index < 4; index++) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
    const value = (key: string) => parts.find((part) => part.type === key)!.value;
    const represented = Date.parse(`${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}Z`);
    const next = instant + desired - represented;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant);
}
export function analyticsPeriod(range: IntelligenceFilters["range"], now = new Date(), timeZone = "Asia/Qyzylorda") {
  const day = localDay(now, timeZone);
  const days = range === "today" ? 1 : range === "all" ? null : Number(range.slice(0, -1));
  const date = new Date(`${day}T00:00:00Z`);
  if (days) date.setUTCDate(date.getUTCDate() - days + 1);
  return { from: days ? startOfLocalDay(date.toISOString().slice(0, 10), timeZone).toISOString() : null,
    to: now.toISOString(), timeZone, cohortLabel: "Workflows created in this period · saved outcomes to date" };
}
