/**
 * Pure, unit-tested refund policy calculator for Medrella appointments.
 *
 * Policy:
 * - Patient cancels >= 24h before appointment start: 100% refund.
 * - Patient cancels between 2h and 24h before start: 50% refund.
 * - Patient cancels < 2h before start: 0% refund.
 * - Doctor cancels (or System cancel): 100% refund at any time.
 * - No-Show: 0% refund.
 * - Reschedule: Free (retains existing payment).
 * - Refund amount is capped at (amountPaidPaise - alreadyRefundedPaise).
 */

export interface ComputeRefundInput {
  appointmentDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  cancelledBy: "PATIENT" | "DOCTOR" | "SYSTEM";
  amountPaidPaise: number;
  alreadyRefundedPaise?: number;
  now?: Date;
}

export interface ComputeRefundResult {
  eligible: boolean;
  refundPercentage: number; // 0, 50, 100
  refundAmountPaise: number;
  hoursUntilStart: number;
  reason: string;
}

export function computeRefund(input: ComputeRefundInput): ComputeRefundResult {
  const {
    appointmentDate,
    startTime,
    cancelledBy,
    amountPaidPaise,
    alreadyRefundedPaise = 0,
    now = new Date(),
  } = input;

  const remainingRefundable = Math.max(0, amountPaidPaise - alreadyRefundedPaise);
  if (remainingRefundable <= 0 || amountPaidPaise <= 0) {
    return {
      eligible: false,
      refundPercentage: 0,
      refundAmountPaise: 0,
      hoursUntilStart: 0,
      reason: "No refundable balance remaining on this payment.",
    };
  }

  // Doctor or System cancellations are always 100% refunded
  if (cancelledBy === "DOCTOR" || cancelledBy === "SYSTEM") {
    return {
      eligible: true,
      refundPercentage: 100,
      refundAmountPaise: remainingRefundable,
      hoursUntilStart: 0,
      reason: "Full 100% refund issued due to clinic / doctor cancellation.",
    };
  }

  // Calculate hours until appointment start
  // Appointment date and start time in local hospital time
  const appointmentStart = new Date(`${appointmentDate}T${startTime}:00`);
  const diffMs = appointmentStart.getTime() - now.getTime();
  const hoursUntilStart = diffMs / (1000 * 60 * 60);

  if (hoursUntilStart >= 24) {
    return {
      eligible: true,
      refundPercentage: 100,
      refundAmountPaise: remainingRefundable,
      hoursUntilStart,
      reason: "100% refund eligible (cancellation requested >= 24 hours prior to appointment).",
    };
  }

  if (hoursUntilStart >= 2) {
    const rawHalf = Math.floor(amountPaidPaise * 0.5);
    const refundAmount = Math.min(rawHalf, remainingRefundable);
    return {
      eligible: true,
      refundPercentage: 50,
      refundAmountPaise: refundAmount,
      hoursUntilStart,
      reason: "50% refund eligible (cancellation requested between 2 and 24 hours prior).",
    };
  }

  return {
    eligible: false,
    refundPercentage: 0,
    refundAmountPaise: 0,
    hoursUntilStart,
    reason: "No refund applicable (cancellation requested less than 2 hours before appointment).",
  };
}

/**
 * Generates a deterministic idempotency key for a refund request.
 */
export function buildRefundIdempotencyKey(
  paymentId: string,
  appointmentId: string,
  purpose: string = "cancellation"
): string {
  return `rfnd_key_${paymentId}_${appointmentId}_${purpose}`;
}
