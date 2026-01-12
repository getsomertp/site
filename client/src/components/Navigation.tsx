import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Trophy, Gift, Users, LogIn, Settings, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const publicLinks = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/stream-games", label: "Stream Games", icon: Gamepad2 },
  { href: "/giveaways", label: "Giveaways", icon: Gift },
  { href: "/affiliates", label: "Affiliates", icon: Users },
  { href: "/profile", label: "Profile", icon: Users },
];

export function Navigation() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" })
      .then(res => res.json())
      .then(data => setIsAdmin(Boolean(data?.isAdmin)))
      .catch(() => setIsAdmin(false));
  }, [location]);

  const beginDiscordLogin = () => {
    window.location.href = "/api/auth/discord";
  };
  
  const navLinks = isAdmin 
    ? [...publicLinks, { href: "/admin", label: "Admin", icon: Settings }]
    : publicLinks;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="/" data-testid="link-home">
            <motion.div 
              className="flex items-center gap-3 cursor-pointer"
              whileHover={{ scale: 1.02 }}
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-purple to-neon-gold flex items-center justify-center">
                <span className="font-display font-bold text-xl text-white">GS</span>
              </div>
              <span className="font-display font-bold text-2xl text-white text-glow-purple">
                GETSOME
              </span>
            </motion.div>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <motion.span
                  className={`font-display text-sm uppercase tracking-wider cursor-pointer transition-colors ${
                    location === link.href
                      ? "text-neon-gold text-glow-gold"
                      : "text-muted-foreground hover:text-white"
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
            <Button 
              className="font-display bg-[#5865F2] hover:bg-[#4752C4] text-white gap-2"
              data-testid="button-discord-login"
              onClick={beginDiscordLogin}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Login with Discord
            </Button>
          </div>

          <button
            className="md:hidden text-white p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            data-testid="button-mobile-menu"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass border-t border-white/10"
          >
            <div className="px-4 py-6 space-y-4">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <div
                    className={`font-display text-lg py-2 ${
                      location === link.href ? "text-neon-gold" : "text-white"
                    }`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </div>
                </Link>
              ))}
              <Button 
                className="w-full font-display bg-[#5865F2] hover:bg-[#4752C4] text-white gap-2 mt-4"
                data-testid="button-discord-login-mobile"
                onClick={beginDiscordLogin}
              >
                <LogIn size={18} />
                Login with Discord
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
