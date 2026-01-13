import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/hooks/useSession";
import { motion } from "framer-motion";
import { Gift, Clock, Users, CheckCircle, Lock, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Navigation } from "@/components/Navigation";
import type { Giveaway, GiveawayRequirement } from "@shared/schema";

type GiveawayWithDetails = Giveaway & { 
  entries: number;
  requirements: GiveawayRequirement[];
};

function formatRequirements(requirements: GiveawayRequirement[]): string {
  if (!requirements || requirements.length === 0) return "No Requirement";
  return requirements.map(r => {
    switch (r.type) {
      case "discord": return "Discord Member";
      case "wager": return `Wager ${r.value || ""}`;
      case "vip": return "VIP Status";
      case "linked_account": return "Linked Casino Account";
      default: return r.type;
    }
  }).join(", ");
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

export default function Giveaways() {
  const [filter, setFilter] = useState<"all" | "active" | "ended">("all");

  const queryClient = useQueryClient();
  const { data: session } = useSession();
const isLoggedIn = Boolean(session?.user?.id);

  const beginDiscordLogin = () => {
    window.location.href = "/api/auth/discord";
  };

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
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
    },
  });

  const filteredGiveaways = giveaways.filter(g => {
    const isActive = g.isActive && new Date(g.endsAt) > new Date();
    if (filter === "all") return true;
    if (filter === "active") return isActive;
    return !isActive;
  });

  const pastWinners = giveaways
    .filter(g => g.winnerId)
    .slice(0, 4)
    .map(g => ({
      username: "Winner",
      prize: g.prize,
      giveaway: g.title,
      date: new Date(g.endsAt).toLocaleDateString()
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-8"
            >
              <Card className="glass p-6 border-[#5865F2]/50 bg-[#5865F2]/10">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#5865F2] rounded-xl flex items-center justify-center">
                      <svg className="w-7 h-7" viewBox="0 0 24 24" fill="white">
                        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-white text-lg">Connect Discord to Enter</h3>
                      <p className="text-sm text-muted-foreground">Link your account to participate in all giveaways</p>
                    </div>
                  </div>
                  <Button 
                    className="font-display bg-[#5865F2] hover:bg-[#4752C4]"
                    data-testid="button-connect-discord-giveaways"
                    onClick={beginDiscordLogin}
                  >
                    Connect Discord
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          <div className="flex gap-2 mb-8">
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

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-neon-purple" />
            </div>
          ) : filteredGiveaways.length === 0 ? (
            <Card className="glass p-12 text-center mb-16">
              <Gift className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-display text-xl text-white mb-2">No Giveaways Found</h3>
              <p className="text-muted-foreground">
                {filter === "active" ? "No active giveaways right now. Check back soon!" : 
                 filter === "ended" ? "No ended giveaways yet." : 
                 "No giveaways available. Check back soon!"}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              {filteredGiveaways.map((giveaway, i) => {
                const isActive = giveaway.isActive && new Date(giveaway.endsAt) > new Date();
                const timeRemaining = formatTimeRemaining(giveaway.endsAt);
                const hasDiscordReq = giveaway.requirements?.some(r => r.type === "discord");
                const requirementMet = (!giveaway.requirements || giveaway.requirements.length === 0) || (hasDiscordReq && isLoggedIn);
                
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
                        
                        <h3 className="font-display text-xl font-bold text-white mb-2">{giveaway.title}</h3>
                        
                        <div className={`text-4xl font-display font-bold mb-4 ${
                          isActive ? "text-neon-gold text-glow-gold" : "text-muted-foreground"
                        }`}>
                          {giveaway.prize}
                        </div>
                        
                        {!isActive && giveaway.winnerId && (
                          <div className="mb-4 p-3 bg-neon-gold/10 rounded-lg border border-neon-gold/20">
                            <p className="text-xs text-muted-foreground mb-1">Winner</p>
                            <p className="font-display font-bold text-neon-gold flex items-center gap-2">
                              <Sparkles className="w-4 h-4" />
                              Winner Selected
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
                              <Progress value={(giveaway.entries / giveaway.maxEntries) * 100} className="h-2" />
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Requirement</span>
                            <span className={`flex items-center gap-1 ${
                              requirementMet ? "text-green-400" : "text-neon-purple"
                            }`}>
                              {requirementMet ? (
                                <CheckCircle className="w-4 h-4" />
                              ) : (
                                <Lock className="w-4 h-4" />
                              )}
                              {formatRequirements(giveaway.requirements)}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button 
                            className={`w-full font-display ${
                              isActive 
                                ? "bg-gradient-to-r from-neon-cyan to-neon-purple hover:opacity-90"
                                : ""
                            }`}
                            variant={!isActive ? "secondary" : "default"}
                            disabled={!isActive}
                            data-testid={`button-enter-${giveaway.id}`}
                          >
                            {isActive ? "Enter Giveaway" : "View Details"}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="glass border-white/10">
                          <DialogHeader>
                            <DialogTitle className="font-display text-2xl">{giveaway.title}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div className="text-4xl font-display font-bold text-neon-gold text-center py-4">
                              {giveaway.prize}
                            </div>
                            <p className="text-muted-foreground">{giveaway.description}</p>
                            <div className="grid grid-cols-2 gap-4 py-4">
                              <div className="text-center p-4 bg-white/5 rounded-lg">
                                <Users className="w-6 h-6 mx-auto mb-2 text-neon-cyan" />
                                <p className="text-2xl font-bold text-white">{giveaway.entries.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">Current Entries</p>
                              </div>
                              <div className="text-center p-4 bg-white/5 rounded-lg">
                                <Clock className="w-6 h-6 mx-auto mb-2 text-neon-purple" />
                                <p className="text-2xl font-bold text-white">{timeRemaining}</p>
                                <p className="text-xs text-muted-foreground">Time Left</p>
                              </div>
                            </div>
                            {!requirementMet && (
                              <div className="p-4 bg-neon-purple/10 rounded-lg border border-neon-purple/30">
                                <p className="text-sm text-neon-purple flex items-center gap-2">
                                  <Lock className="w-4 h-4" />
                                  Requirement: {formatRequirements(giveaway.requirements)}
                                </p>
                              </div>
                            )}
                            <Button 
                              className="w-full font-display bg-gradient-to-r from-neon-cyan to-neon-purple"
                              disabled={!requirementMet || !isLoggedIn}
                              onClick={() => enterMutation.mutate(giveaway.id)}
                            >
                              {!isLoggedIn
                                ? "Connect Discord to Enter"
                                : !requirementMet
                                  ? "Unlock Requirement"
                                  : enterMutation.isPending
                                    ? "Entering..."
                                    : "Confirm Entry"}
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
                    className="grid grid-cols-2 md:grid-cols-4 gap-4 items-center p-4 border-b border-white/5 hover:bg-white/5 transition-colors"
                    data-testid={`row-winner-${i}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-gold to-amber-600 flex items-center justify-center text-black font-bold text-sm">
                        {winner.username.slice(0, 2)}
                      </div>
                      <span className="font-semibold text-white">{winner.username}</span>
                    </div>
                    <div className="font-display font-bold text-neon-gold">{winner.prize}</div>
                    <div className="text-muted-foreground hidden md:block">{winner.giveaway}</div>
                    <div className="text-muted-foreground text-right">{winner.date}</div>
                  </motion.div>
                ))}
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}