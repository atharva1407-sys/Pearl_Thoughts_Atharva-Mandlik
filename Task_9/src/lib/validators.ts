import { z } from "zod";
import { BLOOD_GROUPS, ALLERGY_SEVERITIES, CONDITION_STATUSES } from "@/domain/medical-history";

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

const rxText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);

export const prescriptionSchema = z.object({
  appointmentId: z.string().min(1, "Appointment is required"),
  medicines: z
    .array(
      z.object({
        name: rxText("Medicine name", 80),
        dosage: rxText("Dosage", 60),
        frequency: rxText("Frequency", 60),
        duration: rxText("Duration", 60),
      })
    )
    .min(1, "Add at least one medicine")
    .max(12, "A prescription can list at most 12 medicines"),
  notes: z.string().trim().max(600, "Notes are too long").optional(),
});

// ---------- Medical history & visit records (Task 9) ----------

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (at most ${max} characters)`)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalWholeNumber = (label: string, min: number, max: number) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`)
    .nullish()
    .transform((v) => v ?? null);

const hasUniqueNames = (items: { name: string }[]) =>
  new Set(items.map((i) => i.name.trim().toLowerCase())).size === items.length;

export const medicalProfileDataSchema = z.object({
  bloodGroup: z
    .union([z.enum(BLOOD_GROUPS), z.literal("")])
    .nullish()
    .transform((v) => v || null),
  heightCm: optionalWholeNumber("Height", 30, 260),
  weightKg: optionalWholeNumber("Weight", 1, 500),
  allergies: z
    .array(
      z.object({
        name: rxText("Allergy name", 80),
        severity: z.enum(ALLERGY_SEVERITIES),
        reaction: z
          .string()
          .trim()
          .max(120, "Reaction is too long (at most 120 characters)")
          .nullish()
          .transform((v) => v || undefined),
      })
    )
    .max(30, "At most 30 allergies can be listed")
    .refine(hasUniqueNames, "Each allergy can be listed only once"),
  conditions: z
    .array(
      z.object({
        name: rxText("Condition name", 80),
        status: z.enum(CONDITION_STATUSES),
        notes: z
          .string()
          .trim()
          .max(120, "Condition note is too long (at most 120 characters)")
          .nullish()
          .transform((v) => v || undefined),
      })
    )
    .max(30, "At most 30 conditions can be listed")
    .refine(hasUniqueNames, "Each condition can be listed only once"),
  currentMedications: optionalText("Current medications", 800),
  pastSurgeries: optionalText("Past surgeries", 800),
  familyHistory: optionalText("Family history", 800),
  notes: optionalText("Notes", 1000),
});

export const saveMedicalProfileSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  expectedVersion: z.number().int().min(0),
  changeNote: optionalText("Reason for the change", 200),
  data: medicalProfileDataSchema,
});

export const visitRecordSchema = z.object({
  appointmentId: z.string().min(1, "Appointment is required"),
  diagnosis: rxText("Diagnosis", 200),
  symptoms: optionalText("Symptoms", 600),
  notes: optionalText("Consultation notes", 1500),
  followUp: optionalText("Follow-up advice", 400),
});
