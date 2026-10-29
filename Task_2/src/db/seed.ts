import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { hashPassword } from "../lib/auth-crypto";
import { RUBY_HALL_SPECIALISTS } from "./specialists-catalog";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ ERROR: DATABASE_URL is not set in environment or .env.local");
    console.error("Please add your Neon PostgreSQL connection string: DATABASE_URL=postgresql://...");
    process.exit(1);
  }

  console.log("Connecting to Neon PostgreSQL...");
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  console.log("Seeding initial specialists and shifts...");
  const defaultPasswordHash = hashPassword("password123");

  for (const doc of RUBY_HALL_SPECIALISTS) {
    // 1. Upsert User
    await db
      .insert(schema.users)
      .values({
        id: doc.userId,
        email: doc.email.toLowerCase(),
        passwordHash: defaultPasswordHash,
        role: "DOCTOR",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: { email: doc.email.toLowerCase() },
      });

    // 2. Upsert Doctor Profile
    await db
      .insert(schema.doctors)
      .values({
        id: doc.id,
        userId: doc.userId,
        firstName: doc.firstName,
        lastName: doc.lastName,
        specialization: doc.specialization,
        phone: doc.phone,
        licenseNumber: doc.licenseNumber,
        experienceYears: doc.experienceYears,
        consultationFee: doc.consultationFee.toString(),
        bio: doc.bio,
      })
      .onConflictDoUpdate({
        target: schema.doctors.id,
        set: {
          firstName: doc.firstName,
          lastName: doc.lastName,
          specialization: doc.specialization,
          consultationFee: doc.consultationFee.toString(),
        },
      });

    // 3. Upsert Availabilities
    for (const day of doc.days) {
      await db
        .insert(schema.availabilities)
        .values({
          id: `avail-${doc.id}-${day}`,
          doctorId: doc.id,
          dayOfWeek: day,
          startTime: doc.start,
          endTime: doc.end,
          slotDurationMinutes: doc.duration,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [schema.availabilities.doctorId, schema.availabilities.dayOfWeek],
          set: {
            startTime: doc.start,
            endTime: doc.end,
            slotDurationMinutes: doc.duration,
            isActive: true,
          },
        });
    }
  }

  console.log(`✅ Successfully seeded ${RUBY_HALL_SPECIALISTS.length} specialists into Neon PostgreSQL!`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
