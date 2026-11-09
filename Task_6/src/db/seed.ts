import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { seedSpecialists } from "./seed-specialists";
import { getSeedDoctorPassword } from "./specialists-catalog";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ ERROR: DATABASE_URL is not set in environment or .env.local");
    console.error("Please add your Neon PostgreSQL connection string: DATABASE_URL=postgresql://...");
    process.exit(1);
  }

  let password: string;
  try {
    password = getSeedDoctorPassword({ allowDevFallback: false });
  } catch (err) {
    console.error(`❌ ERROR: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log("Connecting to Neon PostgreSQL...");
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });

  console.log("Seeding Ruby Hall specialists, profiles and weekly sessions...");
  const count = await seedSpecialists(db, password);

  console.log(`✅ Seeded ${count} specialists. New doctor accounts use SEED_DOCTOR_PASSWORD; existing accounts kept their password.`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
