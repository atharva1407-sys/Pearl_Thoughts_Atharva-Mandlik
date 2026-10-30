import crypto from "crypto";

// Security Standard: OWASP recommends >= 600,000 iterations for PBKDF2-HMAC-SHA256
const PBKDF2_RECOMMENDED_ITERATIONS = 600_000;
const KEY_LEN = 64;
const DIGEST = "sha256";

/**
 * Hash password using PBKDF2 with 600,000 iterations and 16-byte cryptographically secure salt.
 * Formatted as: pbkdf2:<iterations>:<salt>:<hash>
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_RECOMMENDED_ITERATIONS, KEY_LEN, DIGEST)
    .toString("hex");
  return `pbkdf2:${PBKDF2_RECOMMENDED_ITERATIONS}:${salt}:${hash}`;
}

/**
 * Verify password against stored hash using constant-time comparison to prevent timing attacks.
 * Supports modern modular format (pbkdf2:<iterations>:<salt>:<hash>) and legacy (<salt>:<hash>).
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    if (!storedHash) return false;

    let iterations = PBKDF2_RECOMMENDED_ITERATIONS;
    let salt = "";
    let expectedHash = "";

    if (storedHash.startsWith("pbkdf2:")) {
      const parts = storedHash.split(":");
      if (parts.length !== 4) return false;
      iterations = parseInt(parts[1], 10);
      salt = parts[2];
      expectedHash = parts[3];
    } else {
      // Legacy backward compatibility for older 1,000 iteration hashes
      const parts = storedHash.split(":");
      if (parts.length !== 2) return false;
      iterations = 1000;
      salt = parts[0];
      expectedHash = parts[1];
    }

    if (!salt || !expectedHash || isNaN(iterations)) return false;

    const actualHash = crypto
      .pbkdf2Sync(password, salt, iterations, KEY_LEN, DIGEST)
      .toString("hex");

    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const actualBuffer = Buffer.from(actualHash, "hex");

    if (expectedBuffer.length !== actualBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}

/**
 * Validates and retrieves SESSION_SECRET.
 * In production (e.g. Vercel deployment), crashes immediately if unset to prevent forgery.
 */
function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.trim() === "") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "FATAL SECURITY CONFIGURATION: 'SESSION_SECRET' environment variable is missing. " +
        "You must configure SESSION_SECRET in Vercel project environment variables to prevent token forgery."
      );
    }
    // Safe fallback strictly for offline local development
    return "dev-local-secret-key-pearl-thoughts-offline-only";
  }
  return secret;
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: "PATIENT" | "DOCTOR";
  profileId: string;
  name: string;
  exp: number;
}

export function createSessionToken(payload: Omit<SessionPayload, "exp">): string {
  const secret = getSessionSecret();
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  const data: SessionPayload = { ...payload, exp };
  const encodedData = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encodedData).digest("base64url");
  return `${encodedData}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const secret = getSessionSecret();
    const [encodedData, signature] = token.split(".");
    if (!encodedData || !signature) return null;

    const expectedSignature = crypto.createHmac("sha256", secret).update(encodedData).digest("base64url");
    
    // Constant time comparison for signature verification
    const sigBuffer = Buffer.from(signature);
    const expectedSigBuffer = Buffer.from(expectedSignature);
    if (sigBuffer.length !== expectedSigBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) return null;

    const payload: SessionPayload = JSON.parse(Buffer.from(encodedData, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}
