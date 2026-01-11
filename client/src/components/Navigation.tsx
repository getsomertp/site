import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Trophy, Gift, Users, Settings, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

type SessionResponse = { user: { id: string; isAdmin: boolean } | null };

const publicLinks = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/giveaways", label: "Giveaways", icon: Gift },
  { href: "/affiliates", label: "Affiliates", icon: Users },
  { href: "/profile", label: "Profile", icon: Users },
];

export function Navigation() {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: session } = useQuery<SessionResponse>({ queryKey: ["/api/auth/me"] });
  const isAdmin = Boolean(session?.user?.isAdmin);
  const isLoggedIn = Boolean(session?.user?.id);

  const beginDiscordLogin = () => {
    window.location.href = "/api/auth/discord";
  };

  const logout = async () => {
    await apiRequest("POST", "/api/auth/logout");
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  const adminPath = (import.meta as any).env?.VITE_ADMIN_PATH || "/admin";
  const navLinks = isAdmin
    ? [...publicLinks, { href: adminPath, label: "Admin", icon: Settings }]
    : publicLinks;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/">
            <motion.div className="flex items-center gap-3 cursor-pointer" whileHover={{ scale: 1.02 }}>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-purple to-neon-gold flex items-center justify-center">
                <span className="font-display font-bold text-xl text-white">GS</span>
              </div>
              <span className="font-display font-bold text-2xl text-white text-glow-purple">GETSOME</span>
            </motion.div>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <motion.span
                  className={`font-display text-sm uppercase tracking-wider cursor-pointer transition-colors ${
                    location === link.href ? "text-neon-gold text-glow-gold" : "text-muted-foreground hover:text-white"
                  }`}
                  whileHover={{ y: -2 }}
                  data-testid={`nav-${link.label.toLowerCase()}`}
                >
                  {link.label}
                </motion.span>
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            {isLoggedIn ? (
              <Button
                variant="outline"
                className="font-display border-white/20 text-white gap-2"
                data-testid="button-logout"
                onClick={logout}
              >
                <LogOut className="w-4 h-4" />
                Logout
              </Button>
            ) : (
              <Button
                className="font-display bg-[#5865F2] hover:bg-[#4752C4] text-white gap-2"
                data-testid="button-discord-login"
                onClick={beginDiscordLogin}
              >
                <LogIn className="w-4 h-4" />
                Login with Discord
              </Button>
            )}
          </div>

          <Button
            variant="ghost"
            className="md:hidden text-white"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="md:hidden border-t border-white/10 bg-black/60 backdrop-blur"
          >
            <div className="px-4 py-4 space-y-2">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/90 hover:bg-white/10">
                    {link.icon ? <link.icon className="w-4 h-4" /> : null}
                    <span className="font-display text-sm">{link.label}</span>
                  </div>
                </Link>
              ))}

              <div className="pt-2">
                {isLoggedIn ? (
                  <Button variant="outline" className="w-full border-white/20 text-white gap-2" onClick={logout}>
                    <LogOut className="w-4 h-4" /> Logout
                  </Button>
                ) : (
                  <Button className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white gap-2" onClick={beginDiscordLogin}>
                    <LogIn className="w-4 h-4" /> Login with Discord
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
