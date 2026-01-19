import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Trophy, Gift, Users, Zap, ExternalLink, Building2, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { GiveawayRulesModal } from "@/components/GiveawayRulesModal";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonGrid } from "@/components/SkeletonBlocks";
import { normalizeExternalUrl } from "@/lib/url";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";
import { useCountUp } from "@/hooks/useCountUp";
import type { Giveaway, GiveawayRequirement } from "@shared/schema";

type Casino = {
  id: number;
  name: string;
  slug: string;
  affiliateLink?: string | null;
  logo?: string | null;
  tier?: string | null;
  welcomeBonus?: string | null;
  bonusText?: string | null;
  isActive?: boolean | null;
};

type GiveawayWithDetails = Giveaway & {
  entries: number;
  requirements: GiveawayRequirement[];
  hasEntered?: boolean;
};

type HomeLeaderboard = null | {
  period: string;
  casino?: { id: number; name: string; slug: string; affiliate_link?: string | null; affiliateLink?: string | null };
  entries?: Array<{ rank: number; username: string; wagered: number; prize?: string | number | null }>;
};

function formatMoney(n: number) {
  return `$${Number(n || 0).toLocaleString()}`;
}

function formatRequirements(requirements: GiveawayRequirement[]): string {
  if (!requirements || requirements.length === 0) return "No Requirement";
  return requirements
    .map((r) => {
      switch (r.type) {
        case "discord":
          return "Discord Member";
        case "wager":
          return `Wager ${r.value || ""}`.trim();
        case "vip":
          return "VIP Status";
        case "linked_account":
          return "Linked Casino Account";
        default:
          return r.type;
      }
    })
    .join(", ");
}

