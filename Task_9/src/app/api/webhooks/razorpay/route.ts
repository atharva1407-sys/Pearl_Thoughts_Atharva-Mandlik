import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { dbRepo } from "@/db/repo";
import type { PaymentEntity, RefundEntity } from "@/db/repo";
import { getPaymentProvider } from "@/lib/payments";
import { applyRefundStatus, issueRefund } from "@/lib/payments/refunds";
import { finalizeConfirmedBooking } from "@/lib/payments/finalize";
import { processDueNotifications } from "@/lib/notifications";
import { runInBackground } from "@/lib/background";

export const runtime = "nodejs";

/** An event still marked PROCESSING after this long is treated as abandoned and may be retried. */
const STALE_PROCESSING_MS = 2 * 60 * 1000;

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body" }, { status: 400 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing x-razorpay-signature header" }, { status: 400 });
  }

  let provider;
  try {
    provider = getPaymentProvider();
  } catch (err) {
    console.error("[WEBHOOK_CONFIG_ERROR]", (err as Error).message);
    return NextResponse.json({ error: "Payments are not configured" }, { status: 503 });
  }

  // 1. The signature is computed over the exact raw body.
  if (!provider.verifyWebhook({ rawBody, signature })) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  let eventData: any;
  try {
    eventData = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType: string = eventData.event || "unknown";
  const eventId: string =
    request.headers.get("x-razorpay-event-id") ||
    eventData.event_id ||
    `evt_${crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 24)}`;

  // 2. Record the event first. A re-delivery is skipped only if the earlier attempt really finished.
  const recorded = await dbRepo.recordPaymentEvent({
    id: `pevt-${crypto.randomUUID()}`,
    provider: provider.name,
    providerEventId: eventId,
    type: eventType,
    payload: eventData,
    outcome: "PROCESSING",
  });

  if (recorded.duplicate) {
    const previous = recorded.event;
    const outcome = previous.outcome ?? "";
    const abandoned =
      outcome === "PROCESSING" && Date.now() - new Date(previous.processedAt).getTime() > STALE_PROCESSING_MS;
    if (outcome === "PROCESSED" || (outcome === "PROCESSING" && !abandoned)) {
      return NextResponse.json({ message: "Duplicate webhook event already handled", eventId }, { status: 200 });
    }
    // FAILED or abandoned: fall through and process it again.
    await dbRepo.updatePaymentEventOutcome(previous.id, "PROCESSING");
  }
  const eventRowId = recorded.event.id;

  // 3. Process. Any error answers 5xx so Razorpay re-delivers; the event is not lost.
  try {
    await handleEvent(provider, eventType, eventData);
    await dbRepo.updatePaymentEventOutcome(eventRowId, "PROCESSED");
    runInBackground(async () => {
      await processDueNotifications(dbRepo);
    });
    return NextResponse.json({ success: true, eventId, type: eventType }, { status: 200 });
  } catch (err) {
    console.error("[WEBHOOK_HANDLER_ERROR]", eventType, err);
    await dbRepo.updatePaymentEventOutcome(eventRowId, `FAILED: ${(err as Error).message}`.slice(0, 200));
    return NextResponse.json({ success: false, error: "Event processing failed; will be retried", eventId }, { status: 500 });
  }
}

async function handleEvent(provider: ReturnType<typeof getPaymentProvider>, eventType: string, eventData: any) {
  switch (eventType) {
    case "payment.captured":
    case "order.paid":
      return handlePaymentCaptured(provider, eventData);
    case "payment.failed":
      return handlePaymentFailed(provider, eventData);
    case "refund.created":
    case "refund.processed":
    case "refund.failed":
      return handleRefundEvent(provider, eventType, eventData);
    default:
      return; // Acknowledge events we don't act on
  }
}

