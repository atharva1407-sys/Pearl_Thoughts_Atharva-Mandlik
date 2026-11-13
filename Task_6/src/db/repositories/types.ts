import type { DayCode, SessionRecurrence } from "@/lib/session-schedule";
export type { DayCode, SessionRecurrence };

export interface UserEntity {
  id: string;
  email: string;
  passwordHash: string;
  role: "PATIENT" | "DOCTOR";
  isActive: boolean;
  createdAt: Date;
}

export interface PatientEntity {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  address?: string | null;
}

export interface DoctorEntity {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  specialization: string;
  phone: string;
  licenseNumber: string;
  experienceYears: number;
  consultationFee: number;
  bio?: string | null;
  profileImage?: string | null;
}

export interface AvailabilityEntity {
  id: string;
  doctorId: string;
  name: string;
  dayOfWeek: DayCode | null;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
  schedulingType: "STREAM" | "WAVE";
  patientsPerWave: number;
  recurrence?: SessionRecurrence;
  dayOfMonth?: number | null;
  specificDate?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface SessionScheduleInput {
  recurrence?: SessionRecurrence;
  dayOfWeek?: DayCode | null;
  dayOfMonth?: number | null;
  specificDate?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
}

export interface DoctorLeaveEntity {
  id: string;
  doctorId: string;
  leaveDate: string;
  reason?: string | null;
  createdAt: Date;
}

export type AppointmentStatus =
  | "PENDING_PAYMENT"
  | "BOOKED"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW"
  | "EXPIRED";

export interface AppointmentEntity {
  id: string;
  patientId: string;
  doctorId: string;
  sessionId?: string | null;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  tokenNumber: number;
  reason?: string | null;
  holdExpiresAt?: Date | null;
  cancelledBy?: "PATIENT" | "DOCTOR" | "SYSTEM" | null;
  cancelReason?: string | null;
  rescheduledAt?: Date | null;
  rescheduledBy?: "PATIENT" | "DOCTOR" | null;
  originalAppointmentDate?: string | null;
  originalStartTime?: string | null;
  originalEndTime?: string | null;
  createdAt: Date;
}

export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "PAID"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export interface PaymentEntity {
  id: string;
  appointmentId: string;
  patientId: string;
  provider: "RAZORPAY" | "MOCK";
  providerOrderId: string;
  providerPaymentId?: string | null;
  amountPaise: number;
  currency: string;
  status: PaymentStatus;
  receiptNo: string;
  failureReason?: string | null;
  expiresAt?: Date | null;
  paidAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentEventEntity {
  id: string;
  provider: "RAZORPAY" | "MOCK";
  providerEventId: string;
  type: string;
  payload?: any;
  outcome?: string | null;
  processedAt: Date;
}

export type RefundStatus = "REQUESTED" | "PENDING" | "PROCESSED" | "FAILED";

export interface RefundEntity {
  id: string;
  paymentId: string;
  appointmentId: string;
  amountPaise: number;
  reason?: string | null;
  status: RefundStatus;
  providerRefundId?: string | null;
  idempotencyKey: string;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NotificationChannel = "EMAIL" | "SMS" | "WHATSAPP";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED" | "CANCELLED";
export type NotificationCategory = "operational" | "promotional";

export interface NotificationPreferencesEntity {
  userId: string;
  emailPromotional: boolean;
  consentedAt?: Date | null;
  updatedAt: Date;
}

export interface PrescriptionMedicine {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface PrescriptionEntity {
  id: string;
  appointmentId: string;
  doctorId: string;
  patientId: string;
  medicines: PrescriptionMedicine[];
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentEventKind = "MESSAGE" | "TOOL_CALL" | "ACTION" | "ERROR";

export interface AgentEventEntity {
  id: string;
  userId: string;
  kind: AgentEventKind;
  tool?: string | null;
  detail?: string | null;
  createdAt: Date;
}

export interface NotificationEntity {
  id: string;
  userId: string;
  appointmentId?: string | null;
  channel: NotificationChannel;
  category?: NotificationCategory;
  template: string;
  recipient: string;
  payload?: any;
  status: NotificationStatus;
  scheduledFor: Date;
  attempts: number;
  lastError?: string | null;
  dedupeKey?: string | null;
  providerMessageId?: string | null;
  sentAt?: Date | null;
  createdAt: Date;
}

export interface ComputedSlot {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  seatsLeft: number;
  isBooked: boolean;
}

export interface SessionSlotGroup {
  sessionId: string;
  sessionName: string;
  schedulingType: "STREAM" | "WAVE";
  patientsPerWave: number;
  timeRange: string;
  slots: ComputedSlot[];
}

export interface NextOpenSlot {
  date: string;
  startTime: string;
  endTime: string;
  sessionName: string;
}
