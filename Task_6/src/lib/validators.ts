import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["PATIENT", "DOCTOR"]),
});

export const registerPatientSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(7, "Phone number is required"),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
});

export const registerDoctorSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  firstName: z.string().min(2, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  specialization: z.string().min(2, "Specialization is required").default("General Medicine"),
  phone: z.string().min(7, "Phone number is required"),
  licenseNumber: z.string().optional().default("TN-MED-99214"),
  experienceYears: z.coerce.number().min(0).default(5),
  consultationFee: z.coerce.number().min(1).default(800),
  bio: z.string().optional(),
});

export const bookingSchema = z.object({
  doctorId: z.string().min(1, "Doctor ID is required"),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid start time (HH:MM)"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid end time (HH:MM)"),
  reason: z.string().min(3, "Please provide a reason for consultation"),
});

export const availabilitySchema = z.object({
  dayOfWeek: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid start time (HH:MM)"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid end time (HH:MM)"),
  slotDurationMinutes: z.coerce.number().min(15).max(120),
  isActive: z.boolean(),
});

// Form fields arrive as "" or null when left empty; treat both as "not provided".
const blankToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const optionalDate = z.preprocess(
  blankToUndefined,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be written as YYYY-MM-DD").optional()
);

export const sessionSchema = z.object({
  name: z.string().min(2, "Session name must be at least 2 characters"),
  // How the session repeats. The cross-field rules (which fields each kind needs) live in lib/session-schedule.
  recurrence: z.preprocess(blankToUndefined, z.enum(["WEEKLY", "MONTHLY_DATE", "ONE_TIME"]).default("WEEKLY")),
  dayOfWeek: z.preprocess(blankToUndefined, z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]).optional()),
  dayOfMonth: z.preprocess(
    blankToUndefined,
    z.coerce.number().int("Day of the month must be a whole number").min(1, "Day of the month must be between 1 and 31").max(31, "Day of the month must be between 1 and 31").optional()
  ),
  specificDate: optionalDate,
  validFrom: optionalDate,
  validUntil: optionalDate,
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid start time (HH:MM)"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid end time (HH:MM)"),
  // Up to 10 hours, so a doctor can make the whole session one arrival window (for example 10:00-14:00 with 20 patients).
  slotDurationMinutes: z.coerce.number().min(10).max(600).default(30),
  isActive: z.boolean().default(true),
  schedulingType: z.enum(["STREAM", "WAVE"]).default("STREAM"),
  patientsPerWave: z.coerce.number().min(1).max(20).default(1),
});

export const rescheduleSchema = z.object({
  appointmentId: z.string().min(1, "Appointment ID is required"),
  newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  newStartTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid start time (HH:MM)"),
  newEndTime: z.string().regex(/^\d{2}:\d{2}$/, "Invalid end time (HH:MM)"),
  newSessionId: z.string().optional(),
});
