import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, Search, Trophy, Gift, Loader2 } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getQueryFn } from "@/lib/queryClient";
import { normalizeExternalUrl } from "@/lib/url";
import { useSeo } from "@/lib/seo";

type Casino = {
  id: number;
  name: string;
  slug: string;
  affiliateLink?: string | null;
  logo?: string | null;
  bonusText?: string | null;
  welcomeBonus?: string | null;
  isActive?: boolean | null;
};

export default function Partners() {
  useSeo({
    title: "Partners",
    description: "Browse GETSOME casino partners and use the official referral links to support the stream.",
    path: "/partners",
  });

  const { data: casinos = [], isLoading } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const [q, setQ] = useState("");
  const active = useMemo(() => (casinos || []).filter((c) => c?.isActive !== false), [casinos]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return active;
    return active.filter((c) => String(c.name || "").toLowerCase().includes(needle));
  }, [active, q]);

  return (
    <div className="min-h-screen">
      <Navigation />

      <div className="pt-28 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-10"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-center gap-4 mb-3">
              <Building2 className="w-10 h-10 text-neon-gold" />
              <h1 className="font-display text-5xl sm:text-6xl font-bold text-white">Partners</h1>
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Official casino partners and referral links. Using these links helps support the stream at no extra cost.
            </p>
          </motion.div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
            <div className="relative w-full md:max-w-md">
              <Search className="w-4 h-4 text-white/50 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search partners..."
                className="pl-9"
              />
            </div>
            <div className="text-sm text-white/60">
              Showing <span className="text-white font-semibold">{filtered.length}</span> partner{filtered.length === 1 ? "" : "s"}
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-14">
              <Loader2 className="w-8 h-8 animate-spin text-neon-purple" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="glass p-12 text-center">
              <Building2 className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display text-xl text-white mb-2">No partners found</h3>
              <p className="text-muted-foreground">Try a different search, or check back soon.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((c, i) => {
                const playUrl = normalizeExternalUrl(c.affiliateLink || "");
                const lbUrl = `/leaderboard?casino=${encodeURIComponent(c.slug)}`;
                return (
                  <motion.div
                    key={c.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.25) }}
                  >
                    <Card className="glass p-6">
                      <div className="flex items-center gap-3">
                        {c.logo ? (
                          <img
                            src={c.logo}
                            alt={`${c.name} logo`}
                            className="w-12 h-12 rounded-2xl object-cover bg-white/5"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-white font-semibold">
                            {(c.name || "").slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-white font-semibold text-lg truncate">{c.name}</div>
                          <div className="text-sm text-muted-foreground line-clamp-1">
                            {c.bonusText || c.welcomeBonus || "Exclusive bonuses available"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <Button variant="outline" asChild className="w-full">
                          <a href={lbUrl}>
                            <Trophy className="w-4 h-4 mr-2" /> Leaderboard
                          </a>
                        </Button>
                        <Button variant="outline" asChild className="w-full">
                          <a href="/giveaways">
                            <Gift className="w-4 h-4 mr-2" /> Giveaways
                          </a>
                        </Button>
                        {playUrl ? (
                          <Button asChild className="w-full">
                            <a href={playUrl} target="_blank" rel="noreferrer noopener">
                              Play <ExternalLink className="w-4 h-4 ml-2" />
                            </a>
                          </Button>
                        ) : (
                          <Button className="w-full" disabled>
                            No link
                          </Button>
                        )}
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
