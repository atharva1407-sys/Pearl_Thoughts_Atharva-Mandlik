import type { MedrellaRepository, AppointmentEntity, PaymentEntity } from "@/db/repo";
import { formatPaise } from "./index";
import { createNotification, scheduleAppointmentReminders } from "@/lib/notifications";

/**
 * Everything that follows a paid, confirmed booking: the confirmation + receipt emails and the
 * reminders. Safe to call more than once (notifications and reminders are de-duplicated), so the
 * browser callback, the webhook and the expiry sweep can all use it.
 */
export async function finalizeConfirmedBooking(
  repo: MedrellaRepository,
  appointment: AppointmentEntity,
  payment: PaymentEntity
): Promise<void> {
  const patient = await repo.getPatientById(appointment.patientId);
  const user = patient ? await repo.getUserById(patient.userId) : undefined;
  const doctor = await repo.getDoctorById(appointment.doctorId);
  if (!patient || !user || !doctor) return;

  const patientName = `${patient.firstName} ${patient.lastName}`;
  const base = {
    patientName,
    doctorName: `${doctor.firstName} ${doctor.lastName}`,
    specialization: doctor.specialization,
    appointmentDate: appointment.appointmentDate,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    tokenNumber: appointment.tokenNumber,
    receiptNo: payment.receiptNo,
    amountFormatted: formatPaise(payment.amountPaise),
  };

  await createNotification(repo, {
    userId: user.id,
    appointmentId: appointment.id,
    channel: "EMAIL",
    template: "BOOKING_CONFIRMED",
    recipient: user.email,
    payload: base,
    dedupeKey: `confirm-${appointment.id}`,
  });

  await createNotification(repo, {
    userId: user.id,
    appointmentId: appointment.id,
    channel: "EMAIL",
    template: "PAYMENT_CONFIRMED",
    recipient: user.email,
    payload: { ...base, paymentId: payment.providerPaymentId ?? undefined },
    dedupeKey: `payment-confirmed-${payment.id}`,
  });

  await scheduleAppointmentReminders(repo, appointment, user.email, user.id, patientName, doctor);
}
