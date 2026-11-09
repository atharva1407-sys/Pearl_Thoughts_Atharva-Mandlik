import crypto from "crypto";
import type {
  AppointmentEntity,
  ClaimEntity,
  InsurancePolicyEntity,
  MedrellaRepository,
  PreauthRequestEntity,
} from "@/db/repo";
import { createNotification } from "../notifications/create";
import { formatPaise, rupeesToPaise } from "../payments";
import { getInsuranceProvider, type InsuranceProvider } from "./index";

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = <T>(error: string): ServiceResult<T> => ({ ok: false, error });
const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });

const TERMINAL_PREAUTH = new Set(["APPROVED", "REJECTED", "CANCELLED"]);
const TERMINAL_CLAIM = new Set(["SETTLED", "REJECTED"]);

function requireProvider(provider?: InsuranceProvider | null): InsuranceProvider | null {
  return provider === undefined ? getInsuranceProvider() : provider;
}

const NOT_CONFIGURED = "Insurance services are not enabled for this hospital yet.";

function shortError(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 160);
}

/** Saves a policy for a patient and checks it with the insurer. */
export async function addPolicy(
  repo: MedrellaRepository,
  patientId: string,
  input: { insurerName: string; policyNumber: string },
  providerArg?: InsuranceProvider | null
): Promise<ServiceResult<InsurancePolicyEntity>> {
  const provider = requireProvider(providerArg);
  if (!provider) return fail(NOT_CONFIGURED);

  const patient = await repo.getPatientById(patientId);
  if (!patient) return fail("Patient not found.");

  const policyNumber = input.policyNumber.trim().toUpperCase();
  const existing = (await repo.getInsurancePoliciesByPatientId(patientId)).find((p) => p.policyNumber === policyNumber);
  if (existing) return fail("This policy is already on file.");

  let policy: InsurancePolicyEntity;
  try {
    policy = await repo.createInsurancePolicy({
      id: `pol_${crypto.randomUUID()}`,
      patientId,
      insurerName: input.insurerName.trim(),
      policyNumber,
      sumInsuredPaise: 0,
      copayPercent: 0,
      status: "PENDING_VERIFICATION",
    });
  } catch (err) {
    // A second request for the same policy lost the race against the unique index.
    return fail(/unique|duplicate|already/i.test(shortError(err)) ? "This policy is already on file." : "Could not save the policy. Please try again.");
  }
  return verifyPolicy(repo, patientId, policy.id, provider);
}

export async function verifyPolicy(
  repo: MedrellaRepository,
  patientId: string,
  policyId: string,
  providerArg?: InsuranceProvider | null
): Promise<ServiceResult<InsurancePolicyEntity>> {
  const provider = requireProvider(providerArg);
  if (!provider) return fail(NOT_CONFIGURED);

  const policy = await repo.getInsurancePolicyById(policyId);
  if (!policy || policy.patientId !== patientId) return fail("Policy not found.");
  const patient = await repo.getPatientById(patientId);

  try {
    const result = await provider.verifyPolicy({
      insurerName: policy.insurerName,
      policyNumber: policy.policyNumber,
      holderName: patient ? `${patient.firstName} ${patient.lastName}` : "Policy holder",
    });
    await repo.updateInsurancePolicy(policy.id, {
      status: result.active ? "ACTIVE" : "INACTIVE",
      sumInsuredPaise: result.sumInsuredPaise,
      copayPercent: result.copayPercent,
      providerReference: result.reference,
      verifiedAt: new Date(),
    });
  } catch (err) {
    return fail(`Could not verify the policy right now: ${shortError(err)}`);
  }
  return ok((await repo.getInsurancePolicyById(policy.id)) as InsurancePolicyEntity);
}

async function ownAppointment(
  repo: MedrellaRepository,
  patientId: string,
  appointmentId: string
): Promise<AppointmentEntity | undefined> {
  const appointment = await repo.getAppointmentById(appointmentId);
  return appointment && appointment.patientId === patientId ? appointment : undefined;
}

