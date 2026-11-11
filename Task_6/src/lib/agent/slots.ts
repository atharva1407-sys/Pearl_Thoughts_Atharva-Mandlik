import type { MedrellaRepository } from "@/db/repo";
import { MAX_BOOKING_DAYS_AHEAD } from "../booking-rules";
import { addDaysToDate } from "../session-schedule";
import { istDateString, istMinutesOfDay } from "../time";

export interface OpenSlot {
  date: string;
  startTime: string;
  endTime: string;
  session: string;
  seatsLeft: number;
}

/** Slots starting sooner than this from now cannot be booked (matches the booking rules). */
const MIN_NOTICE_MINUTES = 15;

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Open (bookable) slots of one doctor on one date, in time order. Past and about-to-start slots are left out. */
export async function listOpenSlotsOnDate(
  repo: MedrellaRepository,
  doctorId: string,
  date: string,
  now: Date
): Promise<{ onLeave: boolean; slots: OpenSlot[] }> {
  const data = await repo.computeSessionGroups(doctorId, date);
  if (data.isLeave) return { onLeave: true, slots: [] };
  const isToday = date === istDateString(now);
  const nowMinutes = istMinutesOfDay(now);
  const slots = data.groups
    .flatMap((g) =>
      g.slots
        .filter((s) => !s.isBooked && s.seatsLeft > 0)
        .map((s) => ({ date, startTime: s.startTime, endTime: s.endTime, session: g.sessionName, seatsLeft: s.seatsLeft }))
    )
    .filter((s) => !isToday || toMinutes(s.startTime) > nowMinutes + MIN_NOTICE_MINUTES)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  return { onLeave: false, slots };
}

/**
 * The open slots closest to what the patient asked for: first on the same day (nearest to the
 * preferred time), then the earliest slots on the following days.
 */
export async function findAlternativeSlots(
  repo: MedrellaRepository,
  input: {
    doctorId: string;
    date: string;
    preferredTime?: string;
    /** A slot to leave out, e.g. the appointment's current time when rescheduling. */
    exclude?: { date: string; startTime: string };
    now: Date;
    limit?: number;
    searchDays?: number;
  }
): Promise<OpenSlot[]> {
  const limit = input.limit ?? 6;
  const searchDays = Math.min(input.searchDays ?? 7, MAX_BOOKING_DAYS_AHEAD + 1);
  const today = istDateString(input.now);
  const lastDate = istDateString(new Date(input.now.getTime() + MAX_BOOKING_DAYS_AHEAD * 24 * 3600 * 1000));
  const preferred = input.preferredTime ? toMinutes(input.preferredTime) : null;
  const isExcluded = (s: OpenSlot) => input.exclude?.date === s.date && input.exclude.startTime === s.startTime;

  const result: OpenSlot[] = [];
  const start = input.date < today ? today : input.date;
  for (let i = 0; i < searchDays && result.length < limit; i++) {
    const date = addDaysToDate(start, i);
    if (date > lastDate) break;
    const { slots } = await listOpenSlotsOnDate(repo, input.doctorId, date, input.now);
    const usable = slots.filter((s) => !isExcluded(s));
    if (i === 0 && preferred !== null) {
      usable.sort((a, b) => Math.abs(toMinutes(a.startTime) - preferred) - Math.abs(toMinutes(b.startTime) - preferred));
    }
    result.push(...usable.slice(0, i === 0 ? 3 : 2));
  }
  return result.slice(0, limit);
}

/** The first open slot of a doctor from a date onwards, looking up to `searchDays` days ahead. */
export async function findNextOpenSlot(
  repo: MedrellaRepository,
  doctorId: string,
  fromDate: string,
  now: Date,
  searchDays = MAX_BOOKING_DAYS_AHEAD
): Promise<OpenSlot | null> {
  const [first] = await findAlternativeSlots(repo, { doctorId, date: fromDate, now, limit: 1, searchDays });
  return first ?? null;
}
