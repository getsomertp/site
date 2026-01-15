import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/use-toast";
import { getQueryFn } from "@/lib/queryClient";
import { motion } from "framer-motion";
import { Gift, Clock, Users, CheckCircle, Lock, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { GiveawayRulesModal } from "@/components/GiveawayRulesModal";
import type { Casino, Giveaway, GiveawayRequirement } from "@shared/schema";

type WinnerSummary = {
  id: string;
  discordUsername?: string | null;
  discordAvatar?: string | null;
  discordAvatarUrl?: string | null;
  kickUsername?: string | null;
  kickVerified?: boolean | null;
};

type GiveawayWithDetails = Giveaway & {
  entries: number;
  requirements: GiveawayRequirement[];
  hasEntered?: boolean;
  winner?: WinnerSummary | null;
};

function parseRequireVerified(value: unknown): boolean {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "verified" || v === "true" || v === "1" || v === "yes";
}

export default function Giveaways() {
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();

  const userId = session?.user?.id as string | undefined;
  const isLoggedIn = Boolean(userId);

  const beginDiscordLogin = () => {
    window.location.href = "/api/auth/discord";
  };

  const { data: casinos = [] } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const casinosById = useMemo(() => {
    const m = new Map<number, Casino>();
    (casinos || []).forEach((c) => m.set(Number(c.id), c));
    return m;
  }, [casinos]);

  const { data: userProfile, isLoading: loadingProfile } = useQuery<any>({
    queryKey: [userId ? `/api/users/${userId}` : "/api/users/0"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!userId,
  });

  const accounts: Array<{ casinoId: number; verified: boolean }> = useMemo(() => {
    return (userProfile?.casinoAccounts || []).map((a: any) => ({
      casinoId: Number(a.casinoId),
      verified: Boolean(a.verified),
    }));
  }, [userProfile]);

  const { data: giveaways = [], isLoading } = useQuery<GiveawayWithDetails[]>({
    queryKey: ["/api/giveaways"],
  });

  const enterMutation = useMutation({
    mutationFn: async (giveawayId: number) => {
      const res = await fetch(`/api/giveaways/${giveawayId}/enter`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to enter");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Entered giveaway" });
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways/active"] });
    },
    onError: (err: any) => {
      toast({
        title: "Could not enter",
        description: err?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const formatRequirements = (requirements: GiveawayRequirement[]): string => {
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
          case "linked_account": {
            const casinoName = r.casinoId ? casinosById.get(Number(r.casinoId))?.name : null;
            const requireVerified = parseRequireVerified((r as any).value);
            const base = casinoName ? `Linked ${casinoName} Account` : "Linked Casino Account";
            return requireVerified ? `${base} (Verified)` : base;
          }
          default:
            return r.type;
        }
      })
      .join(", ");
  };

  const evaluateRequirements = (requirements: GiveawayRequirement[]) => {
    if (!requirements || requirements.length === 0) {
      return { met: true as const, action: "enter" as const };
    }

    if (!isLoggedIn) {
      return { met: false as const, action: "login" as const };
    }

    // If we need to check linked accounts but profile is still loading, keep it locked briefly
    const needsAccounts = requirements.some((r) => r.type === "linked_account");
    if (needsAccounts && loadingProfile) {
      return { met: false as const, action: "checking" as const };
    }

    for (const r of requirements) {
      if (r.type === "discord") continue;

      if (r.type === "linked_account") {
        const requiredCasinoId = r.casinoId ? Number(r.casinoId) : null;
        const requireVerified = parseRequireVerified((r as any).value);

        const ok = accounts.some((a) => {
          const casinoOk = requiredCasinoId ? a.casinoId === requiredCasinoId : true;
          const verifiedOk = requireVerified ? a.verified : true;
          return casinoOk && verifiedOk;
        });

        if (!ok) {
          return {
            met: false as const,
            action: "profile" as const,
            casinoId: requiredCasinoId,
            requireVerified,
          };
        }
        continue;
      }

      // Other requirement types are not implemented yet
      return { met: false as const, action: "unsupported" as const, type: r.type };
    }

    return { met: true as const, action: "enter" as const };
  };

  const formatTimeRemaining = (endsAt: Date | string): string => {
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
  };

  const filteredGiveaways = giveaways.filter((g) => {
    const active = g.isActive && new Date(g.endsAt) > new Date();
    if (filter === "all") return true;
    if (filter === "active") return active;
    return !active;
  });

  const pastWinners = giveaways
    .filter((g) => g.winnerId)
    .slice(0, 4)
    .map((g) => ({
      username: g.winner?.discordUsername || g.winner?.kickUsername || "Winner selected",
      avatar: g.winner?.discordAvatar || null,
      prize: g.prize,
      giveaway: g.title,
      date: new Date(g.endsAt).toLocaleDateString(),
    }));

  return (
    <div className="min-h-screen">
      <Navigation />

      <div className="pt-28 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <Gift className="w-12 h-12 text-neon-cyan animate-pulse-glow" />
              <h1 className="font-display text-5xl sm:text-6xl font-bold text-white">
                Giveaways
              </h1>
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Free entries, massive prizes. Connect your Discord and start winning!
            </p>
          </motion.div>

          {!isLoggedIn && (
            <Card className="glass p-6 mb-8 text-center">
              <p className="text-muted-foreground mb-4">
                Connect your Discord to enter giveaways and track your entries.
              </p>
              <Button
                onClick={beginDiscordLogin}
                className="font-display bg-gradient-to-r from-neon-cyan to-neon-purple"
              >
                Connect Discord
              </Button>
            </Card>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
            <div className="flex gap-2">
              {(["all", "active", "ended"] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? "default" : "outline"}
                  className={`font-display capitalize ${filter === f ? "bg-neon-purple" : ""}`}
                  onClick={() => setFilter(f)}
                  data-testid={`filter-${f}`}
                >
                  {f}
                </Button>
              ))}
            </div>

            <GiveawayRulesModal
              variant="outline"
              className="font-display border-white/15 text-white hover:bg-white/5"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-neon-purple" />
            </div>
          ) : filteredGiveaways.length === 0 ? (
            <Card className="glass p-12 text-center mb-16">
              <Gift className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display text-xl text-white mb-2">No Giveaways Found</h3>
              <p className="text-muted-foreground">
                {filter === "active"
                  ? "No active giveaways right now. Check back soon!"
                  : filter === "ended"
                    ? "No ended giveaways yet."
                    : "No giveaways available. Check back soon!"}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              {filteredGiveaways.map((giveaway, i) => {
                const isActive = giveaway.isActive && new Date(giveaway.endsAt) > new Date();
                const timeRemaining = formatTimeRemaining(giveaway.endsAt);
                const req = evaluateRequirements(giveaway.requirements || []);
                const requirementMet = req.met;
                const alreadyEntered = Boolean((giveaway as any).hasEntered);
                const winnerName = giveaway.winner?.discordUsername || giveaway.winner?.kickUsername || "Winner selected";

                const primaryCta = () => {
                  if (alreadyEntered && isActive) return { label: "Already Entered", disabled: true, onClick: undefined as any };
                  if (!isLoggedIn) return { label: "Connect Discord to Enter", disabled: false, onClick: beginDiscordLogin };
                  if (!isActive) return { label: "Giveaway Ended", disabled: true, onClick: undefined as any };

                  if (!requirementMet) {
                    if (req.action === "profile") {
                      return {
                        label: "Link Required Casino",
                        disabled: false,
                        onClick: () => (window.location.href = "/profile"),
                      };
                    }
                    if (req.action === "checking") {
                      return { label: "Checking Requirements...", disabled: true, onClick: undefined as any };
                    }
                    return { label: "Requirement Not Supported", disabled: true, onClick: undefined as any };
                  }

                  return {
                    label: enterMutation.isPending ? "Entering..." : "Confirm Entry",
                    disabled: enterMutation.isPending,
                    onClick: () => enterMutation.mutate(giveaway.id),
                  };
                };

                const cta = primaryCta();

                return (
                  <motion.div
                    key={giveaway.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card
                      className={`glass p-6 h-full flex flex-col relative overflow-hidden ${
                        !isActive ? "opacity-75" : ""
                      }`}
                      data-testid={`card-giveaway-${giveaway.id}`}
                    >
                      {isActive && (
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-neon-cyan/20 to-transparent rounded-full blur-3xl" />
                      )}

                      <div className="relative flex-1">
                        <div className="flex items-center justify-between mb-4">
                          <Badge
                            variant={isActive ? "default" : "secondary"}
                            className={isActive ? "bg-neon-cyan/20 text-neon-cyan" : ""}
                          >
                            {isActive ? (
                              <>
                                <Clock className="w-3 h-3 mr-1" />
                                {timeRemaining}
                              </>
                            ) : (
                              "Ended"
                            )}
                          </Badge>
                          <Gift className={`w-5 h-5 ${isActive ? "text-neon-cyan" : "text-muted-foreground"}`} />
                        </div>

                        <h3 className="font-display text-xl font-bold text-white mb-2">
                          {giveaway.title}
                        </h3>

                        <div
                          className={`text-4xl font-display font-bold mb-4 ${
                            isActive ? "text-neon-gold text-glow-gold" : "text-muted-foreground"
                          }`}
                        >
                          {giveaway.prize}
                        </div>

                        {!isActive && giveaway.winnerId && (
                          <div className="mb-4 p-3 bg-neon-gold/10 rounded-lg border border-neon-gold/20">
                            <p className="text-xs text-muted-foreground mb-1">Winner</p>
                            <p className="font-display font-bold text-neon-gold flex items-center gap-2">
                              <Sparkles className="w-4 h-4" />
                              {winnerName}
                            </p>
                          </div>
                        )}

                        <div className="space-y-3 mb-6">
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-muted-foreground">Entries</span>
                              <span className="text-white">
                                {giveaway.entries.toLocaleString()}
                                {giveaway.maxEntries && ` / ${giveaway.maxEntries.toLocaleString()}`}
                              </span>
                            </div>
                            {giveaway.maxEntries && (
                              <Progress
                                value={(giveaway.entries / giveaway.maxEntries) * 100}
                                className="h-2"
                              />
                            )}
                          </div>

                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Requirement</span>
                            <span
                              className={`flex items-center gap-1 ${
                                requirementMet ? "text-green-400" : "text-neon-purple"
                              }`}
                            >
                              {requirementMet ? (
                                <CheckCircle className="w-4 h-4" />
                              ) : (
                                <Lock className="w-4 h-4" />
                              )}
                              {formatRequirements(giveaway.requirements || [])}
                            </span>
                          </div>
                        </div>
                      </div>

                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            className={`w-full font-display ${
                              isActive ? "bg-gradient-to-r from-neon-cyan to-neon-purple hover:opacity-90" : ""
                            }`}
                            variant={!isActive ? "secondary" : "default"}
                            data-testid={`button-enter-${giveaway.id}`}
                          >
                            {isActive ? (alreadyEntered ? "Already Entered" : "Enter Giveaway") : "View Details"}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="glass border-white/10">
                          <DialogHeader>
                            <DialogTitle className="font-display text-2xl">
                              {giveaway.title}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="text-4xl font-display font-bold text-neon-gold text-center py-4">
                              {giveaway.prize}
                            </div>
                            <p className="text-muted-foreground">{giveaway.description}</p>

                            <div className="grid grid-cols-2 gap-4 py-4">
                              <div className="text-center p-4 bg-white/5 rounded-lg">
                                <Users className="w-6 h-6 mx-auto mb-2 text-neon-cyan" />
                                <p className="text-2xl font-bold text-white">
                                  {giveaway.entries.toLocaleString()}
                                </p>
                                <p className="text-xs text-muted-foreground">Current Entries</p>
                              </div>
                              <div className="text-center p-4 bg-white/5 rounded-lg">
                                <Clock className="w-6 h-6 mx-auto mb-2 text-neon-purple" />
                                <p className="text-2xl font-bold text-white">{timeRemaining}</p>
                                <p className="text-xs text-muted-foreground">Time Left</p>
                              </div>
                            </div>

                            {!isActive && giveaway.winnerId && (
                              <div className="p-4 bg-neon-gold/10 rounded-lg border border-neon-gold/20">
                                <p className="text-sm text-neon-gold flex items-center gap-2">
                                  <Sparkles className="w-4 h-4" />
                                  Winner: {winnerName}
                                </p>
                              </div>
                            )}

                            {alreadyEntered && isActive && (
                              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                                <p className="text-sm text-green-400 flex items-center gap-2">
                                  <CheckCircle className="w-4 h-4" />
                                  You're already entered in this giveaway.
                                </p>
                              </div>
                            )}

                            {!requirementMet && (
                              <div className="p-4 bg-neon-purple/10 rounded-lg border border-neon-purple/30">
                                <p className="text-sm text-neon-purple flex items-center gap-2">
                                  <Lock className="w-4 h-4" />
                                  Requirement: {formatRequirements(giveaway.requirements || [])}
                                </p>
                              </div>
                            )}

                            <Button
                              className="w-full font-display bg-gradient-to-r from-neon-cyan to-neon-purple"
                              disabled={cta.disabled}
                              onClick={cta.onClick}
                            >
                              {cta.label}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {pastWinners.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-display text-3xl font-bold text-white mb-6 flex items-center gap-3">
                <Sparkles className="w-8 h-8 text-neon-gold" />
                Recent Winners
              </h2>
              <Card className="glass overflow-hidden">
                <div className="hidden md:grid grid-cols-4 gap-4 p-4 border-b border-white/10 text-sm font-display uppercase tracking-wider text-muted-foreground">
                  <div>Winner</div>
                  <div>Prize</div>
                  <div>Giveaway</div>
                  <div className="text-right">Date</div>
                </div>
                {pastWinners.map((winner, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 border-b border-white/5 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-xs text-white">
                        {winner.avatar ? (
                          <img src={winner.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span>🏆</span>
                        )}
                      </div>
                      <div className="text-white font-display font-bold">{winner.username}</div>
                    </div>
                    <div className="text-neon-gold font-bold">{winner.prize}</div>
                    <div className="text-muted-foreground">{winner.giveaway}</div>
                    <div className="text-muted-foreground md:text-right">{winner.date}</div>
                  </motion.div>
                ))}
              </Card>
            </motion.div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
