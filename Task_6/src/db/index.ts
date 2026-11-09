import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// Cache pool globally across Serverless/Edge function invocations
declare global {
  // eslint-disable-next-line no-var
  var __medrellaPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

export function isPostgresConfigured(): boolean {
  return Boolean(connectionString && connectionString.startsWith("postgres"));
}

/**
 * Retrieves the database client.
 * Fails loudly in production if DATABASE_URL is missing on Vercel to prevent silent in-memory data loss.
 */
export function assertProductionDatabase() {
  if (process.env.NODE_ENV === "production" && !isPostgresConfigured()) {
    throw new Error(
      "FATAL DATABASE CONFIGURATION: 'DATABASE_URL' environment variable is missing in production. " +
      "You must configure DATABASE_URL in Vercel project settings to connect to Neon PostgreSQL."
    );
  }
}

let pool: Pool | null = null;

if (isPostgresConfigured()) {
  if (!globalThis.__medrellaPool) {
    globalThis.__medrellaPool = new Pool({ connectionString });
  }
  pool = globalThis.__medrellaPool;
}

export const db = pool ? drizzle(pool, { schema }) : null;
export type DbClient = typeof db;
