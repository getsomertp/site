import { storage } from "./storage";
import type { Leaderboard, InsertLeaderboardEntry } from "@shared/schema";

type JsonValue = any;

type Mapping = {
  itemsPath: string;
  rankFieldPath?: string;
  usernameFieldPath: string;
  userIdFieldPath?: string;
  valueFieldPath: string;
};

function safeJsonParse<T = any>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getByPath(obj: JsonValue, path: string | null | undefined): any {
  if (!path) return undefined;
  const parts = path.split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (/^\d+$/.test(p)) cur = cur[Number(p)];
    else cur = cur[p];
  }
  return cur;
}

async function fetchJson(url: string, options: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 300)}` : ""}`);
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Response was not JSON");
  }
}

function shouldFetch(lb: Leaderboard, now: Date): boolean {
  if (!lb.isActive) return false;
  if (lb.endAt && now.getTime() > new Date(lb.endAt).getTime()) return false;
  if (!lb.lastFetchedAt) return true;
  const last = new Date(lb.lastFetchedAt).getTime();
  const intervalMs = Math.max(30, lb.refreshIntervalSec ?? 300) * 1000;
  return now.getTime() - last >= intervalMs;
}

export async function refreshLeaderboardOnce(lb: Leaderboard): Promise<void> {
  const now = new Date();
  if (!shouldFetch(lb, now)) return;

  try {
    const headers = safeJsonParse<Record<string, string>>(lb.apiHeadersJson, {});
    const bodyJson = safeJsonParse<any>(lb.apiBodyJson, null);
    const query = safeJsonParse<Record<string, string | number>>(lb.apiQueryJson, {});
    const mapping = safeJsonParse<Mapping>(lb.apiMappingJson, {
      itemsPath: "data.items",
      usernameFieldPath: "username",
      valueFieldPath: "value",
    });

    const method = (lb.apiMethod || "GET").toUpperCase();

    const url = new URL(lb.apiEndpoint);
    for (const [k, v] of Object.entries(query || {})) {
      url.searchParams.set(k, String(v));
    }

    const init: RequestInit = {
      method,
      headers: {
        accept: "application/json",
        ...headers,
      },
    };

    if (method !== "GET" && method !== "HEAD" && bodyJson != null) {
      const h = init.headers as Record<string, string>;
      if (!Object.keys(h).some((k) => k.toLowerCase() === "content-type")) {
        h["content-type"] = "application/json";
      }
      init.body = typeof bodyJson === "string" ? bodyJson : JSON.stringify(bodyJson);
    }

    const data = await fetchJson(url.toString(), init);
    const items = getByPath(data, mapping.itemsPath) ?? [];
    if (!Array.isArray(items)) throw new Error("itemsPath did not resolve to an array");

    const entries: InsertLeaderboardEntry[] = items.map((it, idx) => {
      const rankRaw = mapping.rankFieldPath ? getByPath(it, mapping.rankFieldPath) : idx + 1;
      const usernameRaw = getByPath(it, mapping.usernameFieldPath);
      const externalIdRaw = mapping.userIdFieldPath ? getByPath(it, mapping.userIdFieldPath) : null;
      const valueRaw = getByPath(it, mapping.valueFieldPath);

      const rank = Number(rankRaw ?? idx + 1);
      const username = String(usernameRaw ?? `#${idx + 1}`).trim() || `#${idx + 1}`;
      const externalUserId = externalIdRaw == null ? null : String(externalIdRaw);

      let valueNum = 0;
      if (typeof valueRaw === "number") valueNum = valueRaw;
      else valueNum = Number(String(valueRaw ?? "0").replace(/[^0-9.\-]/g, "")) || 0;

      return {
        leaderboardId: lb.id,
        rank: Number.isFinite(rank) ? rank : idx + 1,
        username,
        externalUserId,
        value: String(valueNum),
        rawDataJson: JSON.stringify(it),
      };
    });

    await storage.replaceLeaderboardEntries(lb.id, entries);
    await storage.updateLeaderboard(lb.id, {
      lastFetchedAt: now,
      lastFetchError: null,
    } as any);
  } catch (e: any) {
    await storage.updateLeaderboard(lb.id, {
      lastFetchedAt: new Date(),
      lastFetchError: String(e?.message || e || "Unknown error"),
    } as any);
  }
}

export function startLeaderboardJobs(): void {
  if (!process.env.DATABASE_URL) {
    console.warn("[leaderboards] DATABASE_URL not set; background leaderboard refresh is disabled.");
    return;
  }

  const tick = async () => {
    try {
      const lbs = await storage.getActiveLeaderboards();
      for (const lb of lbs) {
        // eslint-disable-next-line no-await-in-loop
        await refreshLeaderboardOnce(lb);
      }
    } catch (e) {
      console.error("[leaderboards] tick failed", e);
    }
  };

  void tick();
  const intervalMs = 60_000;
  setInterval(() => void tick(), intervalMs).unref();
}
