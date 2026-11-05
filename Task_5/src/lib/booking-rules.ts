import { dbRepo, dayOfWeekFor, toLocalDateString, type AvailabilityEntity, type DoctorEntity } from "@/db/repo";

import { buildInstantFromKolkataTime, istMinutesOfDay } from "./time";
import { formatDateLabel, sessionAppliesOnDate } from "./session-schedule";
export const MAX_BOOKING_DAYS_AHEAD = 30;
export const MIN_BOOKING_NOTICE_MINUTES = 15;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type SlotCheck =
  | { ok: true; doctor: DoctorEntity; session: AvailabilityEntity; endTime: string }
  | { ok: false; error: string };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** A visit can only be marked completed or no-show once its scheduled start time has arrived. */
export function hasAppointmentStarted(
  appointment: { appointmentDate: string; startTime: string },
  now: Date = new Date()
): boolean {
  const [year, month, day] = appointment.appointmentDate.split("-").map(Number);
  const [hours, minutes] = appointment.startTime.split(":").map(Number);
  return now.getTime() >= buildInstantFromKolkataTime(
    `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  ).getTime();
}

function toHHMM(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

/**
 * Server-side rules every requested slot must pass, for new bookings and reschedules alike.
 * The session and end time are always derived here from the doctor's own schedule, never
 * taken from the browser.
 */
export async function checkRequestedSlot(
  doctorId: string,
  date: string,
  startTime: string,
  now: Date = new Date()
): Promise<SlotCheck> {
  if (!DATE_RE.test(date) || Number.isNaN(new Date(date + "T00:00:00").getTime())) {
    return { ok: false, error: "Invalid date format (YYYY-MM-DD)." };
  }
  if (!TIME_RE.test(startTime)) {
    return { ok: false, error: "Invalid appointment slot time format." };
  }

  const today = toLocalDateString(now);
  if (date < today) {
    return { ok: false, error: "Cannot schedule appointments for past dates." };
  }
  const maxDate = new Date(now.getTime() + MAX_BOOKING_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  if (date > toLocalDateString(maxDate)) {
    return { ok: false, error: `Appointments can only be scheduled up to ${MAX_BOOKING_DAYS_AHEAD} days in advance.` };
  }

  const doctor = await dbRepo.getDoctorById(doctorId);
  if (!doctor) {
    return { ok: false, error: "The selected doctor could not be found." };
  }

  if (await dbRepo.isDoctorOnLeave(doctor.id, date)) {
    return { ok: false, error: `Dr. ${doctor.lastName} is on clinical leave on this date.` };
  }

  const daySessions = (await dbRepo.getAvailabilitiesByDoctorId(doctor.id)).filter((s) => sessionAppliesOnDate(s, date));
  if (daySessions.length === 0) {
    return {
      ok: false,
      error: `Dr. ${doctor.lastName} is not scheduled for outpatient consultations on ${formatDateLabel(date)} (${dayOfWeekFor(date)}).`,
    };
  }

  const startMinutes = toMinutes(startTime);
  const session = daySessions.find((s) => startMinutes >= toMinutes(s.startTime) && startMinutes < toMinutes(s.endTime));
  if (!session) {
    return { ok: false, error: "Requested time slot is outside of the physician's active consultation sessions." };
  }

  if ((startMinutes - toMinutes(session.startTime)) % session.slotDurationMinutes !== 0) {
    return { ok: false, error: "Requested time slot does not align with the doctor's consultation intervals." };
  }

  const endMinutes = startMinutes + session.slotDurationMinutes;
  if (endMinutes > toMinutes(session.endTime)) {
    return { ok: false, error: "Appointment slot exceeds the doctor's session closing time." };
  }

  if (date === today && startMinutes <= istMinutesOfDay(now) + MIN_BOOKING_NOTICE_MINUTES) {
    return {
      ok: false,
      error: `Cannot book a time slot in the past or starting in less than ${MIN_BOOKING_NOTICE_MINUTES} minutes.`,
    };
  }

  return { ok: true, doctor, session, endTime: toHHMM(endMinutes) };
}
