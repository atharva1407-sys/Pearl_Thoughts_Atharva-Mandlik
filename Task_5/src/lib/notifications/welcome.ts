import type { MedrellaRepository } from "../../db/repo";
import { createNotification } from "./create";
import { processDueNotifications } from "./dispatcher";
import { runInBackground } from "../background";

interface WelcomeInput {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "PATIENT" | "DOCTOR";
}

/**
 * Queues the one-time welcome email for a new account and sends it after the response.
 * Never throws: a mail problem must not stop someone from signing up.
 */
export async function sendWelcomeEmail(repo: MedrellaRepository, input: WelcomeInput): Promise<void> {
  try {
    const queued = await createNotification(repo, {
      userId: input.userId,
      template: "WELCOME",
      recipient: input.email,
      payload: {
        patientName: `${input.firstName} ${input.lastName}`.trim(),
        role: input.role,
      },
      dedupeKey: `welcome-${input.userId}`,
    });
    if (!queued) return;
    runInBackground(async () => {
      await processDueNotifications(repo);
    });
  } catch (err: any) {
    console.warn(`[WELCOME_EMAIL_FAILED] ${String(err?.message || err).slice(0, 150)}`);
  }
}
