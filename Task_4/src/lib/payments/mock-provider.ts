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

export class MockProvider implements PaymentProvider {
  public readonly name = "MOCK" as const;
  private readonly mockSecret: string;
  private readonly mockWebhookSecret: string;

  // In-memory store for orders and refunds created in test / local mode
  public orders = new Map<string, FetchOrderResult>();
  public refunds = new Map<string, RefundResult>();

  constructor(
    secret: string = "mock_secret_key_12345",
    webhookSecret: string = "mock_webhook_secret_67890"
  ) {
    this.mockSecret = secret;
    this.mockWebhookSecret = webhookSecret;
  }

  public async createOrder(params: CreateOrderParams): Promise<OrderResult> {
    const orderId = `order_mock_${crypto.randomBytes(8).toString("hex")}`;
    const order: FetchOrderResult = {
      id: orderId,
      amount: params.amountPaise,
      amountPaid: 0,
      amountDue: params.amountPaise,
      currency: params.currency || "INR",
      receipt: params.receipt,
      status: "created",
      payments: [],
    };
    this.orders.set(orderId, order);

    return {
      id: orderId,
      amount: params.amountPaise,
      currency: params.currency || "INR",
      receipt: params.receipt,
      status: "created",
    };
  }

  public generateCheckoutSignature(orderId: string, paymentId: string): string {
    return crypto
      .createHmac("sha256", this.mockSecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
  }

  public verifyCheckoutSignature(params: VerifyCheckoutSignatureParams): boolean {
    const { orderId, paymentId, signature } = params;
    if (!orderId || !paymentId || !signature) return false;

    // Direct mock match or HMAC match
    const expected = this.generateCheckoutSignature(orderId, paymentId);
    try {
      if (
        signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature, "utf-8"), Buffer.from(expected, "utf-8"))
      ) {
        return true;
      }
    } catch {
      // Length mismatch or buffer error
    }

    if (signature === `mock_sig_${orderId}_${paymentId}` || signature === "mock_valid_signature") {
      return true;
    }

    return false;
  }

  public generateWebhookSignature(rawBody: string): string {
    return crypto
      .createHmac("sha256", this.mockWebhookSecret)
      .update(rawBody)
      .digest("hex");
  }

  public verifyWebhook(params: VerifyWebhookParams): boolean {
    const { rawBody, signature } = params;
    if (!rawBody || !signature) return false;

    const expected = this.generateWebhookSignature(rawBody);
    try {
      if (
        signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature, "utf-8"), Buffer.from(expected, "utf-8"))
      ) {
        return true;
      }
    } catch {
      // Length mismatch
    }

    if (signature === "mock_webhook_valid_signature") {
      return true;
    }

    return false;
  }

  public async fetchOrder(orderId: string): Promise<FetchOrderResult> {
    const order = this.orders.get(orderId);
    if (order) return order;

    // Fallback deterministic order
    return {
      id: orderId,
      amount: 50000,
      amountPaid: 0,
      amountDue: 50000,
      currency: "INR",
      receipt: `rcpt_${orderId}`,
      status: "created",
      payments: [],
    };
  }

  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    const refundId = `rfnd_mock_${crypto.randomBytes(8).toString("hex")}`;
    const refund: RefundResult = {
      id: refundId,
      paymentId: params.paymentId,
      amount: params.amountPaise,
      currency: "INR",
      status: "processed",
    };
    this.refunds.set(refundId, refund);
    return refund;
  }

  // Simulation helpers for tests
  public markOrderPaid(orderId: string, paymentId?: string, amountPaid?: number): void {
    const order = this.orders.get(orderId);
    const pid = paymentId || `pay_mock_${crypto.randomBytes(8).toString("hex")}`;
    if (order) {
      order.status = "paid";
      order.amountPaid = amountPaid ?? order.amount;
      order.amountDue = Math.max(0, order.amount - order.amountPaid);
      order.payments = order.payments || [];
      order.payments.push({ id: pid, status: "captured", amount: order.amountPaid });
    }
  }
}
