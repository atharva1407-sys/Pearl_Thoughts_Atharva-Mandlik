/**
 * Webhook Simulation Script for Medrella Task 4.
 * Signs payloads using HMAC-SHA256 and sends test events to the local webhook endpoint.
 *
 * Usage:
 *   npx tsx scripts/simulate-webhook.ts [captured|failed|refund|tampered] [orderId] [paymentId]
 */

import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/api/webhooks/razorpay";
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "mock_webhook_secret_67890";

async function main() {
  const mode = process.argv[2] || "captured";
  const orderId = process.argv[3] || `order_mock_${Date.now()}`;
  const paymentId = process.argv[4] || `pay_mock_${Date.now()}`;
  const eventId = `evt_sim_${Date.now()}`;

  let eventType = "payment.captured";
  let payload: any = {};

  if (mode === "captured") {
    eventType = "payment.captured";
    payload = {
      entity: "event",
      account_id: "acc_ruby_hall",
      event: eventType,
      contains: ["payment"],
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: "payment",
            amount: 80000,
            currency: "INR",
            status: "captured",
            order_id: orderId,
            method: "card",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };
  } else if (mode === "failed") {
    eventType = "payment.failed";
    payload = {
      entity: "event",
      account_id: "acc_ruby_hall",
      event: eventType,
      contains: ["payment"],
      payload: {
        payment: {
          entity: {
            id: paymentId,
            entity: "payment",
            amount: 80000,
            currency: "INR",
            status: "failed",
            order_id: orderId,
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Card balance insufficient",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };
  } else if (mode === "refund") {
    eventType = "refund.processed";
    payload = {
      entity: "event",
      account_id: "acc_ruby_hall",
      event: eventType,
      contains: ["refund"],
      payload: {
        refund: {
          entity: {
            id: `rfnd_mock_${Date.now()}`,
            entity: "refund",
            amount: 80000,
            currency: "INR",
            payment_id: paymentId,
            status: "processed",
            created_at: Math.floor(Date.now() / 1000),
          },
        },
      },
      created_at: Math.floor(Date.now() / 1000),
    };
  } else if (mode === "tampered") {
    eventType = "payment.captured";
    payload = {
      entity: "event",
      event: eventType,
      payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
    };
  }

  const rawBody = JSON.stringify(payload);
  const signature =
    mode === "tampered"
      ? "invalid_tampered_signature_1234567890"
      : crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");

  console.log(`Sending simulated webhook [${mode}]:`);
  console.log(`URL: ${WEBHOOK_URL}`);
  console.log(`Event ID: ${eventId}`);
  console.log(`Event Type: ${eventType}`);
  console.log(`Signature: ${signature}`);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-razorpay-signature": signature,
        "x-razorpay-event-id": eventId,
      },
      body: rawBody,
    });

    const status = res.status;
    const body = await res.json().catch(() => null);
    console.log(`Response status: ${status}`);
    console.log("Response body:", body);
  } catch (err: any) {
    console.error("Simulation failed to connect (is server running?):", err.message);
  }
}

main().catch(console.error);
