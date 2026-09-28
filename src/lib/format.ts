export const TZ = "Asia/Kolkata";

export const LANGUAGES: Record<string, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi",
  "ta-IN": "Tamil",
  "te-IN": "Telugu",
  "bn-IN": "Bengali",
  "ml-IN": "Malayalam",
  "kn-IN": "Kannada",
  "pa-IN": "Punjabi",
  "gu-IN": "Gujarati",
  "mr-IN": "Marathi",
  "od-IN": "Odia",
};

export const langName = (code?: string | null) => (code ? LANGUAGES[code] ?? code : "—");

export function rupees(n: number | null | undefined, priceType?: string) {
  if (priceType === "on_request" || n == null) return "On request";
  const v = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(n));
  return priceType === "starting_from" ? `from ₹${v}` : `₹${v}`;
}

export function inr(n: number | null | undefined) {
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(n ?? 0));
}

export function dateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

export function dateOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
}

export function timeOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function duration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function secondsBetween(a: string, b?: string | null) {
  return ((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 1000;
}

/** YYYY-MM-DD in salon time */
export function ymd(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const ROLE_LABEL: Record<string, string> = {
  senior_creative_stylist: "Senior Creative Stylist",
  senior_stylist: "Senior Stylist",
  hair_dresser: "Barber",
  beautician: "Beauty Expert",
  celebrity_stylist: "Celebrity Stylist",
  nail_artist: "Nail Artist",
  makeup_artist: "Makeup Artist",
};

export const OUTCOME_LABEL: Record<string, string> = {
  booked: "Booked",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  enquiry: "Enquiry",
  lead_created: "Callback",
  transferred: "Transferred",
  dropped: "Dropped",
  other: "Other",
  in_progress: "In progress",
};

export function outcomeTone(o?: string | null) {
  switch (o) {
    case "booked":
    case "rescheduled":
      return "pill-green";
    case "cancelled":
    case "dropped":
      return "pill-red";
    case "lead_created":
      return "pill-amber";
    default:
      return "pill-blue";
  }
}

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
