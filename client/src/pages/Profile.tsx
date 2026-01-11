import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, ExternalLink, Save, Trash2, Upload } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getQueryFn, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Casino, UserCasinoAccount, UserWallet } from "@shared/schema";

type SessionResponse = {
  user:
    | {
        id: string;
        discordUsername: string | null;
        discordAvatar: string | null;
        kickUsername: string | null;
        kickVerified: boolean;
        isAdmin: boolean;
      }
    | null;
};

type UserProfileResponse = {
  id: string;
  discordUsername: string | null;
  discordAvatar: string | null;
  kickUsername: string | null;
  kickVerified: boolean;
  casinoAccounts: UserCasinoAccount[];
  wallets: UserWallet[];
};

type AccountInput = { username: string; odId: string };
type WalletInput = { solAddress: string; screenshotUrl: string };

function norm(value: string | null | undefined) {
  return (value || "").trim();
}

export default function Profile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: session } = useQuery<SessionResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const userId = session?.user?.id || null;

  const { data: casinos = [] } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: profile } = useQuery<UserProfileResponse>({
    queryKey: userId ? ["/api/users", userId] : ["__noop__"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: Boolean(userId),
  });

  const [kickUsername, setKickUsername] = useState("");
  const [accountInputs, setAccountInputs] = useState<Record<number, AccountInput>>({});
  const [walletInputs, setWalletInputs] = useState<Record<number, WalletInput>>({});

  useEffect(() => {
    if (profile) setKickUsername(profile.kickUsername || "");
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    const acc: Record<number, AccountInput> = {};
    const wal: Record<number, WalletInput> = {};
    for (const c of casinos) {
      const existingAcc = profile.casinoAccounts.find((a) => a.casinoId === c.id);
      const existingWal = profile.wallets.find((w) => w.casinoId === c.id);
      acc[c.id] = { username: existingAcc?.username || "", odId: existingAcc?.odId || "" };
      wal[c.id] = { solAddress: existingWal?.solAddress || "", screenshotUrl: existingWal?.screenshotUrl || "" };
    }
    setAccountInputs(acc);
    setWalletInputs(wal);
  }, [casinos, profile]);

  const beginDiscordLogin = () => {
    window.location.href = "/api/auth/discord";
  };

  const updateKickMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not logged in");
      const res = await apiRequest("PATCH", `/api/users/${userId}`, { kickUsername: kickUsername.trim() });
      return await res.json();
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Kick username updated." });
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (err: any) => toast({ title: "Error", description: String(err?.message || err), variant: "destructive" }),
  });

  const uploadScreenshotMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/uploads/wallet-screenshot", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as { url: string };
    },
    onError: (err: any) => toast({ title: "Upload failed", description: String(err?.message || err), variant: "destructive" }),
  });

  const saveCasinoAccountMutation = useMutation({
    mutationFn: async (casinoId: number) => {
      if (!userId) throw new Error("Not logged in");
      const input = accountInputs[casinoId] || { username: "", odId: "" };
      const username = norm(input.username);
      const odId = norm(input.odId);

      if (!username || !odId) throw new Error("Casino username and OD ID are required.");

      const existing = profile?.casinoAccounts.find((a) => a.casinoId === casinoId);

      if (existing) {
        const res = await apiRequest("PATCH", `/api/casino-accounts/${existing.id}`, { username, odId });
        return await res.json();
      }

      const res = await apiRequest("POST", `/api/users/${userId}/casino-accounts`, { casinoId, username, odId });
      return await res.json();
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Casino account saved." });
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
    },
    onError: (err: any) => toast({ title: "Error", description: String(err?.message || err), variant: "destructive" }),
  });

  const deleteCasinoAccountMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest("DELETE", `/api/casino-accounts/${accountId}`);
      return res;
    },
    onSuccess: async () => {
      toast({ title: "Deleted", description: "Casino account deleted." });
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
    },
    onError: (err: any) => toast({ title: "Error", description: String(err?.message || err), variant: "destructive" }),
  });

  const saveWalletMutation = useMutation({
    mutationFn: async (casinoId: number) => {
      if (!userId) throw new Error("Not logged in");
      const input = walletInputs[casinoId] || { solAddress: "", screenshotUrl: "" };
      const solAddress = norm(input.solAddress);
      const screenshotUrl = norm(input.screenshotUrl);

      if (!solAddress) throw new Error("SOL address is required.");

      const existing = profile?.wallets.find((w) => w.casinoId === casinoId);

      if (existing) {
        const res = await apiRequest("PATCH", `/api/wallets/${existing.id}`, { solAddress, screenshotUrl: screenshotUrl || null });
        return await res.json();
      }

      const res = await apiRequest("POST", `/api/users/${userId}/wallets`, { casinoId, solAddress, screenshotUrl: screenshotUrl || null });
      return await res.json();
    },
    onSuccess: async () => {
      toast({ title: "Saved", description: "Wallet saved." });
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
    },
    onError: (err: any) => toast({ title: "Error", description: String(err?.message || err), variant: "destructive" }),
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async (walletId: number) => {
      const res = await apiRequest("DELETE", `/api/wallets/${walletId}`);
      return res;
    },
    onSuccess: async () => {
      toast({ title: "Deleted", description: "Wallet deleted." });
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
    },
    onError: (err: any) => toast({ title: "Error", description: String(err?.message || err), variant: "destructive" }),
  });

  const casinoAccountsByCasinoId = useMemo(() => {
    const map = new Map<number, UserCasinoAccount>();
    for (const a of profile?.casinoAccounts || []) map.set(a.casinoId, a);
    return map;
  }, [profile?.casinoAccounts]);

  const walletsByCasinoId = useMemo(() => {
    const map = new Map<number, UserWallet>();
    for (const w of profile?.wallets || []) map.set(w.casinoId, w);
    return map;
  }, [profile?.wallets]);

  return (
    <div className="min-h-screen">
      <Navigation />

      <div className="pt-28 pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="font-display text-4xl font-bold text-white mb-2">Profile</h1>
            <p className="text-white/70">Manage your linked accounts and wallet verification.</p>
          </motion.div>

          {!userId ? (
            <Card className="glass p-6">
              <div className="text-white/80 mb-4">You need to log in with Discord to edit your profile.</div>
              <Button className="font-display bg-[#5865F2] hover:bg-[#4752C4] text-white" onClick={beginDiscordLogin}>
                Login with Discord
              </Button>
            </Card>
          ) : (
            <>
              <Card className="glass p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {profile?.discordAvatar ? (
                      <img
                        src={profile.discordAvatar}
                        alt="avatar"
                        className="w-14 h-14 rounded-xl border border-white/10"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-white/10 border border-white/10" />
                    )}
                    <div>
                      <div className="font-display text-xl text-white">{profile?.discordUsername || "Discord user"}</div>
                      <div className="text-sm text-white/60">ID: {profile?.id}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {profile?.kickVerified ? (
                      <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
                        <Check className="w-3 h-3 mr-1" /> Kick Verified
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-white/10 text-white/70 border border-white/10">
                        Kick not verified
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="mt-6 grid md:grid-cols-3 gap-4">
                  <div className="md:col-span-2">
                    <Label className="text-white/80">Kick Username</Label>
                    <Input
                      value={kickUsername}
                      onChange={(e) => setKickUsername(e.target.value)}
                      className="bg-white/5 border-white/10 text-white"
                      placeholder="your_kick_username"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full font-display"
                      onClick={() => updateKickMutation.mutate()}
                      disabled={updateKickMutation.isPending}
                    >
                      <Save className="w-4 h-4 mr-2" /> Save
                    </Button>
                  </div>
                </div>
              </Card>

              <Tabs defaultValue="accounts" className="w-full">
                <TabsList className="bg-white/5 border border-white/10">
                  <TabsTrigger value="accounts" className="font-display">Casino Accounts</TabsTrigger>
                  <TabsTrigger value="wallets" className="font-display">Wallets</TabsTrigger>
                </TabsList>

                <TabsContent value="accounts" className="mt-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    {casinos.map((casino) => {
                      const existing = casinoAccountsByCasinoId.get(casino.id);
                      const input = accountInputs[casino.id] || { username: "", odId: "" };

                      return (
                        <Card key={casino.id} className="glass p-6">
                          <div className="flex items-start justify-between gap-3 mb-5">
                            <div>
                              <h3 className="font-display text-xl font-bold text-white">{casino.name}</h3>
                              <div className="mt-1">
                                {existing?.verified ? (
                                  <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
                                    <Check className="w-3 h-3 mr-1" /> Verified
                                  </Badge>
                                ) : existing ? (
                                  <Badge variant="secondary" className="bg-white/10 text-white/70 border border-white/10">
                                    Pending
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-white/10 text-white/70 border border-white/10">
                                    Not set
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {existing ? (
                              <Button
                                size="icon"
                                variant="outline"
                                className="border-white/20 text-white"
                                title="Delete"
                                onClick={() => deleteCasinoAccountMutation.mutate(existing.id)}
                                disabled={deleteCasinoAccountMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <Label className="text-white/80">Casino Username</Label>
                              <Input
                                value={input.username}
                                onChange={(e) =>
                                  setAccountInputs((prev) => ({ ...prev, [casino.id]: { ...input, username: e.target.value } }))
                                }
                                className="bg-white/5 border-white/10 text-white"
                              />
                            </div>

                            <div>
                              <Label className="text-white/80">OD ID</Label>
                              <Input
                                value={input.odId}
                                onChange={(e) =>
                                  setAccountInputs((prev) => ({ ...prev, [casino.id]: { ...input, odId: e.target.value } }))
                                }
                                className="bg-white/5 border-white/10 text-white"
                              />
                            </div>

                            <Button
                              className="font-display"
                              onClick={() => saveCasinoAccountMutation.mutate(casino.id)}
                              disabled={saveCasinoAccountMutation.isPending || !norm(input.username) || !norm(input.odId)}
                            >
                              <Save className="w-4 h-4 mr-2" /> Save
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>

                <TabsContent value="wallets" className="mt-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    {casinos.map((casino) => {
                      const existing = walletsByCasinoId.get(casino.id);
                      const input = walletInputs[casino.id] || { solAddress: "", screenshotUrl: "" };

                      return (
                        <Card key={casino.id} className="glass p-6">
                          <div className="flex items-start justify-between gap-3 mb-5">
                            <div>
                              <h3 className="font-display text-xl font-bold text-white">{casino.name}</h3>
                              <div className="mt-1">
                                {existing?.verified ? (
                                  <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">
                                    <Check className="w-3 h-3 mr-1" /> Verified
                                  </Badge>
                                ) : existing ? (
                                  <Badge variant="secondary" className="bg-white/10 text-white/70 border border-white/10">
                                    Pending
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="bg-white/10 text-white/70 border border-white/10">
                                    Not set
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {existing ? (
                              <Button
                                size="icon"
                                variant="outline"
                                className="border-white/20 text-white"
                                title="Delete"
                                onClick={() => deleteWalletMutation.mutate(existing.id)}
                                disabled={deleteWalletMutation.isPending}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <Label className="text-white/80">SOL Address</Label>
                              <Input
                                value={input.solAddress}
                                onChange={(e) =>
                                  setWalletInputs((prev) => ({ ...prev, [casino.id]: { ...input, solAddress: e.target.value } }))
                                }
                                className="bg-white/5 border-white/10 text-white"
                                placeholder="..."
                              />
                            </div>

                            <div>
                              <Label className="text-white/80">Screenshot (optional)</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="file"
                                  accept="image/*"
                                  className="bg-white/5 border-white/10 text-white"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    try {
                                      const out = await uploadScreenshotMutation.mutateAsync(file);
                                      setWalletInputs((prev) => ({
                                        ...prev,
                                        [casino.id]: { ...input, screenshotUrl: out.url },
                                      }));
                                      toast({ title: "Uploaded", description: "Screenshot uploaded." });
                                    } catch {
                                      // handled by mutation onError
                                    }
                                  }}
                                />
                                {uploadScreenshotMutation.isPending ? (
                                  <Button variant="outline" className="border-white/20 text-white" disabled>
                                    <Upload className="w-4 h-4" />
                                  </Button>
                                ) : null}
                              </div>

                              {input.screenshotUrl ? (
                                <div className="mt-2 flex items-center justify-between gap-3">
                                  <a
                                    className="text-sm text-neon-cyan hover:underline inline-flex items-center gap-1"
                                    href={input.screenshotUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    View uploaded screenshot <ExternalLink className="w-3 h-3" />
                                  </a>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-white/20 text-white"
                                    onClick={() =>
                                      setWalletInputs((prev) => ({
                                        ...prev,
                                        [casino.id]: { ...input, screenshotUrl: "" },
                                      }))
                                    }
                                  >
                                    Clear
                                  </Button>
                                </div>
                              ) : null}
                            </div>

                            <Button
                              className="font-display"
                              onClick={() => saveWalletMutation.mutate(casino.id)}
                              disabled={saveWalletMutation.isPending || !norm(input.solAddress)}
                            >
                              <Save className="w-4 h-4 mr-2" /> Save
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
