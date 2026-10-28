import { pgTable, text, timestamp, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
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
    status: text("status").notNull().$type<"BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW">().default("BOOKED"),
    tokenNumber: integer("token_number").default(1).notNull(),
    reason: text("reason"),
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

export type User = typeof users.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type Availability = typeof availabilities.$inferSelect;
export type DoctorLeave = typeof doctorLeaves.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
