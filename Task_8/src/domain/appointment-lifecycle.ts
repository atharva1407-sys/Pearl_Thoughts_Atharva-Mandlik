import { dbRepo, type AppointmentEntity, type AppointmentStatus } from "@/db/repo";
import { checkRequestedSlot, hasAppointmentStarted, type SlotCheck } from "@/lib/booking-rules";
import { computeRefund, type ComputeRefundResult } from "@/lib/refund-policy";
import { formatPaise } from "@/lib/payments";
import { istDateString } from "@/lib/time";

export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export interface CancellationAssessment {
  eligible: boolean;
  appointment: AppointmentEntity;
  refund: ComputeRefundResult;
  reason?: string;
}

export type ManageAppointmentAction =
  | "CHECK_IN"
  | "UNAVAILABLE"
  | "RESCHEDULE"
  | "CANCEL"
  | "NO_SHOW"
  | "CALL"
  | "COMPLETE"
  | "VIEW_QUEUE";

/** Facts about the clinic that the permission rules need; loaded from the database by the caller. */
export interface ManageContext {
  /** Doctors this receptionist is assigned to. A receptionist is denied for every other doctor. */
  assignedDoctorIds?: readonly string[];
  /**
   * Whether the appointment's doctor has at least one assigned receptionist.
   * Only `false` lets the doctor do front-desk work themselves (so a solo doctor is never stuck).
   */
  doctorHasReceptionist?: boolean;
}

type SessionUser = { role: "PATIENT" | "DOCTOR" | "RECEPTIONIST"; profileId: string; userId?: string };

/** The queue controls a role sees, so pages can hide what the role cannot use. */
export interface QueueControls {
  canCall: boolean;
  canComplete: boolean;
  canCheckIn: boolean;
  canMarkUnavailable: boolean;
  canMarkNoShow: boolean;
}

/**
 * Role split for the live queue:
 *  - Doctor: Call and Complete.
 *  - Receptionist (assigned to that doctor): Check In, Unavailable (then reschedule) and No-Show.
 *  - A doctor with NO receptionist gets the front-desk controls too, so a solo doctor is never stuck.
 * The same rule feeds the server-side checks below, so a hidden button cannot be used by calling the action directly.
 */
export function getQueueControls(
  role: "PATIENT" | "DOCTOR" | "RECEPTIONIST",
  doctorHasReceptionist: boolean
): QueueControls {
  if (role === "DOCTOR") {
    const frontDesk = !doctorHasReceptionist;
    return {
      canCall: true,
      canComplete: true,
      canCheckIn: frontDesk,
      canMarkUnavailable: frontDesk,
      canMarkNoShow: frontDesk,
    };
  }
  if (role === "RECEPTIONIST") {
    return { canCall: false, canComplete: false, canCheckIn: true, canMarkUnavailable: true, canMarkNoShow: true };
  }
  return { canCall: false, canComplete: false, canCheckIn: false, canMarkUnavailable: false, canMarkNoShow: false };
}

/**
 * Unified authorization helper for managing appointments (deny by default):
 * - Receptionist: Check In (same day), Unavailable, No-Show, Cancel, Reschedule and View Queue, ONLY for doctors they are
 *   assigned to (`ctx.assignedDoctorIds`). Never Call or Complete.
 * - Doctor: own appointments only. Call, Complete, Cancel, Reschedule and View Queue always; Check In, Unavailable and
 *   No-Show only while the doctor has no receptionist (`ctx.doctorHasReceptionist === false`).
 * - Patient: Cancel or Reschedule their own appointments only.
 */
export function canManageAppointment(
  user: SessionUser | null,
  appointment: { doctorId: string; patientId: string; appointmentDate: string },
  action?: ManageAppointmentAction,
  now: Date = new Date(),
  ctx: ManageContext = {}
): boolean {
  if (!user) return false;

  const targetAction = action ?? "RESCHEDULE";
  const isToday = () => appointment.appointmentDate === istDateString(now);

  if (user.role === "RECEPTIONIST") {
    if (targetAction === "CALL" || targetAction === "COMPLETE") return false;
    if (!ctx.assignedDoctorIds?.includes(appointment.doctorId)) return false;
    if (targetAction === "CHECK_IN") return isToday();
    return true;
  }

  if (user.role === "DOCTOR") {
    if (appointment.doctorId !== user.profileId) return false;
    if (targetAction === "CHECK_IN" || targetAction === "UNAVAILABLE" || targetAction === "NO_SHOW") {
      if (ctx.doctorHasReceptionist !== false) return false;
      return targetAction === "CHECK_IN" ? isToday() : true;
    }
    return true;
  }

  if (user.role === "PATIENT") {
    if (appointment.patientId !== user.profileId) return false;
    return targetAction === "CANCEL" || targetAction === "RESCHEDULE";
  }

  return false;
}

