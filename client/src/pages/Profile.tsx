import { useState } from "react";
import { motion } from "framer-motion";
import { User, Check, Upload, X, ExternalLink, Shield, Wallet, Tv, Copy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Navigation } from "@/components/Navigation";

const casinos = [
  { id: "stake", name: "Stake", code: "GETSOME", color: "#1a1a2e" },
  { id: "rollbit", name: "Rollbit", code: "GETSOME150", color: "#ff6b35" },
  { id: "duelbits", name: "Duelbits", code: "GETSOMEFREE", color: "#00d4aa" },
  { id: "gamdom", name: "Gamdom", code: "GETSOMERAKE", color: "#7c3aed" },
  { id: "roobet", name: "Roobet", code: "GETSOMEVIP", color: "#fbbf24" },
  { id: "bcgame", name: "BC.Game", code: "GETSOMESPIN", color: "#22c55e" },
];

const mockUser = {
  discord: {
    username: "GamingPro#1234",
    id: "123456789012345678",
    avatar: "GP",
    connected: true
  },
  kick: {
    username: "",
    verified: false
  },
  casinoAccounts: {} as Record<string, { username: string; odId: string; verified: boolean }>,
  wallets: {} as Record<string, { address: string; screenshot: string | null }>
};

export default function Profile() {
  const [user] = useState(mockUser);
  const [kickUsername, setKickUsername] = useState("");
  const [casinoInputs, setCasinoInputs] = useState<Record<string, { username: string; odId: string }>>({});
  const [walletInputs, setWalletInputs] = useState<Record<string, { address: string; file: File | null }>>({});
  const [savedCasinos, setSavedCasinos] = useState<Record<string, boolean>>({});
  const [savedWallets, setSavedWallets] = useState<Record<string, boolean>>({});
  const [kickSaved, setKickSaved] = useState(false);

  const handleCasinoChange = (casinoId: string, field: "username" | "odId", value: string) => {
    setCasinoInputs(prev => ({
      ...prev,
      [casinoId]: { ...prev[casinoId], [field]: value }
    }));
  };

  const handleWalletChange = (casinoId: string, address: string) => {
    setWalletInputs(prev => ({
      ...prev,
      [casinoId]: { ...prev[casinoId], address }
    }));
  };

  const handleFileUpload = (casinoId: string, file: File | null) => {
    setWalletInputs(prev => ({
      ...prev,
      [casinoId]: { ...prev[casinoId], file }
    }));
  };

  const saveCasino = (casinoId: string) => {
    setSavedCasinos(prev => ({ ...prev, [casinoId]: true }));
  };

  const saveWallet = (casinoId: string) => {
    setSavedWallets(prev => ({ ...prev, [casinoId]: true }));
  };

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
              <h1 className="font-display text-5xl sm:text-6xl font-bold text-white">
                My Profile
              </h1>
            </div>
            <p className="text-muted-foreground text-lg">
              Link your accounts to participate in giveaways and earn rewards
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-8"
          >
            <Card className="glass p-6 border-[#5865F2]/50">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-[#5865F2] rounded-xl flex items-center justify-center text-white font-bold text-xl">
                  {user.discord.avatar}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-white text-xl">{user.discord.username}</h3>
                    <Badge className="bg-green-500/20 text-green-400">
                      <Check className="w-3 h-3 mr-1" /> Connected
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Discord ID: {user.discord.id}</p>
                </div>
                <Button variant="outline" size="sm" className="font-display">
                  Disconnect
                </Button>
              </div>
            </Card>
          </motion.div>

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
                    <p className="text-sm text-muted-foreground">Enter your username and ID for each casino you play on with our code</p>
                  </div>
                </div>

                {casinos.map((casino, i) => (
                  <motion.div
                    key={casino.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="glass p-6" data-testid={`card-casino-${casino.id}`}>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                        <div className="flex items-center gap-3 lg:w-48 flex-shrink-0">
                          <div 
                            className="w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-white"
                            style={{ backgroundColor: casino.color }}
                          >
                            {casino.name.slice(0, 2)}
                          </div>
                          <div>
                            <h3 className="font-display font-bold text-white">{casino.name}</h3>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span>Code:</span>
                              <span className="font-mono text-neon-cyan">{casino.code}</span>
                              <Copy className="w-3 h-3 cursor-pointer hover:text-white" />
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
                              disabled={savedCasinos[casino.id]}
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
                              disabled={savedCasinos[casino.id]}
                              data-testid={`input-id-${casino.id}`}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 lg:flex-shrink-0">
                          {savedCasinos[casino.id] ? (
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
                ))}
              </div>
            </TabsContent>

            <TabsContent value="kick">
              <Card className="glass p-8" data-testid="card-kick-verification">
                <div className="max-w-md mx-auto text-center">
                  <div className="w-20 h-20 bg-[#53fc18] rounded-2xl flex items-center justify-center mx-auto mb-6">
                    <Tv className="w-10 h-10 text-black" />
                  </div>
                  
                  <h2 className="font-display text-2xl font-bold text-white mb-2">Kick Verification</h2>
                  <p className="text-muted-foreground mb-8">
                    Link your Kick account to verify you're following GETSOME and unlock exclusive rewards
                  </p>

                  {kickSaved ? (
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
                        disabled={!kickUsername}
                        onClick={() => setKickSaved(true)}
                        data-testid="button-verify-kick"
                      >
                        <Check className="mr-2 w-5 h-5" /> Verify Kick Account
                      </Button>
                      
                      <p className="text-xs text-muted-foreground">
                        Make sure you're following GETSOME on Kick before verifying
                      </p>
                      
                      <Button variant="link" className="text-[#53fc18]">
                        <ExternalLink className="w-4 h-4 mr-2" /> Follow on Kick
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="wallets">
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="font-display text-xl font-bold text-white">SOL Wallet Addresses</h2>
                    <p className="text-sm text-muted-foreground">Add your Solana wallet address for each casino and upload a screenshot for verification</p>
                  </div>
                </div>

                {casinos.map((casino, i) => (
                  <motion.div
                    key={casino.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="glass p-6" data-testid={`card-wallet-${casino.id}`}>
                      <div className="flex items-center gap-3 mb-4">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center font-display font-bold text-white text-sm"
                          style={{ backgroundColor: casino.color }}
                        >
                          {casino.name.slice(0, 2)}
                        </div>
                        <h3 className="font-display font-bold text-white">{casino.name}</h3>
                        {savedWallets[casino.id] && (
                          <Badge className="bg-green-500/20 text-green-400 ml-auto">
                            <Check className="w-3 h-3 mr-1" /> Verified
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">SOL Wallet Address</Label>
                          <Input
                            placeholder="Enter your Solana wallet address"
                            value={walletInputs[casino.id]?.address || ""}
                            onChange={(e) => handleWalletChange(casino.id, e.target.value)}
                            className="bg-white/5 border-white/10 font-mono text-sm"
                            disabled={savedWallets[casino.id]}
                            data-testid={`input-wallet-${casino.id}`}
                          />
                        </div>

                        <div>
                          <Label className="text-xs text-muted-foreground mb-2 block">Wallet Screenshot</Label>
                          {savedWallets[casino.id] ? (
                            <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4 text-center">
                              <Check className="w-8 h-8 text-green-400 mx-auto mb-2" />
                              <p className="text-sm text-green-400">Screenshot uploaded</p>
                            </div>
                          ) : (
                            <label 
                              className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-lg cursor-pointer hover:border-neon-purple/50 transition-colors bg-white/5"
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
                                onChange={(e) => handleFileUpload(casino.id, e.target.files?.[0] || null)}
                              />
                            </label>
                          )}
                        </div>

                        {!savedWallets[casino.id] && (
                          <Button 
                            className="w-full font-display bg-gradient-to-r from-neon-purple to-neon-cyan hover:opacity-90"
                            onClick={() => saveWallet(casino.id)}
                            disabled={!walletInputs[casino.id]?.address || !walletInputs[casino.id]?.file}
                            data-testid={`button-save-wallet-${casino.id}`}
                          >
                            <Wallet className="mr-2 w-4 h-4" /> Save Wallet
                          </Button>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8 p-4 bg-neon-gold/10 border border-neon-gold/30 rounded-lg"
          >
            <p className="text-sm text-neon-gold text-center">
              ⚠️ This is a mockup. To save data permanently, upgrade to a full application with database support.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
