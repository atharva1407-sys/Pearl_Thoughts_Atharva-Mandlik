export type NotificationChannelType = "EMAIL" | "SMS" | "WHATSAPP";
export type NotificationStatusType = "PENDING" | "SENT" | "FAILED" | "CANCELLED";

export interface NotificationPayload {
  patientName?: string;
  doctorName?: string;
  specialization?: string;
  appointmentDate?: string;
  startTime?: string;
  endTime?: string;
  tokenNumber?: number;
  amountFormatted?: string;
  refundAmountFormatted?: string;
  receiptNo?: string;
  paymentId?: string;
  reason?: string;
  customMessage?: string;
  [key: string]: any;
}

export interface NotificationItem {
  id: string;
  userId: string;
  appointmentId?: string | null;
  channel: NotificationChannelType;
  template: string;
  recipient: string;
  payload?: NotificationPayload | null;
  status: NotificationStatusType;
  scheduledFor: Date;
  attempts: number;
  lastError?: string | null;
  dedupeKey?: string | null;
  sentAt?: Date | null;
  createdAt: Date;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface NotificationChannel {
  name: NotificationChannelType;
  send(notification: NotificationItem): Promise<SendResult>;
}
