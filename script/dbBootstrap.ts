import pg from "pg";

/**
 * Railway/managed Postgres often starts without optional extensions.
 * Our schema uses gen_random_uuid() in defaults, which requires pgcrypto.
 *
 * This script is safe to run on every boot. It is idempotent.
 */

const { Pool } = pg;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_URL is not set. Skipping db bootstrap.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
    // If an older auth/session table exists (from earlier builds), it can confuse drizzle-kit push
    // into thinking it should be renamed into one of our new tables (non-interactive deploys will fail).
    // This is safe because our app recreates its session table on boot.
    await pool.query(`DROP TABLE IF EXISTS "session" CASCADE;`);
    await pool.query(`DROP TABLE IF EXISTS "sessions" CASCADE;`);
    console.log("✅ DB bootstrap complete (pgcrypto ready; legacy session tables dropped if present)");
  } catch (err: any) {
    // If the DB role cannot create extensions, Drizzle push may still work
    // if your schema doesn't rely on gen_random_uuid(); but in our case it does.
    console.error("❌ DB bootstrap failed:", err?.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
