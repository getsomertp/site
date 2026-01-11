import { motion } from "framer-motion";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Trophy, Gift, Users, ExternalLink, Crown, Medal, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import type { Casino, Giveaway, Leaderboard, LeaderboardEntry } from "@shared/schema";
import heroBg from "@assets/generated_images/dark_neon_casino_background.png";

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-5 h-5 text-neon-gold" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
  if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />;
  return <span className="w-6 text-right font-mono text-xs text-muted-foreground">#{rank}</span>;
}

export default function Home() {
  const { data: siteSettings } = useQuery<Record<string, string>>({
    queryKey: ["/api/site/settings"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: casinos = [] } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: giveaways = [] } = useQuery<Giveaway[]>({
    queryKey: ["/api/giveaways/active"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: leaderboards = [] } = useQuery<Leaderboard[]>({
    queryKey: ["/api/leaderboards/active"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const primaryLeaderboardId = leaderboards?.[0]?.id;
  const { data: leaderboardEntries = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: primaryLeaderboardId ? ["/api/leaderboards", String(primaryLeaderboardId), "entries"] : ["__noop__"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: Boolean(primaryLeaderboardId),
  });

  const kickUrl = (siteSettings?.kickUrl || "").trim();
  const discordUrl = (siteSettings?.discordUrl || "").trim();

  const sponsorsByTier = useMemo(() => {
    const tiers = ["platinum", "gold", "silver", "none"] as const;
    const grouped: Record<string, Casino[]> = {};
    for (const t of tiers) grouped[t] = [];
    for (const c of casinos) grouped[c.tier || "none"].push(c);
    return grouped;
  }, [casinos]);

  return (
    <div className="min-h-screen">
      <Navigation />

      <div
        className="relative pt-16"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-black/70" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h1 className="font-display text-4xl md:text-6xl font-bold text-white mb-4">
              GET<span className="text-neon-gold">SOME</span> Rewards
            </h1>
            <p className="text-white/80 max-w-2xl mx-auto mb-8">
              Connect your accounts, verify your wallet, and compete for giveaways and leaderboard prizes.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                className="font-display gap-2"
                asChild={Boolean(kickUrl)}
                disabled={!kickUrl}
                title={!kickUrl ? "Kick link not configured yet (Admin → Site Settings)." : undefined}
              >
                {kickUrl ? (
                  <a href={kickUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-4 h-4" /> Watch on Kick
                  </a>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" /> Watch on Kick
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                className="font-display border-white/20 text-white gap-2"
                asChild={Boolean(discordUrl)}
                disabled={!discordUrl}
                title={!discordUrl ? "Discord link not configured yet (Admin → Site Settings)." : undefined}
              >
                {discordUrl ? (
                  <a href={discordUrl} target="_blank" rel="noopener noreferrer">
                    <Users className="w-4 h-4" /> Join Discord
                  </a>
                ) : (
                  <>
                    <Users className="w-4 h-4" /> Join Discord
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="glass p-6">
              <div className="flex items-center gap-3 text-white">
                <Trophy className="w-6 h-6 text-neon-gold" />
                <div>
                  <div className="font-display text-sm uppercase tracking-wider text-white/70">Active Leaderboards</div>
                  <div className="font-display text-2xl font-bold">{leaderboards.length}</div>
                </div>
              </div>
            </Card>

            <Card className="glass p-6">
              <div className="flex items-center gap-3 text-white">
                <Gift className="w-6 h-6 text-neon-cyan" />
                <div>
                  <div className="font-display text-sm uppercase tracking-wider text-white/70">Active Giveaways</div>
                  <div className="font-display text-2xl font-bold">{giveaways.length}</div>
                </div>
              </div>
            </Card>

            <Card className="glass p-6">
              <div className="flex items-center gap-3 text-white">
                <Users className="w-6 h-6 text-neon-purple" />
                <div>
                  <div className="font-display text-sm uppercase tracking-wider text-white/70">Partner Casinos</div>
                  <div className="font-display text-2xl font-bold">{casinos.length}</div>
                </div>
              </div>
            </Card>
          </div>

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-bold text-white">Sponsors</h2>
                <p className="text-white/70">These are pulled from the database (Admin → Casinos).</p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {(Object.entries(sponsorsByTier) as Array<[string, Casino[]]>)
                .filter(([, list]) => list.length > 0)
                .map(([tier, list]) => (
                  <Card key={tier} className="glass p-6">
                    <div className="font-display text-sm uppercase tracking-wider text-white/70 mb-4">{tier}</div>
                    <div className="space-y-3">
                      {list.map((c) => (
                        <div key={c.id} className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-display text-white">{c.name}</div>
                            {c.bonus ? <div className="text-xs text-white/60">{c.bonus}</div> : null}
                          </div>
                          {c.affiliateLink ? (
                            <Button size="sm" variant="outline" className="border-white/20 text-white" asChild>
                              <a href={c.affiliateLink} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="border-white/20 text-white" disabled>
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
            </div>
          </section>

          <section className="grid lg:grid-cols-2 gap-6">
            <Card className="glass p-6">
              <div className="flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-neon-gold" />
                <h3 className="font-display text-xl font-bold text-white">Leaderboard Preview</h3>
              </div>

              {primaryLeaderboardId ? (
                <div className="space-y-2">
                  {leaderboardEntries.slice(0, 10).map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/5">
                      <div className="flex items-center gap-3">
                        <RankIcon rank={entry.rank} />
                        <div className="font-display text-white">{entry.username}</div>
                      </div>
                      <div className="font-mono text-sm text-white/80">{entry.value}</div>
                    </div>
                  ))}
                  {leaderboardEntries.length === 0 ? (
                    <div className="text-white/70 text-sm">No entries yet.</div>
                  ) : null}
                </div>
              ) : (
                <div className="text-white/70 text-sm">No active leaderboards yet.</div>
              )}
            </Card>

            <Card className="glass p-6">
              <div className="flex items-center gap-2 mb-4">
                <Gift className="w-5 h-5 text-neon-cyan" />
                <h3 className="font-display text-xl font-bold text-white">Active Giveaways</h3>
              </div>

              <div className="space-y-3">
                {giveaways.slice(0, 5).map((g) => (
                  <div key={g.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-white/5">
                    <div>
                      <div className="font-display text-white">{g.title}</div>
                      <div className="text-xs text-white/60">{g.prize}</div>
                    </div>
                    <Button size="sm" className="font-display" asChild>
                      <a href="/giveaways">Enter</a>
                    </Button>
                  </div>
                ))}
                {giveaways.length === 0 ? <div className="text-white/70 text-sm">No active giveaways.</div> : null}
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
