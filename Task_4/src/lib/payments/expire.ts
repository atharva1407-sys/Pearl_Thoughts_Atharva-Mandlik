import { MedrellaRepository } from "../../db/repo";
import { getPaymentProvider } from "./index";
import { PaymentProvider } from "./types";

export async function sweepExpiredHolds(
  repo?: MedrellaRepository,
  providerOrDate?: PaymentProvider | Date,
  maybeDate: Date = new Date()
): Promise<{ sweptCount: number; expiredCount: number; recoveredCount: number }> {
  const dbRepo = repo || new MedrellaRepository();
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
  let expiredCount = 0;
  let recoveredCount = 0;

  for (const app of expiredHolds) {
    const payment = await dbRepo.getPaymentByAppointmentId(app.id);

    // If there's an associated provider order, fetch its live status from Razorpay/Mock
    if (payment && payment.providerOrderId) {
      try {
        const order = await provider.fetchOrder(payment.providerOrderId);
        if (order.status === "paid" || (order.amountPaid && order.amountPaid > 0)) {
          // Payment actually succeeded! Reconcile and confirm or auto-refund
          const paymentId =
            order.payments && order.payments.length > 0
              ? order.payments[0].id
              : `pay_reconciled_${Date.now()}`;

          await dbRepo.confirmPaymentAndBookAppointment({
            appointmentId: app.id,
            paymentId: payment.id,
            providerPaymentId: paymentId,
          });
          recoveredCount++;
          continue;
        }
      } catch (err) {
        console.warn(`[RECONCILIATION] Failed to fetch order ${payment.providerOrderId}:`, (err as Error).message);
      }
    }

    // Otherwise mark expired
    await dbRepo.expireAppointmentHold(app.id);
    if (payment && payment.status === "CREATED") {
      await dbRepo.updatePaymentStatus(payment.id, "EXPIRED", {
        failureReason: "Seat hold expired before checkout was completed.",
      });
    }
    expiredCount++;
  }

  return {
    sweptCount: expiredHolds.length,
    expiredCount,
    recoveredCount,
  };
}
