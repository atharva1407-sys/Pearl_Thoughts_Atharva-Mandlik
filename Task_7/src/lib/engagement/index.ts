import type { MedrellaRepository, PatientEntity } from "@/db/repo";
import { createNotification } from "../notifications/create";
import { istDateString } from "../time";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PATIENTS_PER_SWEEP = 500;

export interface EngagementSettings {
  /** Days after the last completed visit before a check-up reminder is sent. */
  careReminderDays: number;
  /** Days after the last completed visit before a "we miss you" message is sent. */
  reengageDays: number;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getEngagementSettings(): EngagementSettings {
  const careReminderDays = positiveInt(process.env.ENGAGEMENT_CARE_REMINDER_DAYS, 90);
  const reengageDays = Math.max(
    positiveInt(process.env.ENGAGEMENT_REENGAGE_DAYS, 180),
    careReminderDays + 1
  );
  return { careReminderDays, reengageDays };
}

export { istDateString };

export interface EngagementSweepResult {
  followUpsQueued: number;
  careRemindersQueued: number;
  reengagementsQueued: number;
  skippedNoConsent: number;
  patientsChecked: number;
}

/**
 * Proactive patient engagement. Safe to run repeatedly: every message has a deterministic
 * dedupe key, so a patient is never messaged twice for the same visit or month.
 *
 *  - FOLLOW_UP_VISIT (operational): once, 1 to 3 days after a completed consultation.
 *  - CARE_REMINDER (promotional, opt-in): last completed visit is old enough, nothing upcoming.
 *  - REENGAGEMENT  (promotional, opt-in): last visit is much older, nothing upcoming.
 *
 * Promotional messages are dropped by createNotification unless the patient opted in.
 */
export async function runEngagementSweep(
  repo: MedrellaRepository,
  now: Date = new Date(),
  settings: EngagementSettings = getEngagementSettings()
): Promise<EngagementSweepResult> {
  const result: EngagementSweepResult = {
    followUpsQueued: 0,
    careRemindersQueued: 0,
    reengagementsQueued: 0,
    skippedNoConsent: 0,
    patientsChecked: 0,
  };

  // 1. Follow-ups after completed visits.
  const from = istDateString(new Date(now.getTime() - 3 * DAY_MS));
  const to = istDateString(new Date(now.getTime() - DAY_MS));
  const completed = await repo.getAppointmentsInRange(from, to, ["COMPLETED"]);
  for (const appointment of completed) {
    const patient = await repo.getPatientById(appointment.patientId);
    const user = patient ? await repo.getUserById(patient.userId) : undefined;
    if (!patient || !user || user.isActive === false) continue;
    const doctor = await repo.getDoctorById(appointment.doctorId);
    const queued = await createNotification(repo, {
      userId: user.id,
      appointmentId: appointment.id,
      template: "FOLLOW_UP_VISIT",
      category: "operational",
      recipient: user.email,
      dedupeKey: `followup-${appointment.id}`,
      payload: {
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}` : undefined,
        appointmentDate: appointment.appointmentDate,
      },
    });
    if (queued) result.followUpsQueued++;
  }

  // 2. Care reminders and re-engagement for patients who have not visited for a while.
  const today = istDateString(now);
  const monthKey = today.slice(0, 7);
  let offset = 0;
  while (offset < MAX_PATIENTS_PER_SWEEP) {
    const patients = await repo.getPatientsPage(PAGE_SIZE, offset);
    if (patients.length === 0) break;
    offset += patients.length;
    for (const patient of patients) {
      result.patientsChecked++;
      await engageIfDue(repo, patient, now, today, monthKey, settings, result);
    }
    if (patients.length < PAGE_SIZE) break;
  }

  return result;
}

async function engageIfDue(
  repo: MedrellaRepository,
  patient: PatientEntity,
  now: Date,
  today: string,
  monthKey: string,
  settings: EngagementSettings,
  result: EngagementSweepResult
): Promise<void> {
  const appointments = await repo.getAppointmentsByPatientId(patient.id);
  const hasUpcoming = appointments.some(
    (a) => (a.status === "BOOKED" || a.status === "PENDING_PAYMENT") && a.appointmentDate >= today
  );
  if (hasUpcoming) return;

  const lastCompleted = appointments
    .filter((a) => a.status === "COMPLETED")
    .map((a) => a.appointmentDate)
    .sort()
    .pop();
  if (!lastCompleted) return;

  const daysSince = Math.floor((now.getTime() - new Date(`${lastCompleted}T00:00:00+05:30`).getTime()) / DAY_MS);
  const template =
    daysSince >= settings.reengageDays
      ? "REENGAGEMENT"
      : daysSince >= settings.careReminderDays
        ? "CARE_REMINDER"
        : null;
  if (!template) return;

  const user = await repo.getUserById(patient.userId);
  if (!user || user.isActive === false) return;

  const queued = await createNotification(repo, {
    userId: user.id,
    template,
    category: "promotional",
    recipient: user.email,
    dedupeKey: `${template.toLowerCase()}-${patient.id}-${monthKey}`,
    payload: { patientName: `${patient.firstName} ${patient.lastName}` },
  });
  if (queued) {
    if (template === "REENGAGEMENT") result.reengagementsQueued++;
    else result.careRemindersQueued++;
  } else {
    result.skippedNoConsent++;
  }
}
