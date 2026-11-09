import { MockInsuranceProvider } from "./mock-provider";
import type { InsuranceProvider } from "./types";

export * from "./types";
export { MockInsuranceProvider } from "./mock-provider";

declare global {
  // eslint-disable-next-line no-var
  var __medrellaInsuranceProvider: InsuranceProvider | undefined;
}

/**
 * Returns the insurance provider, or null when insurance workflows are switched off.
 *
 * There is no real insurer integration yet. The simulated insurer runs outside production, and in
 * production only when INSURANCE_PROVIDER=mock is set on purpose (for a demo deployment). Without
 * that, insurance features stay disabled instead of pretending to talk to an insurer.
 */
export function getInsuranceProvider(): InsuranceProvider | null {
  const choice = process.env.INSURANCE_PROVIDER?.trim().toLowerCase();
  const allowSimulator = process.env.NODE_ENV !== "production" || choice === "mock";
  if (!allowSimulator || choice === "off") return null;
  if (!globalThis.__medrellaInsuranceProvider) {
    globalThis.__medrellaInsuranceProvider = new MockInsuranceProvider();
  }
  return globalThis.__medrellaInsuranceProvider;
}