const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING_PAYMENT: ["BOOKED", "EXPIRED", "CANCELLED"],
  BOOKED: ["CHECKED_IN", "IN_CONSULTATION", "COMPLETED", "NO_SHOW", "CANCELLED", "BOOKED"],
  CHECKED_IN: ["IN_CONSULTATION", "COMPLETED", "CANCELLED", "BOOKED", "CHECKED_IN"],
  IN_CONSULTATION: ["COMPLETED", "CANCELLED", "IN_CONSULTATION"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  EXPIRED: ["CANCELLED"],
};

/**
 * Domain coordinator encapsulating appointment business invariants,
 * lifecycle state machine, refund rules, validation, and notification side-effects.
 */
export class AppointmentLifecycle {
  static canManageAppointment = canManageAppointment;

  /**
   * Validates whether a state transition is legal in the clinical lifecycle.
   */
  static isValidTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
    if (from === to) return true;
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  /**
   * Asserts that a state transition is permitted, throwing a DomainError otherwise.
   */
  static assertValidTransition(from: AppointmentStatus, to: AppointmentStatus): void {
    if (!this.isValidTransition(from, to)) {
      throw new DomainError(
        "INVALID_TRANSITION",
        `Cannot transition appointment from status ${from} to ${to}. Terminal and illegal transitions are blocked.`
      );
    }
  }

  /**
   * Asserts that an appointment can be marked unavailable (must be currently CHECKED_IN).
   */
  static assertCanMarkUnavailable(appointment: { status: AppointmentStatus }): void {
    if (appointment.status !== "CHECKED_IN") {
      throw new DomainError(
        "INVALID_STATUS",
        `Cannot mark patient unavailable. Patient status is ${appointment.status}. Only CHECKED_IN patients can be marked unavailable.`
      );
    }
  }

  /**
   * Assesses whether an appointment can be cancelled and calculates refund eligibility.
   */
  static async assessCancellation(
    appointmentId: string,
    cancelledBy: "PATIENT" | "DOCTOR" | "RECEPTIONIST",
    now: Date = new Date()
  ): Promise<CancellationAssessment> {
    const appointment = await dbRepo.getAppointmentById(appointmentId);
    if (!appointment) {
      throw new DomainError("NOT_FOUND", "Appointment not found.");
    }

    if (
      appointment.status !== "BOOKED" &&
      appointment.status !== "PENDING_PAYMENT" &&
      appointment.status !== "CHECKED_IN" &&
      appointment.status !== "IN_CONSULTATION"
    ) {
      return {
        eligible: false,
        appointment,
        refund: computeRefund({
          amountPaidPaise: 0,
          appointmentDate: appointment.appointmentDate,
          startTime: appointment.startTime,
          cancelledBy,
          now,
        }),
        reason: `Appointment is already ${appointment.status.toLowerCase().replace("_", " ")}.`,
      };
    }

    const payment = await dbRepo.getPaymentByAppointmentId(appointmentId);
    const amountPaidPaise = payment?.status === "PAID" ? payment.amountPaise : 0;

    const refund = computeRefund({
      amountPaidPaise,
      appointmentDate: appointment.appointmentDate,
      startTime: appointment.startTime,
      cancelledBy,
      now,
    });

    return {
      eligible: true,
      appointment,
      refund,
    };
  }

  /**
   * Validates a prospective slot against doctor availability, leaves, and time boundaries.
   */
  static async validateSlot(
    doctorId: string,
    date: string,
    startTime: string,
    now: Date = new Date()
  ): Promise<SlotCheck> {
    return checkRequestedSlot(doctorId, date, startTime, now);
  }

  /**
   * Checks if an appointment has started or passed.
   */
  static isStarted(
    appointment: { appointmentDate: string; startTime: string },
    now: Date = new Date()
  ): boolean {
    return hasAppointmentStarted(appointment, now);
  }

  /**
   * Helper to format refund summary for messaging and receipts.
   */
  static formatRefundSummary(refund: ComputeRefundResult): string {
    const formattedAmount = formatPaise(refund.refundAmountPaise);
    if (refund.refundAmountPaise === 0) {
      return "No refund applicable per the clinic cancellation policy.";
    }
    return `Eligible for a ${refund.refundPercentage}% refund (${formattedAmount}).`;
  }
}
