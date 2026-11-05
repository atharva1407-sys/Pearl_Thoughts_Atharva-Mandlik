"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dbRepo } from "@/db/repo";
import { getCurrentUser } from "./auth";
import {
  addPolicy,
  refreshClaim,
  refreshPreauth,
  requestPreauth,
  submitClaim,
  verifyPolicy,
} from "@/lib/insurance/service";

const policySchema = z.object({
  insurerName: z.string().trim().min(2, "Enter the insurer name.").max(60),
  policyNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{6,24}$/, "Policy number must be 6 to 24 letters, digits or dashes."),
});

const idSchema = z.string().min(1).max(80);
const pairSchema = z.object({ appointmentId: idSchema, policyId: idSchema });

type ActionResult = { success: true; message?: string } | { success: false; error: string };

async function patientId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user && user.role === "PATIENT" ? user.profileId : null;
}

const UNAUTHORISED: ActionResult = { success: false, error: "Please sign in as a patient to use insurance features." };
const BAD_INPUT: ActionResult = { success: false, error: "Invalid request." };

const FAILED: ActionResult = { success: false, error: "Something went wrong. Please try again." };

async function guarded(task: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await task();
  } catch (err) {
    console.error("[INSURANCE_ACTION_ERROR]", err instanceof Error ? err.message.slice(0, 200) : "unknown");
    return FAILED;
  }
}

function done(result: { ok: true } | { ok: false; error: string }, message: string): ActionResult {
  revalidatePath("/patient/insurance");
  return result.ok ? { success: true, message } : { success: false, error: result.error };
}

async function addPolicyActionInner(formData: FormData): Promise<ActionResult> {
  const pid = await patientId();
  if (!pid) return UNAUTHORISED;
  const parsed = policySchema.safeParse({
    insurerName: formData.get("insurerName"),
    policyNumber: formData.get("policyNumber"),
  });
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message };
  const result = await addPolicy(dbRepo, pid, parsed.data);
  if (result.ok && result.value.status === "INACTIVE") {
    revalidatePath("/patient/insurance");
    return { success: true, message: "Policy saved, but the insurer reports it is not active." };
  }
  return done(result.ok ? { ok: true } : result, "Policy added and verified.");
}

async function verifyPolicyActionInner(policyId: string): Promise<ActionResult> {
  const pid = await patientId();
  if (!pid) return UNAUTHORISED;
  if (!idSchema.safeParse(policyId).success) return BAD_INPUT;
  const result = await verifyPolicy(dbRepo, pid, policyId);
  return done(result.ok ? { ok: true } : result, "Policy status refreshed.");
}

async function requestPreauthActionInner(input: { appointmentId: string; policyId: string }): Promise<ActionResult> {
  const pid = await patientId();
  if (!pid) return UNAUTHORISED;
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const result = await requestPreauth(dbRepo, pid, parsed.data);
  return done(result.ok ? { ok: true } : result, "Pre-authorisation request sent to the insurer.");
}

async function refreshPreauthActionInner(appointmentId: string): Promise<ActionResult> {
  const pid = await patientId();
  if (!pid) return UNAUTHORISED;
  if (!idSchema.safeParse(appointmentId).success) return BAD_INPUT;
  const result = await refreshPreauth(dbRepo, pid, appointmentId);
  return done(result.ok ? { ok: true } : result, "Status refreshed.");
}

async function submitClaimActionInner(input: { appointmentId: string; policyId: string }): Promise<ActionResult> {
  const pid = await patientId();
  if (!pid) return UNAUTHORISED;
  const parsed = pairSchema.safeParse(input);
  if (!parsed.success) return BAD_INPUT;
  const result = await submitClaim(dbRepo, pid, parsed.data);
  return done(result.ok ? { ok: true } : result, "Claim submitted to the insurer.");
}

async function refreshClaimActionInner(appointmentId: string): Promise<ActionResult> {
  const pid = await patientId();
  if (!pid) return UNAUTHORISED;
  if (!idSchema.safeParse(appointmentId).success) return BAD_INPUT;
  const result = await refreshClaim(dbRepo, pid, appointmentId);
  return done(result.ok ? { ok: true } : result, "Status refreshed.");
}

export async function addPolicyAction(formData: FormData): Promise<ActionResult> {
  return guarded(() => addPolicyActionInner(formData));
}

export async function verifyPolicyAction(policyId: string): Promise<ActionResult> {
  return guarded(() => verifyPolicyActionInner(policyId));
}

export async function requestPreauthAction(input: { appointmentId: string; policyId: string }): Promise<ActionResult> {
  return guarded(() => requestPreauthActionInner(input));
}

export async function refreshPreauthAction(appointmentId: string): Promise<ActionResult> {
  return guarded(() => refreshPreauthActionInner(appointmentId));
}

export async function submitClaimAction(input: { appointmentId: string; policyId: string }): Promise<ActionResult> {
  return guarded(() => submitClaimActionInner(input));
}

export async function refreshClaimAction(appointmentId: string): Promise<ActionResult> {
  return guarded(() => refreshClaimActionInner(appointmentId));
}
