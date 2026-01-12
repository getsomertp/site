import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set. See .env.example.");
}

const poolMax = Number.parseInt(process.env.PG_POOL_MAX || "10", 10);
const shouldUseSsl =
  /sslmode=require/i.test(connectionString) ||
  process.env.PGSSLMODE === "require" ||
  process.env.DATABASE_SSL === "true";

export const pool = new Pool({
  connectionString,
  max: Number.isFinite(poolMax) ? poolMax : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ...(shouldUseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle(pool, { schema });
