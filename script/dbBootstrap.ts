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
    console.log("✅ DB bootstrap complete (pgcrypto ready)");
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