function formatTimeRemaining(endsAt: Date | string): string {
  const end = new Date(endsAt);
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return "Ended";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function Home() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();
  const userId = (session as any)?.user?.id as string | undefined;
  const isLoggedIn = Boolean(userId);

  const beginDiscordLogin = () => {
    window.location.href = "/api/auth/discord";
  };

  const { data: casinos = [], isLoading: casinosLoading } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: giveaways = [], isLoading: giveawaysLoading } = useQuery<GiveawayWithDetails[]>({
    queryKey: ["/api/giveaways/active"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Logged-in user's linked casino accounts (used for requirement checks)
  const { data: userProfile } = useQuery<any>({
    queryKey: [userId ? `/api/users/${userId}` : "/api/users/0"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!userId,
  });

  const requirementMet = (requirements: GiveawayRequirement[]) => {
    if (!requirements || requirements.length === 0) return true;
    if (!isLoggedIn) return false;

    const accounts: Array<{ casinoId: number; verified: boolean }> =
      (userProfile?.casinoAccounts || []).map((a: any) => ({
        casinoId: Number(a.casinoId),
        verified: Boolean(a.verified),
      }));

    for (const r of requirements) {
      if (r.type === "discord") continue;
      if (r.type === "linked_account") {
        const v = String((r as any).value || "").trim().toLowerCase();
        const requireVerified = v === "verified" || v === "true" || v === "1" || v === "yes";

        const ok = accounts.some(
          (a) =>
            (!r.casinoId || a.casinoId === Number(r.casinoId)) &&
            (!requireVerified || a.verified),
        );
        if (!ok) return false;
        continue;
      }
      // Other requirement types (vip/wager) are not implemented yet
      return false;
    }
    return true;
  };

  const enterGiveaway = useMutation({
    mutationFn: async (giveawayId: number) => {
      const res = await fetch(`/api/giveaways/${giveawayId}/enter`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to enter giveaway");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Entered giveaway" });
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
    },
    onError: (err: any) => {
      toast({ title: "Could not enter", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const { data: siteSettingsRaw, isLoading: settingsLoading } = useQuery<Record<string, string> | null>({
    queryKey: ["/api/site/settings"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: siteStats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/site/stats"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Start the count-up animation once when stats load.
  const didAnimateStats = useRef(false);
  const [animateStats, setAnimateStats] = useState(false);
  useEffect(() => {
    if (didAnimateStats.current) return;
    if (!statsLoading && siteStats) {
      didAnimateStats.current = true;
      setAnimateStats(true);
    }
  }, [statsLoading, siteStats]);

  // Guard against null (e.g., if a proxy/auth layer returns 401).
  const siteSettings = (siteSettingsRaw as any) || {};

  const { data: homeLb, isLoading: homeLbLoading } = useQuery<HomeLeaderboard>({
    queryKey: ["/api/home/leaderboard"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const activeCasinos = (casinos || []).filter((c) => c.isActive !== false);
  const showNoCasinos = !casinosLoading && activeCasinos.length === 0;

  const activeGiveaways = (giveaways || []).slice(0, 3);
  const showNoGiveaways = !giveawaysLoading && activeGiveaways.length === 0;


  const brandName = siteSettings.brandName || "GETSOME";
  const kickUrl = siteSettings.kickUrl || "https://kick.com/get-some";
  const discordUrl = siteSettings.discordUrl || "https://discord.gg/";

  useSeo({
    title: String(brandName || "GETSOME"),
    description: "Live giveaways, leaderboards, and stream games — all in one place.",
    path: "/",
  });

  const communityMembers = Number(siteStats?.community || 0);
  const totalGivenAway = Number(siteStats?.givenAway || 0);
  const totalWinners = Number(siteStats?.winners || 0);
  const liveHours = Number(siteStats?.liveHours || 0);

  // Count-up effect for stats (runs once after stats load)
  const didAnimateStats = useRef(false);
  const [animateStats, setAnimateStats] = useState(false);
  useEffect(() => {
    if (didAnimateStats.current) return;
    if (!statsLoading) {
      didAnimateStats.current = true;
      setAnimateStats(true);
    }
  }, [statsLoading]);

  const communityAnim = useCountUp(communityMembers, { start: animateStats, durationMs: 1200 });
  const givenAwayAnim = useCountUp(totalGivenAway, { start: animateStats, durationMs: 1300 });
  const winnersAnim = useCountUp(totalWinners, { start: animateStats, durationMs: 1200 });
  const liveHoursAnim = useCountUp(liveHours, { start: animateStats, durationMs: 1200 });

  const hasLeaderboard = Boolean(homeLb && (homeLb.casino || (homeLb as any)?.casino));
  const lbCasino = (homeLb as any)?.casino;
  const casinoSlug = lbCasino?.slug;
  const casinoLink = casinoSlug ? `/leaderboard?casino=${encodeURIComponent(casinoSlug)}` : undefined;

  return (
    <div className="min-h-screen text-foreground">
      <Navigation />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/55" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-12"
            >
              <h1 className="font-display text-4xl md:text-6xl font-bold text-white leading-tight">
                {brandName}
              </h1>
              <p className="mt-4 text-lg text-muted-foreground">
                Live giveaways, leaderboards, and stream games — all in one place.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild className="font-display bg-gradient-to-r from-neon-purple to-neon-pink text-white">
                  <a href={kickUrl} target="_blank" rel="noreferrer">
                    Watch Live <ExternalLink className="ml-2 w-4 h-4" />
                  </a>
                </Button>
                <Button
                  variant="outline"
                  asChild
                  className="font-display border-white/20 hover:bg-white/5"
                >
                  <a href={discordUrl} target="_blank" rel="noreferrer">
                    Join Discord <ExternalLink className="ml-2 w-4 h-4" />
                  </a>
                </Button>
                <Button variant="secondary" asChild>
                  <a href="/stream-games">Stream Games</a>
                </Button>
              </div>
            </motion.div>
          </div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass p-5">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Community</div>
                  {statsLoading ? (
                    <Skeleton className="h-7 w-20" />
                  ) : (
                    <div className="text-2xl font-bold tabular-nums">{communityAnim.toLocaleString()}+</div>
                  )}
                </div>
              </div>
            </Card>
            <Card className="glass p-5">
              <div className="flex items-center gap-3">
                <Gift className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Given Away</div>
                  {statsLoading ? (
                    <Skeleton className="h-7 w-24" />
                  ) : (
                    <div className="text-2xl font-bold tabular-nums">{formatMoney(givenAwayAnim)}+</div>
                  )}
                </div>
              </div>
            </Card>
            <Card className="glass p-5">
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Winners</div>
                  {statsLoading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : (
                    <div className="text-2xl font-bold tabular-nums">{winnersAnim.toLocaleString()}+</div>
                  )}
                </div>
              </div>
            </Card>
            <Card className="glass p-5">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Live Hours</div>
                  {statsLoading ? (
                    <Skeleton className="h-7 w-14" />
                  ) : (
                    <div className="text-2xl font-bold tabular-nums">{liveHoursAnim.toLocaleString()}+</div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Casinos */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Casino Partners</h2>
            <p className="text-muted-foreground">Use the official links to support the stream.</p>
          </div>
          <Button variant="outline" asChild>
            <a href="/partners">View All</a>
          </Button>
        </div>

        <div className="mt-6">
          {casinosLoading ? (
            <SkeletonGrid count={6} />
          ) : showNoCasinos ? (
            <EmptyState
              icon={Building2}
              title="No casino partners yet"
              description="Once a casino is added in Admin, it will show up here automatically."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeCasinos.slice(0, 6).map((c) => (
              <Card key={c.id} className="glass p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {c.logo ? (
                      <img loading="lazy" decoding="async"
                        src={c.logo}
                        alt={`${c.name} logo`}
                        className="w-10 h-10 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white font-semibold">
                        {(c.name || "").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-white font-semibold">{c.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {c.bonusText || c.welcomeBonus || "Exclusive bonuses available"}
                      </div>
                    </div>
                  </div>

                  {c.affiliateLink ? (
                    <Button asChild size="sm">
                      <a href={normalizeExternalUrl(c.affiliateLink)} target="_blank" rel="noreferrer noopener">
                        Play
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      No link
                    </Button>
                  )}
                </div>
              </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Giveaways */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Giveaways</h2>
            <p className="text-muted-foreground">Active giveaways running on stream.</p>
          </div>

          <div className="flex items-center gap-2">
            <GiveawayRulesModal variant="outline" className="border-white/15 text-white hover:bg-white/5" />
            <Button variant="outline" asChild>
              <a href="/giveaways">View All</a>
            </Button>
          </div>
        </div>

        <div className="mt-6">
          {giveawaysLoading ? (
            <SkeletonGrid count={3} />
          ) : showNoGiveaways ? (
            <EmptyState
              icon={Gift}
              title="No active giveaways"
              description="When a giveaway is created and activated, it will appear here automatically."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activeGiveaways.map((g) => (
              <Card key={g.id} className="glass p-6">
                <div className="text-white font-semibold">{g.title}</div>
                <div className="mt-2 text-2xl font-bold text-neon-gold">
                  {g.prize}
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  Entries: {(g.entries ?? 0).toLocaleString()}{g.maxEntries ? ` / ${g.maxEntries.toLocaleString()}` : ""}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Ends: {g.endsAt ? formatTimeRemaining(g.endsAt as any) : "—"}
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Requirement: {formatRequirements(g.requirements || [])}
                </div>

                <div className="mt-4 flex gap-2">
                  {!isLoggedIn ? (
                    <Button className="w-full" onClick={beginDiscordLogin}>
                      Connect Discord
                    </Button>
                  ) : (
                    (() => {
                      const met = requirementMet(g.requirements || []);
                      const needsLinked = (g.requirements || []).some((r) => r.type === "linked_account");

                      if (!met) {
                        return (
                          <Button className="w-full" variant="outline" asChild>
                            <a href={needsLinked ? "/profile" : "/giveaways"}>
                              {needsLinked ? "Link Account" : "View Details"}
                            </a>
                          </Button>
                        );
                      }

                      if ((g as any).hasEntered) {
                        return (
                          <Button className="w-full" variant="secondary" disabled>
                            Already Entered
                          </Button>
                        );
                      }

                      return (
                        <Button
                          className="w-full"
                          disabled={enterGiveaway.isPending}
                          onClick={() => enterGiveaway.mutate(g.id)}
                        >
                          {enterGiveaway.isPending ? "Entering..." : "Enter"}
                        </Button>
                      );
})()
                  )}
                </div>
              </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Leaderboard */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Monthly Leaderboard</h2>
            <p className="text-muted-foreground">
              {hasLeaderboard && lbCasino?.name ? `Top casino this month: ${lbCasino.name}` : "Leaderboard updates will appear once a casino API is connected."}
            </p>
          </div>

          {hasLeaderboard && casinoLink ? (
            <Button asChild>
              <a href={casinoLink}>View Full Leaderboard</a>
            </Button>
          ) : null}
        </div>

        <div className="mt-6">
          {homeLbLoading ? (
            <Card className="glass p-6">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2 mt-3" />
            </Card>
          ) : !hasLeaderboard ? (
            <EmptyState
              icon={Trophy}
              title="(no leaderboard yet)"
              description="Add at least one casino leaderboard API in Admin to populate this section."
            />
          ) : (
            <Card className="glass p-6">
              <div className="text-muted-foreground text-sm">
                Leaderboard is available for <span className="text-white font-semibold">{lbCasino?.name}</span>. Click “View Full Leaderboard”.
              </div>
            </Card>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
