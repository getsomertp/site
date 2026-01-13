import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Trophy, Gift, Users, Zap, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import heroBg from "@assets/generated_images/dark_neon_casino_background.png";

type Casino = {
  id: number;
  name: string;
  slug: string;
  affiliateLink?: string | null;
  tier?: string | null;
  welcomeBonus?: string | null;
  bonusText?: string | null;
  isActive?: boolean | null;
};

type Giveaway = {
  id: number;
  title: string;
  prizeText?: string | null;
  prize?: string | null;
  prizePool?: number | null;
  entriesCount?: number | null;
  endAt?: string | null;
  requirementText?: string | null;
};

type HomeLeaderboard = null | {
  period: string;
  casino?: { id: number; name: string; slug: string; affiliate_link?: string | null; affiliateLink?: string | null };
  entries?: Array<{ rank: number; username: string; wagered: number; prize?: string | number | null }>;
};

function formatMoney(n: number) {
  return `$${Number(n || 0).toLocaleString()}`;
}

export default function Home() {
  const { data: casinos = [] } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: giveaways = [] } = useQuery<Giveaway[]>({
    queryKey: ["/api/giveaways/active"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/site/settings"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: homeLb } = useQuery<HomeLeaderboard>({
    queryKey: ["/api/home/leaderboard"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const activeCasinos = (casinos || []).filter((c) => c.isActive !== false);
  const showNoCasinos = activeCasinos.length === 0;

  const activeGiveaways = (giveaways || []).slice(0, 3);
  const showNoGiveaways = activeGiveaways.length === 0;

  const kickUrl = siteSettings.kickUrl || "https://kick.com/get-some";
  const discordUrl = siteSettings.discordUrl || "https://discord.gg/";

  const communityMembers = Number(siteSettings.communityMembers || 0);
  const totalGivenAway = Number(siteSettings.totalGivenAway || 0);
  const totalWinners = Number(siteSettings.totalWinners || 0);
  const liveHours = Number(siteSettings.liveHours || 0);

  const hasLeaderboard = Boolean(homeLb && (homeLb.casino || (homeLb as any)?.casino));
  const lbCasino = (homeLb as any)?.casino;
  const casinoSlug = lbCasino?.slug;
  const casinoLink = casinoSlug ? `/casino/${casinoSlug}` : undefined;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroBg} className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-14">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl">
            <h1 className="font-display text-4xl md:text-6xl font-bold text-white leading-tight">
              GETSOME Stream Hub
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Live giveaways, leaderboards, and stream games — all in one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <a href={kickUrl} target="_blank" rel="noreferrer">
                  Watch Live <ExternalLink className="ml-2 w-4 h-4" />
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={discordUrl} target="_blank" rel="noreferrer">
                  Join Discord <ExternalLink className="ml-2 w-4 h-4" />
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="/stream-games">Stream Games</a>
              </Button>
            </div>
          </motion.div>

          {/* Stats */}
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Community</div>
                  <div className="text-2xl font-bold">{communityMembers.toLocaleString()}</div>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Gift className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Given Away</div>
                  <div className="text-2xl font-bold">{formatMoney(totalGivenAway)}</div>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Winners</div>
                  <div className="text-2xl font-bold">{totalWinners.toLocaleString()}</div>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5" />
                <div>
                  <div className="text-sm text-muted-foreground">Live Hours</div>
                  <div className="text-2xl font-bold">{liveHours.toLocaleString()}</div>
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
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {showNoCasinos ? (
            <Card className="p-6">
              <div className="text-white font-semibold">No casinos yet</div>
              <div className="text-muted-foreground text-sm mt-1">
                Add your first casino in the Admin panel and it will appear here.
              </div>
            </Card>
          ) : (
            activeCasinos.slice(0, 6).map((c) => (
              <Card key={c.id} className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {c.logo ? (
                      <img
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
                      <a href={c.affiliateLink} target="_blank" rel="noreferrer">
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
            ))
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
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {showNoGiveaways ? (
            <Card className="p-6 md:col-span-3">
              <div className="text-white font-semibold">No active giveaways</div>
              <div className="text-muted-foreground text-sm mt-1">
                When a giveaway is created and activated, it will show up here automatically.
              </div>
            </Card>
          ) : (
            activeGiveaways.map((g) => (
              <Card key={g.id} className="p-6">
                <div className="text-white font-semibold">{g.title}</div>
                <div className="mt-2 text-2xl font-bold text-neon-gold">
                  {g.prizePool ? formatMoney(g.prizePool) : (g.prizeText || g.prize || "Prize")}
                </div>
                <div className="mt-3 text-sm text-muted-foreground">
                  Entries: {(g.entriesCount ?? 0).toLocaleString()}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Ends: {g.endAt ? new Date(g.endAt).toLocaleString() : "—"}
                </div>
                {g.requirementText ? (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Requirement: {g.requirementText}
                  </div>
                ) : null}
              </Card>
            ))
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
          {!hasLeaderboard ? (
            <Card className="p-6">
              <div className="text-white font-semibold">(no leaderboard yet)</div>
              <div className="text-muted-foreground text-sm mt-1">
                Add at least one casino leaderboard API in Admin to populate this section.
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="text-muted-foreground text-sm">
                Leaderboard is available for <span className="text-white font-semibold">{lbCasino?.name}</span>. Click “View Full Leaderboard”.
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">
            © 2025 GETSOME. 18+ Only. Gamble Responsibly.
          </p>
        </div>
      </footer>
    </div>
  );
}
