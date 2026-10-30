export interface CreateOrderParams {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface OrderResult {
  id: string; // provider order ID, e.g. "order_..."
  amount: number; // in paise
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
}

export interface VerifyCheckoutSignatureParams {
  orderId: string;
  paymentId: string;
  signature: string;
}

export interface VerifyWebhookParams {
  rawBody: string;
  signature: string;
}

export interface CreateRefundParams {
  paymentId: string;
  amountPaise: number;
  notes?: Record<string, string>;
  receipt?: string;
  reason?: string;
}

export interface RefundResult {
  id: string; // provider refund ID, e.g. "rfnd_..."
  paymentId: string;
  amount: number; // in paise
  currency: string;
  status: "pending" | "processed" | "failed";
}

export interface FetchOrderResult {
  id: string;
  amount: number;
  amountPaid: number;
  amountDue: number;
  currency: string;
  receipt: string;
  status: "created" | "attempted" | "paid";
  payments?: {
    id: string;
    status: string;
    amount: number;
  }[];
}

export interface PaymentProvider {
  name: "RAZORPAY" | "MOCK";
  keyId?: string;
  createOrder(params: CreateOrderParams): Promise<OrderResult>;
  verifyCheckoutSignature(params: VerifyCheckoutSignatureParams): boolean;
  verifyWebhook(params: VerifyWebhookParams): boolean;
  fetchOrder(orderId: string): Promise<FetchOrderResult>;
  createRefund(params: CreateRefundParams): Promise<RefundResult>;
}
