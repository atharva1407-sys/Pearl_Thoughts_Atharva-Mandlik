/**
 * Elastic scheduling: pure rules for what happens when a doctor stretches or shrinks the hours of
 * an existing OPD session (for example 10:00-12:00 becoming 09:00-12:00, or 10:00-11:00).
 *
 * No database or framework imports, so the repository, the doctor's form and the tests all work out
 * the same answer. A doctor can ALWAYS change the hours, even when appointments are booked. Bookings
 * are classified against the NEW schedule:
 *
 *   KEPT      the booking still sits on a slot of the new schedule: nothing to do
 *   OUTSIDE   the new hours (or dates) no longer cover it
 *   OFF_GRID  it falls inside the new hours but between two new slots (a different slot length or
 *             start time), so it would overlap whichever slot a new patient books
 *
 * OUTSIDE and OFF_GRID bookings are "affected". The change is saved only once the doctor has said
 * what happens to them (BookingResolution):
 *
 *   MOVE    each patient is moved to the nearest free slot (same day first, then the next days) and told
 *           by email. Anyone who cannot be placed stays booked exactly as before, so nobody is ever lost
 *   CANCEL  each patient is cancelled by the doctor, refunded in full and told by email
 *   KEEP    the appointment stays as booked, outside the new hours
 *
 * Expansion never disturbs a booking as long as the existing slot grid is kept (see effectiveSlotLength).
 */

import { addDaysToDate, scheduleCoversDate, type ScheduleFields } from "./session-schedule";

export interface SessionWindow {
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  slotDurationMinutes: number;
}

export interface ElasticBooking {
  id: string;
  appointmentDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  tokenNumber?: number;
  patientName?: string;
}

export type BookingFit = "KEPT" | "OUTSIDE" | "OFF_GRID";
export type WindowChange = "NONE" | "EXPANDED" | "SHRUNK" | "CHANGED";
export type BookingResolution = "KEEP" | "MOVE" | "CANCEL";

export const BOOKING_RESOLUTIONS: BookingResolution[] = ["MOVE", "CANCEL", "KEEP"];

export function isBookingResolution(value: unknown): value is BookingResolution {
  return value === "KEEP" || value === "MOVE" || value === "CANCEL";
}

