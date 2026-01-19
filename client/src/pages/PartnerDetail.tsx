import { motion } from "framer-motion";
import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Copy,
  ExternalLink,
  Gift,
  Sparkles,
  Trophy,
} from "lucide-react";

import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { getQueryFn } from "@/lib/queryClient";
import { normalizeExternalUrl } from "@/lib/url";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";

type Casino = {
  id: number;
  name: string;
  slug: string;
  logo?: string | null;
  affiliateLink?: string | null;
  affiliateCode?: string | null;
  bonus?: string | null;
  rakeback?: string | null;
  features?: string[] | null;
  description?: string | null;
  isActive?: boolean | null;
};

type LeaderboardMeta = {
  id: number;
  casinoId: number;
  casinoName?: string | null;
  name: string;
  periodType: string;
  startAt: string | Date;
  endAt?: string | Date | null;
  lastFetchedAt?: string | Date | null;
};

type LeaderboardEntry = {
  rank: number;
  username: string;
  value?: number | string | null;
  prize?: string | number | null;
};

type Giveaway = {
  id: number;
  title: string;
  prize: string;
  casinoId?: number | null;
  endsAt: string | Date;
};

function initials(name: string) {
  const s = String(name || "?").trim();
  if (!s) return "?";
  return s.slice(0, 2).toUpperCase();
}

function formatTimeRemaining(iso?: string | Date) {
  if (!iso) return "--";
  const end = new Date(iso).getTime();
  const ms = end - Date.now();
  if (!Number.isFinite(ms)) return "--";
  if (ms <= 0) return "Ended";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours || days) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

async function copyText(text: string) {
  if (!text) return;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fall through
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "true");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(ta);
  }
}

