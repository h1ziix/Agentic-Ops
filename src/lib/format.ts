const dateTime = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Almaty" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Almaty" });
const timeOnly = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Almaty" });

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));
export const formatTime = (iso: string) => timeOnly.format(new Date(iso));