export interface SessionChangeImpact {
  change: WindowChange;
  /** Start times of slots that exist in the new schedule but not the old one. */
  slotsAdded: string[];
  /** Start times of slots that existed before and are gone now. */
  slotsRemoved: string[];
  /** Upcoming bookings that still sit on a slot. */
  keptBookings: number;
  /** Upcoming bookings the new hours (or dates) no longer cover. */
  outsideBookings: ElasticBooking[];
  /** Upcoming bookings that fall between new slots. */
  offGridBookings: ElasticBooking[];
  /** Outside plus off-grid, in date and time order: the bookings the doctor has to decide about. */
  affectedBookings: ElasticBooking[];
  /**
   * Set by the repository when bookings are affected: how many could be moved to a free slot under the
   * new schedule, and how many would find every slot full (those would simply stay booked).
   */
  relocationPreview?: { movable: number; stuck: number };
  /** Plain-language summary, safe to show to the doctor. */
  summary: string;
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Start times of every slot the booking engine offers for these hours. Mirrors buildSessionSlotGroups. */
export function slotStarts(w: SessionWindow): string[] {
  const start = toMinutes(w.startTime);
  const end = toMinutes(w.endTime);
  const step = Math.max(1, w.slotDurationMinutes);
  const out: string[] = [];
  for (let t = start; t + step <= end; t += step) out.push(fromMinutes(t));
  return out;
}

/**
 * The slot length to save when the doctor edits a session's hours. Normally that is exactly what the
 * form says. The one exception: a session that is already "one slot for the whole session" and is
 * only being EXTENDED keeps its current slot length, so the existing slot (and everyone booked in it)
 * stays where it is and the extra time becomes additional slots next to it. Without this, extending
 * 09:00-10:00 to 08:00-10:00 would stretch the single slot to 08:00 and strand the 09:00 bookings.
 */
export function effectiveSlotLength(args: {
  editing: SessionWindow | null;
  startTime: string;
  endTime: string;
  slotLength: number;
  wholeSession: boolean;
}): number {
  const windowMinutes = toMinutes(args.endTime) - toMinutes(args.startTime);
  if (!args.wholeSession) return args.slotLength;
  const old = args.editing;
  if (old) {
    const oldWindow = toMinutes(old.endTime) - toMinutes(old.startTime);
    const wasWholeSession = old.slotDurationMinutes === oldWindow;
    const onlyGrows = toMinutes(args.startTime) <= toMinutes(old.startTime) && toMinutes(args.endTime) >= toMinutes(old.endTime);
    if (wasWholeSession && onlyGrows && windowMinutes > oldWindow) return old.slotDurationMinutes;
  }
  return windowMinutes;
}

export function classifyWindowChange(before: SessionWindow, after: SessionWindow): WindowChange {
  const sameHours = before.startTime === after.startTime && before.endTime === after.endTime;
  if (sameHours && before.slotDurationMinutes === after.slotDurationMinutes) return "NONE";
  const startsEarlier = toMinutes(after.startTime) < toMinutes(before.startTime);
  const startsLater = toMinutes(after.startTime) > toMinutes(before.startTime);
  const endsLater = toMinutes(after.endTime) > toMinutes(before.endTime);
  const endsEarlier = toMinutes(after.endTime) < toMinutes(before.endTime);
  const grew = startsEarlier || endsLater;
  const shrank = startsLater || endsEarlier;
  if (grew && !shrank) return "EXPANDED";
  if (shrank && !grew) return "SHRUNK";
  return "CHANGED";
}

/** Where one booking stands against the new schedule. */
export function classifyBooking(
  booking: Pick<ElasticBooking, "appointmentDate" | "startTime">,
  after: SessionWindow & ScheduleFields
): BookingFit {
  if (!scheduleCoversDate(after, booking.appointmentDate)) return "OUTSIDE";
  const starts = slotStarts(after);
  if (starts.includes(booking.startTime)) return "KEPT";
  const t = toMinutes(booking.startTime);
  const windowStart = toMinutes(after.startTime);
  const usableEnd = starts.length
    ? toMinutes(starts[starts.length - 1]) + Math.max(1, after.slotDurationMinutes)
    : windowStart;
  if (t < windowStart || t >= usableEnd) return "OUTSIDE";
  return "OFF_GRID";
}

const listTimes = (times: string[], max = 4): string =>
  times.length <= max ? times.join(", ") : `${times.slice(0, max).join(", ")} and ${times.length - max} more`;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const byDateTime = (a: ElasticBooking, b: ElasticBooking) =>
  a.appointmentDate.localeCompare(b.appointmentDate) ||
  a.startTime.localeCompare(b.startTime) ||
  (a.tokenNumber ?? 0) - (b.tokenNumber ?? 0);

/**
 * Works out what an edit to a session's hours does to its slots and to the bookings already made
 * in it. `bookings` should be the upcoming appointments that currently occupy a seat in the session.
 */
export function analyzeSessionChange(
  before: SessionWindow,
  after: SessionWindow & ScheduleFields,
  bookings: ElasticBooking[]
): SessionChangeImpact {
  const change = classifyWindowChange(before, after);
  const oldStarts = new Set(slotStarts(before));
  const newStarts = new Set(slotStarts(after));
  const slotsAdded = [...newStarts].filter((s) => !oldStarts.has(s));
  const slotsRemoved = [...oldStarts].filter((s) => !newStarts.has(s));

  const outsideBookings: ElasticBooking[] = [];
  const offGridBookings: ElasticBooking[] = [];
  let keptBookings = 0;
  for (const b of bookings) {
    const fit = classifyBooking(b, after);
    if (fit === "KEPT") keptBookings++;
    else if (fit === "OUTSIDE") outsideBookings.push(b);
    else offGridBookings.push(b);
  }
  const affectedBookings = [...outsideBookings, ...offGridBookings].sort(byDateTime);

  const parts: string[] = [];
  if (change === "NONE") parts.push("The hours are unchanged.");
  if (slotsAdded.length) parts.push(`${plural(slotsAdded.length, "slot", "slots")} added (${listTimes(slotsAdded)}).`);
  if (slotsRemoved.length) parts.push(`${plural(slotsRemoved.length, "slot", "slots")} removed (${listTimes(slotsRemoved)}).`);
  if (change !== "NONE" && !slotsAdded.length && !slotsRemoved.length) parts.push("The slots stay the same.");
  if (keptBookings > 0) {
    parts.push(`${plural(keptBookings, "booked appointment is", "booked appointments are")} untouched.`);
  }
  if (affectedBookings.length > 0) {
    parts.push(
      `${plural(affectedBookings.length, "booked appointment is", "booked appointments are")} affected by the new hours.`
    );
  }

  return { change, slotsAdded, slotsRemoved, keptBookings, outsideBookings, offGridBookings, affectedBookings, summary: parts.join(" ") };
}

/**
 * Thrown by the repository when an edit would affect booked appointments and the doctor has not yet
 * said what should happen to them. Nothing has been saved when this is thrown.
 */
export class SessionChangeBlocked extends Error {
  public readonly code = "NEEDS_RESOLUTION" as const;
  public readonly impact: SessionChangeImpact;

