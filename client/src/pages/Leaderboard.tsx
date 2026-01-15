import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Crown, Medal, Award, TrendingUp, Calendar, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useSeo } from "@/lib/seo";
import { normalizeExternalUrl } from "@/lib/url";
import type { Casino } from "@shared/schema";

type LeaderboardEntry = {
  rank: number;
  username: string;
  odId?: string;
  wagered: number;
  prize: string;
  avatar: string;
  change: string;
};

type LeaderboardData = {
  leaderboardName: string;
  casino: string;
  period: string;
  data: LeaderboardEntry[];
};

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="w-8 h-8 text-neon-gold drop-shadow-lg" />;
  if (rank === 2) return <Medal className="w-7 h-7 text-gray-300" />;
  if (rank === 3) return <Award className="w-7 h-7 text-amber-600" />;
  return <span className="w-8 h-8 flex items-center justify-center font-display font-bold text-xl text-muted-foreground">#{rank}</span>;
}

function getChangeColor(change: string) {
  if (change === "NEW") return "text-neon-cyan";
  if (change.startsWith("+")) return "text-green-400";
  if (change.startsWith("-")) return "text-red-400";
  return "text-muted-foreground";
}

function getTierColor(tier: string) {
  switch (tier) {
    case "platinum": return "from-cyan-400 to-cyan-600";
    case "gold": return "from-yellow-400 to-amber-500";
    case "silver": return "from-gray-300 to-gray-500";
    default: return "from-purple-500 to-purple-700";
  }
}

