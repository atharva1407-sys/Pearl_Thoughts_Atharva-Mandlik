import { dbRepo } from "@/db/repo";
import type {
  AppointmentEntity,
  DoctorEntity,
  PrescriptionEntity,
  VisitRecordEntity,
} from "@/db/repositories/types";
import { resolveRecordAccess, type RecordAccess } from "@/domain/medical-history";
import { formatKolkataDateTime } from "@/lib/time";

type SessionUser = { role: "PATIENT" | "DOCTOR" | "RECEPTIONIST"; profileId: string; userId: string };

/**
 * The patient record that belongs to this signed-in user: a patient's own, or the record of a doctor who also
 * registered as a patient. Receptionists have none.
 */
export async function resolveOwnPatientId(user: SessionUser): Promise<string | undefined> {
  if (user.role === "PATIENT") return user.profileId;
  if (user.role === "DOCTOR") return (await dbRepo.getPatientByUserId(user.userId))?.id;
  return undefined;
}

/** Server-side gate for every medical-record page and action: who is this user to this patient? */
export async function getPatientRecordAccess(
  user: SessionUser | null,
  patientId: string
): Promise<RecordAccess & { isOwnRecord: boolean }> {
  if (!user || user.role === "RECEPTIONIST") return { canView: false, canEdit: false, isOwnRecord: false };
  const isOwnRecord = (await resolveOwnPatientId(user)) === patientId;
  const doctorHasTreated =
    !isOwnRecord && user.role === "DOCTOR" ? await dbRepo.doctorHasTreatedPatient(user.profileId, patientId) : false;
  return { ...resolveRecordAccess(user, { isOwnRecord, doctorHasTreated }), isOwnRecord };
}

/** One visit as shown in a history: the appointment, its doctor, and whatever was recorded about it. */
export interface VisitHistoryItem {
  appointment: AppointmentEntity & { doctor: DoctorEntity };
  record?: VisitRecordEntity;
  prescription?: PrescriptionEntity;
}

/** "Last updated 12 Nov 2026, 4:05 pm by Dr. Ananya Sharma", or null when nothing has been saved yet. */
export function profileUpdatedLabel(
  profile: { updatedAt: Date; updatedByName?: string | null } | undefined
): string | null {
  if (!profile) return null;
  return `Last updated ${formatKolkataDateTime(profile.updatedAt)}${profile.updatedByName ? ` by ${profile.updatedByName}` : ""}`;
}

/** Whole years between a YYYY-MM-DD birth date and `now`, or null when the date is missing or invalid. */
export function ageFromDateOfBirth(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null;
  const [y, m, d] = dob.split("-").map(Number);
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

/** Every appointment of a patient with its visit record and prescription attached (unordered; see `splitVisits`). */
export async function loadVisitHistory(patientId: string): Promise<VisitHistoryItem[]> {
  const [appointments, records, prescriptions] = await Promise.all([
    dbRepo.getAppointmentsByPatientId(patientId),
    dbRepo.getVisitRecordsByPatientId(patientId),
    dbRepo.getPrescriptionsByPatientId(patientId),
  ]);
  const recordByAppt = new Map(records.map((r) => [r.appointmentId, r]));
  const rxByAppt = new Map(prescriptions.map((p) => [p.appointmentId, p]));
  return appointments.map((appointment) => ({
    appointment,
    record: recordByAppt.get(appointment.id),
    prescription: rxByAppt.get(appointment.id),
  }));
}
