import { dbRepo, type AppointmentEntity } from "@/db/repo";
import {
  canManageAppointment,
  type ManageAppointmentAction,
  type ManageContext,
} from "@/domain/appointment-lifecycle";

type SessionUser = { role: "PATIENT" | "DOCTOR" | "RECEPTIONIST"; profileId: string; userId?: string };

/**
 * Loads the clinic facts the permission rules need for this user and appointment:
 * a receptionist's assigned doctors, or whether the appointment's doctor has a receptionist at all.
 */
export async function loadManageContext(
  user: SessionUser,
  appointment: Pick<AppointmentEntity, "doctorId">
): Promise<ManageContext> {
  if (user.role === "RECEPTIONIST") {
    return { assignedDoctorIds: await dbRepo.getAssignedDoctorIds(user.profileId) };
  }
  if (user.role === "DOCTOR") {
    return { doctorHasReceptionist: await dbRepo.doctorHasReceptionist(appointment.doctorId) };
  }
  return {};
}

/** Server-side gate used by every appointment action: true only when this user may perform `action`. */
export async function isAllowedToManage(
  user: SessionUser | null,
  appointment: Pick<AppointmentEntity, "doctorId" | "patientId" | "appointmentDate">,
  action: ManageAppointmentAction,
  now: Date = new Date()
): Promise<boolean> {
  if (!user) return false;
  const ctx = await loadManageContext(user, appointment);
  return canManageAppointment(user, appointment, action, now, ctx);
}
