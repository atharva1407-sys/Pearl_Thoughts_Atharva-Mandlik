/**
 * Elastic scheduling: pure rules for what happens when a doctor stretches or shrinks the hours of
 * an existing OPD session (for example 10:00-12:00 becoming 09:00-12:00, or 10:00-11:00).
 *
 * No database or framework imports, so the repository, the doctor's form and the tests all work out
 * the same answer. The one promise this module exists to keep: editing a session never moves,
 * cancels or loses a booked appointment. Bookings are classified against the NEW schedule:
 *
 *   KEPT      the booking still sits on a slot of the new schedule, nothing to do
 *   OUTSIDE   the new hours (or dates) no longer cover it. It stays booked and honoured; the doctor
 *             has to confirm the change knowingly, and can reschedule the patient afterwards
 *   OFF_GRID  it falls inside the new hours but between two new slots (a changed slot length or an
 *             odd start time), which would let a second patient overlap it. The change is refused
 */

import { scheduleCoversDate, type ScheduleFields } from "./session-schedule";

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

export interface SessionChangeImpact {
  change: WindowChange;
  /** Start times of slots that exist in the new schedule but not the old one. */
  slotsAdded: string[];
  /** Start times of slots that existed before and are gone now. */
  slotsRemoved: string[];
  /** Upcoming bookings that still sit on a slot. */
  keptBookings: number;
  /** Upcoming bookings that stay booked but are no longer covered by the session. */
  outsideBookings: ElasticBooking[];
  /** Upcoming bookings that fall between new slots. The change is refused while any exist. */
  offGridBookings: ElasticBooking[];
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

  const parts: string[] = [];
  if (change === "NONE") parts.push("The hours are unchanged.");
  if (slotsAdded.length) parts.push(`${plural(slotsAdded.length, "slot", "slots")} added (${listTimes(slotsAdded)}).`);
  if (slotsRemoved.length) parts.push(`${plural(slotsRemoved.length, "slot", "slots")} removed (${listTimes(slotsRemoved)}).`);
  if (change !== "NONE" && !slotsAdded.length && !slotsRemoved.length) parts.push("The slots stay the same.");
  if (keptBookings > 0) {
    parts.push(`${plural(keptBookings, "booked appointment is", "booked appointments are")} untouched.`);
  }
  if (outsideBookings.length > 0) {
    parts.push(
      `${plural(outsideBookings.length, "booked appointment stays", "booked appointments stay")} booked outside the new hours.`
    );
  }

  return { change, slotsAdded, slotsRemoved, keptBookings, outsideBookings, offGridBookings, summary: parts.join(" ") };
}

/** Thrown when an edit would affect booked appointments in a way the doctor has to resolve or confirm. */
export class SessionChangeBlocked extends Error {
  public readonly code: "NEEDS_CONFIRMATION" | "OFF_GRID";
  public readonly impact: SessionChangeImpact;

  constructor(code: "NEEDS_CONFIRMATION" | "OFF_GRID", message: string, impact: SessionChangeImpact) {
    super(message);
    this.name = "SessionChangeBlocked";
    this.code = code;
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
  return !!e && e.name === "SessionChangeBlocked" && (e.code === "NEEDS_CONFIRMATION" || e.code === "OFF_GRID") && !!e.impact;
}

const describeBooking = (b: ElasticBooking) => `${b.appointmentDate} ${b.startTime}${b.patientName ? ` (${b.patientName})` : ""}`;

export function offGridMessage(impact: SessionChangeImpact): string {
  const sample = impact.offGridBookings.slice(0, 3).map(describeBooking).join(", ");
  return (
    `This change would leave ${plural(impact.offGridBookings.length, "booked appointment", "booked appointments")} between slots ` +
    `(${sample}${impact.offGridBookings.length > 3 ? ", ..." : ""}). ` +
    "Keep the start time and slot length so those bookings stay on a slot, or reschedule or cancel them first."
  );
}

export function outsideMessage(impact: SessionChangeImpact): string {
  const sample = impact.outsideBookings.slice(0, 3).map(describeBooking).join(", ");
  return (
    `${plural(impact.outsideBookings.length, "booked appointment falls", "booked appointments fall")} outside the new hours ` +
    `(${sample}${impact.outsideBookings.length > 3 ? ", ..." : ""}). ` +
    "They stay booked and are not cancelled. Confirm to apply the change."
  );
}
