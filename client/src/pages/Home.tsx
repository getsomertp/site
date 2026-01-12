import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Trophy, Gift, Users, Zap, ExternalLink, Star, Crown, Medal, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Navigation } from "@/components/Navigation";
import heroBg from "@assets/generated_images/dark_neon_casino_background.png";

const sponsors = [
  { name: "Stake", tier: "platinum", bonus: "200% Deposit Bonus" },
  { name: "Rollbit", tier: "gold", bonus: "150% Welcome Bonus" },
  { name: "Duelbits", tier: "gold", bonus: "$100 Free Play" },
  { name: "Gamdom", tier: "silver", bonus: "15% Rakeback" },
  { name: "Roobet", tier: "silver", bonus: "Exclusive Rewards" },
  { name: "BC.Game", tier: "silver", bonus: "Lucky Spin Bonus" },
];

const leaderboardData = [
  { rank: 1, username: "CryptoKing", wagered: 2450000, prize: "$50,000", avatar: "CK" },
  { rank: 2, username: "LuckyDegen", wagered: 1890000, prize: "$25,000", avatar: "LD" },
  { rank: 3, username: "HighRoller99", wagered: 1560000, prize: "$15,000", avatar: "HR" },
  { rank: 4, username: "SlotMaster", wagered: 1230000, prize: "$10,000", avatar: "SM" },
  { rank: 5, username: "BigWinBob", wagered: 980000, prize: "$5,000", avatar: "BW" },
];

const giveaways = [
  { 
    title: "Weekly Cash Drop", 
    prize: "$10,000", 
    entries: 4523, 
    endsIn: "2d 14h",
    requirement: "Wager $1,000+"
  },
  { 
    title: "Crypto Giveaway", 
    prize: "1 BTC", 
    entries: 8901, 
    endsIn: "5d 8h",
    requirement: "Discord Member"
  },
  { 
    title: "VIP Exclusive", 
    prize: "$25,000", 
    entries: 234, 
    endsIn: "12d 2h",
    requirement: "VIP Status"
  },
];

function formatCompactNumber(n: number) {
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
}

function formatMoneyCompact(amount: string | number) {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "$0";
  // Compact, but keep the $ sign.
  const compact = n.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
  return `$${compact}`;
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="w-6 h-6 text-neon-gold" />;
  if (rank === 2) return <Medal className="w-6 h-6 text-gray-300" />;
  if (rank === 3) return <Award className="w-6 h-6 text-amber-600" />;
  return <span className="w-6 h-6 flex items-center justify-center font-bold text-muted-foreground">#{rank}</span>;
}

