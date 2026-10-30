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

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "utf-8");
    const bb = Buffer.from(b, "utf-8");
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * In-memory stand-in for Razorpay, for local development and automated tests ONLY.
 * `getPaymentProvider()` refuses to return it in production. It accepts exactly the signatures it
 * would itself produce (HMAC with its own secrets): there are no fixed "always valid" values.
 */
export class MockProvider implements PaymentProvider {
  public readonly name = "MOCK" as const;
  public readonly keyId = "rzp_test_mock_medrella";
  private readonly mockSecret: string;
  private readonly mockWebhookSecret: string;

  /** Status the mock reports for refunds it creates (env MOCK_REFUND_STATUS=pending|failed to demo those cases). */
  public refundStatus: RefundResult["status"] =
    process.env.MOCK_REFUND_STATUS === "pending" ? "pending" : process.env.MOCK_REFUND_STATUS === "failed" ? "failed" : "processed";

  // In-memory store for orders and refunds created in test / local mode
  public orders = new Map<string, FetchOrderResult>();
  public refunds = new Map<string, RefundResult>();

  constructor(
    secret: string = process.env.MOCK_PAYMENT_SECRET || "mock_secret_key_12345",
    webhookSecret: string = process.env.MOCK_WEBHOOK_SECRET || "mock_webhook_secret_67890"
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
    return crypto.createHmac("sha256", this.mockSecret).update(`${orderId}|${paymentId}`).digest("hex");
  }

  public verifyCheckoutSignature(params: VerifyCheckoutSignatureParams): boolean {
    const { orderId, paymentId, signature } = params;
    if (!orderId || !paymentId || !signature) return false;
    return safeEqualHex(signature, this.generateCheckoutSignature(orderId, paymentId));
  }

  public generateWebhookSignature(rawBody: string): string {
    return crypto.createHmac("sha256", this.mockWebhookSecret).update(rawBody).digest("hex");
  }

  public verifyWebhook(params: VerifyWebhookParams): boolean {
    const { rawBody, signature } = params;
    if (!rawBody || !signature) return false;
    return safeEqualHex(signature, this.generateWebhookSignature(rawBody));
  }

  public async fetchOrder(orderId: string): Promise<FetchOrderResult> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Mock order ${orderId} not found.`);
    }
    return order;
  }

  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    const refundId = `rfnd_mock_${crypto.randomBytes(8).toString("hex")}`;
    const refund: RefundResult = {
      id: refundId,
      paymentId: params.paymentId,
      amount: params.amountPaise,
      currency: "INR",
      status: this.refundStatus,
    };
    this.refunds.set(refundId, refund);
    return refund;
  }

  /** Marks an order as paid in the mock gateway and returns the payment id that "Razorpay" issued. */
  public markOrderPaid(orderId: string, paymentId?: string, amountPaid?: number): string {
    const order = this.orders.get(orderId);
    const pid = paymentId || `pay_mock_${crypto.randomBytes(8).toString("hex")}`;
    if (order) {
      order.status = "paid";
      order.amountPaid = amountPaid ?? order.amount;
      order.amountDue = Math.max(0, order.amount - order.amountPaid);
      order.payments = order.payments || [];
      order.payments.push({ id: pid, status: "captured", amount: order.amountPaid });
    }
    return pid;
  }

  /**
   * Server-side "customer pays at the checkout": marks the order paid and returns exactly what
   * Razorpay Checkout would hand back to the browser (order id, payment id, signature).
   */
  public simulatePayment(orderId: string): { orderId: string; paymentId: string; signature: string } {
    if (!this.orders.has(orderId)) {
      throw new Error("Unknown mock order.");
    }
    const paymentId = this.markOrderPaid(orderId);
    return { orderId, paymentId, signature: this.generateCheckoutSignature(orderId, paymentId) };
  }
}