  constructor(message: string, impact: SessionChangeImpact) {
    super(message);
    this.name = "SessionChangeBlocked";
    this.impact = impact;
  }
}

/**
 * Recognises a SessionChangeBlocked by its shape rather than with instanceof: Next.js can load the
 * same module twice (server actions and the repository are bundled separately), and instanceof
 * would then quietly fail.
 */
export function isSessionChangeBlocked(err: unknown): err is SessionChangeBlocked {
  const e = err as Partial<SessionChangeBlocked> | null;
  return !!e && e.name === "SessionChangeBlocked" && e.code === "NEEDS_RESOLUTION" && !!e.impact;
}

const describeBooking = (b: ElasticBooking) => `${b.appointmentDate} ${b.startTime}${b.patientName ? ` (${b.patientName})` : ""}`;

export function affectedMessage(impact: SessionChangeImpact): string {
  const sample = impact.affectedBookings.slice(0, 3).map(describeBooking).join(", ");
  return (
    `${plural(impact.affectedBookings.length, "booked appointment is", "booked appointments are")} affected by the new hours ` +
    `(${sample}${impact.affectedBookings.length > 3 ? ", ..." : ""}). ` +
    "Choose what happens to them: move them to the nearest free slot, cancel and refund them, or keep them as booked."
  );
}

// ---------------------------------------------------------------------------------------------
// Resolving the affected bookings
// ---------------------------------------------------------------------------------------------

/** A slot with at least one free seat, as the booking engine would offer it to a patient. */
export interface FreeSlot {
  date: string; // YYYY-MM-DD
  sessionId: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  seatsLeft: number;
}

/**
 * Free slots ordered by how little they disturb the patient: the earliest date first (their own day
 * if it has room), and on each date the time closest to the one they originally booked.
 */
export function rankRelocationCandidates(booking: ElasticBooking, slots: FreeSlot[]): FreeSlot[] {
  const wanted = toMinutes(booking.startTime);
  return slots
    .filter((s) => s.seatsLeft > 0 && s.date >= booking.appointmentDate)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        Math.abs(toMinutes(a.startTime) - wanted) - Math.abs(toMinutes(b.startTime) - wanted) ||
        a.startTime.localeCompare(b.startTime)
    );
}

/**
 * Dry run of MOVE: assigns each affected booking to the best free slot (counting seats as they are
 * used up) without moving anything, so the doctor can be told in advance how many would find a place.
 */
export function planRelocations(
  affected: ElasticBooking[],
  freeSlotsOn: (date: string) => FreeSlot[],
  options: { today: string; lastBookableDate: string; maxDaysAhead?: number }
): { movable: number; stuck: number } {
  const cache = new Map<string, FreeSlot[]>();
  const slotsOn = (date: string): FreeSlot[] => {
    if (!cache.has(date)) cache.set(date, freeSlotsOn(date).map((s) => ({ ...s })));
    return cache.get(date) as FreeSlot[];
  };
  const horizon = options.maxDaysAhead ?? 14;
  let movable = 0;
  for (const booking of [...affected].sort(byDateTime)) {
    const lastDate = [addDaysToDate(booking.appointmentDate, horizon), options.lastBookableDate].sort()[0];
    let placed = false;
    for (let date = booking.appointmentDate; date <= lastDate && !placed; date = addDaysToDate(date, 1)) {
      const best = rankRelocationCandidates(booking, slotsOn(date))[0];
      if (best) {
        best.seatsLeft -= 1;
        placed = true;
      }
    }
    if (placed) movable++;
  }
  return { movable, stuck: affected.length - movable };
}

