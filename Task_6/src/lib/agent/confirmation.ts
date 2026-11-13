import crypto from "crypto";

/**
 * Confirmation tokens are how the assistant stays "propose, never act": the model can only PREPARE
 * a booking, cancellation or reschedule. The patient presses Confirm in the chat, which sends the
 * signed token to /api/agent/confirm, and only then does anything change.
 *
 * A token is bound to one user, one exact action and a short lifetime, and it is signed with the
 * server secret, so neither the model nor the browser can edit or forge what it authorises.
 */

export type ConfirmAction =
  | { type: "BOOK"; doctorId: string; date: string; startTime: string; reason: string }
  | { type: "CANCEL"; appointmentId: string }
  | { type: "RESCHEDULE"; appointmentId: string; newDate: string; newStartTime: string };

export const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

interface TokenBody {
  v: 1;
  u: string;
  a: ConfirmAction;
  n: string;
  e: number;
}

export type VerifyResult =
  | { ok: true; action: ConfirmAction; nonce: string; expiresAt: number }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "WRONG_USER" };

function secret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required to sign assistant confirmations.");
  }
  return "dev-local-secret-key-pearl-thoughts-offline-only";
}

const b64 = (buf: Buffer) => buf.toString("base64url");

function mac(payload: string): string {
  return b64(crypto.createHmac("sha256", `agent-confirm:${secret()}`).update(payload).digest());
}

export function signConfirmation(
  userId: string,
  action: ConfirmAction,
  now: Date = new Date()
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + CONFIRMATION_TTL_MS);
  const body: TokenBody = { v: 1, u: userId, a: action, n: crypto.randomUUID(), e: expiresAt.getTime() };
  const payload = b64(Buffer.from(JSON.stringify(body), "utf-8"));
  return { token: `${payload}.${mac(payload)}`, expiresAt };
}

export function verifyConfirmation(token: unknown, userId: string, now: Date = new Date()): VerifyResult {
  if (typeof token !== "string" || token.length > 2000) return { ok: false, reason: "INVALID" };
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return { ok: false, reason: "INVALID" };

  const expected = Buffer.from(mac(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false, reason: "INVALID" };

  let body: TokenBody;
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  } catch {
    return { ok: false, reason: "INVALID" };
  }
  if (body?.v !== 1 || typeof body.u !== "string" || typeof body.n !== "string" || typeof body.e !== "number" || !body.a) {
    return { ok: false, reason: "INVALID" };
  }
  if (body.u !== userId) return { ok: false, reason: "WRONG_USER" };
  if (now.getTime() > body.e) return { ok: false, reason: "EXPIRED" };
  return { ok: true, action: body.a, nonce: body.n, expiresAt: body.e };
}

// A token works once. In-memory is enough: every action it can trigger is also re-validated and
// idempotent on the server (a second booking of a taken slot or a second cancel is refused).
const consumed = new Map<string, number>();

export function consumeNonce(nonce: string, expiresAt: number, now: number = Date.now()): boolean {
  for (const [key, exp] of consumed) if (exp < now) consumed.delete(key);
  if (consumed.has(nonce)) return false;
  consumed.set(nonce, expiresAt);
  return true;
}

export function resetConfirmationsForTests(): void {
  consumed.clear();
}