export default function PartnerDetail() {
  const { toast } = useToast();
  const [match, params] = useRoute("/partners/:slug");
  const slug = params?.slug ? String(params.slug) : "";

  const { data: casino, isLoading: loadingCasino } = useQuery<Casino | null>({
    queryKey: ["/api/casinos/slug", slug],
    queryFn: async () => {
      if (!slug) return null;
      const res = await fetch(`/api/casinos/slug/${encodeURIComponent(slug)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to load partner");
      return res.json();
    },
    enabled: Boolean(slug),
    staleTime: 60_000,
  });

  const { data: activeLeaderboards = [], isLoading: loadingLeaderboards } = useQuery<LeaderboardMeta[]>({
    queryKey: ["/api/leaderboards/active"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 30_000,
  });

  const selectedLb = useMemo(() => {
    if (!casino?.id) return null;
    const byCasino = (activeLeaderboards || []).filter((lb) => Number(lb.casinoId) === Number(casino.id));
    if (byCasino.length === 0) return null;
    return byCasino.find((lb) => lb.periodType === "monthly") || byCasino[0];
  }, [activeLeaderboards, casino?.id]);

  const { data: lbEntries = [], isLoading: loadingEntries } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboards", selectedLb?.id, "entries"],
    queryFn: async () => {
      if (!selectedLb?.id) return [];
      const res = await fetch(`/api/leaderboards/${selectedLb.id}/entries`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: Boolean(selectedLb?.id),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: activeGiveaways = [] } = useQuery<Giveaway[]>({
    queryKey: ["/api/giveaways/active"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 10_000,
  });

  const giveawaysForPartner = useMemo(() => {
    if (!casino?.id) return [];
    return (activeGiveaways || []).filter((g) => Number(g.casinoId || 0) === Number(casino.id));
  }, [activeGiveaways, casino?.id]);

  const playUrl = normalizeExternalUrl(casino?.affiliateLink || "");

  useSeo({
    title: casino?.name ? `${casino.name} • Partners` : "Partner",
    description: casino?.description || "Official GETSOME partner details, bonuses, and leaderboard.",
    path: slug ? `/partners/${slug}` : "/partners",
  });

  const onCopyLink = async () => {
    const link = playUrl || casino?.affiliateLink || "";
    if (!link) return;
    await copyText(link);
    toast({ title: "Copied referral link" });
  };

  const onCopyCode = async () => {
    const code = String(casino?.affiliateCode || "").trim();
    if (!code) return;
    await copyText(code);
    toast({ title: "Copied code" });
  };

  if (!match) return null;

  return (
    <div className="min-h-screen">
      <Navigation />

      <div className="pt-24 sm:pt-28 pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/partners">
              <span className="inline-flex items-center gap-2 text-white/70 hover:text-white cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                Back to Partners
              </span>
            </Link>
          </div>

          {loadingCasino ? (
            <Card className="glass p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-14 w-14 rounded-2xl" />
                <div className="flex-1">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-72 mt-2" />
                </div>
              </div>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
              </div>
            </Card>
          ) : !casino ? (
            <EmptyState
              icon={Building2}
              title="Partner not found"
              description="That partner link may be outdated, or the partner is not active."
            />
          ) : (
            <>
              {/* Header */}
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="glass p-6">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
                    <div className="flex items-center gap-4 min-w-0">
                      {casino.logo ? (
                        <img
                          loading="eager"
                          decoding="async"
                          src={casino.logo}
                          alt={`${casino.name} logo`}
                          className="w-14 h-14 rounded-2xl object-cover bg-white/5 border border-white/10"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-white font-semibold">
                          {initials(casino.name)}
                        </div>
                      )}

                      <div className="min-w-0">
                        <h1 className="font-display text-3xl sm:text-4xl font-bold text-white truncate">
                          {casino.name}
                        </h1>
                        <p className="text-white/60 mt-1 max-w-2xl">
                          {casino.description || casino.bonus || "Official GETSOME partner — bonuses, giveaways, and leaderboards."}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      {playUrl ? (
                        <Button asChild size="pill" className="min-w-[180px]">
                          <a href={playUrl} target="_blank" rel="noreferrer noopener">
                            Play on {casino.name}
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                      ) : (
                        <Button size="pill" disabled className="min-w-[180px]">
                          Link not set
                        </Button>
                      )}
                      <Button variant="outline" size="pill" onClick={onCopyLink} disabled={!playUrl && !casino.affiliateLink}>
                        <Copy className="w-4 h-4" />
                        Copy referral link
                      </Button>
                    </div>
                  </div>

                  <Separator className="my-5" />

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-wider text-white/60">Bonus</div>
                      <div className="mt-1 text-white font-semibold">
                        {casino.bonus || "Exclusive bonuses available"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-wider text-white/60">Rakeback</div>
                      <div className="mt-1 text-white font-semibold">
                        {casino.rakeback || "Ask in Discord"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs uppercase tracking-wider text-white/60">Affiliate Code</div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <div className="text-white font-semibold truncate">
                          {casino.affiliateCode || "—"}
                        </div>
                        <Button size="icon" variant="outline" onClick={onCopyCode} disabled={!casino.affiliateCode}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {casino.features && casino.features.length > 0 ? (
                    <div className="mt-5">
                      <div className="text-xs uppercase tracking-wider text-white/60 mb-2">Features</div>
                      <div className="flex flex-wrap gap-2">
                        {casino.features.slice(0, 12).map((f, idx) => (
                          <span
                            key={`${f}-${idx}`}
                            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Card>
              </motion.div>

              {/* Content */}
              <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-7">
                  <Card className="glass p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-neon-gold" />
                        <h2 className="text-white font-display font-bold text-xl">Leaderboard</h2>
                      </div>
                      <Button variant="outline" size="pill" asChild>
                        <a href={`/leaderboard?casino=${encodeURIComponent(casino.slug)}`}>View full</a>
                      </Button>
                    </div>

                    <div className="mt-4">
                      {loadingLeaderboards ? (
                        <Skeleton className="h-24" />
                      ) : !selectedLb ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/70">
                          No leaderboard configured yet for this partner.
                          <div className="text-xs text-white/50 mt-1">Add a leaderboard in Admin → Leaderboards.</div>
                        </div>
                      ) : loadingEntries ? (
                        <Skeleton className="h-44" />
                      ) : (lbEntries || []).length === 0 ? (
                        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/70">
                          Leaderboard is configured but has no entries yet.
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border border-white/10">
                          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-white/5 text-xs text-white/60">
                            <div className="col-span-2">Rank</div>
                            <div className="col-span-7">User</div>
                            <div className="col-span-3 text-right">Value</div>
                          </div>
                          <div className="divide-y divide-white/10">
                            {(lbEntries || []).slice(0, 10).map((e) => (
                              <div key={`${e.rank}-${e.username}`} className="grid grid-cols-12 gap-2 px-4 py-3">
                                <div className="col-span-2 font-display font-bold text-white">#{e.rank}</div>
                                <div className="col-span-7 text-white truncate">{e.username}</div>
                                <div className="col-span-3 text-right text-white/80 tabular-nums">
                                  {Number(e.value ?? 0).toLocaleString()}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                </div>

                <div className="lg:col-span-5 space-y-4">
                  <Card className="glass p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Gift className="w-5 h-5 text-neon-pink" />
                      <h2 className="text-white font-display font-bold text-xl">Active Giveaways</h2>
                    </div>

                    {giveawaysForPartner.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-white/70">
                        No active giveaways for this partner right now.
                        <div className="text-xs text-white/50 mt-1">Check the Giveaways page for all active giveaways.</div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {giveawaysForPartner.slice(0, 3).map((g) => (
                          <div key={g.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-white font-semibold truncate">{g.title}</div>
                                <div className="text-sm text-neon-gold font-display font-bold mt-1">{g.prize}</div>
                              </div>
                              <div className="text-xs text-white/60 whitespace-nowrap">
                                Ends in {formatTimeRemaining(g.endsAt)}
                              </div>
                            </div>
                            <div className="mt-3">
                              <Button size="pill" asChild className="w-full">
                                <a href="/giveaways">View & Enter</a>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="glass p-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-5 h-5 text-neon-gold" />
                      <h2 className="text-white font-display font-bold text-xl">Quick actions</h2>
                    </div>
                    <div className="text-white/60 text-sm mb-4">
                      Jump straight into the good stuff.
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="pill" asChild>
                        <a href="/giveaways">Giveaways</a>
                      </Button>
                      <Button variant="outline" size="pill" asChild>
                        <a href={`/leaderboard?casino=${encodeURIComponent(casino.slug)}`}>Leaderboard</a>
                      </Button>
                      <Button variant="outline" size="pill" asChild>
                        <a href="/stream-games">Stream games</a>
                      </Button>
                      <Button size="pill" asChild>
                        <a href="/partners">All partners</a>
                      </Button>
                    </div>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
