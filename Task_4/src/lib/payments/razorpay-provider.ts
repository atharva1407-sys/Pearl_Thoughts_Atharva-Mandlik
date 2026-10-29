import crypto from "crypto";
import {
  PaymentProvider,
  CreateOrderParams,
  OrderResult,
  VerifyCheckoutSignatureParams,
  VerifyWebhookParams,
  FetchOrderResult,
  CreateRefundParams,
  RefundResult,
} from "./types";

/** Builds a short error from Razorpay's JSON error (never the raw body, which may be long or echo input). */
async function razorpayError(res: Response, action: string): Promise<Error> {
  let detail = "";
  try {
    const data = await res.json();
    detail = String(data?.error?.description || data?.error?.code || "").slice(0, 160);
  } catch {
    // Non-JSON error body: ignore it
  }
  return new Error(`Razorpay ${action} failed (${res.status})${detail ? `: ${detail}` : ""}`);
}

export class RazorpayProvider implements PaymentProvider {
  public readonly name = "RAZORPAY" as const;
  public readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly baseUrl = "https://api.razorpay.com/v1";

  constructor(keyId: string, keySecret: string, webhookSecret?: string) {
    if (!keyId || !keySecret) {
      throw new Error("RazorpayProvider requires keyId and keySecret.");
    }
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret || "";
  }

  private get authHeader(): string {
    const creds = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");
    return `Basic ${creds}`;
  }

  public async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const res = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amountPaise,
        currency: params.currency || "INR",
        receipt: params.receipt,
        notes: params.notes,
      }),
    });

    if (!res.ok) {
      throw await razorpayError(res, "createOrder");
    }

    const data = await res.json();
    return {
      id: data.id,
      amount: data.amount,
      currency: data.currency,
      receipt: data.receipt,
      status: data.status,
    };
  }

  public verifyCheckoutSignature(params: VerifyCheckoutSignatureParams): boolean {
    const { orderId, paymentId, signature } = params;
    if (!orderId || !paymentId || !signature) return false;

    const payload = `${orderId}|${paymentId}`;
    const expected = crypto
      .createHmac("sha256", this.keySecret)
      .update(payload)
      .digest("hex");

    try {
      const sigBuf = Buffer.from(signature, "utf-8");
      const expBuf = Buffer.from(expected, "utf-8");
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  public verifyWebhook(params: VerifyWebhookParams): boolean {
    const { rawBody, signature } = params;
    if (!rawBody || !signature || !this.webhookSecret) return false;

    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(rawBody)
      .digest("hex");

    try {
      const sigBuf = Buffer.from(signature, "utf-8");
      const expBuf = Buffer.from(expected, "utf-8");
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  public async fetchOrder(orderId: string): Promise<FetchOrderResult> {
    const res = await fetch(`${this.baseUrl}/orders/${orderId}`, {
      method: "GET",
      headers: {
        Authorization: this.authHeader,
      },
    });

    if (!res.ok) {
      throw await razorpayError(res, "fetchOrder");
    }

    const data = await res.json();

    // The order lists the payment attempts made against it; we need the real payment id to confirm or refund.
    let payments: FetchOrderResult["payments"];
    try {
      const paymentsRes = await fetch(`${this.baseUrl}/orders/${orderId}/payments`, {
        method: "GET",
        headers: { Authorization: this.authHeader },
      });
      if (paymentsRes.ok) {
        const list = await paymentsRes.json();
        payments = (list.items || []).map((item: any) => ({
          id: item.id,
          status: item.status,
          amount: item.amount,
        }));
      }
    } catch {
      // Best effort: the caller treats a missing list as "unknown"
    }

    return {
      id: data.id,
      amount: data.amount,
      amountPaid: data.amount_paid,
      amountDue: data.amount_due,
      currency: data.currency,
      receipt: data.receipt,
      status: data.status,
      payments,
    };
  }

  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    const res = await fetch(`${this.baseUrl}/payments/${params.paymentId}/refund`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amountPaise,
        notes: params.notes,
        receipt: params.receipt,
      }),
    });

    if (!res.ok) {
      throw await razorpayError(res, "createRefund");
    }

    const data = await res.json();
    return {
      id: data.id,
      paymentId: data.payment_id,
      amount: data.amount,
      currency: data.currency,
      status: data.status === "processed" ? "processed" : data.status === "failed" ? "failed" : "pending",
    };
  }
}