function formatTimeRemaining(iso?: string) {
  if (!iso) return "--";
  const ms = new Date(iso).getTime() - Date.now();
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

export default function Leaderboard() {
  useSeo({
    title: "Leaderboard",
    description: "View partner leaderboards and track the top players.",
    path: "/leaderboard",
  });
  const [period, setPeriod] = useState("monthly");
  const [selectedCasinoSlug, setSelectedCasinoSlug] = useState<string>("");

  useEffect(() => {
    // Allow deep links from the homepage: /leaderboard?casino=stake&period=monthly
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("casino");
    const p = params.get("period");
    if (slug) setSelectedCasinoSlug(slug);
    if (p && ["weekly", "monthly", "biweekly"].includes(p)) setPeriod(p);
  }, []);

  const { data: casinos = [], isLoading: loadingCasinos } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
  });

  const { data: activeLeaderboards = [], isLoading: loadingLeaderboards } = useQuery<any[]>({
    queryKey: ["/api/leaderboards/active"],
  });

  const activeCasinos = casinos.filter((c) => c.isActive !== false);
  const selectedCasino = casinos.find(c => c.slug === selectedCasinoSlug) || activeCasinos[0];
  const selectedCasinoTier = (selectedCasino?.tier || "none") as string;

  useEffect(() => {
    if (!selectedCasino) return;
    const isPeriodAvailable = (p: string) =>
      activeLeaderboards.some((lb: any) => lb.periodType === p && lb.casinoId === selectedCasino.id);
    if (isPeriodAvailable(period)) return;
    const firstAvailable = ["monthly", "weekly", "biweekly"].find(isPeriodAvailable);
    if (firstAvailable) setPeriod(firstAvailable);
  }, [selectedCasino?.id, activeLeaderboards, period]);

  const selectedLb = activeLeaderboards.find((lb: any) => lb.periodType === period && (!selectedCasino || lb.casinoId === selectedCasino.id))
    || activeLeaderboards.find((lb: any) => !selectedCasino || lb.casinoId === selectedCasino.id);


  const { data: leaderboardEntries = [], isLoading: loadingLeaderboard } = useQuery<any[]>({
    queryKey: ["/api/leaderboards", selectedLb?.id, "entries"],
    queryFn: async () => {
      if (!selectedLb?.id) return [];
      const res = await fetch(`/api/leaderboards/${selectedLb.id}/entries`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard entries");
      return res.json();
    },
    enabled: !!selectedLb?.id,
  });

  const leaderboardData: LeaderboardData | undefined = selectedLb
    ? {
        leaderboardName: selectedLb.name,
        casino: selectedLb.casinoName || selectedCasino?.name || "",
        period: selectedLb.periodType,
        data: (leaderboardEntries || []).map((e: any) => ({
          rank: e.rank,
          username: e.username,
          odId: e.externalUserId || e.userId || undefined,
          wagered: Number(e.value ?? 0),
          prize: e.prize ? String(e.prize) : "",
          avatar: String(e.username || "U").slice(0, 2).toUpperCase(),
          change: e.change ? String(e.change) : "",
        })),
      }
    : undefined;

  const prizePool = (selectedLb as any)?.prizePool
    ? `$${Number((selectedLb as any).prizePool).toLocaleString()}`
    : "--";

  const resetAtIso: string | undefined = selectedLb?.endAt
    ? new Date(selectedLb.endAt).toISOString()
    : (selectedLb?.startAt && selectedLb?.durationDays)
      ? new Date(new Date(selectedLb.startAt).getTime() + Number(selectedLb.durationDays) * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

  const resetAtText = resetAtIso ? new Date(resetAtIso).toLocaleString() : "--";
  const resetInText = resetAtIso ? formatTimeRemaining(resetAtIso) : "--";
  const lastUpdatedText = selectedLb?.lastFetchedAt ? new Date(selectedLb.lastFetchedAt).toLocaleString() : null;

  return (
    <div className="min-h-screen">
      <Navigation />
      
      <div className="pt-28 pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <Trophy className="w-12 h-12 text-neon-gold animate-pulse-glow" />
              <h1 className="font-display text-5xl sm:text-6xl font-bold text-white">
                Leaderboards
              </h1>
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Compete for glory and massive cash prizes. The more you wager, the higher you climb!
            </p>
          </motion.div>

          {loadingCasinos ? (
            <div className="text-center py-12 text-muted-foreground">Loading casinos...</div>
          ) : casinos.length === 0 ? (
            <Card className="glass p-12 text-center">
              <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display text-xl text-white mb-2">No Casinos Yet</h3>
              <p className="text-muted-foreground">Check back soon for leaderboards!</p>
            </Card>
          ) : (
            <>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-8"
              >
                <Card className="glass p-6">
                  <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row items-center gap-6 w-full lg:w-auto">
                      <div>
                        <p className="text-muted-foreground text-sm uppercase tracking-wider mb-2">Select Casino</p>
                        <Select 
                          value={selectedCasinoSlug || selectedCasino?.slug || ""} 
                          onValueChange={setSelectedCasinoSlug}
                        >
                          <SelectTrigger className="w-[240px] bg-white/5 font-display" data-testid="select-casino">
                            <SelectValue placeholder="Choose a casino" />
                          </SelectTrigger>
                          <SelectContent>
                            {casinos.map((casino) => (
                              <SelectItem key={casino.id} value={casino.slug} data-testid={`casino-option-${casino.slug}`}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${getTierColor(casino.tier)}`} />
                                  {casino.name}
                                  {!casino.leaderboardApiUrl && (
                                    <span className="text-xs text-muted-foreground ml-1">(Coming soon)</span>
                                  )}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {selectedCasino && (
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                          {selectedCasino.logo ? (
                            <img src={selectedCasino.logo} alt={selectedCasino.name} className="w-12 h-12 rounded-lg object-contain" />
                          ) : (
                            <div 
                              className="w-12 h-12 rounded-lg flex items-center justify-center font-display font-bold text-white"
                              style={{ backgroundColor: selectedCasino.color }}
                            >
                              {selectedCasino.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <h3 className="font-display font-bold text-white">{selectedCasino.name}</h3>
                            {selectedCasinoTier !== "none" && (
                              <span className={`text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${getTierColor(selectedCasino.tier)} text-white`}>
                                {selectedCasinoTier.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-center px-6 border-r border-white/10">
                        <p className="text-2xl font-display font-bold text-neon-gold" data-testid="text-prize-pool">
                          {prizePool}
                        </p>
                        <p className="text-xs text-muted-foreground">Prize Pool</p>
                      </div>
                      <div className="text-center px-6">
                        <p
                          className="text-2xl font-display font-bold text-neon-purple"
                          title={resetAtText !== "--" ? `Resets at: ${resetAtText}` : undefined}
                          data-testid="text-reset-in"
                        >
                          {resetInText}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Until Reset
                          {lastUpdatedText ? (
                            <span className="block text-[10px] text-white/40 mt-1">
                              Updated: {lastUpdatedText}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>

              <Tabs value={period} className="w-full" onValueChange={setPeriod}>
                <TabsList className="grid w-full grid-cols-3 mb-8 bg-card/50">
                  <TabsTrigger
                    value="weekly"
                    className="font-display"
                    data-testid="tab-weekly"
                    disabled={!activeLeaderboards.some((lb: any) => lb.periodType === "weekly" && (!selectedCasino || lb.casinoId === selectedCasino.id))}
                  >
                    <Calendar className="w-4 h-4 mr-2" /> Weekly
                  </TabsTrigger>
                  <TabsTrigger
                    value="monthly"
                    className="font-display"
                    data-testid="tab-monthly"
                    disabled={!activeLeaderboards.some((lb: any) => lb.periodType === "monthly" && (!selectedCasino || lb.casinoId === selectedCasino.id))}
                  >
                    <TrendingUp className="w-4 h-4 mr-2" /> Monthly
                  </TabsTrigger>
                  <TabsTrigger
                    value="biweekly"
                    className="font-display"
                    data-testid="tab-biweekly"
                    disabled={!activeLeaderboards.some((lb: any) => lb.periodType === "biweekly" && (!selectedCasino || lb.casinoId === selectedCasino.id))}
                  >
                    <Trophy className="w-4 h-4 mr-2" /> Bi-weekly
                  </TabsTrigger>
                </TabsList>

                {["weekly", "monthly", "biweekly"].map((tab) => (
                  <TabsContent key={tab} value={tab}>
                    <Card className="glass overflow-hidden" data-testid={`card-leaderboard-${tab}`}>
                      {loadingLeaderboard ? (
                        <div className="p-12 text-center text-muted-foreground">
                          Loading leaderboard...
                        </div>
                      ) : !selectedCasino?.leaderboardApiUrl ? (
                        <div className="p-12 text-center">
                          <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                          <h3 className="font-display text-xl text-white mb-2">Leaderboard Coming Soon</h3>
                          <p className="text-muted-foreground">
                            The leaderboard for {selectedCasino?.name || "this casino"} is being set up.
                          </p>
                        </div>
                      ) : leaderboardData?.data?.length === 0 ? (
                        <div className="p-12 text-center">
                          <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                          <h3 className="font-display text-xl text-white mb-2">No Data Yet</h3>
                          <p className="text-muted-foreground">
                            Be the first to climb the {selectedCasino?.name} leaderboard!
                          </p>
                          {selectedCasino?.affiliateLink && (
                            <Button 
                              className="mt-4 font-display"
                              style={{ backgroundColor: selectedCasino.color }}
                              onClick={() => {
                                const url = normalizeExternalUrl((selectedCasino as any)?.affiliateLink);
                                if (!url) return;
                                window.open(url, "_blank", "noopener,noreferrer");
                              }}
                            >
                              Sign Up at {selectedCasino.name}
                            </Button>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="hidden md:grid grid-cols-12 gap-4 p-6 border-b border-white/10 text-sm font-display uppercase tracking-wider text-muted-foreground">
                            <div className="col-span-1">Rank</div>
                            <div className="col-span-1">Change</div>
                            <div className="col-span-4">Player</div>
                            <div className="col-span-3 text-right">Total Wagered</div>
                            <div className="col-span-3 text-right">Prize</div>
                          </div>
                          
                          {(leaderboardData?.data || []).map((player, i) => (
                            <motion.div
                              key={`${tab}-${player.rank}`}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              className={`grid grid-cols-12 gap-4 items-center p-6 border-b border-white/5 hover:bg-white/5 transition-colors ${
                                player.rank === 1 ? "bg-gradient-to-r from-neon-gold/10 to-transparent" : ""
                              }`}
                              data-testid={`row-${tab}-${player.rank}`}
                            >
                              <div className="col-span-2 md:col-span-1 flex items-center">
                                {getRankIcon(player.rank)}
                              </div>
                              <div className="hidden md:flex col-span-1 items-center">
                                <span className={`text-sm font-semibold ${getChangeColor(player.change)}`}>
                                  {player.change
                                    ? (player.change === "0" ? "—" : player.change)
                                    : "—"}
                                </span>
                              </div>
                              <div className="col-span-6 md:col-span-4 flex items-center gap-3">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm ${
                                  player.rank === 1 
                                    ? "bg-gradient-to-br from-neon-gold to-amber-600 text-black shadow-lg shadow-neon-gold/30"
                                    : player.rank <= 3
                                    ? "bg-gradient-to-br from-neon-purple to-neon-pink text-white"
                                    : "bg-muted text-white"
                                }`}>
                                  {player.avatar}
                                </div>
                                <div>
                                  <span className={`font-semibold ${player.rank === 1 ? "text-neon-gold" : "text-white"}`}>
                                    {player.username}
                                  </span>
                                  <span className={`md:hidden block text-xs ${getChangeColor(player.change)}`}>
                                    {player.change !== "0" && player.change}
                                  </span>
                                </div>
                              </div>
                              <div className="col-span-4 md:col-span-3 text-right">
                                <span className="font-display text-white text-lg">
                                  ${player.wagered.toLocaleString()}
                                </span>
                              </div>
                              <div className="hidden md:block col-span-3 text-right">
                                <span className={`font-display font-bold text-xl ${
                                  player.rank === 1 ? "text-neon-gold text-glow-gold" : 
                                  player.rank <= 3 ? "text-neon-purple" : "text-white"
                                }`}>
                                  {player.prize || "—"}
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </>
                      )}
                    </Card>
                  </TabsContent>
                ))}
              </Tabs>

              <motion.div 
                className="mt-12 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <p className="text-muted-foreground mb-4">
                  Want to compete? Sign up with our partners and start climbing!
                </p>
                <Button 
                  size="lg" 
                  className="font-display bg-gradient-to-r from-neon-purple to-neon-gold hover:opacity-90"
                  onClick={() => window.location.href = "/affiliates"}
                  data-testid="button-start-competing"
                >
                  View Our Casino Partners
                </Button>
              </motion.div>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
