import crypto from "crypto";
import { z } from "zod";
import { dbRepo, type ReceptionistWithEmail } from "@/db/repo";
import { hashPassword } from "@/lib/auth-crypto";

/**
 * A doctor's front-desk team. Every function takes the acting doctor's id explicitly and only ever touches that
 * doctor's own assignments, so the server actions stay thin and the rules can be tested without a request.
 */

export const RECEPTIONIST_MIN_PASSWORD_LENGTH = 8;

const passwordSchema = z
  .string()
  .min(RECEPTIONIST_MIN_PASSWORD_LENGTH, `Password must be at least ${RECEPTIONIST_MIN_PASSWORD_LENGTH} characters.`)
  .max(128, "Password is too long.");

const createSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(60),
  lastName: z.string().trim().min(1, "Last name is required.").max(60),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number.")
    .max(20, "Enter a valid phone number.")
    .regex(/^[0-9+()\-\s]+$/, "Enter a valid phone number."),
  password: passwordSchema,
});

export type TeamResult<T = never> =
  | { success: true; message: string; data?: T }
  | { success: false; error: string };

export interface NewReceptionistInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
}

function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message || "Please check the details and try again.";
}

export async function listTeam(doctorId: string): Promise<ReceptionistWithEmail[]> {
  return dbRepo.getReceptionistsForDoctor(doctorId);
}

/** Creates a receptionist login and assigns it to this doctor in one step. */
export async function createReceptionistForDoctor(
  doctorId: string,
  input: NewReceptionistInput
): Promise<TeamResult<ReceptionistWithEmail>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };
  const data = parsed.data;

  // Same answer whatever kind of account owns the email, so this form cannot be used to probe who is registered.
  if (await dbRepo.getUserByEmail(data.email)) {
    return { success: false, error: "An account with this email already exists. Use \"Assign existing\" if it is a receptionist." };
  }

  const userId = `usr_rec_${crypto.randomUUID()}`;
  const receptionistId = `rec_${crypto.randomUUID()}`;
  try {
    await dbRepo.createReceptionistAccount({
      userId,
      receptionistId,
      email: data.email,
      passwordHash: hashPassword(data.password),
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone,
      createdByDoctorId: doctorId,
    });
  } catch {
    return { success: false, error: "Could not create the receptionist account. Please try again." };
  }

  await dbRepo.assignReceptionist(doctorId, receptionistId);
  const created = (await dbRepo.getReceptionistsForDoctor(doctorId)).find((r) => r.id === receptionistId);
  if (!created) return { success: false, error: "The account was created but could not be assigned. Try assigning it by email." };
  return {
    success: true,
    message: `${data.firstName} ${data.lastName} can now sign in through the Receptionist button on the login page.`,
    data: created,
  };
}

/** Assigns an existing receptionist (by login email) to this doctor. Safe to repeat. */
export async function assignExistingReceptionist(doctorId: string, email: string): Promise<TeamResult<ReceptionistWithEmail>> {
  const parsed = z.string().trim().toLowerCase().email().safeParse(email);
  if (!parsed.success) return { success: false, error: "Enter the receptionist's email address." };

  const receptionist = await dbRepo.getReceptionistByEmail(parsed.data);
  if (!receptionist) return { success: false, error: "No receptionist account was found with that email." };

  const added = await dbRepo.assignReceptionist(doctorId, receptionist.id);
  return {
    success: true,
    message: added
      ? `${receptionist.firstName} ${receptionist.lastName} is now assigned to your queue.`
      : `${receptionist.firstName} ${receptionist.lastName} is already assigned to your queue.`,
    data: receptionist,
  };
}

/** Removes a receptionist from this doctor's queue. Their access to this doctor ends on their next request. */
export async function revokeReceptionistFromDoctor(doctorId: string, receptionistId: string): Promise<TeamResult> {
  const removed = await dbRepo.revokeReceptionist(doctorId, receptionistId);
  if (!removed) return { success: false, error: "That receptionist is not assigned to you." };
  return { success: true, message: "Receptionist removed from your queue." };
}

/** Sets a new password. Only the doctor who created the account may do this. */
export async function resetReceptionistPassword(
  doctorId: string,
  receptionistId: string,
  newPassword: string
): Promise<TeamResult> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) return { success: false, error: firstIssue(parsed.error) };

  const receptionist = await dbRepo.getReceptionistById(receptionistId);
  if (!receptionist || receptionist.createdByDoctorId !== doctorId) {
    return { success: false, error: "Only the doctor who created this account can reset its password." };
  }
  const ok = await dbRepo.updateUserPasswordHash(receptionist.userId, hashPassword(parsed.data));
  if (!ok) return { success: false, error: "Could not update the password." };
  return { success: true, message: "Password updated. Share it with the receptionist securely." };
}
