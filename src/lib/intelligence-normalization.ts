/** Display-only normalization. Original research text and historical scores are never rewritten. */
const clean = (value: string | null | undefined) => value?.trim().replace(/\s+/g, " ") ?? "";
const unknown = (value: string) => !value || /^(unknown|unavailable|not known|n\/a|na|not specified|unspecified)$/i.test(value);
export function normalizeIndustry(input: string | null | undefined): string {
  const value = clean(input);
  if (unknown(value)) return "Unknown";
  if (/fin[ -]?tech|payments?|digital banking/i.test(value)) return "Fintech";
  if (/saas|software as a service/i.test(value)) return "SaaS";
  if (/e[ -]?commerce|online retail/i.test(value)) return "Ecommerce";
  return value.toLowerCase().replace(/(^|[ -])\p{L}/gu, (part) => part.toUpperCase());
}
export function normalizeLocation(input: string | null | undefined): string {
  const value = clean(input);
  if (unknown(value)) return "Unknown";
  if (/kazakhstan|казахстан|^kz$/i.test(value)) return "Kazakhstan";
  if (/uzbekistan|узбекистан|^uz$/i.test(value)) return "Uzbekistan";
  if (/kyrgyzstan|киргизстан|кыргызстан|^kg$/i.test(value)) return "Kyrgyzstan";
  if (/united states|^usa?$|^u\.s\.a?\.?$/i.test(value)) return "United States";
  return value.toLowerCase().replace(/(^|[ -])\p{L}/gu, (part) => part.toUpperCase());
}
export function normalizeOpportunity(input: string | null | undefined): string {
  const value = clean(input).toLowerCase().replace(/_/g, " ");
  if (unknown(value)) return "Unknown";
  if (/customer support|support ticket|helpdesk|help desk|customer service/i.test(value)) return "Customer support";
  if (/lead qualif|lead scor/i.test(value)) return "Lead qualification";
  if (/knowledge|retrieval|\brag\b/i.test(value)) return "Knowledge automation";
  if (/document|invoice|ocr/i.test(value)) return "Document processing";
  if (/sales|outreach|crm/i.test(value)) return "Sales operations";
  if (/internal|back office|back-office|operational/i.test(value)) return "Internal operations";
  if (/workflow|process automat/i.test(value)) return "Workflow automation";
  return "Other";
}
