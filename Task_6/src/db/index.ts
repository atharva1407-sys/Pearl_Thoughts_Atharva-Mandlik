import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { getServerEnv } from "@/lib/env";

// Cache pool globally across Serverless/Edge function invocations
declare global {
  // eslint-disable-next-line no-var
  var __medrellaPool: any | undefined;
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
  const env = getServerEnv();
  if (process.env.NODE_ENV === "production" && !isPostgresConfigured()) {
    throw new Error(
      "FATAL DATABASE CONFIGURATION: 'DATABASE_URL' environment variable is missing in production. " +
      "You must configure DATABASE_URL in Vercel project settings to connect to Neon PostgreSQL."
    );
  }
}

let pool: any = null;
let dbClient: ReturnType<typeof drizzle<typeof schema>> | null = null;

if (isPostgresConfigured() && connectionString) {
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

  if (!globalThis.__medrellaPool) {
    if (isLocal) {
      globalThis.__medrellaPool = new PgPool({
        connectionString,
        max: Number(process.env.DB_POOL_MAX || 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } else {
      globalThis.__medrellaPool = new Pool({
        connectionString,
        max: Number(process.env.DB_POOL_MAX || 10),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    }
  }
  pool = globalThis.__medrellaPool;
  dbClient = isLocal
    ? (pgDrizzle(pool, { schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>)
    : drizzle(pool, { schema });
}

export const db = dbClient;
export type DbClient = typeof db;
