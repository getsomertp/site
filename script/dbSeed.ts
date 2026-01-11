/**
 * script/dbSeed.ts
 *
 * Idempotent seed data for a fresh database:
 * - Ensures required site setting keys exist
 * - Inserts a starter casino list if no casinos exist
 *
 * Run:
 *   npm run db:bootstrap
 *   npm run db:push
 *   npm run db:seed
 */
import { db } from "../server/db";
import { casinos, siteSettings } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

type SeedCasino = {
  name: string;
  slug: string;
  color: string;
  tier: "platinum" | "gold" | "silver" | "none";
  affiliateLink: string;
  sortOrder: number;
  bonus?: string;
  rakeback?: string;
  description?: string;
};

const SEED_SITE_SETTINGS: Array<{ key: string; value: string }> = [
  { key: "kickUrl", value: "" },
  { key: "discordUrl", value: "" },
];

const SEED_CASINOS: SeedCasino[] = [
  {
    name: "Stake",
    slug: "stake",
    color: "#1a1a2e",
    tier: "platinum",
    affiliateLink: "https://stake.com/",
    sortOrder: 10,
    bonus: "",
    rakeback: "",
  },
  {
    name: "Rollbit",
    slug: "rollbit",
    color: "#ff6b35",
    tier: "gold",
    affiliateLink: "https://rollbit.com/",
    sortOrder: 20,
    bonus: "",
    rakeback: "",
  },
  {
    name: "Duelbits",
    slug: "duelbits",
    color: "#00d4aa",
    tier: "gold",
    affiliateLink: "https://duelbits.com/",
    sortOrder: 30,
    bonus: "",
    rakeback: "",
  },
  {
    name: "Gamdom",
    slug: "gamdom",
    color: "#7c3aed",
    tier: "silver",
    affiliateLink: "https://gamdom.com/",
    sortOrder: 40,
    bonus: "",
    rakeback: "",
  },
];

async function ensureSiteSettings() {
  for (const s of SEED_SITE_SETTINGS) {
    const [existing] = await db.select().from(siteSettings).where(eq(siteSettings.key, s.key));
    if (!existing) {
      await db.insert(siteSettings).values(s);
      // eslint-disable-next-line no-console
      console.log(`Inserted site setting: ${s.key}`);
    }
  }
}

async function seedCasinosIfEmpty() {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(casinos);

  if ((count ?? 0) > 0) {
    // eslint-disable-next-line no-console
    console.log("Casinos already exist; skipping casino seed.");
    return;
  }

  await db.insert(casinos).values(
    SEED_CASINOS.map((c) => ({
      name: c.name,
      slug: c.slug,
      color: c.color,
      tier: c.tier,
      affiliateCode: "", // fill in via Admin UI
      affiliateLink: c.affiliateLink,
      bonus: c.bonus ?? null,
      rakeback: c.rakeback ?? null,
      description: c.description ?? null,
      isActive: true,
      sortOrder: c.sortOrder,
    })),
  );

  // eslint-disable-next-line no-console
  console.log(`Seeded ${SEED_CASINOS.length} casinos.`);
}

async function main() {
  await ensureSiteSettings();
  await seedCasinosIfEmpty();
}

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log("Seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", err);
    process.exit(1);
  });