/** Asks the insurer to pre-approve cashless treatment for an upcoming booked visit. */
export async function requestPreauth(
  repo: MedrellaRepository,
  patientId: string,
  input: { appointmentId: string; policyId: string },
  providerArg?: InsuranceProvider | null
): Promise<ServiceResult<PreauthRequestEntity>> {
  const provider = requireProvider(providerArg);
  if (!provider) return fail(NOT_CONFIGURED);

  const appointment = await ownAppointment(repo, patientId, input.appointmentId);
  if (!appointment) return fail("Appointment not found.");
  if (appointment.status !== "BOOKED") return fail("Pre-authorisation is only possible for a confirmed, upcoming appointment.");

  const policy = await repo.getInsurancePolicyById(input.policyId);
  if (!policy || policy.patientId !== patientId) return fail("Policy not found.");
  if (policy.status !== "ACTIVE") return fail("This policy is not active. Verify it first.");

  const doctor = await repo.getDoctorById(appointment.doctorId);
  if (!doctor) return fail("Doctor not found.");
  const estimatedAmountPaise = rupeesToPaise(doctor.consultationFee);
  if (estimatedAmountPaise <= 0) return fail("This consultation is complimentary, so no insurance approval is needed.");

  const existing = await repo.getPreauthByAppointmentId(appointment.id);
  if (existing && !["REJECTED", "CANCELLED"].includes(existing.status)) {
    return ok(existing); // already in progress or approved: never duplicate
  }

  let request: PreauthRequestEntity;
  if (existing) {
    await repo.updatePreauthRequest(existing.id, {
      status: "REQUESTED",
      policyId: policy.id,
      estimatedAmountPaise,
      approvedAmountPaise: null,
      statusNote: null,
      providerReference: null,
    });
    request = { ...existing, status: "REQUESTED", policyId: policy.id, estimatedAmountPaise };
  } else {
    try {
      request = await repo.createPreauthRequest({
        id: `pre_${crypto.randomUUID()}`,
        policyId: policy.id,
        appointmentId: appointment.id,
        patientId,
        estimatedAmountPaise,
        status: "REQUESTED",
      });
    } catch {
      // A parallel request created it first: return that one instead of failing.
      const raced = await repo.getPreauthByAppointmentId(appointment.id);
      return raced ? ok(raced) : fail("Could not create the request. Please try again.");
    }
  }

  try {
    const { reference } = await provider.submitPreauth({
      policyNumber: policy.policyNumber,
      estimatedAmountPaise,
      requestId: request.id,
    });
    await repo.updatePreauthRequest(request.id, { status: "SUBMITTED", providerReference: reference });
  } catch (err) {
    await repo.updatePreauthRequest(request.id, {
      status: "REQUESTED",
      statusNote: `Could not reach the insurer: ${shortError(err)}`,
    });
    return fail("The insurer could not be reached. Please try again in a few minutes.");
  }
  return ok((await repo.getPreauthByAppointmentId(appointment.id)) as PreauthRequestEntity);
}

/** Polls the insurer for the latest pre-authorisation status. */
export async function refreshPreauth(
  repo: MedrellaRepository,
  patientId: string,
  appointmentId: string,
  providerArg?: InsuranceProvider | null
): Promise<ServiceResult<PreauthRequestEntity>> {
  const provider = requireProvider(providerArg);
  if (!provider) return fail(NOT_CONFIGURED);

  const request = await repo.getPreauthByAppointmentId(appointmentId);
  if (!request || request.patientId !== patientId) return fail("No pre-authorisation found for this appointment.");
  if (TERMINAL_PREAUTH.has(request.status) || !request.providerReference) return ok(request);

  const policy = await repo.getInsurancePolicyById(request.policyId);
  if (!policy) return fail("Policy not found.");

  try {
    const result = await provider.getPreauthStatus({
      reference: request.providerReference,
      policyNumber: policy.policyNumber,
      estimatedAmountPaise: request.estimatedAmountPaise,
      sumInsuredPaise: policy.sumInsuredPaise,
      copayPercent: policy.copayPercent,
    });
    if (result.status !== request.status) {
      await repo.updatePreauthRequest(request.id, {
        status: result.status,
        approvedAmountPaise: result.approvedAmountPaise ?? null,
        statusNote: result.note ?? null,
      });
      await notifyInsurance(repo, patientId, appointmentId, "PREAUTH_UPDATE", `preauth-${request.id}-${result.status}`, {
        statusLabel: result.status,
        amountFormatted: formatPaise(result.approvedAmountPaise ?? request.estimatedAmountPaise),
        reference: request.providerReference,
        note: result.note,
      });
    }
  } catch (err) {
    return fail(`Could not reach the insurer: ${shortError(err)}`);
  }
  return ok((await repo.getPreauthByAppointmentId(appointmentId)) as PreauthRequestEntity);
}

/** Cancels any open pre-authorisation when its appointment is cancelled. Never throws. */
export async function cancelPreauthForAppointment(repo: MedrellaRepository, appointmentId: string): Promise<void> {
  try {
    const request = await repo.getPreauthByAppointmentId(appointmentId);
    if (request && request.status !== "CANCELLED" && request.status !== "REJECTED") {
      await repo.updatePreauthRequest(request.id, {
        status: "CANCELLED",
        statusNote: "The appointment was cancelled.",
      });
    }
  } catch (err) {
    console.warn(`[INSURANCE_PREAUTH_CANCEL_FAILED] ${shortError(err)}`);
  }
}

