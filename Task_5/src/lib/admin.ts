/**
 * Admin authorization utilities for Medrella Healthcare.
 * Checks administrative permissions against the configured ADMIN_EMAILS environment variable.
 */

export function isAdminUser(email?: string | null): boolean {
  if (!email) return false;
  const configured = process.env.ADMIN_EMAILS || "";
  const allowed = configured
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}
