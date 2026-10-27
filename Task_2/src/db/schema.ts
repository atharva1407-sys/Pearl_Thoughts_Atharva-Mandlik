import { pgTable, text, timestamp, boolean, integer, numeric, uniqueIndex, index } from "drizzle-orm/pg-core";
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

export const availabilities = pgTable(
  "availabilities",
  {
    id: text("id").primaryKey(),
    doctorId: text("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
    dayOfWeek: text("day_of_week").notNull().$type<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN">(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    slotDurationMinutes: integer("slot_duration_minutes").default(30).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [
    uniqueIndex("doctor_day_unique").on(table.doctorId, table.dayOfWeek),
  ]
);

export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    patientId: text("patient_id").notNull().references(() => patients.id, { onDelete: "cascade" }),
    doctorId: text("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
    appointmentDate: text("appointment_date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    status: text("status").notNull().$type<"BOOKED" | "COMPLETED" | "CANCELLED">().default("BOOKED"),
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Strict database-level concurrency safeguard:
    // Prevents double-booking any active (BOOKED or COMPLETED) slot for a doctor,
    // while allowing cancelled slots to be freely re-booked.
    uniqueIndex("doctor_slot_active_unique")
      .on(table.doctorId, table.appointmentDate, table.startTime)
      .where(sql`${table.status} != 'CANCELLED'`),
    index("appointment_patient_idx").on(table.patientId),
    index("appointment_doctor_idx").on(table.doctorId),
    index("appointment_date_idx").on(table.appointmentDate),
  ]
);

export type User = typeof users.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type Doctor = typeof doctors.$inferSelect;
export type Availability = typeof availabilities.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
