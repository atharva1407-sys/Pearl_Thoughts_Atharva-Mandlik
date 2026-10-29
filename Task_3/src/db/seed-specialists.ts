import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { hashPassword } from "../lib/auth-crypto";
import { RUBY_HALL_SPECIALISTS, specialistSessionId } from "./specialists-catalog";

/**
 * Idempotently upserts the catalog doctors, their profiles and weekly sessions.
 * - New doctor accounts get `password`; existing accounts keep their current password.
 * - Profile fields and session timings are refreshed from the catalog on every run.
 * Returns the number of doctors processed.
 */
export async function seedSpecialists(
  database: NeonDatabase<typeof schema>,
  password: string
): Promise<number> {
  const passwordHash = hashPassword(password);

  for (const doc of RUBY_HALL_SPECIALISTS) {
    await database.transaction(async (tx) => {
      await tx
        .insert(schema.users)
        .values({
          id: doc.userId,
          email: doc.email.toLowerCase(),
          passwordHash,
          role: "DOCTOR",
          isActive: true,
        })
        .onConflictDoNothing({ target: schema.users.id });

      const profile = {
        firstName: doc.firstName,
        lastName: doc.lastName,
        specialization: doc.specialization,
        phone: doc.phone,
        licenseNumber: doc.licenseNumber,
        experienceYears: doc.experienceYears,
        consultationFee: doc.consultationFee,
        bio: doc.bio,
        profileImage: doc.profileImage,
      };
      await tx
        .insert(schema.doctors)
        .values({ id: doc.id, userId: doc.userId, ...profile })
        .onConflictDoUpdate({ target: schema.doctors.id, set: profile });

      for (const session of doc.sessions) {
        for (const day of session.days) {
          const timing = {
            name: session.name,
            startTime: session.start,
            endTime: session.end,
            slotDurationMinutes: session.duration,
            schedulingType: session.schedulingType,
            patientsPerWave: session.patientsPerWave,
          };
          await tx
            .insert(schema.availabilities)
            .values({
              id: specialistSessionId(doc.id, session.key, day),
              doctorId: doc.id,
              dayOfWeek: day,
              isActive: true,
              ...timing,
            })
            .onConflictDoUpdate({ target: schema.availabilities.id, set: timing });
        }
      }
    });
  }

  return RUBY_HALL_SPECIALISTS.length;
}
