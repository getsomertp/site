import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Crown, Sparkles } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useSeo } from "@/lib/seo";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getQueryFn } from "@/lib/queryClient";
import { GiveawayRulesModal } from "@/components/GiveawayRulesModal";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonList } from "@/components/SkeletonBlocks";

type WinnerSummary = {
  id: string;
  discordUsername?: string | null;
  discordAvatarUrl?: string | null;
  kickUsername?: string | null;
};

type WinnerRow = {
  id: number;
  title: string;
  prize: string;
  endsAt: string | Date;
  casino?: { id: number; name: string; slug: string; logo?: string | null } | null;
  winner: WinnerSummary;
};

function initials(name: string) {
  const cleaned = String(name || "W").trim();
  if (!cleaned) return "W";
  return cleaned.slice(0, 2).toUpperCase();
}

export default function Winners() {
  useSeo({
    title: "Winners",
    description: "Recent giveaway winners announced on stream.",
    path: "/winners",
  });
  const { data: winnersRaw, isLoading } = useQuery<WinnerRow[]>({
    queryKey: ["/api/giveaways/winners", 50],
    queryFn: async () => {
      const fn = getQueryFn({ on401: "returnNull" });
      const res = await fn({ queryKey: ["/api/giveaways/winners?limit=50"] } as any);
      return Array.isArray(res) ? res : [];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const winners = winnersRaw || [];

  const sorted = useMemo(() => {
    return [...winners].sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime());
  }, [winners]);

  return (
    <div className="min-h-screen">
      <Navigation />

      <div className="pt-24 sm:pt-28 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-10"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <Crown className="w-12 h-12 text-neon-gold animate-pulse-glow" />
              <h1 className="font-display text-5xl sm:text-6xl font-bold text-white">Winners</h1>
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Verified giveaway winners — updated as winners are picked and announced on stream.
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <GiveawayRulesModal variant="outline" className="font-display border-white/15 text-white hover:bg-white/5" />
              <Button
                variant="outline"
                className="font-display border-white/15 text-white hover:bg-white/5"
                onClick={() => (window.location.href = "/giveaways")}
              >
                View Giveaways
              </Button>
            </div>
          </motion.div>

          {isLoading ? (
            <SkeletonList count={6} />
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No winners yet"
              description="Winners will appear here after a giveaway ends and a winner is selected."
            />
          ) : (
            <div className="space-y-4">
              {sorted.map((w, idx) => {
                const name = w?.winner?.discordUsername || w?.winner?.kickUsername || "Winner";
                const avatar = w?.winner?.discordAvatarUrl || null;
                const ended = new Date(w.endsAt);
                const casinoName = w.casino?.name || null;
                const casinoLogo = (w.casino as any)?.logo || null;
                return (
                  <motion.div
                    key={`${w.id}-${idx}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.03, 0.3) }}
                  >
                    <Card className="glass p-5">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          {avatar ? (
                            <img
                              src={avatar}
                              alt=""
                              className="w-12 h-12 rounded-full border border-white/10"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white font-display">
                              {initials(name)}
                            </div>
                          )}

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-display font-bold text-white truncate">{name}</div>
                              <Badge className="bg-neon-gold/15 text-neon-gold border border-neon-gold/20">Winner</Badge>
                            </div>
                            <div className="text-white/60 text-sm truncate">{w.title}</div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-4">
                          <div className="text-right">
                            <div className="font-display font-bold text-neon-gold text-lg">{w.prize}</div>
                            <div className="text-xs text-white/55">Ended {ended.toLocaleDateString()}</div>
                          </div>

                          {casinoName ? (
                            <div className="flex items-center gap-2">
                              {casinoLogo ? (
                                <img src={casinoLogo} alt="" className="w-7 h-7 rounded-md border border-white/10" />
                              ) : (
                                <div className="w-7 h-7 rounded-md bg-white/10 border border-white/10" />
                              )}
                              <span className="text-sm text-white/70">{casinoName}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
