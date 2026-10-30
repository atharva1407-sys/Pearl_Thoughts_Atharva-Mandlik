import { MedrellaRepository, AppointmentEntity, DoctorEntity } from "../../db/repo";
import { formatPaise } from "../payments";
import { buildInstantFromKolkataTime } from "../time";
import { createNotification } from "./create";

export const DEFAULT_REMINDER_OFFSETS_MINUTES = [1440, 120]; // 24 hours and 2 hours

/**
 * Returns reminder offsets in minutes from environment variable.
 * Validates strictly, ignores non-positive / non-numeric tokens, and falls back to [1440, 120].
 */
export function getReminderOffsetsMinutes(): number[] {
  const envVal = process.env.REMINDER_OFFSETS_MINUTES;
  if (!envVal || typeof envVal !== "string") {
    return DEFAULT_REMINDER_OFFSETS_MINUTES;
  }

  const parsed = envVal
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && Number.isFinite(n) && n > 0);

  return parsed.length > 0 ? parsed : DEFAULT_REMINDER_OFFSETS_MINUTES;
}

/**
 * Creates outbox reminder notifications for a newly confirmed appointment.
 * Computes exact instants in Asia/Kolkata and skips any reminders whose scheduled instant
 * is already in the past.
 */
export async function scheduleAppointmentReminders(
  repo: MedrellaRepository,
  appointment: AppointmentEntity,
  recipientEmail: string,
  patientUserId: string,
  patientName: string,
  doctor: DoctorEntity,
  now: Date = new Date()
): Promise<number> {
  const offsets = getReminderOffsetsMinutes();
  const appointmentInstant = buildInstantFromKolkataTime(appointment.appointmentDate, appointment.startTime);

  let scheduledCount = 0;
  for (const offset of offsets) {
    const scheduledFor = new Date(appointmentInstant.getTime() - offset * 60 * 1000);

    // Only schedule reminders that are in the future
    if (scheduledFor.getTime() > now.getTime()) {
      const dedupeKey = `reminder-${appointment.id}-${offset}`;
      await createNotification(repo, {
        userId: patientUserId,
        appointmentId: appointment.id,
        channel: "EMAIL",
        category: "operational",
        template: "APPOINTMENT_REMINDER",
        recipient: recipientEmail,
        payload: {
          patientName,
          doctorName: `${doctor.firstName} ${doctor.lastName}`,
          specialization: doctor.specialization,
          appointmentDate: appointment.appointmentDate,
          startTime: appointment.startTime,
          endTime: appointment.endTime,
          tokenNumber: appointment.tokenNumber,
          amountFormatted: formatPaise(doctor.consultationFee * 100),
          reminderOffsetMinutes: offset,
        },
        scheduledFor,
        dedupeKey,
      });
      scheduledCount++;
    }
  }

  return scheduledCount;
}

/**
 * Cancels old reminders and creates new ones on appointment reschedule with latest details.
 */
export async function updateRescheduledReminders(
  repo: MedrellaRepository,
  appointment: AppointmentEntity,
  recipientEmail: string,
  patientUserId: string,
  patientName: string,
  doctor: DoctorEntity,
  now: Date = new Date()
): Promise<number> {
  await repo.cancelPendingNotificationsForAppointment(appointment.id, "APPOINTMENT_REMINDER");
  return scheduleAppointmentReminders(
    repo,
    appointment,
    recipientEmail,
    patientUserId,
    patientName,
    doctor,
    now
  );
}

/**
 * Cancels any pending reminders when an appointment is cancelled, completed, or expired.
 */
export async function cancelAppointmentReminders(
  repo: MedrellaRepository,
  appointmentId: string
): Promise<number> {
  return repo.cancelPendingNotificationsForAppointment(appointmentId, "APPOINTMENT_REMINDER");
}
