import { motion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { getQueryFn } from "@/lib/queryClient";
import { normalizeExternalUrl } from "@/lib/url";

type SiteSetting = {
  key: string;
  value: string;
};

function getSetting(settings: SiteSetting[] | undefined, key: string): string {
  const row = (settings || []).find((s) => s.key === key);
  return row?.value || "";
}

export function Footer() {
  const { data: settings } = useQuery<SiteSetting[]>({
    queryKey: ["/api/site/settings"],
    queryFn: getQueryFn({ on401: "throw" }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const kick = normalizeExternalUrl(getSetting(settings, "kickUrl"));
  const discord = normalizeExternalUrl(getSetting(settings, "discordUrl"));
  const x = normalizeExternalUrl(getSetting(settings, "xUrl"));

  return (
    <footer className="mt-16 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <motion.div initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <Card className="glass p-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
              <div>
                <div className="font-display font-bold text-white text-xl">GETSOME</div>
                <p className="text-sm text-white/60 mt-2 max-w-md">
                  Giveaways, partner leaderboards, and stream events — all in one place.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-sm">
                <div className="space-y-2">
                  <div className="font-display text-white/80 uppercase tracking-wider text-xs">Site</div>
                  <div className="space-y-1">
                    <Link href="/giveaways"><span className="text-white/70 hover:text-white cursor-pointer">Giveaways</span></Link>
                    <Link href="/leaderboard"><span className="text-white/70 hover:text-white cursor-pointer">Leaderboards</span></Link>
                    <Link href="/stream-games"><span className="text-white/70 hover:text-white cursor-pointer">Stream Games</span></Link>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-display text-white/80 uppercase tracking-wider text-xs">Account</div>
                  <div className="space-y-1">
                    <Link href="/profile"><span className="text-white/70 hover:text-white cursor-pointer">Profile</span></Link>
                    <Link href="/affiliates"><span className="text-white/70 hover:text-white cursor-pointer">Affiliates</span></Link>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-display text-white/80 uppercase tracking-wider text-xs">Social</div>
                  <div className="space-y-1">
                    {kick && (
                      <a className="inline-flex items-center gap-2 text-white/70 hover:text-white" href={kick} target="_blank" rel="noopener noreferrer">
                        Kick <ExternalLink className="h-4 w-4 opacity-70" />
                      </a>
                    )}
                    {discord && (
                      <a className="inline-flex items-center gap-2 text-white/70 hover:text-white" href={discord} target="_blank" rel="noopener noreferrer">
                        Discord <ExternalLink className="h-4 w-4 opacity-70" />
                      </a>
                    )}
                    {x && (
                      <a className="inline-flex items-center gap-2 text-white/70 hover:text-white" href={x} target="_blank" rel="noopener noreferrer">
                        X <ExternalLink className="h-4 w-4 opacity-70" />
                      </a>
                    )}
                    {!kick && !discord && !x && (
                      <div className="text-white/50">Links coming soon</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/10 text-xs text-white/50 leading-relaxed">
              <div>
                19+ (or legal age in your region). Gamble responsibly. GETSOME is not a gambling operator and does not
                process wagers or handle deposits/withdrawals.
              </div>
              <div className="mt-2">
                Partner links may be affiliate links. By using them you may support the stream at no extra cost.
              </div>
              <div className="mt-4 text-white/40">© {new Date().getFullYear()} GETSOME</div>
            </div>
          </Card>
        </motion.div>
      </div>
    </footer>
  );
}
