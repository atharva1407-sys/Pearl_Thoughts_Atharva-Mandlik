import { MedrellaRepository, dbRepo as sharedRepo } from "../../db/repo";
import { getPaymentProvider } from "./index";
import { PaymentProvider } from "./types";
import { findSuccessfulPaymentId } from "./binding";
import { issueRefund, retryStuckRefunds } from "./refunds";
import { finalizeConfirmedBooking } from "./finalize";

export interface SweepResult {
  sweptCount: number;
  expiredCount: number;
  recoveredCount: number;
  refundedCount: number;
  skippedCount: number;
  retriedRefunds: number;
}

/**
 * Releases expired seat holds. Before giving up on a hold it asks the gateway whether the order was
 * paid after all (a slow or delayed payment):
 *  - paid and the seat is still free  -> confirm the booking;
 *  - paid but the seat was taken      -> refund in full;
 *  - paid but the payment id is unknown -> leave it for the next sweep (never guess an id);
 *  - not paid                          -> expire the hold.
 * It also retries refund requests that were recorded but never reached the gateway.
 */
export async function sweepExpiredHolds(
  repo?: MedrellaRepository,
  providerOrDate?: PaymentProvider | Date,
  maybeDate: Date = new Date()
): Promise<SweepResult> {
  const dbRepo = repo || sharedRepo;
  let provider: PaymentProvider;
  let now: Date;

  if (providerOrDate instanceof Date) {
    provider = getPaymentProvider();
    now = providerOrDate;
  } else if (providerOrDate && typeof (providerOrDate as any).fetchOrder === "function") {
    provider = providerOrDate as PaymentProvider;
    now = maybeDate;
  } else {
    provider = getPaymentProvider();
    now = maybeDate;
  }

  const expiredHolds = await dbRepo.getExpiredHolds(now);
  const result: SweepResult = {
    sweptCount: expiredHolds.length,
    expiredCount: 0,
    recoveredCount: 0,
    refundedCount: 0,
    skippedCount: 0,
    retriedRefunds: 0,
  };

  for (const app of expiredHolds) {
    const payment = await dbRepo.getPaymentByAppointmentId(app.id);

    if (payment && payment.providerOrderId) {
      try {
        const order = await provider.fetchOrder(payment.providerOrderId);
        if (order.status === "paid" || (order.amountPaid && order.amountPaid > 0)) {
          const providerPaymentId = findSuccessfulPaymentId(order) ?? payment.providerPaymentId ?? undefined;
          if (!providerPaymentId) {
            // Paid, but we can't say which payment: never invent an id. Try again next sweep.
            console.warn(`[RECONCILIATION] Order ${payment.providerOrderId} is paid but has no payment id yet.`);
            result.skippedCount++;
            continue;
          }

          const confirmed = await dbRepo.confirmPaymentAndBookAppointment({
            appointmentId: app.id,
            paymentId: payment.id,
            providerPaymentId,
          });

          if (confirmed.refundNeeded) {
            await issueRefund(
              dbRepo,
              {
                payment: { ...(confirmed.payment ?? payment), providerPaymentId },
                appointmentId: app.id,
                amountPaise: payment.amountPaise,
                reason: "Your payment arrived after the seat hold expired and the slot was taken. Full refund.",
                purpose: "AUTO_REFUND_EXPIRED_SLOT",
              },
              provider
            );
            result.refundedCount++;
          } else if (confirmed.success && confirmed.appointment && confirmed.payment) {
            await finalizeConfirmedBooking(dbRepo, confirmed.appointment, confirmed.payment);
            result.recoveredCount++;
          } else {
            result.skippedCount++;
          }
          continue;
        }
      } catch (err) {
        console.warn(`[RECONCILIATION] Failed to fetch order ${payment.providerOrderId}:`, (err as Error).message);
        // Could not ask the gateway: don't release a hold that might have been paid. Retry next sweep.
        result.skippedCount++;
        continue;
      }
    }

    await dbRepo.expireAppointmentHold(app.id);
    if (payment && (payment.status === "CREATED" || payment.status === "PENDING")) {
      await dbRepo.updatePaymentStatus(payment.id, "EXPIRED", {
        failureReason: "Seat hold expired before checkout was completed.",
      });
    }
    result.expiredCount++;
  }

  const refunds = await retryStuckRefunds(dbRepo, provider, now);
  result.retriedRefunds = refunds.retried;

  return result;
}
