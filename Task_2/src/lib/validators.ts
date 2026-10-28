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
