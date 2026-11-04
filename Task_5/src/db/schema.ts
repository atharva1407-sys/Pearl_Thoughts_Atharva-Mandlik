import { pgTable, text, timestamp, integer, boolean, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().$type<"PATIENT" | "DOCTOR">(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const patients = pgTable("patients", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  address: text("address"),
});

export const doctors = pgTable("doctors", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  specialization: text("specialization").notNull(),
  phone: text("phone").notNull(),
  licenseNumber: text("license_number"),
  experienceYears: integer("experience_years").default(0),
  consultationFee: integer("consultation_fee").default(500),
  bio: text("bio"),
  profileImage: text("profile_image"),
});

export const availabilities = pgTable(
  "availabilities",
  {
    id: text("id").primaryKey(),
    doctorId: text("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("OPD Session"),
    dayOfWeek: text("day_of_week").notNull().$type<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN">(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    slotDurationMinutes: integer("slot_duration_minutes").default(30).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    schedulingType: text("scheduling_type").notNull().$type<"STREAM" | "WAVE">().default("STREAM"),
    patientsPerWave: integer("patients_per_wave").notNull().default(1),
  },
  (table) => [
    index("availability_doctor_idx").on(table.doctorId),
    index("availability_day_idx").on(table.dayOfWeek),
  ]
);

export const doctorLeaves = pgTable(
  "doctor_leaves",
  {
    id: text("id").primaryKey(),
    doctorId: text("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
    leaveDate: text("leave_date").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("doctor_leave_unique").on(table.doctorId, table.leaveDate),
    index("doctor_leave_doc_idx").on(table.doctorId),
    index("doctor_leave_date_idx").on(table.leaveDate),
  ]
);

export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
    doctorId: text("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
    sessionId: text("session_id"),
    appointmentDate: text("appointment_date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    status: text("status")
      .notNull()
      .$type<"PENDING_PAYMENT" | "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" | "EXPIRED">()
      .default("BOOKED"),
    tokenNumber: integer("token_number").default(1).notNull(),
    reason: text("reason"),
    holdExpiresAt: timestamp("hold_expires_at"),
    cancelledBy: text("cancelled_by").$type<"PATIENT" | "DOCTOR" | "SYSTEM">(),
    cancelReason: text("cancel_reason"),
    rescheduledAt: timestamp("rescheduled_at"),
    rescheduledBy: text("rescheduled_by").$type<"PATIENT" | "DOCTOR">(),
    originalAppointmentDate: text("original_appointment_date"),
    originalStartTime: text("original_start_time"),
    originalEndTime: text("original_end_time"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("appointment_patient_idx").on(table.patientId),
    index("appointment_doctor_idx").on(table.doctorId),
    index("appointment_date_idx").on(table.appointmentDate),
    index("appointment_doctor_slot_idx").on(table.doctorId, table.appointmentDate, table.startTime),
    index("appointment_status_idx").on(table.status),
  ]
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    attemptedAt: timestamp("attempted_at").defaultNow().notNull(),
  },
  (table) => [
    index("login_attempts_email_idx").on(table.email),
    index("login_attempts_time_idx").on(table.attemptedAt),
  ]
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    patientId: text("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().$type<"RAZORPAY" | "MOCK">(),
    providerOrderId: text("provider_order_id").notNull(),
    providerPaymentId: text("provider_payment_id"),
    amountPaise: integer("amount_paise").notNull(),
    currency: text("currency").notNull().default("INR"),
    status: text("status")
      .notNull()
      .$type<"CREATED" | "PENDING" | "PAID" | "FAILED" | "EXPIRED" | "REFUNDED" | "PARTIALLY_REFUNDED">()
      .default("CREATED"),
    receiptNo: text("receipt_no").notNull().unique(),
    failureReason: text("failure_reason"),
    expiresAt: timestamp("expires_at"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payments_provider_order_idx").on(table.provider, table.providerOrderId),
    uniqueIndex("payments_provider_payment_idx").on(table.provider, table.providerPaymentId),
    index("payments_appointment_idx").on(table.appointmentId),
    index("payments_patient_idx").on(table.patientId),
    index("payments_status_idx").on(table.status),
  ]
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull().$type<"RAZORPAY" | "MOCK">(),
    providerEventId: text("provider_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    outcome: text("outcome"),
    processedAt: timestamp("processed_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("payment_events_provider_event_idx").on(table.provider, table.providerEventId),
    index("payment_events_type_idx").on(table.type),
  ]
);

export const refunds = pgTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    appointmentId: text("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason"),
    status: text("status")
      .notNull()
      .$type<"REQUESTED" | "PENDING" | "PROCESSED" | "FAILED">()
      .default("REQUESTED"),
    providerRefundId: text("provider_refund_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("refunds_payment_idx").on(table.paymentId),
    index("refunds_appointment_idx").on(table.appointmentId),
    index("refunds_status_idx").on(table.status),
  ]
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    appointmentId: text("appointment_id").references(() => appointments.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().$type<"EMAIL" | "SMS" | "WHATSAPP">().default("EMAIL"),
    category: text("category").notNull().$type<"operational" | "promotional">().default("operational"),
    template: text("template").notNull(),
    recipient: text("recipient").notNull(),
    payload: jsonb("payload"),
    status: text("status").notNull().$type<"PENDING" | "SENT" | "FAILED" | "CANCELLED">().default("PENDING"),
    scheduledFor: timestamp("scheduled_for").defaultNow().notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    dedupeKey: text("dedupe_key").unique(),
    providerMessageId: text("provider_message_id"),
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("notifications_status_scheduled_idx").on(table.status, table.scheduledFor),
    index("notifications_user_idx").on(table.userId),
    index("notifications_appointment_idx").on(table.appointmentId),
    index("notifications_category_idx").on(table.category),
  ]
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  emailPromotional: boolean("email_promotional").default(false).notNull(),
  consentedAt: timestamp("consented_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type Availability = typeof availabilities.$inferSelect;
export type DoctorLeave = typeof doctorLeaves.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
