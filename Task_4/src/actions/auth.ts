"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import crypto from "crypto";
import { dbRepo } from "@/db/repo";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "@/lib/auth-crypto";
import { registerPatientSchema, registerDoctorSchema } from "@/lib/validators";

const COOKIE_NAME = "medrella_session";

function getCookieConfig() {
  const isProduction = process.env.NODE_ENV === "production";
  const isVercel = Boolean(process.env.VERCEL || process.env.NEXT_PUBLIC_VERCEL_URL);
  // Only enforce secure cookies if on Vercel/HTTPS to avoid dropping cookies over HTTP on localhost
  const isSecure = isProduction && isVercel;
  const cookieExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: "lax" as const,
    path: "/",
    expires: cookieExpires,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };
}

export async function getCurrentUser(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  // Real-time Database Session Validation:
  // Ensure the user still exists in the database and their account is active.
  const dbUser = await dbRepo.getUserById(payload.userId);
  if (!dbUser || !dbUser.isActive) {
    return null;
  }

  return payload;
}

function sanitizeRedirect(rawRedirect?: string | null): string | null {
  if (!rawRedirect) return null;
  const trimmed = rawRedirect.trim();
  // Open-redirect protection: strictly reject backslashes and protocol-relative URLs
  if (trimmed.includes("\\") || !trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }
  return trimmed;
}

export async function loginAction(formData: FormData) {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const password = formData.get("password") as string;
  const rawRole = (formData.get("role") as string)?.trim().toUpperCase();
  const rawRedirect = (formData.get("redirectTo") as string)?.trim();

  if (!email || !password) {
    return { success: false, error: "Please enter your email and password." };
  }

  // Rate Limiting Guard: Max 5 failed attempts per email in 15 minutes
  const failedAttempts = await dbRepo.getRecentFailedLoginCount(email, 15);
  if (failedAttempts >= 5) {
    return {
      success: false,
      error: "Too many failed login attempts. Please wait 15 minutes before trying again.",
    };
  }

  const user = await dbRepo.getUserByEmail(email);
  if (!user || !user.isActive) {
    await dbRepo.recordFailedLogin(email);
    return { success: false, error: "Invalid email or password." };
  }

  let role: "PATIENT" | "DOCTOR" = user.role;
  if (rawRole === "PATIENT" || rawRole === "DOCTOR") {
    if (user.role !== rawRole) {
      await dbRepo.recordFailedLogin(email);
      return { success: false, error: "Invalid email or password." };
    }
    role = rawRole;
  }

  const isPasswordValid = verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    await dbRepo.recordFailedLogin(email);
    return { success: false, error: "Invalid email or password." };
  }

  // Authentication succeeded: clear failed login counter
  await dbRepo.clearFailedLogins(email);

  let profileId = "";
  let name = "";

  if (role === "PATIENT") {
    const patient = await dbRepo.getPatientByUserId(user.id);
    if (!patient) return { success: false, error: "Invalid email or password." };
    profileId = patient.id;
    name = `${patient.firstName} ${patient.lastName}`;
  } else {
    const doctor = await dbRepo.getDoctorByUserId(user.id);
    if (!doctor) return { success: false, error: "Invalid email or password." };
    profileId = doctor.id;
    name = `Dr. ${doctor.firstName} ${doctor.lastName}`;
  }

  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    profileId,
    name,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, getCookieConfig());
  revalidatePath("/", "layout");

  // Determine safe redirect destination
  const safeRedirect = sanitizeRedirect(rawRedirect);
  const redirectPath = safeRedirect || (role === "PATIENT" ? "/patient/dashboard" : "/doctor/dashboard");

  return { success: true, redirectPath };
}

