import { z } from "zod";

export const publicWebsiteSchema = z.string().trim().max(2048).url().refine((value) => {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  const hostname = url.hostname.replace(/\.$/, "");
  return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
    && !url.port && !hostname.includes(":") && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)
    && hostname.includes(".") && !/(^|\.)(localhost|local|internal|test|invalid|localdomain|home|lan)$/.test(hostname);
}, "Use a public company website.");

export function normalizeDomain(website: string): string {
  const value = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  return new URL(publicWebsiteSchema.parse(value)).hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

export function normalizeWebsite(website: string): string {
  const value = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const url = new URL(publicWebsiteSchema.parse(value));
  url.hostname = normalizeDomain(value);
  url.hash = ""; url.search = ""; url.pathname = "/";
  return url.href.replace(/\/$/, "");
}

export function normalizeCompanyName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[.,'’]/g, "")
    .replace(/\s+(incorporated|inc|llc|ltd|limited|corp|corporation)$/i, "").replace(/\s+/g, " ").trim();
}

export function sameCompany(a: { name: string; website: string | null }, b: { name: string; website: string | null }): boolean {
  if (a.website && b.website) return normalizeDomain(a.website) === normalizeDomain(b.website);
  return normalizeCompanyName(a.name) === normalizeCompanyName(b.name);
}

export function deduplicateCompanies<T extends { name: string; website: string | null }>(companies: T[]): T[] {
  return companies.reduce<T[]>((unique, company) => {
    const index = unique.findIndex((other) => sameCompany(other, company));
    if (index < 0) unique.push(company);
    else if (!unique[index].website && company.website) unique[index] = company;
    return unique;
  }, []);
}
