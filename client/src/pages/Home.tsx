import { motion } from "framer-motion";
import { Fragment, useEffect, useRef, useState } from "react";
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
import { RecentWinnersMini } from "@/components/RecentWinnersMini";
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

const DEFAULT_HOME_BLOCK_ORDER = [
  "hero",
  "onboarding",
  "featured",
  "casinos",
  "giveaways",
  "leaderboard",
];

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

  const { data: siteSettingsRaw } = useQuery<Record<string, string> | null>({
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

  const featuredGiveaway = (giveaways || [])[0] as GiveawayWithDetails | undefined;

  const brandName = String(siteSettings.brandName || "GETSOME").trim() || "GETSOME";
  const kickUrl = String(siteSettings.kickUrl || "https://kick.com/get-some").trim() || "https://kick.com/get-some";
  const discordUrl = String(siteSettings.discordUrl || "https://discord.gg/").trim() || "https://discord.gg/";

  const getS = (key: string, fallback: string) => {
    const v = (siteSettings as any)?.[key];
    return typeof v === "string" && v.trim() ? v : fallback;
  };

  // Home page content (mini CMS) — leave blank in Admin to use these defaults
  const heroTitleLeft = getS("home.heroTitleLeft", brandName);
  const heroTitleHighlight = String((siteSettings as any)?.["home.heroTitleHighlight"] || "").trim();
  const heroSubtitle = getS("home.heroSubtitle", "Live giveaways, leaderboards, and stream games — all in one place.");
  const heroWatchLabel = getS("home.heroWatchLabel", "Watch Live");
  const heroDiscordLabel = getS("home.heroDiscordLabel", "Join Discord");
  const heroStreamGamesLabel = getS("home.heroStreamGamesLabel", "Stream Games");

  const featuredLabel = getS("home.featuredLabel", "Live giveaway");

  const quickTitle = getS("home.quickTitle", "Everything in one hub");
  const quickSubtitle = getS(
    "home.quickSubtitle",
    "Giveaways, leaderboards, partners, and stream games — built for speed and mobile.",
  );
  const quickCtaLabel = getS("home.quickCtaLabel", "Browse Giveaways");

  const tileGiveawaysTitle = getS("home.tileGiveawaysTitle", "Giveaways");
  const tileGiveawaysSubtitle = getS("home.tileGiveawaysSubtitle", "Provably-fair draws, live on stream.");
  const tileLeaderboardsTitle = getS("home.tileLeaderboardsTitle", "Leaderboards");
  const tileLeaderboardsSubtitle = getS("home.tileLeaderboardsSubtitle", "Track prize pools and top players.");
  const tilePartnersTitle = getS("home.tilePartnersTitle", "Partners");
  const tilePartnersSubtitle = getS("home.tilePartnersSubtitle", "Official links, codes, and perks.");
  const tileStreamGamesTitle = getS("home.tileStreamGamesTitle", "Stream Games");
  const tileStreamGamesSubtitle = getS("home.tileStreamGamesSubtitle", "Join live events and bonus hunts.");

  const newHereTitle = getS("home.newHereTitle", "New here?");
  const newHereSubtitle = getS("home.newHereSubtitle", "Get verified once, then enter in seconds.");
  const step1Title = getS("home.newHereStep1Title", "Connect Discord");
  const step1Text = getS("home.newHereStep1Text", "Unlock entries + account linking.");
  const step2Title = getS("home.newHereStep2Title", "Link partner account");
  const step2Text = getS("home.newHereStep2Text", "Some giveaways require a linked account.");
  const step3Title = getS("home.newHereStep3Title", "Upload wallet proof");
  const step3Text = getS("home.newHereStep3Text", "Fast verification for payouts.");
  const newHereCtaLabel = getS("home.newHereCtaLabel", "Complete profile");

  const casinosTitle = getS("home.casinosTitle", "Casino Partners");
  const casinosSubtitle = getS("home.casinosSubtitle", "Use the official links to support the stream.");
  const casinosViewAllLabel = getS("home.casinosViewAllLabel", "View All");
  const casinosEmptyTitle = getS("home.casinosEmptyTitle", "No casino partners yet");
  const casinosEmptyText = getS(
    "home.casinosEmptyText",
    "Once a casino is added in Admin, it will show up here automatically.",
  );

  const giveawaysTitle = getS("home.giveawaysTitle", "Giveaways");
  const giveawaysSubtitle = getS("home.giveawaysSubtitle", "Active giveaways running on stream.");
  const giveawaysViewAllLabel = getS("home.giveawaysViewAllLabel", "View All");
  const giveawaysEmptyTitle = getS("home.giveawaysEmptyTitle", "No active giveaways");
  const giveawaysEmptyText = getS(
    "home.giveawaysEmptyText",
    "When a giveaway is created and activated, it will appear here automatically.",
  );

  const leaderboardTitle = getS("home.leaderboardTitle", "Monthly Leaderboard");
  const leaderboardSubtitleWithCasino = getS("home.leaderboardSubtitleWithCasino", "Top casino this month: {casino}");
  const leaderboardSubtitleNoCasino = getS(
    "home.leaderboardSubtitleNoCasino",
    "Leaderboard updates will appear once a casino API is connected.",
  );
  const leaderboardCtaLabel = getS("home.leaderboardCtaLabel", "View Full Leaderboard");
  const leaderboardEmptyTitle = getS("home.leaderboardEmptyTitle", "(no leaderboard yet)");
  const leaderboardEmptyText = getS(
    "home.leaderboardEmptyText",
    "Add at least one casino leaderboard API in Admin to populate this section.",
  );

  const winnersTitle = getS("home.winnersTitle", "Recent Winners");
  const winnersEmptyText = getS("home.winnersEmptyText", "No winners yet.");
  const winnersViewAllLabel = getS("home.winnersViewAllLabel", "View all");

  useSeo({
    title: String(brandName || "GETSOME"),
    description: String(heroSubtitle || "Live giveaways, leaderboards, and stream games — all in one place."),
    path: "/",
  });

  const communityMembers = Number(siteStats?.community || 0);
  const totalGivenAway = Number(siteStats?.givenAway || 0);
  const totalWinners = Number(siteStats?.winners || 0);
  const liveHours = Number(siteStats?.liveHours || 0);

  const communityAnim = useCountUp(communityMembers, { start: animateStats, durationMs: 1200 });
  const givenAwayAnim = useCountUp(totalGivenAway, { start: animateStats, durationMs: 1300 });
  const winnersAnim = useCountUp(totalWinners, { start: animateStats, durationMs: 1200 });
  const liveHoursAnim = useCountUp(liveHours, { start: animateStats, durationMs: 1200 });

  const hasLeaderboard = Boolean(homeLb && (homeLb.casino || (homeLb as any)?.casino));
  const lbCasino = (homeLb as any)?.casino;
  const casinoSlug = lbCasino?.slug;
  const casinoLink = casinoSlug ? `/leaderboard?casino=${encodeURIComponent(casinoSlug)}` : undefined;

  const leaderboardSubtitle = hasLeaderboard && lbCasino?.name
    ? leaderboardSubtitleWithCasino.replace("{casino}", String(lbCasino.name))
    : leaderboardSubtitleNoCasino;

  const parseBlocksOrder = (): string[] => {
    const raw = (siteSettings as any)?.["home.blocksOrder"];
    if (typeof raw !== "string" || !raw.trim()) return DEFAULT_HOME_BLOCK_ORDER;

    // Prefer JSON array
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const ids = parsed
          .filter((x) => typeof x === "string")
          .map((x) => String(x).trim())
          .filter(Boolean);
        if (ids.length) return ids;
      }
    } catch {
      // ignore
    }

    // Fallback: comma-separated
    const parts = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : DEFAULT_HOME_BLOCK_ORDER;
  };

  // --- Blocks ---
  const heroBlock = (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/55" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-12">
            <h1 className="font-display text-4xl md:text-6xl font-bold text-white leading-tight">
              {heroTitleHighlight ? (
                <>
                  <span>{heroTitleLeft} </span>
                  <span className="text-neon-pink">{heroTitleHighlight}</span>
                </>
              ) : (
                heroTitleLeft
              )}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">{heroSubtitle}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="font-display bg-gradient-to-r from-neon-purple to-neon-pink text-white">
                <a href={kickUrl} target="_blank" rel="noreferrer">
                  {heroWatchLabel} <ExternalLink className="ml-2 w-4 h-4" />
                </a>
              </Button>
              <Button variant="outline" asChild className="font-display border-white/20 hover:bg-white/5">
                <a href={discordUrl} target="_blank" rel="noreferrer">
                  {heroDiscordLabel} <ExternalLink className="ml-2 w-4 h-4" />
                </a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="/stream-games">{heroStreamGamesLabel}</a>
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
  );

  const onboardingBlock = (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <Card className="glass p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-white font-display font-bold text-xl">{quickTitle}</div>
                <div className="text-white/60 text-sm mt-1">{quickSubtitle}</div>
              </div>
              <Button size="pill" asChild>
                <a href="/giveaways">{quickCtaLabel}</a>
              </Button>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              <a
                href="/giveaways"
                className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2 text-white">
                  <Gift className="w-4 h-4 text-neon-pink" />
                  <span className="font-display font-bold">{tileGiveawaysTitle}</span>
                </div>
                <div className="text-xs text-white/60 mt-1">{tileGiveawaysSubtitle}</div>
              </a>
              <a
                href="/leaderboard"
                className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2 text-white">
                  <Trophy className="w-4 h-4 text-neon-gold" />
                  <span className="font-display font-bold">{tileLeaderboardsTitle}</span>
                </div>
                <div className="text-xs text-white/60 mt-1">{tileLeaderboardsSubtitle}</div>
              </a>
              <a
                href="/partners"
                className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2 text-white">
                  <Building2 className="w-4 h-4 text-neon-cyan" />
                  <span className="font-display font-bold">{tilePartnersTitle}</span>
                </div>
                <div className="text-xs text-white/60 mt-1">{tilePartnersSubtitle}</div>
              </a>
              <a
                href="/stream-games"
                className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-2 text-white">
                  <Crown className="w-4 h-4 text-neon-purple" />
                  <span className="font-display font-bold">{tileStreamGamesTitle}</span>
                </div>
                <div className="text-xs text-white/60 mt-1">{tileStreamGamesSubtitle}</div>
              </a>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-4">
          <Card className="glass p-6">
            <div className="text-white font-display font-bold text-xl">{newHereTitle}</div>
            <div className="text-white/60 text-sm mt-1">{newHereSubtitle}</div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wider text-white/60">Step 1</div>
                <div className="text-white font-semibold">{step1Title}</div>
                <div className="text-xs text-white/60 mt-1">{step1Text}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wider text-white/60">Step 2</div>
                <div className="text-white font-semibold">{step2Title}</div>
                <div className="text-xs text-white/60 mt-1">{step2Text}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs uppercase tracking-wider text-white/60">Step 3</div>
                <div className="text-white font-semibold">{step3Title}</div>
                <div className="text-xs text-white/60 mt-1">{step3Text}</div>
              </div>
            </div>

            <div className="mt-4">
              <Button size="pill" className="w-full" asChild>
                <a href="/profile">{newHereCtaLabel}</a>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );

  const featuredBlock = !giveawaysLoading && featuredGiveaway ? (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      <Card className="glass p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-white/60">{featuredLabel}</div>
            <div className="text-white font-display font-bold text-lg truncate">{featuredGiveaway.title}</div>
            <div className="text-sm text-white/70 mt-1">
              <span className="text-neon-gold font-display font-bold">{featuredGiveaway.prize}</span>
              <span className="mx-2 text-white/35">•</span>
              Ends in {formatTimeRemaining(featuredGiveaway.endsAt as any)}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="pill" asChild>
              <a href="/giveaways">View details</a>
            </Button>
            {!isLoggedIn ? (
              <Button size="pill" onClick={beginDiscordLogin}>
                Connect Discord
              </Button>
            ) : (featuredGiveaway as any).hasEntered ? (
              <Button size="pill" variant="secondary" disabled>
                Already entered
              </Button>
            ) : requirementMet((featuredGiveaway as any).requirements || []) ? (
              <Button
                size="pill"
                disabled={enterGiveaway.isPending}
                onClick={() => enterGiveaway.mutate((featuredGiveaway as any).id)}
              >
                {enterGiveaway.isPending ? "Entering..." : "Enter now"}
              </Button>
            ) : (
              <Button size="pill" variant="outline" asChild>
                <a href="/profile">Complete requirements</a>
              </Button>
            )}
          </div>
        </div>
      </Card>
    </section>
  ) : null;

  const casinosBlock = (
    // Slightly tighter top padding so this section tucks under the block above without a large visual gap.
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">{casinosTitle}</h2>
          <p className="text-muted-foreground">{casinosSubtitle}</p>
        </div>
        <Button variant="outline" asChild>
          <a href="/partners">{casinosViewAllLabel}</a>
        </Button>
      </div>

      <div className="mt-6">
        {casinosLoading ? (
          <SkeletonGrid count={8} />
        ) : showNoCasinos ? (
          <EmptyState icon={Building2} title={casinosEmptyTitle} description={casinosEmptyText} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {activeCasinos.slice(0, 8).map((c) => (
              <Card key={c.id} className="glass p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {c.logo ? (
                      <img
                        loading="lazy"
                        decoding="async"
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
                      <a href={`/partners/${c.slug}`} className="text-white font-semibold hover:text-white/90">
                        {c.name}
                      </a>
                      <div className="text-sm text-muted-foreground">{c.bonusText || c.welcomeBonus || "Exclusive bonuses available"}</div>
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
  );

  const giveawaysBlock = (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-white">{giveawaysTitle}</h2>
              <p className="text-muted-foreground">{giveawaysSubtitle}</p>
            </div>

            <div className="flex items-center gap-2">
              <GiveawayRulesModal variant="outline" className="border-white/15 text-white hover:bg-white/5" />
              <Button variant="outline" asChild>
                <a href="/giveaways">{giveawaysViewAllLabel}</a>
              </Button>
            </div>
          </div>

          <div className="mt-6">
            {giveawaysLoading ? (
              <SkeletonGrid count={3} />
            ) : showNoGiveaways ? (
              <EmptyState icon={Gift} title={giveawaysEmptyTitle} description={giveawaysEmptyText} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeGiveaways.map((g) => (
                  <Card key={g.id} className="glass p-6">
                    <div className="text-white font-semibold">{g.title}</div>
                    <div className="mt-2 text-2xl font-bold text-neon-gold">{g.prize}</div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      Entries: {(g.entries ?? 0).toLocaleString()}
                      {g.maxEntries ? ` / ${g.maxEntries.toLocaleString()}` : ""}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">Ends: {g.endsAt ? formatTimeRemaining(g.endsAt as any) : "—"}</div>

                    <div className="mt-3 text-xs text-muted-foreground">Requirement: {formatRequirements(g.requirements || [])}</div>

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
                                <a href={needsLinked ? "/profile" : "/giveaways"}>{needsLinked ? "Link Account" : "View Details"}</a>
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
        </div>

        <div className="lg:col-span-4">
          <RecentWinnersMini
            limit={4}
            title={winnersTitle}
            emptyText={winnersEmptyText}
            viewAllLabel={winnersViewAllLabel}
          />
        </div>
      </div>
    </section>
  );

  const leaderboardBlock = (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">{leaderboardTitle}</h2>
          <p className="text-muted-foreground">{leaderboardSubtitle}</p>
        </div>

        {hasLeaderboard && casinoLink ? (
          <Button asChild>
            <a href={casinoLink}>{leaderboardCtaLabel}</a>
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
          <EmptyState icon={Trophy} title={leaderboardEmptyTitle} description={leaderboardEmptyText} />
        ) : (
          <Card className="glass p-6">
            <div className="text-muted-foreground text-sm">
              Leaderboard is available for <span className="text-white font-semibold">{lbCasino?.name}</span>. Click “View Full Leaderboard”.
            </div>
          </Card>
        )}
      </div>
    </section>
  );

  const blocks: Record<string, JSX.Element | null> = {
    hero: heroBlock,
    onboarding: onboardingBlock,
    featured: featuredBlock,
    casinos: casinosBlock,
    giveaways: giveawaysBlock,
    leaderboard: leaderboardBlock,
  };

  const desiredOrder = parseBlocksOrder();
  const finalOrder: string[] = [];

  const pushUnique = (id: string) => {
    if (!id) return;
    if (finalOrder.includes(id)) return;
    if (!(id in blocks)) return;
    finalOrder.push(id);
  };

  desiredOrder.forEach(pushUnique);
  DEFAULT_HOME_BLOCK_ORDER.forEach(pushUnique);
  Object.keys(blocks).forEach(pushUnique);

  return (
    <div className="min-h-screen text-foreground">
      <Navigation />

      {finalOrder.map((id) => (
        <Fragment key={id}>{blocks[id]}</Fragment>
      ))}

      <Footer />
    </div>
  );
}