export interface ResolutionDeps {
  /** Free slots the doctor offers on a date, read AFTER the new schedule has been saved. */
  freeSlots(date: string): Promise<FreeSlot[]>;
  /** Moves one appointment into a free slot (and tells the patient). */
  move(booking: ElasticBooking, target: FreeSlot): Promise<{ ok: boolean; message?: string }>;
  /** Cancels one appointment as the doctor (refund and email handled by the caller). */
  cancel(booking: ElasticBooking): Promise<{ ok: boolean; message?: string }>;
}

export interface ResolutionOptions {
  /** Hospital-time "today" (YYYY-MM-DD). */
  today: string;
  /** Furthest date patients can be moved to (the booking window), YYYY-MM-DD. */
  lastBookableDate: string;
  /** How many days after their own day a patient may be moved when their day is full. */
  maxDaysAhead?: number;
}

export interface ResolutionOutcome {
  resolution: BookingResolution;
  moved: Array<{ booking: ElasticBooking; to: FreeSlot }>;
  cancelled: ElasticBooking[];
  /** Still booked exactly as before: the doctor chose KEEP, or the booking could not be moved or cancelled. */
  kept: Array<{ booking: ElasticBooking; reason?: string }>;
  summary: string;
}

const MAX_MOVE_ATTEMPTS = 10;

/**
 * Applies the doctor's choice to the affected bookings. Never loses a booking: anything that cannot
 * be moved or cancelled simply stays booked as it was, and is reported in `kept`.
 */
export async function resolveAffectedBookings(
  resolution: BookingResolution,
  affected: ElasticBooking[],
  deps: ResolutionDeps,
  options: ResolutionOptions
): Promise<ResolutionOutcome> {
  const outcome: ResolutionOutcome = { resolution, moved: [], cancelled: [], kept: [], summary: "" };
  const ordered = [...affected].sort(byDateTime);

  if (resolution === "KEEP") {
    outcome.kept = ordered.map((booking) => ({ booking }));
  } else if (resolution === "CANCEL") {
    for (const booking of ordered) {
      const res = await deps.cancel(booking).catch((err) => ({ ok: false, message: String(err?.message ?? err) }));
      if (res.ok) outcome.cancelled.push(booking);
      else outcome.kept.push({ booking, reason: res.message || "It could not be cancelled." });
    }
  } else {
    const cache = new Map<string, FreeSlot[]>();
    const slotsOn = async (date: string): Promise<FreeSlot[]> => {
      if (!cache.has(date)) cache.set(date, (await deps.freeSlots(date)).map((s) => ({ ...s })));
      return cache.get(date) as FreeSlot[];
    };
    const horizon = options.maxDaysAhead ?? 14;

    for (const booking of ordered) {
      const lastDate = [addDaysToDate(booking.appointmentDate, horizon), options.lastBookableDate].sort()[0];
      let attempts = 0;
      let reason = "No free slot was found in the next few days.";
      let placed = false;

      for (let date = booking.appointmentDate; date <= lastDate && !placed && attempts < MAX_MOVE_ATTEMPTS; date = addDaysToDate(date, 1)) {
        for (const target of rankRelocationCandidates(booking, await slotsOn(date))) {
          if (attempts++ >= MAX_MOVE_ATTEMPTS) break;
          const res = await deps.move(booking, target).catch((err) => ({ ok: false, message: String(err?.message ?? err) }));
          if (res.ok) {
            target.seatsLeft -= 1;
            outcome.moved.push({ booking, to: target });
            placed = true;
            break;
          }
          if (res.message) reason = res.message;
        }
      }
      if (!placed) outcome.kept.push({ booking, reason });
    }
  }

  outcome.summary = describeOutcome(outcome);
  return outcome;
}

function describeOutcome(o: ResolutionOutcome): string {
  const parts: string[] = [];
  if (o.moved.length) {
    parts.push(
      `${plural(o.moved.length, "appointment was", "appointments were")} moved to the nearest free slot and the patient${o.moved.length === 1 ? " was" : "s were"} emailed.`
    );
  }
  if (o.cancelled.length) {
    parts.push(
      `${plural(o.cancelled.length, "appointment was", "appointments were")} cancelled (paid ones refunded in full) and the patient${o.cancelled.length === 1 ? " was" : "s were"} emailed.`
    );
  }
  if (o.kept.length) {
    parts.push(
      o.resolution === "KEEP"
        ? `${plural(o.kept.length, "appointment stays", "appointments stay")} booked as before.`
        : `${plural(o.kept.length, "appointment could not be changed and stays", "appointments could not be changed and stay")} booked as before.`
    );
  }
  return parts.join(" ");
}
