/**
 * Time and Timezone Utilities for Medrella Healthcare (Task 5)
 * All patient appointment times and reminder schedules are strictly computed in Asia/Kolkata (IST = UTC+05:30).
 * This ensures deterministic behavior regardless of the server clock (Vercel UTC, local dev, CI/CD).
 */

export const ASIA_KOLKATA_TIMEZONE = "Asia/Kolkata";
export const IST_OFFSET_HOURS = 5;
export const IST_OFFSET_MINUTES = 30;
export const IST_TOTAL_OFFSET_MINUTES = 330; // 5 hours * 60 + 30

/**
 * Builds a deterministic Date instant (UTC) from a calendar date (YYYY-MM-DD)
 * and clock time (HH:mm) interpreted strictly in Asia/Kolkata (+05:30).
 *
 * Example:
 * 2026-10-31 at 09:30 IST -> 2026-10-31T04:00:00.000Z
 * 2026-11-01 at 00:15 IST -> 2026-10-31T18:45:00.000Z (previous calendar day in UTC)
 */
export function buildInstantFromKolkataTime(dateStr: string, timeStr: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!dateMatch) {
    throw new Error(`Invalid appointment date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }

  const timeMatch = /^(\d{1,2}):(\d{2})/.exec(timeStr.trim());
  if (!timeMatch) {
    throw new Error(`Invalid appointment time format: "${timeStr}". Expected HH:mm.`);
  }

  const year = parseInt(dateMatch[1], 10);
  const month = parseInt(dateMatch[2], 10);
  const day = parseInt(dateMatch[3], 10);
  const hour = parseInt(timeMatch[1], 10);
  const minute = parseInt(timeMatch[2], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Out of range date/time values: ${dateStr} ${timeStr}`);
  }

  // Construct ISO string with explicit +05:30 offset
  const pad = (n: number) => String(n).padStart(2, "0");
  const isoString = `${pad(year)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00+05:30`;
  const instant = new Date(isoString);

  if (isNaN(instant.getTime())) {
    throw new Error(`Failed to parse constructed IST datetime: ${isoString}`);
  }

  return instant;
}

/**
 * Formats a Date or YYYY-MM-DD string into a human-readable date in Asia/Kolkata.
 * Example: "Saturday, 31 October 2026"
 */
export function formatKolkataDate(d: Date | string): string {
  let dateObj: Date;
  if (typeof d === "string") {
    // If format is YYYY-MM-DD, parse at noon IST to avoid day shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      dateObj = buildInstantFromKolkataTime(d, "12:00");
    } else {
      dateObj = new Date(d);
    }
  } else {
    dateObj = d;
  }

  return new Intl.DateTimeFormat("en-IN", {
    timeZone: ASIA_KOLKATA_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(dateObj);
}

/**
 * Formats a clock time (HH:mm) or Date object in 12-hour format with AM/PM IST.
 * Example: "09:30 AM IST"
 */
export function formatKolkataTime(timeOrDate: string | Date): string {
  if (typeof timeOrDate === "string" && /^\d{1,2}:\d{2}/.test(timeOrDate)) {
    const [h, m] = timeOrDate.split(":").map((s) => parseInt(s, 10));
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(hour12)}:${pad(m)} ${period} IST`;
  }

  const d = typeof timeOrDate === "string" ? new Date(timeOrDate) : timeOrDate;
  const timePart = new Intl.DateTimeFormat("en-IN", {
    timeZone: ASIA_KOLKATA_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  return `${timePart} IST`;
}

/**
 * Formats a full instant in Asia/Kolkata.
 * Example: "31 Oct 2026, 09:30 AM IST"
 */
export function formatKolkataDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: ASIA_KOLKATA_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d) + " IST";
}
