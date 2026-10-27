import crypto from "crypto";

// SHA-256 with salt for secure and portable password hashing
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, originalHash] = storedHash.split(":");
    if (!salt || !originalHash) return false;
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha256").toString("hex");
    return hash === originalHash;
  } catch {
    return false;
  }
}

// Lightweight JWT / signed session token implementation using HMAC-SHA256
const SESSION_SECRET = process.env.SESSION_SECRET || "medrella-super-secret-key-pearl-thoughts-task-2";

export interface SessionPayload {
  userId: string;
  email: string;
  role: "PATIENT" | "DOCTOR";
  profileId: string;
  name: string;
  exp: number;
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  const data: SessionPayload = { ...payload, exp };
  const encodedData = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(encodedData).digest("base64url");
  return `${encodedData}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [encodedData, signature] = token.split(".");
    if (!encodedData || !signature) return null;

    const expectedSignature = crypto.createHmac("sha256", SESSION_SECRET).update(encodedData).digest("base64url");
    if (signature !== expectedSignature) return null;

    const payload: SessionPayload = JSON.parse(Buffer.from(encodedData, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}
