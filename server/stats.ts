import { db } from "./db";
import { giveaways, siteStats as siteStatsTable, userPayments, users } from "@shared/schema";
import { isNotNull, sql } from "drizzle-orm";

export type PublicStatsResponse = {
  community: number;
  givenAway: number;
  winners: number;
  liveHours: number;
  meta: {
    community: {
      mode: "users" | "discord" | "manual";
      source: string;
      base: number;
      extra: number;
      total: number;
    };
    givenAway: { base: number; extra: number; total: number };
    winners: { base: number; extra: number; total: number };
    liveHours: { manual: number };
  };
};

type SiteStatsRow = {
  id: number;
  communityMode: string;
  discordGuildId: string | null;
  communityManual: number;
  communityExtra: number;
  givenAwayExtra: string;
  winnersExtra: number;
  liveHoursManual: number;
  updatedAt: Date | null;
};

let statsCache: { at: number; value: PublicStatsResponse } | null = null;
const STATS_CACHE_MS = 15_000;

let discordCache: { guildId: string; at: number; count: number | null; error?: string } | null = null;
const DISCORD_CACHE_MS = 60_000;

async function ensureStatsRow(): Promise<SiteStatsRow> {
  const [row] = await db.select().from(siteStatsTable).limit(1);
  if (row) return row as any;

  const [created] = await db
    .insert(siteStatsTable)
    .values({
      communityMode: "users",
      communityManual: 0,
      communityExtra: 0,
      givenAwayExtra: "0",
      winnersExtra: 0,
      liveHoursManual: 0,
      updatedAt: new Date(),
    } as any)
    .returning();

  return created as any;
}

function clampInt(n: unknown, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.trunc(v);
}

async function getDiscordMemberCount(guildId: string): Promise<{ count: number | null; source: string }> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return { count: null, source: "discord (missing DISCORD_BOT_TOKEN)" };

  const now = Date.now();
  if (discordCache && discordCache.guildId === guildId && now - discordCache.at < DISCORD_CACHE_MS) {
    if (discordCache.count === null) return { count: null, source: discordCache.error || "discord" };
    return { count: discordCache.count, source: "discord" };
  }

  try {
    const url = `https://discord.com/api/v10/guilds/${encodeURIComponent(guildId)}?with_counts=true`;
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      const msg = `discord (HTTP ${res.status})`;
      discordCache = { guildId, at: now, count: null, error: msg };
      return { count: null, source: msg };
    }

    const data: any = await res.json();
    const count = clampInt(data?.approximate_member_count, NaN);
    if (!Number.isFinite(count)) {
      const msg = "discord (no approximate_member_count)";
      discordCache = { guildId, at: now, count: null, error: msg };
      return { count: null, source: msg };
    }

    discordCache = { guildId, at: now, count, error: undefined };
    return { count, source: "discord" };
  } catch (_err: any) {
    const msg = "discord (error)";
    discordCache = { guildId, at: now, count: null, error: msg };
    return { count: null, source: msg };
  }
}

async function getDbTotals() {
  const [{ userCount }] = await db
    .select({
      userCount: sql<number>`count(*)::int`,
    })
    .from(users);

  const [{ winnersCount }] = await db
    .select({
      winnersCount: sql<number>`count(*)::int`,
    })
    .from(giveaways)
    .where(isNotNull(giveaways.winnerId));

  const [{ totalPaid }] = await db
    .select({
      totalPaid: sql<string>`coalesce(sum(${userPayments.amount}), 0)`,
    })
    .from(userPayments);

  const givenAwayBase = Number(totalPaid || 0);

  return {
    users: Number(userCount || 0),
    winners: Number(winnersCount || 0),
    givenAway: Number.isFinite(givenAwayBase) ? givenAwayBase : 0,
  };
}

export async function getPublicStats(): Promise<PublicStatsResponse> {
  const now = Date.now();
  if (statsCache && now - statsCache.at < STATS_CACHE_MS) return statsCache.value;

  const cfg = await ensureStatsRow();
  const totals = await getDbTotals();

  // community
  const mode = (cfg.communityMode || "users") as "users" | "discord" | "manual";
  let communityBase = totals.users;
  let communitySource = "users";
  let communityExtra = Number(cfg.communityExtra || 0);

  if (mode === "manual") {
    communityBase = Number(cfg.communityManual || 0);
    communityExtra = 0;
    communitySource = "manual";
  } else if (mode === "discord") {
    const guild = String(cfg.discordGuildId || "").trim();
    if (guild) {
      const r = await getDiscordMemberCount(guild);
      if (typeof r.count === "number" && Number.isFinite(r.count)) {
        communityBase = r.count;
        communitySource = r.source;
      } else {
        communityBase = totals.users;
        communitySource = `${r.source} \u2192 fallback users`;
      }
    } else {
      communityBase = totals.users;
      communitySource = "discord (missing guild id) \u2192 fallback users";
    }
  }

  const givenAwayExtra = Number(cfg.givenAwayExtra || 0);
  const winnersExtra = Number(cfg.winnersExtra || 0);

  const communityTotal = mode === "manual" ? communityBase : communityBase + communityExtra;
  const givenAwayTotal = totals.givenAway + (Number.isFinite(givenAwayExtra) ? givenAwayExtra : 0);
  const winnersTotal = totals.winners + (Number.isFinite(winnersExtra) ? winnersExtra : 0);
  const liveHoursTotal = Number(cfg.liveHoursManual || 0);

  const out: PublicStatsResponse = {
    community: Math.max(0, Math.trunc(communityTotal)),
    givenAway: Math.max(0, Number(givenAwayTotal.toFixed(2))),
    winners: Math.max(0, Math.trunc(winnersTotal)),
    liveHours: Math.max(0, Math.trunc(liveHoursTotal)),
    meta: {
      community: {
        mode,
        source: communitySource,
        base: Math.max(0, Math.trunc(communityBase)),
        extra: Math.trunc(communityExtra),
        total: Math.max(0, Math.trunc(communityTotal)),
      },
      givenAway: {
        base: Number(totals.givenAway.toFixed(2)),
        extra: Number.isFinite(givenAwayExtra) ? Number(givenAwayExtra.toFixed(2)) : 0,
        total: Math.max(0, Number(givenAwayTotal.toFixed(2))),
      },
      winners: {
        base: totals.winners,
        extra: Math.trunc(winnersExtra),
        total: Math.max(0, Math.trunc(winnersTotal)),
      },
      liveHours: { manual: Math.max(0, Math.trunc(liveHoursTotal)) },
    },
  };

  statsCache = { at: now, value: out };
  return out;
}

export async function getAdminStats() {
  const cfg = await ensureStatsRow();
  const publicView = await getPublicStats();
  return {
    config: {
      communityMode: String(cfg.communityMode || "users"),
      discordGuildId: String(cfg.discordGuildId || ""),
      communityManual: Number(cfg.communityManual || 0),
      communityExtra: Number(cfg.communityExtra || 0),
      givenAwayExtra: Number(cfg.givenAwayExtra || 0),
      winnersExtra: Number(cfg.winnersExtra || 0),
      liveHoursManual: Number(cfg.liveHoursManual || 0),
    },
    stats: publicView,
  };
}

export function clearStatsCache() {
  statsCache = null;
}