async function handlePaymentCaptured(provider: ReturnType<typeof getPaymentProvider>, eventData: any) {
  const paymentEntity = eventData.payload?.payment?.entity;
  const orderEntity = eventData.payload?.order?.entity;
  const orderId: string | undefined = paymentEntity?.order_id || orderEntity?.id;
  const providerPaymentId: string | undefined = paymentEntity?.id;
  if (!orderId) return;

  const payment = await dbRepo.getPaymentByProviderOrderId(provider.name, orderId);
  if (!payment) return;

  // The amount the gateway captured must be what we charged.
  const capturedAmount: number | undefined = paymentEntity?.amount;
  if (capturedAmount !== undefined && capturedAmount < payment.amountPaise) {
    throw new Error(`Captured amount ${capturedAmount} is below the charged amount ${payment.amountPaise}`);
  }

  const result = await dbRepo.confirmPaymentAndBookAppointment({
    appointmentId: payment.appointmentId,
    paymentId: payment.id,
    providerPaymentId: providerPaymentId || payment.providerPaymentId || undefined,
  });

  if (result.refundNeeded) {
    await refundLatePayment(provider, result.payment ?? payment, providerPaymentId);
    return;
  }
  if (result.success && result.appointment && result.payment) {
    await finalizeConfirmedBooking(dbRepo, result.appointment, result.payment);
  }
}

/** Money was taken but the seat is gone: refund it in full (once), and tell the patient. */
async function refundLatePayment(
  provider: ReturnType<typeof getPaymentProvider>,
  payment: PaymentEntity,
  providerPaymentId?: string
) {
  // Make sure the refund can find the real payment reference.
  const withReference: PaymentEntity = {
    ...payment,
    providerPaymentId: providerPaymentId || payment.providerPaymentId,
  };
  await issueRefund(
    dbRepo,
    {
      payment: withReference,
      appointmentId: payment.appointmentId,
      amountPaise: payment.amountPaise,
      reason: "Your payment arrived after the seat hold expired and the slot was taken. Full refund.",
      purpose: "AUTO_REFUND_EXPIRED_SLOT",
    },
    provider
  );
}

async function handlePaymentFailed(provider: ReturnType<typeof getPaymentProvider>, eventData: any) {
  const paymentEntity = eventData.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id;
  if (!orderId) return;

  const payment = await dbRepo.getPaymentByProviderOrderId(provider.name, orderId);
  if (!payment || payment.status === "PAID" || payment.status === "REFUNDED" || payment.status === "PARTIALLY_REFUNDED") {
    return;
  }

  // Razorpay lets the customer retry on the same order, so one failed attempt must NOT release the
  // seat. Record the reason; the hold simply expires if no attempt succeeds in time.
  await dbRepo.updatePaymentStatus(payment.id, payment.status, {
    failureReason: String(paymentEntity?.error_description || "Payment attempt failed at checkout").slice(0, 200),
  });
}

async function handleRefundEvent(provider: ReturnType<typeof getPaymentProvider>, eventType: string, eventData: any) {
  const entity = eventData.payload?.refund?.entity;
  const providerRefundId: string | undefined = entity?.id;
  const providerPaymentId: string | undefined = entity?.payment_id;
  if (!providerRefundId) return;

  const status =
    eventType === "refund.processed" ? "PROCESSED" : eventType === "refund.failed" ? "FAILED" : "PENDING";
  const failureReason =
    status === "FAILED" ? String(entity?.error_description || "Refund failed at the payment gateway").slice(0, 200) : undefined;

  // The webhook carries Razorpay's PAYMENT id (pay_...), not the order id.
  const payment = providerPaymentId ? await dbRepo.getPaymentByProviderPaymentId(provider.name, providerPaymentId) : undefined;

  let refund: RefundEntity | undefined = await dbRepo.getRefundByProviderRefundId(providerRefundId);

  if (!refund && payment) {
    // The event can beat our own bookkeeping: attach it to the matching refund we haven't labelled yet.
    const mine = await dbRepo.getRefundsByPaymentId(payment.id);
    refund = mine.find((r) => !r.providerRefundId && r.amountPaise === entity?.amount && r.status !== "PROCESSED");
  }

  if (!refund && payment) {
    // A refund made outside this app (e.g. from the Razorpay dashboard): record it so history stays truthful.
    refund = await dbRepo.createRefund({
      id: `ref-${crypto.randomUUID()}`,
      paymentId: payment.id,
      appointmentId: payment.appointmentId,
      amountPaise: Number(entity?.amount ?? 0),
      reason: "Refund issued from the payment gateway dashboard",
      status: "REQUESTED",
      providerRefundId,
      idempotencyKey: `external_${providerRefundId}`,
      failureReason: null,
    });
  }

  if (!refund) return; // Unknown payment: nothing of ours to update
  await applyRefundStatus(dbRepo, refund, status, { providerRefundId, failureReason });
}
