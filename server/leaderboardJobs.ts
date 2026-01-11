import { storage } from "./storage";
import type { Leaderboard, InsertLeaderboardEntry } from "@shared/schema";

type JsonValue = any;

function safeJsonParse<T = any>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Basic dot-path resolver: "data.items.0.name"
function getByPath(obj: JsonValue, path: string | null | undefined): any {
  if (!path) return undefined;
  const parts = path.split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (p.match(/^\d+$/)) cur = cur[Number(p)];
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
  // Some partner APIs return JSON without correct headers.
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
    const method = (lb.apiMethod || "GET").toUpperCase();

    const init: RequestInit = {
      method,
      headers: {
        "accept": "application/json",
        ...headers,
      },
    };

    if (method !== "GET" && method !== "HEAD" && bodyJson != null) {
      // If the admin didn't specify a content-type, default to JSON.
      const h = init.headers as Record<string, string>;
      if (!Object.keys(h).some((k) => k.toLowerCase() === "content-type")) {
        h["content-type"] = "application/json";
      }
      init.body = typeof bodyJson === "string" ? bodyJson : JSON.stringify(bodyJson);
    }

    const data = await fetchJson(lb.apiUrl, init);
    const items = getByPath(data, lb.itemsPath) ?? [];
    if (!Array.isArray(items)) throw new Error("itemsPath did not resolve to an array");

    const entries: InsertLeaderboardEntry[] = items.slice(0, lb.maxEntries ?? 100).map((it, idx) => {
      const rank = Number(getByPath(it, lb.rankFieldPath) ?? idx + 1);
      const username = String(getByPath(it, lb.usernameFieldPath) ?? "").trim();
      const userIdRaw = getByPath(it, lb.userIdFieldPath);
      const valueRaw = getByPath(it, lb.valueFieldPath);

      const valueNumber = typeof valueRaw === "number" ? valueRaw : Number(String(valueRaw ?? "0").replace(/[^0-9.\-]/g, ""));
      const displayValue = valueRaw == null ? "" : String(valueRaw);

      return {
        leaderboardId: lb.id,
        rank: Number.isFinite(rank) ? rank : idx + 1,
        userId: userIdRaw == null ? null : String(userIdRaw),
        username: username || `#${idx + 1}`,
        valueNumber: Number.isFinite(valueNumber) ? valueNumber : 0,
        valueDisplay: displayValue,
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
  // Leaderboards rely on DB-backed partner configs and cached entries.
  // On first deploy it's common to be missing DATABASE_URL; don't crash the process.
  if (!process.env.DATABASE_URL) {
    console.warn("[leaderboards] DATABASE_URL not set; background leaderboard refresh is disabled.");
    return;
  }

  // Run quickly on boot, then periodically.
  const tick = async () => {
    try {
      const lbs = await storage.getActiveLeaderboards();
      for (const lb of lbs) {
        // eslint-disable-next-line no-await-in-loop
        await refreshLeaderboardOnce(lb);
      }
    } catch (e) {
      // Never let a transient DB/network error kill the server.
      console.error("[leaderboards] tick failed", e);
    }
  };

  void tick();
  const intervalMs = 60_000; // every 60s; per-lb throttle handled by shouldFetch()
  setInterval(() => void tick(), intervalMs).unref();
}