export async function registerPatientAction(formData: FormData) {
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    dateOfBirth: formData.get("dateOfBirth") || undefined,
    gender: formData.get("gender") || undefined,
    address: formData.get("address") || undefined,
  };

  const parsed = registerPatientSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const existing = await dbRepo.getUserByEmail(parsed.data.email);
  if (existing) {
    return { success: false, error: "An account with this email already exists." };
  }

  // 128-bit collision-proof cryptographically secure UUIDs
  const userId = `usr_${crypto.randomUUID()}`;
  const patientId = `pat_${crypto.randomUUID()}`;

  await dbRepo.createUser({
    id: userId,
    email: parsed.data.email,
    passwordHash: hashPassword(parsed.data.password),
    role: "PATIENT",
    isActive: true,
  });

  await dbRepo.createPatient({
    id: patientId,
    userId,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    phone: parsed.data.phone,
    dateOfBirth: parsed.data.dateOfBirth,
    gender: parsed.data.gender,
    address: parsed.data.address,
  });

  const token = createSessionToken({
    userId,
    email: parsed.data.email,
    role: "PATIENT",
    profileId: patientId,
    name: `${parsed.data.firstName} ${parsed.data.lastName}`,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, getCookieConfig());
  revalidatePath("/", "layout");

  const rawRedirect = (formData.get("redirectTo") as string)?.trim();
  const safeRedirect = sanitizeRedirect(rawRedirect);
  const redirectPath = safeRedirect || "/patient/dashboard";

  return { success: true, redirectPath };
}

export async function registerDoctorAction(formData: FormData) {
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    specialization: formData.get("specialization"),
    phone: formData.get("phone"),
    licenseNumber: formData.get("licenseNumber"),
    experienceYears: formData.get("experienceYears"),
    consultationFee: formData.get("consultationFee"),
    bio: formData.get("bio") || undefined,
  };

  const parsed = registerDoctorSchema.safeParse(rawData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0].message };
  }

  const existing = await dbRepo.getUserByEmail(parsed.data.email);
  if (existing) {
    return { success: false, error: "An account with this email already exists." };
  }

  // 128-bit collision-proof cryptographically secure UUIDs
  const userId = `usr_${crypto.randomUUID()}`;
  const doctorId = `doc_${crypto.randomUUID()}`;

  await dbRepo.createUser({
    id: userId,
    email: parsed.data.email,
    passwordHash: hashPassword(parsed.data.password),
    role: "DOCTOR",
    isActive: true,
  });

  await dbRepo.createDoctor({
    id: doctorId,
    userId,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    specialization: parsed.data.specialization,
    phone: parsed.data.phone,
    licenseNumber: parsed.data.licenseNumber,
    experienceYears: parsed.data.experienceYears,
    consultationFee: parsed.data.consultationFee,
    bio: parsed.data.bio,
  });

  // Default Mon-Fri shifts
  const days: Array<"MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN"> = [
    "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"
  ];
  for (const day of days) {
    await dbRepo.updateDoctorAvailability(doctorId, day, {
      startTime: "09:00",
      endTime: "17:00",
      slotDurationMinutes: 30,
      isActive: ["MON", "TUE", "WED", "THU", "FRI"].includes(day),
    });
  }

  const token = createSessionToken({
    userId,
    email: parsed.data.email,
    role: "DOCTOR",
    profileId: doctorId,
    name: `Dr. ${parsed.data.firstName} ${parsed.data.lastName}`,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, getCookieConfig());
  revalidatePath("/", "layout");

  const rawRedirect = (formData.get("redirectTo") as string)?.trim();
  const safeRedirect = sanitizeRedirect(rawRedirect);
  const redirectPath = safeRedirect || "/doctor/dashboard";

  return { success: true, redirectPath };
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}

export async function deleteAccountAction(password: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: "No active session found. Please sign in." };
  }

  if (!password || !password.trim()) {
    return { success: false, error: "Password confirmation is required to delete your account." };
  }

  const dbUser = await dbRepo.getUserById(user.userId);
  if (!dbUser) {
    return { success: false, error: "User record not found." };
  }

  const isPasswordValid = verifyPassword(password, dbUser.passwordHash);
  if (!isPasswordValid) {
    return { success: false, error: "Incorrect password. Account deletion aborted." };
  }

  try {
    const deleted = await dbRepo.deleteUserComplete(user.userId);
    if (!deleted) {
      return { success: false, error: "Failed to delete account. Account record not found." };
    }
  } catch (err: any) {
    if (err?.message && err.message.includes("active upcoming appointments")) {
      return { success: false, error: err.message };
    }
    return {
      success: false,
      error: "Unable to delete account due to a server error. Please try again later.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);

  revalidatePath("/", "layout");
  return { success: true, redirectPath: "/signup" };
}