/** Submits a claim for a completed visit. One claim per appointment. */
export async function submitClaim(
  repo: MedrellaRepository,
  patientId: string,
  input: { appointmentId: string; policyId: string },
  providerArg?: InsuranceProvider | null
): Promise<ServiceResult<ClaimEntity>> {
  const provider = requireProvider(providerArg);
  if (!provider) return fail(NOT_CONFIGURED);

  const appointment = await ownAppointment(repo, patientId, input.appointmentId);
  if (!appointment) return fail("Appointment not found.");
  if (appointment.status !== "COMPLETED") return fail("A claim can only be filed after the consultation is completed.");

  const existing = await repo.getClaimByAppointmentId(appointment.id);
  if (existing) return ok(existing);

  const policy = await repo.getInsurancePolicyById(input.policyId);
  if (!policy || policy.patientId !== patientId) return fail("Policy not found.");
  if (policy.status !== "ACTIVE") return fail("This policy is not active.");

  const doctor = await repo.getDoctorById(appointment.doctorId);
  if (!doctor) return fail("Doctor not found.");
  const amountPaise = rupeesToPaise(doctor.consultationFee);
  if (amountPaise <= 0) return fail("This consultation was complimentary, so there is nothing to claim.");

  const preauth = await repo.getPreauthByAppointmentId(appointment.id);
  let claim: ClaimEntity;
  try {
    claim = await repo.createClaim({
      id: `clm_${crypto.randomUUID()}`,
      policyId: policy.id,
      appointmentId: appointment.id,
      patientId,
      preauthId: preauth && preauth.status === "APPROVED" ? preauth.id : null,
      amountPaise,
      status: "SUBMITTED",
    });
  } catch {
    const raced = await repo.getClaimByAppointmentId(appointment.id);
    return raced ? ok(raced) : fail("Could not file the claim. Please try again.");
  }

  try {
    const { reference } = await provider.submitClaim({
      policyNumber: policy.policyNumber,
      amountPaise,
      requestId: claim.id,
    });
    await repo.updateClaim(claim.id, { providerReference: reference });
  } catch (err) {
    await repo.updateClaim(claim.id, { statusNote: `Could not reach the insurer: ${shortError(err)}` });
    return fail("The insurer could not be reached. Your claim is saved; try refreshing its status later.");
  }
  return ok((await repo.getClaimByAppointmentId(appointment.id)) as ClaimEntity);
}

export async function refreshClaim(
  repo: MedrellaRepository,
  patientId: string,
  appointmentId: string,
  providerArg?: InsuranceProvider | null
): Promise<ServiceResult<ClaimEntity>> {
  const provider = requireProvider(providerArg);
  if (!provider) return fail(NOT_CONFIGURED);

  const claim = await repo.getClaimByAppointmentId(appointmentId);
  if (!claim || claim.patientId !== patientId) return fail("No claim found for this appointment.");
  if (TERMINAL_CLAIM.has(claim.status) || !claim.providerReference) return ok(claim);

  const policy = await repo.getInsurancePolicyById(claim.policyId);
  if (!policy) return fail("Policy not found.");

  try {
    const result = await provider.getClaimStatus({
      reference: claim.providerReference,
      policyNumber: policy.policyNumber,
      amountPaise: claim.amountPaise,
      copayPercent: policy.copayPercent,
    });
    if (result.status !== claim.status) {
      await repo.updateClaim(claim.id, {
        status: result.status,
        settledAmountPaise: result.settledAmountPaise ?? null,
        statusNote: result.note ?? null,
      });
      await notifyInsurance(repo, patientId, appointmentId, "CLAIM_UPDATE", `claim-${claim.id}-${result.status}`, {
        statusLabel: result.status,
        amountFormatted: formatPaise(result.settledAmountPaise ?? claim.amountPaise),
        reference: claim.providerReference,
        note: result.note,
      });
    }
  } catch (err) {
    return fail(`Could not reach the insurer: ${shortError(err)}`);
  }
  return ok((await repo.getClaimByAppointmentId(appointmentId)) as ClaimEntity);
}

async function notifyInsurance(
  repo: MedrellaRepository,
  patientId: string,
  appointmentId: string,
  template: "PREAUTH_UPDATE" | "CLAIM_UPDATE",
  dedupeKey: string,
  extra: Record<string, string | undefined>
): Promise<void> {
  try {
    const patient = await repo.getPatientById(patientId);
    const user = patient ? await repo.getUserById(patient.userId) : undefined;
    const appointment = await repo.getAppointmentById(appointmentId);
    const doctor = appointment ? await repo.getDoctorById(appointment.doctorId) : undefined;
    if (!patient || !user) return;
    await createNotification(repo, {
      userId: user.id,
      appointmentId,
      template,
      recipient: user.email,
      dedupeKey,
      payload: {
        patientName: `${patient.firstName} ${patient.lastName}`,
        doctorName: doctor ? `${doctor.firstName} ${doctor.lastName}` : undefined,
        appointmentDate: appointment?.appointmentDate,
        startTime: appointment?.startTime,
        ...extra,
      },
    });
  } catch (err) {
    console.warn(`[INSURANCE_NOTIFY_FAILED] ${shortError(err)}`);
  }
}
