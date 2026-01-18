import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";

import { db } from "./db";
import { storage } from "./storage";
import { giveaways } from "@shared/schema";

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function log(message: string, meta?: any) {
  const payload = {
    ts: new Date().toISOString(),
    source: "giveawayJobs",
    msg: message,
    ...(meta ? { meta } : {}),
  };

  if ((process.env.NODE_ENV || "development") === "production") {
    console.log(JSON.stringify(payload));
    return;
  }

  // Dev: readable
  try {
    console.log(`[giveawayJobs] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
  } catch {
    console.log(`[giveawayJobs] ${message}`);
  }
}

async function auditSystem(action: string, giveawayId: number, details?: any) {
  try {
    await storage.createAdminAuditLog({
      action,
      entityType: "giveaway",
      entityId: String(giveawayId),
      details: details ? JSON.stringify(details) : null,
      actorUserId: null,
      actorRole: "system",
      actorLabel: "system",
      ip: null,
      userAgent: null,
    } as any);
  } catch {
    // never block
  }
}

async function pickWinnerAuto(giveawayId: number): Promise<void> {
  const giveaway = await storage.getGiveaway(giveawayId);
  if (!giveaway) return;

  const now = new Date();
  const endsAt = new Date(giveaway.endsAt);
  if (!(endsAt.getTime() <= now.getTime())) return;

  // If already picked, nothing to do.
  if ((giveaway as any).winnerId) return;

  const entries = await storage.getGiveawayEntries(giveawayId); // ordered by id asc
  if (!entries.length) {
    // No entries: mark inactive (ended) so it doesn't look "stuck".
    await db
      .update(giveaways)
      .set({ isActive: false } as any)
      .where(eq(giveaways.id, giveawayId));
    await auditSystem("giveaway.auto_end_no_entries", giveawayId, {
      title: giveaway.title,
      endsAt: giveaway.endsAt,
    });
    return;
  }

  const priorPfSeed = String((giveaway as any).pfSeed || "");
  const priorPfSeedHash = String((giveaway as any).pfSeedHash || "");
  const needsCommit = !priorPfSeed || !priorPfSeedHash;

  const pfSeed = needsCommit ? crypto.randomBytes(32).toString("hex") : priorPfSeed;
  const pfSeedHash = needsCommit ? sha256Hex(pfSeed) : priorPfSeedHash;

  const entryIdsCsv = entries.map((e: any) => String(e.id)).join(",");
  const entriesHash = sha256Hex(entryIdsCsv);

  const pickHash = sha256Hex(`${pfSeed}|${giveawayId}|${entryIdsCsv}`);
  const idx = Number(BigInt("0x" + pickHash) % BigInt(entries.length));
  const winnerEntry = entries[idx];
  const winnerId = winnerEntry.userId;

  const patch: any = {
    winnerId,
    isActive: false,
    winnerPickedAt: now,
    winnerPickedBy: "system:auto",

    // reveal seed once winner is picked
    winnerSeed: pfSeed,

    // provably-fair metadata
    pfSeed,
    pfSeedHash,
    pfEntriesHash: entriesHash,
    pfWinnerEntryId: winnerEntry.id,
    pfWinnerIndex: idx,
  };

  // Only one instance should "win" the write.
  const [updated] = await db
    .update(giveaways)
    .set(patch)
    .where(and(eq(giveaways.id, giveawayId), sql`${giveaways.winnerId} IS NULL`))
    .returning();

  if (!updated) return;

  await auditSystem("giveaway.auto_pick_winner", giveawayId, {
    title: giveaway.title,
    winnerId,
    entries: entries.length,
    seedCommitHash: pfSeedHash,
    entriesHash,
    winnerIndex: idx,
    winnerEntryId: winnerEntry.id,
    pickHash,
    committedNow: needsCommit,
  });
}

async function backfillSeedReveal(giveawayId: number): Promise<void> {
  const giveaway = await storage.getGiveaway(giveawayId);
  if (!giveaway) return;

  // Only backfill if a winner exists, seed is missing, and we have a committed seed.
  if (!(giveaway as any).winnerId) return;
  if ((giveaway as any).winnerSeed) return;
  if (!(giveaway as any).pfSeed || !(giveaway as any).pfSeedHash) return;

  const entries = await storage.getGiveawayEntries(giveawayId);
  if (!entries.length) return;

  const pfSeed = String((giveaway as any).pfSeed);
  const entryIdsCsv = entries.map((e: any) => String(e.id)).join(",");
  const entriesHash = sha256Hex(entryIdsCsv);

  const pickHash = sha256Hex(`${pfSeed}|${giveawayId}|${entryIdsCsv}`);
  const idx = Number(BigInt("0x" + pickHash) % BigInt(entries.length));
  const winnerEntry = entries[idx];

  // Only backfill if the computed winner matches the stored winner.
  if (String((giveaway as any).winnerId) !== String(winnerEntry.userId)) return;

  const patch: any = {
    winnerSeed: pfSeed,
    isActive: false,
  };
  if (!(giveaway as any).pfEntriesHash) patch.pfEntriesHash = entriesHash;
  if ((giveaway as any).pfWinnerIndex === null || (giveaway as any).pfWinnerIndex === undefined) patch.pfWinnerIndex = idx;
  if ((giveaway as any).pfWinnerEntryId === null || (giveaway as any).pfWinnerEntryId === undefined) patch.pfWinnerEntryId = winnerEntry.id;

  await db.update(giveaways).set(patch).where(eq(giveaways.id, giveawayId));

  await auditSystem("giveaway.backfill_seed_reveal", giveawayId, {
    title: giveaway.title,
    winnerId: (giveaway as any).winnerId,
    entries: entries.length,
    entriesHash,
    winnerIndex: idx,
    winnerEntryId: winnerEntry.id,
    pickHash,
  });
}

async function processGiveawaysTick(): Promise<void> {
  // 1) Auto-pick winners for due giveaways
  const due = await db
    .select({ id: giveaways.id })
    .from(giveaways)
    .where(and(sql`${giveaways.endsAt} <= NOW()`, sql`${giveaways.winnerId} IS NULL`))
    .orderBy(sql`${giveaways.endsAt} ASC`)
    .limit(25);

  for (const row of due) {
    try {
      await pickWinnerAuto(Number(row.id));
    } catch (err: any) {
      log("auto-pick error", { giveawayId: row.id, err: String(err?.message || err) });
    }
  }

  // 2) Backfill seed reveal for already-picked winners (legacy rows)
  const backfill = await db
    .select({ id: giveaways.id })
    .from(giveaways)
    .where(
      and(
        sql`${giveaways.winnerId} IS NOT NULL`,
        sql`${giveaways.winnerSeed} IS NULL`,
        sql`${giveaways.pfSeed} IS NOT NULL`,
        sql`${giveaways.pfSeedHash} IS NOT NULL`,
      ),
    )
    .orderBy(sql`${giveaways.endsAt} DESC`)
    .limit(25);

  for (const row of backfill) {
    try {
      await backfillSeedReveal(Number(row.id));
    } catch (err: any) {
      log("backfill error", { giveawayId: row.id, err: String(err?.message || err) });
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function startGiveawayJobs() {
  if (timer) return;

  const intervalMsRaw = Number(process.env.GIVEAWAY_JOB_INTERVAL_MS || 15000);
  const intervalMs = Number.isFinite(intervalMsRaw) ? Math.max(intervalMsRaw, 5000) : 15000;

  log(`starting (intervalMs=${intervalMs})`);

  const tick = async () => {
    try {
      await processGiveawaysTick();
    } catch (err: any) {
      log("tick crash", { err: String(err?.message || err) });
    }
  };

  // Run once right away
  void tick();

  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  // Don’t keep the process alive just for this timer
  (timer as any).unref?.();
}
