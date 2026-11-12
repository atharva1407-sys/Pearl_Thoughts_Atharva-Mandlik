import { dbRepo, type AppointmentEntity, type AppointmentStatus } from "@/db/repo";
import { checkRequestedSlot, hasAppointmentStarted, type SlotCheck } from "@/lib/booking-rules";
import { computeRefund, type ComputeRefundResult } from "@/lib/refund-policy";
import { formatPaise } from "@/lib/payments";

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

const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING_PAYMENT: ["BOOKED", "EXPIRED", "CANCELLED"],
  BOOKED: ["COMPLETED", "NO_SHOW", "CANCELLED", "BOOKED"],
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
   * Assesses whether an appointment can be cancelled and calculates refund eligibility.
   */
  static async assessCancellation(
    appointmentId: string,
    cancelledBy: "PATIENT" | "DOCTOR",
    now: Date = new Date()
  ): Promise<CancellationAssessment> {
    const appointment = await dbRepo.getAppointmentById(appointmentId);
    if (!appointment) {
      throw new DomainError("NOT_FOUND", "Appointment not found.");
    }

    if (appointment.status !== "BOOKED" && appointment.status !== "PENDING_PAYMENT") {
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
