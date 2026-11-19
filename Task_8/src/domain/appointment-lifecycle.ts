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

/**
 * Unified authorization helper for managing appointments across all clinical roles:
 * - Receptionist: check in (same-day), mark unavailable, reschedule, cancel, mark no-show, view queue for any doctor.
 *   Cannot start or complete consultations (CALL, COMPLETE).
 * - Doctor: can perform all actions on appointments assigned to their own schedule only.
 * - Patient: can only CANCEL or RESCHEDULE their own appointments.
 */
export function canManageAppointment(
  user: { role: "PATIENT" | "DOCTOR" | "RECEPTIONIST"; profileId: string; userId?: string } | null,
  appointment: { doctorId: string; patientId: string; appointmentDate: string },
  action?: ManageAppointmentAction,
  now: Date = new Date()
): boolean {
  if (!user) return false;

  const targetAction = action ?? "RESCHEDULE";

  if (user.role === "RECEPTIONIST") {
    // Receptionist can check in, mark unavailable, reschedule, cancel, mark no-show, view queue
    if (targetAction === "CHECK_IN") {
      const today = istDateString(now);
      return appointment.appointmentDate === today;
    }
    if (
      targetAction === "UNAVAILABLE" ||
      targetAction === "RESCHEDULE" ||
      targetAction === "CANCEL" ||
      targetAction === "NO_SHOW" ||
      targetAction === "VIEW_QUEUE"
    ) {
      return true;
    }
    // Strictly forbidden: starting or completing consultations
    return false;
  }

  if (user.role === "DOCTOR") {
    // Doctor can only manage their own patients
    if (appointment.doctorId !== user.profileId) return false;
    if (targetAction === "CHECK_IN") {
      const today = istDateString(now);
      return appointment.appointmentDate === today;
    }
    return true;
  }

  if (user.role === "PATIENT") {
    // Patient can only CANCEL and RESCHEDULE their own appointments
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
