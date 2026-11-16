export type NotificationChannelType = "EMAIL" | "SMS" | "WHATSAPP";
export type NotificationStatusType = "PENDING" | "SENT" | "FAILED" | "CANCELLED";
export type NotificationCategory = "operational" | "promotional";

export interface NotificationPreferencesEntity {
  userId: string;
  emailPromotional: boolean;
  consentedAt?: Date | null;
  updatedAt: Date;
}

export interface BaseNotificationPayload {
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
  unsubscribeUrl?: string;
  customMessage?: string;
  reminderOffsetMinutes?: number;
  [key: string]: string | number | boolean | null | undefined;
}

export type BookingNotificationPayload = BaseNotificationPayload & {
  patientName: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
  tokenNumber?: number;
  receiptNo?: string;
};

export type RefundNotificationPayload = BaseNotificationPayload & {
  patientName: string;
  doctorName: string;
  refundAmountFormatted: string;
  receiptNo?: string;
};

export type ReminderNotificationPayload = BaseNotificationPayload & {
  patientName: string;
  doctorName: string;
  appointmentDate: string;
  startTime: string;
  reminderOffsetMinutes: number;
};

export type NotificationPayload = BaseNotificationPayload | BookingNotificationPayload | RefundNotificationPayload | ReminderNotificationPayload;

export interface NotificationItem {
  id: string;
  userId: string;
  appointmentId?: string | null;
  channel: NotificationChannelType;
  category?: NotificationCategory;
  template: string;
  recipient: string;
  payload?: NotificationPayload | null;
  status: NotificationStatusType;
  scheduledFor: Date;
  attempts: number;
  lastError?: string | null;
  dedupeKey?: string | null;
  providerMessageId?: string | null;
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
