import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Users, ExternalLink, Star, Percent, Gift, Shield, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import { normalizeExternalUrl } from "@/lib/url";
import { useSeo } from "@/lib/seo";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonList } from "@/components/SkeletonBlocks";
import type { Casino } from "@shared/schema";

const benefits = [
  {
    icon: Gift,
    title: "Exclusive Bonuses",
    description: "Get bonuses you won't find anywhere else - only through GETSOME affiliate links."
  },
  {
    icon: Percent,
    title: "Maximum Rakeback",
    description: "Our codes unlock the highest possible rakeback percentages on every platform."
  },
  {
    icon: Shield,
    title: "Trusted Partners",
    description: "We only work with licensed, reputable casinos that we personally use and verify."
  },
  {
    icon: Zap,
    title: "Instant Activation",
    description: "Use our codes and bonuses activate instantly - no waiting, no hassle."
  },
];

function getTierStyles(tier: string) {
  switch (tier) {
    case "platinum":
      return {
        border: "border-neon-gold",
        glow: "box-glow-gold",
        badge: "bg-gradient-to-r from-neon-gold to-amber-500 text-black",
        logo: "bg-gradient-to-br from-neon-gold to-amber-600 text-black"
      };
    case "gold":
      return {
        border: "border-neon-purple/50",
        glow: "",
        badge: "bg-neon-purple text-white",
        logo: "bg-gradient-to-br from-neon-purple to-neon-pink text-white"
      };
    default:
      return {
        border: "border-white/10",
        glow: "",
        badge: "bg-muted text-muted-foreground",
        logo: "bg-muted text-white"
      };
  }
}

export default function Affiliates() {
  useSeo({
    title: "Affiliates",
    description: "Exclusive bonuses and maximum rakeback through trusted partners.",
    path: "/affiliates",
  });
  const { toast } = useToast();

  const { data: casinos = [], isLoading } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
  });

  const copyCode = (code: string, name: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: `Code "${code}" copied!`, description: `Use it on ${name}` });
  };

  return (
    <div className="min-h-screen">
      <Navigation />
      
      <div className="pt-24 sm:pt-28 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <Users className="w-12 h-12 text-neon-gold" />
              <h1 className="font-display text-5xl sm:text-6xl font-bold text-white">
                Affiliates & Sponsors
              </h1>
            </div>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Exclusive bonuses and maximum rakeback through our trusted casino partners. 
              Use our codes and GET SOME extra value!
            </p>
          </motion.div>

          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {benefits.map((benefit, i) => (
              <Card key={i} className="glass p-6 text-center">
                <benefit.icon className="w-10 h-10 text-neon-purple mx-auto mb-4" />
                <h3 className="font-display font-bold text-white mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.description}</p>
              </Card>
            ))}
          </motion.div>

          {isLoading ? (
            <SkeletonList count={5} />
          ) : casinos.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No affiliates yet"
              description="Check back soon for exclusive casino partnerships."
            />
          ) : (
            <div className="space-y-6">
              {casinos.map((casino, i) => {
                const tier = (casino.tier || "none") as string;
                const styles = getTierStyles(tier);
                const tierLabel = tier === "none" ? "Partner" : `${tier.charAt(0).toUpperCase()}${tier.slice(1)} Partner`;
                return (
                  <motion.div
                    key={casino.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Card 
                      className={`glass p-6 md:p-8 ${styles.border} ${styles.glow}`}
                      data-testid={`card-affiliate-${casino.slug}`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div 
                            className={`w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center font-display font-bold text-2xl ${styles.logo}`}
                            style={casino.color ? { backgroundColor: casino.color } : undefined}
                          >
                            {casino.logo ? (
                              <img
                                src={casino.logo}
                                alt={casino.name}
                                className="w-full h-full object-contain rounded-2xl bg-white/5"
                              />
                            ) : (
                              casino.name.slice(0, 2)
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-display text-2xl font-bold text-white">{casino.name}</h3>
                              {casino.tier === "platinum" && <Star className="w-5 h-5 text-neon-gold fill-neon-gold" />}
                            </div>
                            <Badge className={styles.badge}>
                              {tierLabel}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Bonus</p>
                            <p className="font-display font-bold text-neon-purple">{casino.bonus || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Rakeback</p>
                            <p className="font-display font-bold text-neon-gold">{casino.rakeback || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Code</p>
                            <p className="font-mono font-bold text-neon-cyan">{casino.affiliateCode}</p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 lg:flex-shrink-0">
                          <Button 
                            variant="outline" 
                            className="font-display"
                            onClick={() => copyCode(casino.affiliateCode, casino.name)}
                            data-testid={`button-copy-${casino.slug}`}
                          >
                            Copy Code
                          </Button>
                          <Button 
                            className={`font-display ${
                              casino.tier === "platinum" 
                                ? "bg-gradient-to-r from-neon-gold to-amber-500 text-black hover:opacity-90" 
                                : "bg-neon-purple hover:bg-neon-purple/80"
                            }`}
                            onClick={() => {
                              const url = normalizeExternalUrl((casino as any)?.affiliateLink);
                              if (!url) return;
                              window.open(url, "_blank", "noopener,noreferrer");
                            }}
                            data-testid={`button-visit-${casino.slug}`}
                          >
                            Visit Site <ExternalLink className="ml-2 w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {(casino.description || casino.features?.length) && (
                        <div className="mt-6 pt-6 border-t border-white/10">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <p className="text-muted-foreground">{casino.description}</p>
                            {casino.features && casino.features.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {casino.features.map((feature) => (
                                  <Badge key={feature} variant="secondary" className="text-xs">
                                    {feature}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-16"
          >
            <Card className="glass p-8 md:p-12 text-center">
              <h2 className="font-display text-3xl font-bold text-white mb-4">
                Want to Partner with GETSOME?
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                Are you a casino or gambling platform looking to reach our engaged audience? 
                We're always looking for quality partners to bring exclusive deals to our community.
              </p>
              <Button 
                size="lg" 
                className="font-display bg-gradient-to-r from-neon-purple to-neon-gold hover:opacity-90"
                data-testid="button-become-partner"
              >
                Become a Partner
              </Button>
            </Card>
          </motion.div>

        </div>
      </div>
      <Footer />
    </div>
  );
}
