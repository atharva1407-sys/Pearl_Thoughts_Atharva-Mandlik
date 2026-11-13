import { cache } from "react";
import { cookies } from "next/headers";
import { dbRepo } from "@/db/repo";
import { verifySessionToken, type SessionPayload } from "@/lib/auth-crypto";

const COOKIE_NAME = "medrella_session";

/**
 * The signed-in user, checked against the database (the account must still exist and be active).
 *
 * Wrapped in React `cache`: the root layout, the page and anything else rendering the same request share ONE
 * lookup. Before, each of them hit the database separately, and every database round trip is a visible delay.
 * The check itself is unchanged, so a deactivated account is still refused on the very next request.
 */
export const getCurrentUserOncePerRequest = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const dbUser = await dbRepo.getUserById(payload.userId);
  if (!dbUser || !dbUser.isActive) return null;

  return payload;
});
