import type { AppointmentEntity } from "@/db/repo";
import { istDateString } from "./time";

export interface WaitingQueueItem<T extends AppointmentEntity = AppointmentEntity> {
  appointment: T;
  queuePosition: number; // 1, 2, 3... (strictly dynamic, no gaps)
  estimatedWaitMinutes: number;
}

export interface DoctorQueueSummary<T extends AppointmentEntity = AppointmentEntity> {
  date: string;
  nowServing: T | null;
  waiting: WaitingQueueItem<T>[];
  notArrived: T[];
  finished: T[];
  missed: T[];
  totalExpected: number;
  totalCheckedIn: number;
}

export interface QueueComputeOptions {
  targetDate?: string;
  now?: Date;
  defaultSlotDurationMinutes?: number;
  slotDurationMinutes?: number;
}

/**
 * Normalizes a check-in timestamp to milliseconds epoch.
 */
function toEpochMs(d?: Date | string | null): number {
  if (!d) return 0;
  if (typeof d === "string") return new Date(d).getTime();
  return d.getTime();
}

/**
 * Pure queue calculation algorithm.
 * No database queries inside -> 100% deterministic and unit-testable.
 */
export function computeDoctorQueue<T extends AppointmentEntity = AppointmentEntity>(
  appointments: T[],
  options?: QueueComputeOptions
): DoctorQueueSummary<T> {
  const now = options?.now ?? new Date();
  const targetDate = options?.targetDate ?? istDateString(now);
  const slotDuration = options?.slotDurationMinutes ?? options?.defaultSlotDurationMinutes ?? 20;

  // 1. Filter to target date only
  const dayAppointments = appointments.filter((a) => a.appointmentDate === targetDate);

  // 2. Identify nowServing (status === "IN_CONSULTATION")
  const inConsultationList = dayAppointments.filter((a) => a.status === "IN_CONSULTATION");
  // In case of edge cases with multiple, pick earliest consultationStartedAt or lowest token
  inConsultationList.sort((a, b) => {
    const timeA = toEpochMs(a.consultationStartedAt);
    const timeB = toEpochMs(b.consultationStartedAt);
    if (timeA !== timeB) return timeA - timeB;
    return a.tokenNumber - b.tokenNumber;
  });
  const nowServing = inConsultationList.length > 0 ? inConsultationList[0] : null;

  // 3. Compute remaining time for currently serving patient
  let activeRemainingMinutes = 0;
  if (nowServing) {
    if (nowServing.consultationStartedAt) {
      const startedMs = toEpochMs(nowServing.consultationStartedAt);
      const elapsedMs = Math.max(0, now.getTime() - startedMs);
      const elapsedMinutes = Math.floor(elapsedMs / 60_000);
      activeRemainingMinutes = Math.max(0, slotDuration - elapsedMinutes);
    } else {
      activeRemainingMinutes = slotDuration;
    }
  }

  // 4. Identify and order checked-in waiting patients
  // Status MUST be CHECKED_IN
  const rawWaiting = dayAppointments.filter((a) => a.status === "CHECKED_IN");

  rawWaiting.sort((a, b) => {
    const timeA = toEpochMs(a.checkedInAt);
    const timeB = toEpochMs(b.checkedInAt);
    if (timeA !== timeB) {
      return timeA - timeB; // Earliest check-in first
    }
    return a.tokenNumber - b.tokenNumber; // Tie break by permanent token number
  });

  const waiting: WaitingQueueItem<T>[] = rawWaiting.map((appointment, idx) => {
    const queuePosition = idx + 1; // 1-indexed, contiguous without gaps
    const estimatedWaitMinutes = activeRemainingMinutes + idx * slotDuration;
    return {
      appointment,
      queuePosition,
      estimatedWaitMinutes,
    };
  });

  // 5. Identify not yet arrived patients (status === "BOOKED" without check-in)
  const notArrived = dayAppointments.filter((a) => a.status === "BOOKED" && !a.checkedInAt);
  notArrived.sort((a, b) => {
    if (a.startTime !== b.startTime) {
      return a.startTime.localeCompare(b.startTime);
    }
    return a.tokenNumber - b.tokenNumber;
  });

  // 6. Finished (COMPLETED)
  const finished = dayAppointments.filter((a) => a.status === "COMPLETED");
  finished.sort((a, b) => a.tokenNumber - b.tokenNumber);

  // 7. Missed / Inactive (NO_SHOW, CANCELLED, EXPIRED)
  const missed = dayAppointments.filter(
    (a) => a.status === "NO_SHOW" || a.status === "CANCELLED" || a.status === "EXPIRED"
  );
  missed.sort((a, b) => a.tokenNumber - b.tokenNumber);

  const totalExpected = (nowServing ? 1 : 0) + waiting.length + notArrived.length + finished.length;
  const totalCheckedIn = (nowServing ? 1 : 0) + waiting.length + finished.length;

  return {
    date: targetDate,
    nowServing,
    waiting,
    notArrived,
    finished,
    missed,
    totalExpected,
    totalCheckedIn,
  };
}

export interface PatientQueueStatus {
  appointment: AppointmentEntity | null;
  status: AppointmentEntity["status"] | null;
  isCheckedIn: boolean;
  isInConsultation: boolean;
  isCompleted: boolean;
  queuePosition: number | null;
  estimatedWaitMinutes: number | null;
  nowServingToken: number | null;
  patientsAhead: number;
}

/**
 * Calculates a privacy-safe queue status snapshot for an individual patient.
 * Zero exposure of other patients' personal names, phones, or details.
 */
export function computePatientQueueStatus(
  doctorAppointments: AppointmentEntity[],
  patientAppointmentId: string,
  options?: QueueComputeOptions
): PatientQueueStatus {
  const queue = computeDoctorQueue(doctorAppointments, options);
  const targetAppt = doctorAppointments.find((a) => a.id === patientAppointmentId) ?? null;

  if (!targetAppt) {
    return {
      appointment: null,
      status: null,
      isCheckedIn: false,
      isInConsultation: false,
      isCompleted: false,
      queuePosition: null,
      estimatedWaitMinutes: null,
      nowServingToken: null,
      patientsAhead: 0,
    };
  }

  const nowServingToken = queue.nowServing ? queue.nowServing.tokenNumber : null;
  const isInConsultation = targetAppt.status === "IN_CONSULTATION";
  const isCompleted = targetAppt.status === "COMPLETED";
  const isCheckedIn = targetAppt.status === "CHECKED_IN" || isInConsultation || isCompleted;

  const waitingEntry = queue.waiting.find((w) => w.appointment.id === targetAppt.id);
  const queuePosition = waitingEntry ? waitingEntry.queuePosition : null;
  const estimatedWaitMinutes = waitingEntry ? waitingEntry.estimatedWaitMinutes : isInConsultation ? 0 : null;
  const patientsAhead = queuePosition !== null ? Math.max(0, queuePosition - 1) : 0;

  return {
    appointment: targetAppt,
    status: targetAppt.status,
    isCheckedIn,
    isInConsultation,
    isCompleted,
    queuePosition,
    estimatedWaitMinutes,
    nowServingToken,
    patientsAhead,
  };
}
