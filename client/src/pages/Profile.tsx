import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { User, Check, Upload, X, Shield, Wallet, Tv, Copy, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Navigation } from "@/components/Navigation";
import type { Casino } from "@shared/schema";

type SessionResponse = {
  user: null | {
    id: string;
    discordUsername?: string | null;
    discordId?: string | null;
    discordAvatar?: string | null;
    kickUsername?: string | null;
    kickVerified?: boolean;
  };
};

function safeInitials(name: string) {
  const s = (name || "").trim();
  if (!s) return "??";
  return s.slice(0, 2).toUpperCase();
}

export default function Profile() {
  const { data: session, isLoading: sessionLoading } = useQuery<SessionResponse>({
    queryKey: ["/api/auth/me"],
  });

  const isLoggedIn = Boolean(session?.user?.id);

  const beginDiscordLogin = () => {
    window.location.href = "/api/auth/discord";
  };

  const { data: casinosRaw = [], isLoading: casinosLoading } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
    queryFn: async () => {
      const res = await fetch("/api/casinos", { credentials: "include" });
      const ct = res.headers.get("content-type") || "";
      const data = ct.includes("application/json") ? await res.json() : [];
      return Array.isArray(data) ? data : [];
    },
  });

  // Only show casinos that exist in your admin panel (i.e., from DB).
  const casinos = useMemo(() => (casinosRaw || []).filter((c) => c && c.isActive !== false), [casinosRaw]);

  const [kickUsername, setKickUsername] = useState("");
  const [casinoInputs, setCasinoInputs] = useState<Record<number, { username: string; odId: string }>>({});
  const [walletInputs, setWalletInputs] = useState<Record<number, { address: string; file: File | null }>>({});
  const [savedCasinos, setSavedCasinos] = useState<Record<number, boolean>>({});
  const [savedWallets, setSavedWallets] = useState<Record<number, boolean>>({});
  const [kickSaved, setKickSaved] = useState(false);

  const handleCasinoChange = (casinoId: number, field: "username" | "odId", value: string) => {
    setCasinoInputs((prev) => ({
      ...prev,
      [casinoId]: { ...prev[casinoId], [field]: value },
    }));
  };

  const handleWalletChange = (casinoId: number, address: string) => {
    setWalletInputs((prev) => ({
      ...prev,
      [casinoId]: { ...prev[casinoId], address },
    }));
  };

  const handleFileUpload = (casinoId: number, file: File | null) => {
    setWalletInputs((prev) => ({
      ...prev,
      [casinoId]: { ...prev[casinoId], file },
    }));
  };

  const saveCasino = (casinoId: number) => {
    setSavedCasinos((prev) => ({ ...prev, [casinoId]: true }));
  };

  const saveWallet = (casinoId: number) => {
    setSavedWallets((prev) => ({ ...prev, [casinoId]: true }));
  };

  const copyAffiliateCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // ignore
    }
  };

  const headerLoading = sessionLoading || casinosLoading;

  return (
    <div className="min-h-screen">
      <Navigation />

      <div className="pt-28 pb-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <User className="w-12 h-12 text-neon-purple" />
              <h1 className="font-display text-5xl sm:text-6xl font-bold text-white">My Profile</h1>
            </div>
            <p className="text-muted-foreground text-lg">Link your accounts to participate in giveaways and earn rewards</p>
          </motion.div>

          {headerLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-neon-purple" />
            </div>
          ) : !isLoggedIn ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-8"
            >
              <Card className="glass p-6 border-[#5865F2]/50 bg-[#5865F2]/10">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#5865F2] rounded-xl flex items-center justify-center text-white font-bold">
                      D
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-white text-lg">Connect Discord</h3>
                      <p className="text-sm text-muted-foreground">Log in to manage your linked accounts.</p>
                    </div>
                  </div>
                  <Button className="font-display bg-[#5865F2] hover:bg-[#4752C4]" onClick={beginDiscordLogin}>
                    Connect Discord
                  </Button>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-8"
            >
              <Card className="glass p-6 border-[#5865F2]/50">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-[#5865F2] rounded-xl flex items-center justify-center text-white font-bold text-xl">
                    {safeInitials(session?.user?.discordUsername || "Discord")}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display font-bold text-white text-xl">{session?.user?.discordUsername || "Discord User"}</h3>
                      <Badge className="bg-green-500/20 text-green-400">
                        <Check className="w-3 h-3 mr-1" /> Connected
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Discord ID: {session?.user?.discordId || "—"}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Keep the tabs UI visible (it’s a profile page), but disable saving unless logged in. */}
          <Tabs defaultValue="casinos" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-8 bg-card/50">
              <TabsTrigger value="casinos" className="font-display" data-testid="tab-casinos">
                <Shield className="w-4 h-4 mr-2" /> Casino Accounts
              </TabsTrigger>
              <TabsTrigger value="kick" className="font-display" data-testid="tab-kick">
                <Tv className="w-4 h-4 mr-2" /> Kick Verification
              </TabsTrigger>
              <TabsTrigger value="wallets" className="font-display" data-testid="tab-wallets">
                <Wallet className="w-4 h-4 mr-2" /> SOL Wallets
              </TabsTrigger>
            </TabsList>

            <TabsContent value="casinos">
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-display text-xl font-bold text-white">Link Casino Accounts</h2>
                    <p className="text-sm text-muted-foreground">Enter your username and ID for each casino you play on</p>
                  </div>
                </div>

                {casinos.length === 0 ? (
                  <Card className="glass p-10 text-center">
                    <p className="text-muted-foreground">No casinos yet.</p>
                  </Card>
                ) : (
                  casinos.map((casino, i) => (
                    <motion.div
                      key={casino.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Card className="glass p-6" data-testid={`card-casino-${casino.id}`}>
                        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                          <div className="flex items-center gap-3 lg:w-56 flex-shrink-0">
                            {casino.logo ? (
                              <img
                                src={casino.logo}
                                alt={casino.name}
                                className="w-12 h-12 rounded-xl object-contain bg-white/5"
                              />
                            ) : (
                              <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-white"
                                style={{ backgroundColor: casino.color || "#7c3aed" }}
                              >
                                {safeInitials(casino.name)}
                              </div>
                            )}
                            <div>
                              <h3 className="font-display font-bold text-white">{casino.name}</h3>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <span>Code:</span>
                                <button
                                  className="font-mono text-neon-cyan hover:text-white"
                                  onClick={() => copyAffiliateCode(casino.affiliateCode)}
                                  type="button"
                                >
                                  {casino.affiliateCode}
                                </button>
                                <Copy
                                  className="w-3 h-3 cursor-pointer hover:text-white"
                                  onClick={() => copyAffiliateCode(casino.affiliateCode)}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">Username</Label>
                              <Input
                                placeholder={`Your ${casino.name} username`}
                                value={casinoInputs[casino.id]?.username || ""}
                                onChange={(e) => handleCasinoChange(casino.id, "username", e.target.value)}
                                className="bg-white/5 border-white/10"
                                disabled={!isLoggedIn || savedCasinos[casino.id]}
                                data-testid={`input-username-${casino.id}`}
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground mb-1 block">User ID / OD ID</Label>
                              <Input
                                placeholder="Your numeric ID"
                                value={casinoInputs[casino.id]?.odId || ""}
                                onChange={(e) => handleCasinoChange(casino.id, "odId", e.target.value)}
                                className="bg-white/5 border-white/10"
                                disabled={!isLoggedIn || savedCasinos[casino.id]}
                                data-testid={`input-id-${casino.id}`}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2 lg:flex-shrink-0">
                            {!isLoggedIn ? (
                              <Badge className="bg-muted text-muted-foreground">Login required</Badge>
                            ) : savedCasinos[casino.id] ? (
                              <Badge className="bg-green-500/20 text-green-400">
                                <Check className="w-3 h-3 mr-1" /> Saved
                              </Badge>
                            ) : (
                              <Button
                                className="font-display bg-neon-purple hover:bg-neon-purple/80"
                                onClick={() => saveCasino(casino.id)}
                                disabled={!casinoInputs[casino.id]?.username || !casinoInputs[casino.id]?.odId}
                                data-testid={`button-save-${casino.id}`}
                              >
                                Save
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))
                )}
              </div>
            </TabsContent>

            <TabsContent value="kick">
              <Card className="glass p-8" data-testid="card-kick-verification">
                <div className="max-w-md mx-auto text-center">
                  <div className="w-20 h-20 bg-[#53fc18] rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Tv className="w-10 h-10 text-black" />
                  </div>

                  <h2 className="font-display text-2xl font-bold text-white mb-2">Kick Verification</h2>
                  <p className="text-muted-foreground mb-8">Link your Kick account to unlock exclusive rewards</p>

                  {!isLoggedIn ? (
                    <div className="space-y-4">
                      <Badge className="bg-muted text-muted-foreground text-base px-4 py-2">Login required</Badge>
                      <Button className="font-display bg-[#5865F2] hover:bg-[#4752C4]" onClick={beginDiscordLogin}>
                        Connect Discord
                      </Button>
                    </div>
                  ) : kickSaved ? (
                    <div className="space-y-4">
                      <Badge className="bg-green-500/20 text-green-400 text-base px-4 py-2">
                        <Check className="w-4 h-4 mr-2" /> Kick Account Linked
                      </Badge>
                      <p className="text-white font-display text-lg">@{kickUsername}</p>
                      <Button variant="outline" className="font-display" onClick={() => setKickSaved(false)}>
                        Change Account
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-left">
                        <Label className="text-muted-foreground mb-2 block">Kick Username</Label>
                        <Input
                          placeholder="your_kick_username"
                          value={kickUsername}
                          onChange={(e) => setKickUsername(e.target.value)}
                          className="bg-white/5 border-white/10 text-center text-lg"
                          data-testid="input-kick-username"
                        />
                      </div>

                      <Button
                        className="w-full font-display bg-[#53fc18] hover:bg-[#53fc18]/80 text-black"
                        onClick={() => setKickSaved(true)}
                        disabled={!kickUsername.trim()}
                        data-testid="button-save-kick"
                      >
                        Save Kick Username
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="wallets">
              <div className="space-y-6">
                <div>
                  <h2 className="font-display text-xl font-bold text-white mb-1">Link SOL Wallets</h2>
                  <p className="text-sm text-muted-foreground">Submit your SOL wallet per casino + a screenshot for verification</p>
                </div>

                {casinos.length === 0 ? (
                  <Card className="glass p-10 text-center">
                    <p className="text-muted-foreground">No casinos yet.</p>
                  </Card>
                ) : (
                  casinos.map((casino, i) => (
                    <motion.div
                      key={casino.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <Card className="glass p-6" data-testid={`card-wallet-${casino.id}`}>
                        <div className="flex items-center gap-3 mb-4">
                          {casino.logo ? (
                            <img
                              src={casino.logo}
                              alt={casino.name}
                              className="w-10 h-10 rounded-lg object-contain bg-white/5"
                            />
                          ) : (
                            <div
                              className="w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold text-white"
                              style={{ backgroundColor: casino.color || "#7c3aed" }}
                            >
                              {safeInitials(casino.name)}
                            </div>
                          )}
                          <div>
                            <h3 className="font-display font-bold text-white">{casino.name}</h3>
                            <p className="text-xs text-muted-foreground">SOL wallet for payouts</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <Label className="text-xs text-muted-foreground mb-1 block">SOL Address</Label>
                            <Input
                              placeholder="Your SOL address"
                              value={walletInputs[casino.id]?.address || ""}
                              onChange={(e) => handleWalletChange(casino.id, e.target.value)}
                              className="bg-white/5 border-white/10 font-mono"
                              disabled={!isLoggedIn || savedWallets[casino.id]}
                              data-testid={`input-wallet-${casino.id}`}
                            />
                          </div>

                          <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">Screenshot (wallet proof)</Label>

                            {savedWallets[casino.id] ? (
                              <div className="flex items-center justify-between p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                                <div className="flex items-center gap-3">
                                  <Check className="w-5 h-5 text-green-400" />
                                  <div>
                                    <p className="text-green-400 font-display font-bold">Submitted</p>
                                    <p className="text-xs text-muted-foreground">Pending verification</p>
                                  </div>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => setSavedWallets((p) => ({ ...p, [casino.id]: false }))}>
                                  Edit
                                </Button>
                              </div>
                            ) : (
                              <label
                                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-neon-purple/50 transition-colors bg-white/5 ${
                                  !isLoggedIn ? "opacity-60 cursor-not-allowed" : ""
                                }`}
                                data-testid={`upload-wallet-${casino.id}`}
                              >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                  <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                                  <p className="text-sm text-muted-foreground">
                                    {walletInputs[casino.id]?.file ? (
                                      <span className="text-neon-cyan">{walletInputs[casino.id].file?.name}</span>
                                    ) : (
                                      <>Click to upload or drag and drop</>
                                    )}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                                </div>
                                <input
                                  type="file"
                                  className="hidden"
                                  accept="image/*"
                                  disabled={!isLoggedIn}
                                  onChange={(e) => handleFileUpload(casino.id, e.target.files?.[0] || null)}
                                />
                              </label>
                            )}
                          </div>

                          {!savedWallets[casino.id] && (
                            <Button
                              className="w-full font-display bg-gradient-to-r from-neon-purple to-neon-cyan hover:opacity-90"
                              onClick={() => saveWallet(casino.id)}
                              disabled={!isLoggedIn || !walletInputs[casino.id]?.address || !walletInputs[casino.id]?.file}
                              data-testid={`button-save-wallet-${casino.id}`}
                            >
                              <Wallet className="mr-2 w-4 h-4" /> Save Wallet
                            </Button>
                          )}
                        </div>
                      </Card>
                    </motion.div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
