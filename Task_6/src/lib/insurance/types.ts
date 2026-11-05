import type { ClaimStatus, PreauthStatus } from "@/db/repo";

/**
 * Contract every insurer / TPA integration implements. Medrella only talks to this interface, so a
 * real integration (an insurer API, a TPA or a health-claims exchange) can replace the simulator
 * without touching booking, the agent or the UI.
 */
export interface InsuranceProvider {
  /** "SIMULATED" for the built-in demo insurer. */
  readonly name: string;
  readonly isSimulated: boolean;

  verifyPolicy(input: {
    insurerName: string;
    policyNumber: string;
    holderName: string;
  }): Promise<VerifyPolicyResult>;

  submitPreauth(input: {
    policyNumber: string;
    estimatedAmountPaise: number;
    requestId: string;
  }): Promise<{ reference: string }>;

  getPreauthStatus(input: {
    reference: string;
    policyNumber: string;
    estimatedAmountPaise: number;
    sumInsuredPaise: number;
    copayPercent: number;
  }): Promise<PreauthStatusResult>;

  submitClaim(input: {
    policyNumber: string;
    amountPaise: number;
    requestId: string;
  }): Promise<{ reference: string }>;

  getClaimStatus(input: {
    reference: string;
    policyNumber: string;
    amountPaise: number;
    copayPercent: number;
  }): Promise<ClaimStatusResult>;
}

export interface VerifyPolicyResult {
  active: boolean;
  sumInsuredPaise: number;
  copayPercent: number;
  reference: string;
  note?: string;
}

export interface PreauthStatusResult {
  status: Extract<PreauthStatus, "SUBMITTED" | "QUERY" | "APPROVED" | "REJECTED">;
  approvedAmountPaise?: number;
  note?: string;
}

export interface ClaimStatusResult {
  status: ClaimStatus;
  settledAmountPaise?: number;
  note?: string;
}
