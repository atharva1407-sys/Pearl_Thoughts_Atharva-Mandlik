import crypto from "crypto";
import type {
  ClaimStatusResult,
  InsuranceProvider,
  PreauthStatusResult,
  VerifyPolicyResult,
} from "./types";

const DEFAULT_SUM_INSURED_PAISE = 500_000_00; // ₹5,00,000
const DEFAULT_COPAY_PERCENT = 10;

/**
 * Built-in demo insurer. It does NOT contact any real insurer. Outcomes depend on the policy number
 * so every path can be demonstrated and tested:
 *
 *   ends with "0"      -> policy is inactive (lapsed)
 *   starts with "LOW"  -> tiny sum insured (₹500): larger pre-auths are rejected
 *   contains "QRY"     -> pre-auth first asks for more information, then approves
 *   contains "REJ"     -> claims are rejected
 *   anything else      -> active policy, pre-auth approved on the first status check,
 *                         claims go IN_REVIEW on the first check and SETTLED on the second
 *
 * Status progresses each time it is checked, like polling a real insurer.
 */
export class MockInsuranceProvider implements InsuranceProvider {
  readonly name = "SIMULATED";
  readonly isSimulated = true;

  private polls = new Map<string, number>();

  private nextPoll(reference: string): number {
    const n = (this.polls.get(reference) ?? 0) + 1;
    this.polls.set(reference, n);
    return n;
  }

  async verifyPolicy(input: { insurerName: string; policyNumber: string; holderName: string }): Promise<VerifyPolicyResult> {
    const reference = `SIM-POL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const number = input.policyNumber.toUpperCase();
    if (number.endsWith("0")) {
      return { active: false, sumInsuredPaise: 0, copayPercent: 0, reference, note: "Policy is not active." };
    }
    return {
      active: true,
      sumInsuredPaise: number.startsWith("LOW") ? 500_00 : DEFAULT_SUM_INSURED_PAISE,
      copayPercent: DEFAULT_COPAY_PERCENT,
      reference,
    };
  }

  async submitPreauth(): Promise<{ reference: string }> {
    return { reference: `SIM-PA-${crypto.randomBytes(4).toString("hex").toUpperCase()}` };
  }

  async getPreauthStatus(input: {
    reference: string;
    policyNumber: string;
    estimatedAmountPaise: number;
    sumInsuredPaise: number;
    copayPercent: number;
  }): Promise<PreauthStatusResult> {
    const poll = this.nextPoll(input.reference);
    const number = input.policyNumber.toUpperCase();

    if (input.estimatedAmountPaise > input.sumInsuredPaise) {
      return { status: "REJECTED", note: "The estimated amount is above the sum insured." };
    }
    if (number.includes("QRY") && poll === 1) {
      return { status: "QUERY", note: "The insurer needs additional documents. Please contact the hospital desk." };
    }
    const covered = Math.floor((input.estimatedAmountPaise * (100 - input.copayPercent)) / 100);
    return { status: "APPROVED", approvedAmountPaise: covered };
  }

  async submitClaim(): Promise<{ reference: string }> {
    return { reference: `SIM-CL-${crypto.randomBytes(4).toString("hex").toUpperCase()}` };
  }

  async getClaimStatus(input: {
    reference: string;
    policyNumber: string;
    amountPaise: number;
    copayPercent: number;
  }): Promise<ClaimStatusResult> {
    const poll = this.nextPoll(input.reference);
    if (input.policyNumber.toUpperCase().includes("REJ")) {
      return { status: "REJECTED", note: "The claim is not covered under this policy." };
    }
    if (poll === 1) return { status: "IN_REVIEW", note: "The insurer is reviewing the claim." };
    return {
      status: "SETTLED",
      settledAmountPaise: Math.floor((input.amountPaise * (100 - input.copayPercent)) / 100),
    };
  }
}
