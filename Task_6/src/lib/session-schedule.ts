/**
 * Pure scheduling rules for OPD sessions. No database or framework imports, so the booking
 * engine, the doctor's form, the agent and the tests all answer "does this session run on this
 * date?" the same way.
 *
 * A session is one of:
 *   WEEKLY        repeats on a weekday (e.g. every Monday)
 *   MONTHLY_DATE  repeats on a day of the month (e.g. the 1st of every month)
 *   ONE_TIME      runs on exactly one calendar date and never repeats
 * Recurring sessions may also carry an optional validFrom / validUntil range
 * (e.g. every Monday, but only from 1 Dec to 31 Dec).
 */

export type DayCode = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
export type SessionRecurrence = "WEEKLY" | "MONTHLY_DATE" | "ONE_TIME";

export const DAY_CODES_SUNDAY_FIRST: DayCode[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const WEEK_ORDER: DayCode[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** The fields of a session that decide on which dates it runs. */
export interface ScheduleFields {
  isActive?: boolean;
  recurrence?: SessionRecurrence | null;
  dayOfWeek?: DayCode | null;
  dayOfMonth?: number | null;
  specificDate?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_DATE = "0000-01-01";
const MAX_DATE = "9999-12-31";
/** How far ahead two sessions are compared when looking for a clash. Covers every weekday/day-of-month combination. */
const CLASH_HORIZON_DAYS = 366 * 5;

function utcMs(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isRealDate(date: unknown): date is string {
  if (typeof date !== "string" || !DATE_RE.test(date)) return false;
  const ms = utcMs(date);
  if (Number.isNaN(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === date;
}

export function addDaysToDate(date: string, days: number): string {
  return new Date(utcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Weekday of a calendar date. Independent of the server's timezone. */
export function weekdayOfDate(date: string): DayCode {
  return DAY_CODES_SUNDAY_FIRST[new Date(utcMs(date)).getUTCDay()];
}

export function dayOfMonthOf(date: string): number {
  return Number(date.slice(8, 10));
}

export function recurrenceOf(s: ScheduleFields): SessionRecurrence {
  return s.recurrence ?? "WEEKLY";
}

/** Capacity of one slot. The same field serves Stream and Wave: patients per slot, minimum 1. */
export function sessionCapacity(s: { patientsPerWave?: number | null }): number {
  return Math.max(1, Math.floor(Number(s.patientsPerWave) || 1));
}

/** Does this session run on the given calendar date? Leave days are handled separately by the caller. */
export function sessionAppliesOnDate(s: ScheduleFields, date: string): boolean {
  if (s.isActive === false) return false;
  return scheduleCoversDate(s, date);
}

/** Same as sessionAppliesOnDate but ignores isActive (used when comparing sessions with each other). */
export function scheduleCoversDate(s: ScheduleFields, date: string): boolean {
  if (!isRealDate(date)) return false;
  const kind = recurrenceOf(s);
  if (kind === "ONE_TIME") return s.specificDate === date;
  if (s.validFrom && date < s.validFrom) return false;
  if (s.validUntil && date > s.validUntil) return false;
  if (kind === "MONTHLY_DATE") return s.dayOfMonth != null && dayOfMonthOf(date) === s.dayOfMonth;
  return s.dayOfWeek != null && weekdayOfDate(date) === s.dayOfWeek;
}

function rangeOf(s: ScheduleFields): [string, string] {
  if (recurrenceOf(s) === "ONE_TIME" && s.specificDate) return [s.specificDate, s.specificDate];
  return [s.validFrom || MIN_DATE, s.validUntil || MAX_DATE];
}

/** First date in [from, until] (capped at the clash horizon) that satisfies the predicate, or null. */
function firstDateWhere(from: string, until: string, test: (date: string) => boolean): string | null {
  const cap = addDaysToDate(from, CLASH_HORIZON_DAYS);
  const end = until < cap ? until : cap;
  for (let d = from; d <= end; d = addDaysToDate(d, 1)) {
    if (test(d)) return d;
  }
  return null;
}

/**
 * The first date on or after `fromDate` on which both schedules run, or null when they never
 * share a day. Used to refuse two sessions of one doctor whose hours overlap on a shared day.
 */
export function firstSharedDate(a: ScheduleFields, b: ScheduleFields, fromDate: string): string | null {
  const [aLo, aHi] = rangeOf(a);
  const [bLo, bHi] = rangeOf(b);
  const lo = [aLo, bLo, fromDate].reduce((x, y) => (x > y ? x : y));
  const hi = aHi < bHi ? aHi : bHi;
  if (lo > hi) return null;
  return firstDateWhere(lo, hi, (d) => scheduleCoversDate(a, d) && scheduleCoversDate(b, d));
}

/** Returns an error message when the schedule fields are inconsistent, otherwise null. */
export function validateScheduleShape(s: ScheduleFields): string | null {
  const kind = recurrenceOf(s);
  if (kind !== "WEEKLY" && kind !== "MONTHLY_DATE" && kind !== "ONE_TIME") {
    return "Choose how the session repeats.";
  }
  if (kind === "WEEKLY" && !s.dayOfWeek) return "Choose the day of the week.";
  if (kind === "MONTHLY_DATE") {
    if (!Number.isInteger(s.dayOfMonth) || (s.dayOfMonth as number) < 1 || (s.dayOfMonth as number) > 31) {
      return "Day of the month must be between 1 and 31.";
    }
  }
  if (kind === "ONE_TIME") {
    if (!isRealDate(s.specificDate)) return "Choose a valid date for this one-time session.";
    return null;
  }
  if (s.validFrom && !isRealDate(s.validFrom)) return "The 'from' date is not a valid date.";
  if (s.validUntil && !isRealDate(s.validUntil)) return "The 'until' date is not a valid date.";
  if (s.validFrom && s.validUntil && s.validFrom > s.validUntil) {
    return "The 'until' date must be on or after the 'from' date.";
  }
  if (s.validFrom && s.validUntil) {
    const hit = firstDateWhere(s.validFrom, s.validUntil, (d) => scheduleCoversDate(s, d));
    if (!hit) return "No date between 'from' and 'until' matches this schedule, so the session would never run.";
  }
  return null;
}

/** Past-date rules, applied when a schedule is created or its dates are changed. */
export function validateScheduleNotInPast(s: ScheduleFields, today: string): string | null {
  if (recurrenceOf(s) === "ONE_TIME") {
    if (s.specificDate && s.specificDate < today) return "A one-time session can't be set on a past date.";
    return null;
  }
  if (s.validUntil && s.validUntil < today) return "The 'until' date is already in the past.";
  return null;
}

/**
 * Cleans a schedule so the stored row only carries the fields its recurrence uses.
 * A one-time session still records its weekday; a monthly one has none.
 */
export interface NormalizedSchedule {
  recurrence: SessionRecurrence;
  dayOfWeek: DayCode | null;
  dayOfMonth: number | null;
  specificDate: string | null;
  validFrom: string | null;
  validUntil: string | null;
}

export function normalizeSchedule(s: ScheduleFields): NormalizedSchedule {
  const kind = recurrenceOf(s);
  if (kind === "ONE_TIME") {
    return {
      recurrence: "ONE_TIME",
      dayOfWeek: s.specificDate && isRealDate(s.specificDate) ? weekdayOfDate(s.specificDate) : null,
      dayOfMonth: null,
      specificDate: s.specificDate ?? null,
      validFrom: null,
      validUntil: null,
    };
  }
  return {
    recurrence: kind,
    dayOfWeek: kind === "WEEKLY" ? s.dayOfWeek ?? null : null,
    dayOfMonth: kind === "MONTHLY_DATE" ? s.dayOfMonth ?? null : null,
    specificDate: null,
    validFrom: s.validFrom || null,
    validUntil: s.validUntil || null,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDateLabel(date: string): string {
  if (!isRealDate(date)) return date;
  return `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10] ?? "th"}`;
}

function rangeSuffix(s: ScheduleFields): string {
  if (s.validFrom && s.validUntil) return ` · ${formatDateLabel(s.validFrom)} to ${formatDateLabel(s.validUntil)}`;
  if (s.validFrom) return ` · from ${formatDateLabel(s.validFrom)}`;
  if (s.validUntil) return ` · until ${formatDateLabel(s.validUntil)}`;
  return "";
}

/** Short human description, e.g. "Every MON · from 1 Dec 2026", "1st of every month", "Only 5 Dec 2026 (SAT)". */
export function describeSchedule(s: ScheduleFields): string {
  const kind = recurrenceOf(s);
  if (kind === "ONE_TIME") {
    return s.specificDate ? `Only ${formatDateLabel(s.specificDate)} (${weekdayOfDate(s.specificDate)})` : "One-time";
  }
  if (kind === "MONTHLY_DATE") return `${ordinal(s.dayOfMonth ?? 1)} of every month${rangeSuffix(s)}`;
  return `Every ${s.dayOfWeek ?? "week"}${rangeSuffix(s)}`;
}

/** One-line summary of a doctor's active sessions for profile cards. */
export function summarizeSchedule(sessions: ScheduleFields[], today: string): string {
  const active = sessions.filter((s) => s.isActive !== false);
  const weekly = WEEK_ORDER.filter((day) =>
    active.some((s) => recurrenceOf(s) === "WEEKLY" && s.dayOfWeek === day && (!s.validUntil || s.validUntil >= today))
  );
  const monthly = Array.from(
    new Set(
      active
        .filter((s) => recurrenceOf(s) === "MONTHLY_DATE" && s.dayOfMonth != null && (!s.validUntil || s.validUntil >= today))
        .map((s) => s.dayOfMonth as number)
    )
  ).sort((x, y) => x - y);
  const oneOff = active.filter((s) => recurrenceOf(s) === "ONE_TIME" && s.specificDate && s.specificDate >= today);
  const parts: string[] = [];
  if (weekly.length) parts.push(weekly.join(", "));
  if (monthly.length) parts.push(`${monthly.map(ordinal).join(", ")} of month`);
  if (oneOff.length) parts.push(`${oneOff.length} special date${oneOff.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
