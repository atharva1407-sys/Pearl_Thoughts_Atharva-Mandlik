import { MedrellaRepository, AppointmentEntity, DoctorEntity, UserEntity } from "../../db/repo";
import { formatPaise } from "../payments";

/**
 * Returns reminder offsets in minutes from environment variable (default: 1440, 120 -> 24h and 2h).
 */
export function getReminderOffsetsMinutes(): number[] {
  const envVal = process.env.REMINDER_OFFSETS_MINUTES || "1440,120";
  return envVal
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * Creates outbox reminder notifications for a newly confirmed appointment.
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
  const appointmentStart = new Date(`${appointment.appointmentDate}T${appointment.startTime}:00`);

  let scheduledCount = 0;
  for (const offset of offsets) {
    const scheduledFor = new Date(appointmentStart.getTime() - offset * 60 * 1000);

    // Only schedule future reminders
    if (scheduledFor.getTime() > now.getTime()) {
      const dedupeKey = `reminder-${appointment.id}-${offset}`;
      await repo.createNotification({
        id: `notif-${crypto.randomUUID()}`,
        userId: patientUserId,
        appointmentId: appointment.id,
        channel: "EMAIL",
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
        status: "PENDING",
        scheduledFor,
        attempts: 0,
        dedupeKey,
      });
      scheduledCount++;
    }
  }

  return scheduledCount;
}

/**
 * Cancels old reminders and creates new ones on appointment reschedule.
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
