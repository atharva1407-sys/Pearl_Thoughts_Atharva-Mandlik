import { pgTable, text, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";

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
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone").notNull(),
  dateOfBirth: text("date_of_birth"),
  gender: text("gender"),
  address: text("address"),
});

export const doctors = pgTable("doctors", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  specialization: text("specialization").notNull(),
  phone: text("phone").notNull(),
  licenseNumber: text("license_number").notNull().unique(),
  experienceYears: integer("experience_years").notNull(),
  consultationFee: numeric("consultation_fee").notNull(),
  bio: text("bio"),
});

export const availabilities = pgTable("availabilities", {
  id: text("id").primaryKey(),
  doctorId: text("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  dayOfWeek: text("day_of_week").notNull().$type<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN">(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  slotDurationMinutes: integer("slot_duration_minutes").default(30).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const appointments = pgTable("appointments", {
  id: text("id").primaryKey(),
  patientId: text("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
  doctorId: text("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  appointmentDate: text("appointment_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: text("status").notNull().$type<"BOOKED" | "COMPLETED" | "CANCELLED">().default("BOOKED"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type Availability = typeof availabilities.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
