export const number = (value: number | null | undefined, digits = 0) => value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
export const money = (value: number | null | undefined) => value == null ? "Unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
export const percent = (value: number | null | undefined) => value == null ? "—" : `${number(value, 1)}%`;
export const duration = (value: number | null | undefined) => value == null ? "—" : value < 1000 ? `${number(value)} ms` : value < 60000 ? `${number(value / 1000, 1)}s` : `${number(value / 60000, 1)}m`;