export default function Home() {
  const { data: siteSettings } = useQuery<Record<string, string>>({
    queryKey: ["/api/site/settings"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const kickUrl = siteSettings?.kickUrl || "https://kick.com/get-some";
  const discordUrl = siteSettings?.discordUrl || "https://discord.gg/";

  const { data: homeSummary } = useQuery<Record<string, string>>({
    queryKey: ["/api/home/summary"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: casinos } = useQuery<any[]>({
    queryKey: ["/api/casinos"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const sponsorsDynamic = (casinos || [])
    .filter((c) => c.isActive)
    .slice(0, 6)
    .map((c) => ({
      name: c.name,
      tier: c.tier || "silver",
      bonus: c.promoTitle || c.promoDescription || "",
      url: c.url,
    }));

  const sponsorsList = sponsorsDynamic.length ? sponsorsDynamic : sponsors;

  const { data: activeLeaderboards } = useQuery<any[]>({
    queryKey: ["/api/leaderboards/active"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const primaryLb = activeLeaderboards?.[0];

  const { data: primaryEntries } = useQuery<any[]>({
    queryKey: primaryLb ? ["/api/leaderboards", primaryLb.id, "entries"] : ["/api/leaderboards", "none", "entries"],
    queryFn: async ({ queryKey }) => {
      const id = queryKey[1];
      if (!id || id === "none") return [];
      const res = await fetch(`/api/leaderboards/${id}/entries`, { credentials: "include" });
      if (!res.ok) return [];
      return (await res.json()) as any[];
    },
    enabled: !!primaryLb,
  });

  const leaderboardList = (primaryEntries && primaryEntries.length)
    ? primaryEntries.slice(0, 5).map((e, idx) => ({
        rank: e.rank ?? idx + 1,
        username: e.username,
        wagered: e.valueNumber ?? 0,
        prize: "",
        avatar: (e.username || "?").slice(0, 2).toUpperCase(),
      }))
    : leaderboardData;

  const { data: activeGiveaways } = useQuery<any[]>({
    queryKey: ["/api/giveaways/active"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const giveawayCards = (activeGiveaways && activeGiveaways.length)
    ? activeGiveaways.slice(0, 3).map((g: any) => {
        const endsAt = g.endsAt ? new Date(g.endsAt) : null;
        const ms = endsAt ? (endsAt.getTime() - Date.now()) : 0;
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const d = Math.floor(totalSec / 86400);
        const h = Math.floor((totalSec % 86400) / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const endsIn = d > 0 ? `${d}d ${h}h` : `${h}h ${m}m`;
        const requirement = (g.requirements && g.requirements.length)
          ? String(g.requirements[0]?.type || "Discord")
          : "Discord";
        return {
          id: g.id,
          title: g.title,
          prize: g.prize,
          entries: Number(g.entries || 0),
          endsIn,
          requirement,
        };
      })
    : giveaways;

  const stats = [
    { label: "Community Members", value: homeSummary?.communityMembers ? formatCompactNumber(Number(homeSummary.communityMembers)) : "—" },
    { label: "Given Away", value: homeSummary?.givenAway ? formatMoneyCompact(homeSummary.givenAway) : "—" },
    { label: "Live Hours", value: homeSummary?.liveHours ? formatCompactNumber(Number(homeSummary.liveHours)) : "—" },
    { label: "Winners", value: homeSummary?.winners ? formatCompactNumber(Number(homeSummary.winners)) : "—" },
  ];
  return (
    <div className="min-h-screen">
      <Navigation />
      
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <h1 className="font-display font-bold text-6xl sm:text-7xl lg:text-8xl text-white mb-4">
              <span className="text-glow-purple">GET</span>{" "}
              <span className="text-neon-gold text-glow-gold">SOME</span>
            </h1>
            <p className="text-xl sm:text-2xl text-muted-foreground max-w-2xl mx-auto mb-8">
              Join the most electrifying gambling streams. Exclusive bonuses, 
              epic giveaways, and a community that wins together.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="font-display text-lg bg-gradient-to-r from-neon-purple to-neon-pink hover:opacity-90 text-white px-8 py-6 box-glow-purple"
                data-testid="button-watch-live"
                onClick={() => window.open(kickUrl, "_blank", "noopener,noreferrer")}
              >
                <Zap className="mr-2" /> Watch Live
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="font-display text-lg border-neon-gold text-neon-gold hover:bg-neon-gold hover:text-black px-8 py-6"
                data-testid="button-join-discord"
                onClick={() => window.open(discordUrl, "_blank", "noopener,noreferrer")}
              >
                Join Discord
              </Button>
            </div>
          </motion.div>

          <motion.div 
            className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            {stats.map((stat) => (
              <div key={stat.label} className="glass rounded-xl p-6">
                <div className="font-display text-3xl sm:text-4xl font-bold text-neon-gold text-glow-gold" data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  {stat.value}
                </div>
                <div className="text-muted-foreground text-sm mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-24 relative" id="sponsors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-4xl sm:text-5xl font-bold text-white mb-4">
              Official <span className="text-neon-gold text-glow-gold">Partners</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Exclusive bonuses and rewards through our trusted casino partners
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sponsorsList.map((sponsor, i) => (
              <motion.div
                key={sponsor.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card 
                  className={`glass p-6 cursor-pointer transition-all hover:scale-105 ${
                    sponsor.tier === "platinum" 
                      ? "border-neon-gold box-glow-gold" 
                      : sponsor.tier === "gold"
                      ? "border-neon-purple/50"
                      : "border-white/10"
                  }`}
                  data-testid={`card-sponsor-${sponsor.name.toLowerCase()}`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center font-display font-bold text-xl ${
                        sponsor.tier === "platinum" 
                          ? "bg-gradient-to-br from-neon-gold to-amber-600 text-black" 
                          : "bg-gradient-to-br from-neon-purple to-neon-pink text-white"
                      }`}>
                        {sponsor.name.slice(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-bold text-white">{sponsor.name}</h3>
                        <span className={`text-xs uppercase tracking-wider ${
                          sponsor.tier === "platinum" ? "text-neon-gold" : "text-muted-foreground"
                        }`}>
                          {sponsor.tier} Partner
                        </span>
                      </div>
                    </div>
                    {sponsor.tier === "platinum" && <Star className="w-6 h-6 text-neon-gold fill-neon-gold" />}
                  </div>
                  <div className="bg-neon-purple/10 rounded-lg p-3 mb-4">
                    <p className="text-neon-purple font-semibold">{sponsor.bonus}</p>
                  </div>
                  <Button className="w-full font-display" variant="outline" data-testid={`button-claim-${sponsor.name.toLowerCase()}`}>
                    Claim Bonus <ExternalLink className="ml-2 w-4 h-4" />
                  </Button>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 relative" id="leaderboard">
        <div className="absolute inset-0 bg-gradient-to-b from-neon-purple/5 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <Trophy className="w-10 h-10 text-neon-gold" />
              <h2 className="font-display text-4xl sm:text-5xl font-bold text-white">
                {(primaryLb?.name || "Monthly")} <span className="text-neon-purple text-glow-purple">Leaderboard</span>
              </h2>
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Top wagerers win massive prizes every month. Climb the ranks and GETSOME!
            </p>
          </motion.div>

          <Card className="glass overflow-hidden" data-testid="card-leaderboard">
            <div className="p-6 border-b border-white/10">
              <div className="grid grid-cols-12 gap-4 text-sm font-display uppercase tracking-wider text-muted-foreground">
                <div className="col-span-1">Rank</div>
                <div className="col-span-5">Player</div>
                <div className="col-span-3 text-right">Wagered</div>
                <div className="col-span-3 text-right">Prize</div>
              </div>
            </div>
            {leaderboardList.map((player, i) => (
              <motion.div
                key={player.rank}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`grid grid-cols-12 gap-4 items-center p-6 border-b border-white/5 hover:bg-white/5 transition-colors ${
                  player.rank === 1 ? "bg-neon-gold/5" : ""
                }`}
                data-testid={`row-leaderboard-${player.rank}`}
              >
                <div className="col-span-1">
                  {getRankIcon(player.rank)}
                </div>
                <div className="col-span-5 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${
                    player.rank === 1 
                      ? "bg-gradient-to-br from-neon-gold to-amber-600 text-black"
                      : "bg-gradient-to-br from-neon-purple to-neon-pink text-white"
                  }`}>
                    {player.avatar}
                  </div>
                  <span className="font-semibold text-white">{player.username}</span>
                </div>
                <div className="col-span-3 text-right font-display text-white">
                  ${player.wagered.toLocaleString()}
                </div>
                <div className={`col-span-3 text-right font-display font-bold ${
                  player.rank === 1 ? "text-neon-gold text-glow-gold" : "text-neon-purple"
                }`}>
                  {player.prize}
                </div>
              </motion.div>
            ))}
          </Card>

          <div className="text-center mt-8">
            <Button 
              size="lg" 
              className="font-display bg-neon-purple hover:bg-neon-purple/80"
              data-testid="button-view-full-leaderboard"
              onClick={() => window.location.href = "/leaderboard"}
            >
              View Full Leaderboard <Trophy className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      <section className="py-24 relative" id="giveaways">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <Gift className="w-10 h-10 text-neon-cyan animate-pulse-glow" />
              <h2 className="font-display text-4xl sm:text-5xl font-bold text-white">
                Active <span className="text-neon-cyan text-glow-cyan">Giveaways</span>
              </h2>
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Enter for your chance to win. Connect your Discord to participate!
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {giveawayCards.map((giveaway: any, i: number) => (
              <motion.div
                key={giveaway.id ?? giveaway.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card 
                  className="glass p-6 relative overflow-hidden group"
                  data-testid={`card-giveaway-${i}`}
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-neon-cyan/20 to-transparent rounded-full blur-3xl group-hover:scale-150 transition-transform" />
                  
                  <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                      <span className="px-3 py-1 bg-neon-cyan/20 text-neon-cyan text-xs font-display uppercase rounded-full">
                        Ends in {giveaway.endsIn}
                      </span>
                      <Gift className="w-5 h-5 text-neon-cyan" />
                    </div>
                    
                    <h3 className="font-display text-xl font-bold text-white mb-2">{giveaway.title}</h3>
                    
                    <div className="text-4xl font-display font-bold text-neon-gold text-glow-gold mb-4">
                      {giveaway.prize}
                    </div>
                    
                    <div className="space-y-2 mb-6">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Entries</span>
                        <span className="text-white font-semibold">{giveaway.entries.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Requirement</span>
                        <span className="text-neon-purple font-semibold">{giveaway.requirement}</span>
                      </div>
                    </div>
                    
                    <Button 
                      className="w-full font-display bg-gradient-to-r from-neon-cyan to-neon-purple hover:opacity-90"
                      data-testid={`button-enter-giveaway-${i}`}
                      onClick={() => window.location.href = "/giveaways"}
                    >
                      Enter Giveaway
                    </Button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 relative" id="discord">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <Card className="glass p-8 md:p-12 text-center relative overflow-hidden" data-testid="card-discord-cta">
              <div className="absolute inset-0 bg-gradient-to-r from-[#5865F2]/20 to-neon-purple/20" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#5865F2]/30 rounded-full blur-[100px]" />
              
              <div className="relative">
                <div className="w-20 h-20 bg-[#5865F2] rounded-2xl flex items-center justify-center mx-auto mb-6 animate-float">
                  <svg className="w-12 h-12" viewBox="0 0 24 24" fill="white">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                  </svg>
                </div>
                
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white mb-4">
                  Join the <span className="text-[#5865F2]">Community</span>
                </h2>
                <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
                  Connect your Discord to access exclusive giveaways, get notified when we go live, 
                  and join 125K+ degens winning together.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Button 
                    size="lg"
                    className="font-display text-lg bg-[#5865F2] hover:bg-[#4752C4] text-white px-8"
                    data-testid="button-connect-discord"
                  >
                    <svg className="w-6 h-6 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                    Connect Discord
                  </Button>
                </div>
                
                <div className="mt-8 flex items-center justify-center gap-8 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    <span>125,000+ Members</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    <span>5,432 Online</span>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      <footer className="py-12 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-neon-purple to-neon-gold flex items-center justify-center">
                <span className="font-display font-bold text-white">GS</span>
              </div>
              <span className="font-display font-bold text-xl text-white">GETSOME</span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Responsible Gambling</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
            
            <p className="text-sm text-muted-foreground">
              © 2025 GETSOME. 18+ Only. Gamble Responsibly.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
