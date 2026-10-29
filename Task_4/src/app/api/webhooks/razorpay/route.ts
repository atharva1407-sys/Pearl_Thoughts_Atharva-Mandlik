import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { dbRepo } from "@/db/repo";
import { getPaymentProvider, formatPaise } from "@/lib/payments";
import { buildRefundIdempotencyKey } from "@/lib/refund-policy";
import {
  scheduleAppointmentReminders,
  processDueNotifications,
} from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (err: any) {
    return NextResponse.json({ error: "Could not read request body" }, { status: 400 });
  }

  const signature = request.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing x-razorpay-signature header" }, { status: 400 });
  }

  const provider = getPaymentProvider();

  // 1. Verify webhook signature
  const isValid = provider.verifyWebhook({
    rawBody,
    signature,
  });

  if (!isValid) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  let eventData: any;
  try {
    eventData = JSON.parse(rawBody);
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType: string = eventData.event || "unknown";
  const eventId: string =
    eventData.event_id ||
    request.headers.get("x-razorpay-event-id") ||
    `evt_${crypto.createHash("sha256").update(rawBody).digest("hex").slice(0, 24)}`;

  // 2. Insert into payment_events first for strict idempotency
  const eventRecord = await dbRepo.recordPaymentEvent({
    id: `pevt-${crypto.randomUUID()}`,
    provider: provider.name,
    providerEventId: eventId,
    type: eventType,
    payload: eventData,
  });

  if (eventRecord.duplicate) {
    // Known duplicate event -> acknowledge immediately with 200 and exit
    return NextResponse.json(
      { message: "Duplicate webhook event already processed", eventId },
      { status: 200 }
    );
  }

  // 3. Handle event types
  try {
    switch (eventType) {
      case "payment.captured":
      case "order.paid": {
        const paymentEntity = eventData.payload?.payment?.entity;
        const orderEntity = eventData.payload?.order?.entity;

        const orderId: string | undefined = paymentEntity?.order_id || orderEntity?.id;
        const providerPaymentId: string | undefined = paymentEntity?.id;

        if (orderId) {
          const payment = await dbRepo.getPaymentByProviderOrderId(provider.name, orderId);
          if (payment) {
            const confirmResult = await dbRepo.confirmPaymentAndBookAppointment({
              appointmentId: payment.appointmentId,
              paymentId: payment.id,
              providerPaymentId: providerPaymentId || payment.providerPaymentId || undefined,
            });

            if (confirmResult.refundNeeded && providerPaymentId) {
              // Edge case: Late payment after hold expired & slot taken
              // Automatic 100% refund
              let refundStatus: "PROCESSED" | "FAILED" = "PROCESSED";
              let providerRefundId: string | null = null;
              let failureReason: string | null = null;

              try {
                const refundRes = await provider.createRefund({
                  paymentId: providerPaymentId,
                  amountPaise: payment.amountPaise,
                  reason: "Seat hold expired and slot was taken by another patient",
                });
                providerRefundId = refundRes.id;
              } catch (err: any) {
                refundStatus = "FAILED";
                failureReason = err.message;
              }

              await dbRepo.createRefund({
                id: `ref-${crypto.randomUUID()}`,
                paymentId: payment.id,
                appointmentId: payment.appointmentId,
                amountPaise: payment.amountPaise,
                reason: "Seat hold expired and slot was taken by another patient",
                status: refundStatus,
                providerRefundId,
                idempotencyKey: buildRefundIdempotencyKey(payment.id, payment.appointmentId, "AUTO_REFUND_EXPIRED_SLOT"),
                failureReason,
              });

              const patient = await dbRepo.getPatientById(payment.patientId);
              const user = patient ? await dbRepo.getUserById(patient.userId) : undefined;
              if (user) {
                await dbRepo.createNotification({
                  id: `notif-${crypto.randomUUID()}`,
                  userId: user.id,
                  appointmentId: payment.appointmentId,
                  channel: "EMAIL",
                  template: "REFUND_NOTIFICATION",
                  recipient: user.email,
                  payload: {
                    patientName: patient ? `${patient.firstName} ${patient.lastName}` : "Patient",
                    appointmentDate: confirmResult.appointment?.appointmentDate || "Scheduled Date",
                    refundAmountFormatted: formatPaise(payment.amountPaise),
                    refundPercentage: 100,
                    reason: "Your hold expired and the slot was taken. A full refund has been initiated.",
                    status: refundStatus,
                  },
                  status: "PENDING",
                  scheduledFor: new Date(),
                  attempts: 0,
                  dedupeKey: `refund-auto-${payment.id}`,
                });
              }
            } else if (confirmResult.success && confirmResult.appointment) {
              const appointment = confirmResult.appointment;
              const doctor = await dbRepo.getDoctorById(appointment.doctorId);
              const patient = await dbRepo.getPatientById(appointment.patientId);
              const user = patient ? await dbRepo.getUserById(patient.userId) : undefined;

              if (user && doctor && patient) {
                await dbRepo.createNotification({
                  id: `notif-${crypto.randomUUID()}`,
                  userId: user.id,
                  appointmentId: appointment.id,
                  channel: "EMAIL",
                  template: "BOOKING_CONFIRMATION",
                  recipient: user.email,
                  payload: {
                    patientName: `${patient.firstName} ${patient.lastName}`,
                    doctorName: `${doctor.firstName} ${doctor.lastName}`,
                    specialization: doctor.specialization,
                    appointmentDate: appointment.appointmentDate,
                    startTime: appointment.startTime,
                    endTime: appointment.endTime,
                    tokenNumber: appointment.tokenNumber,
                    receiptNo: payment.receiptNo,
                    amountFormatted: formatPaise(payment.amountPaise),
                  },
                  status: "PENDING",
                  scheduledFor: new Date(),
                  attempts: 0,
                  dedupeKey: `confirm-${appointment.id}`,
                });

                await scheduleAppointmentReminders(
                  dbRepo,
                  appointment,
                  user.email,
                  user.id,
                  `${patient.firstName} ${patient.lastName}`,
                  doctor
                );
              }
            }
          }
        }
        break;
      }

      case "payment.failed": {
        const paymentEntity = eventData.payload?.payment?.entity;
        const orderId = paymentEntity?.order_id;
        const errorDesc = paymentEntity?.error_description || "Payment failed at checkout";

        if (orderId) {
          const payment = await dbRepo.getPaymentByProviderOrderId(provider.name, orderId);
          if (payment) {
            await dbRepo.updatePaymentStatus(payment.id, "FAILED", {
              failureReason: errorDesc,
            });
            // Release the hold so the seat is free for other patients or retries
            await dbRepo.expireAppointmentHold(payment.appointmentId);
          }
        }
        break;
      }

      case "refund.processed":
      case "refund.created": {
        const refundEntity = eventData.payload?.refund?.entity;
        const providerRefundId = refundEntity?.id;
        const paymentId = refundEntity?.payment_id;

        if (providerRefundId || paymentId) {
          // Look up refund by providerRefundId or payment
          const payment = paymentId ? await dbRepo.getPaymentByProviderOrderId(provider.name, paymentId) : undefined;
          const refunds = payment ? await dbRepo.getRefundsByPaymentId(payment.id) : [];
          const targetRefund =
            refunds.find((r) => r.providerRefundId === providerRefundId) || refunds[0];

          if (targetRefund) {
            await dbRepo.updateRefundStatus(targetRefund.id, "PROCESSED", {
              providerRefundId: providerRefundId || targetRefund.providerRefundId,
            });
          }

          if (payment) {
            await dbRepo.updatePaymentStatus(payment.id, "REFUNDED");
          }
        }
        break;
      }

      case "refund.failed": {
        const refundEntity = eventData.payload?.refund?.entity;
        const providerRefundId = refundEntity?.id;
        if (providerRefundId) {
          // Find and mark as failed
          const paymentId = refundEntity?.payment_id;
          const payment = paymentId ? await dbRepo.getPaymentByProviderOrderId(provider.name, paymentId) : undefined;
          const refunds = payment ? await dbRepo.getRefundsByPaymentId(payment.id) : [];
          const targetRefund = refunds.find((r) => r.providerRefundId === providerRefundId);
          if (targetRefund) {
            await dbRepo.updateRefundStatus(targetRefund.id, "FAILED", {
              failureReason: refundEntity?.error_description || "Refund processing failed",
            });
          }
        }
        break;
      }

      default:
        // Acknowledge unhandled events safely
        break;
    }

    // Trigger notification processing in background
    processDueNotifications(dbRepo).catch(() => {});

    return NextResponse.json({ success: true, eventId, type: eventType }, { status: 200 });
  } catch (err: any) {
    console.error("[WEBHOOK_HANDLER_ERROR]", err);
    // Return 200 so Razorpay does not endlessly hammer with re-deliveries on internal edge errors
    return NextResponse.json({ success: false, error: err.message, eventId }, { status: 200 });
  }
}
