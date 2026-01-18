import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSession } from "@/hooks/useSession";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Wallet, Loader2, CheckCircle2, Clock, Pencil, Trash2, ExternalLink } from "lucide-react";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useSeo } from "@/lib/seo";

import { EmptyState } from "@/components/EmptyState";
import { SkeletonCard } from "@/components/SkeletonBlocks";
import { VerificationBadge } from "@/components/VerificationBadge";

import type { Casino, UserCasinoAccount, UserWallet } from "@shared/schema";

type ProfileResponse = {
  id: string;
  discordUsername?: string | null;
  discordAvatar?: string | null;
  kickUsername?: string | null;
  kickVerified?: boolean | null;
  casinoAccounts: UserCasinoAccount[];
  wallets: UserWallet[];
};

function statusBadge(verified: boolean) {
  return <VerificationBadge verified={verified} />;
}

export default function Profile() {
  useSeo({
    title: "Profile",
    description: "Manage your linked casino accounts, wallet proof, and verification status.",
    path: "/profile",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const session = useSession();
  const userId = session.data?.user?.id ?? null;

  const { data: casinos, isLoading: casinosLoading } = useQuery<Casino[]>({
    queryKey: ["/api/casinos"],
  });

  const {
    data: profile,
    isLoading: profileLoading,
  } = useQuery<ProfileResponse>({
    queryKey: userId ? ["/api/users", userId] : ["/api/users", "_"],
    enabled: Boolean(userId),
  });

  // ------- Local form state -------
  const [kickUsername, setKickUsername] = useState("");

  const [casinoInputs, setCasinoInputs] = useState<Record<number, { username: string; odId: string }>>({});
  const [casinoExisting, setCasinoExisting] = useState<Record<number, UserCasinoAccount>>({});
  const [casinoEditing, setCasinoEditing] = useState<Record<number, boolean>>({});

  const [walletInputs, setWalletInputs] = useState<Record<number, { solAddress: string; file: File | null }>>({});
  const [walletExisting, setWalletExisting] = useState<Record<number, UserWallet>>({});
  const [walletEditing, setWalletEditing] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!profile) return;

    setKickUsername(profile.kickUsername ?? "");

    const existingAccounts: Record<number, UserCasinoAccount> = {};
    const nextCasinoInputs: Record<number, { username: string; odId: string }> = {};
    for (const acc of profile.casinoAccounts || []) {
      existingAccounts[acc.casinoId] = acc;
      nextCasinoInputs[acc.casinoId] = { username: acc.username ?? "", odId: acc.odId ?? "" };
    }

    const existingWallets: Record<number, UserWallet> = {};
    const nextWalletInputs: Record<number, { solAddress: string; file: File | null }> = {};
    for (const w of profile.wallets || []) {
      existingWallets[w.casinoId] = w;
      nextWalletInputs[w.casinoId] = { solAddress: w.solAddress ?? "", file: null };
    }

    setCasinoExisting(existingAccounts);
    setCasinoInputs((prev) => ({ ...nextCasinoInputs, ...prev }));
    setWalletExisting(existingWallets);
    setWalletInputs((prev) => ({ ...nextWalletInputs, ...prev }));

    // Reset edit mode if server data changed (keeps UI consistent)
    setCasinoEditing({});
    setWalletEditing({});
  }, [profile]);

  const activeCasinos = useMemo(() => {
    return (casinos || []).filter((c) => c.isActive);
  }, [casinos]);

  // ------- Mutations -------
  const updateKickMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not logged in");
      await apiRequest("PATCH", `/api/users/${userId}`, { kickUsername: kickUsername.trim() });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({ title: "Saved", description: "Kick username updated." });
    },
    onError: (err: any) => {
      toast({ title: "Could not save", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  const saveCasinoAccountMutation = useMutation({
    mutationFn: async (casinoId: number) => {
      if (!userId) throw new Error("Not logged in");
      const inputs = casinoInputs[casinoId] || { username: "", odId: "" };
      const username = inputs.username.trim();
      const odId = inputs.odId.trim();
      if (!username || !odId) throw new Error("Username and OD ID are required");

      // Idempotent upsert on the server
      const res = await apiRequest("POST", `/api/users/${userId}/casino-accounts`, {
        casinoId,
        username,
        odId,
      });
      return (await res.json()) as UserCasinoAccount;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({ title: "Saved", description: "Casino account submitted for verification." });
    },
    onError: (err: any) => {
      toast({ title: "Could not save", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  const deleteCasinoAccountMutation = useMutation({
    mutationFn: async (casinoId: number) => {
      const existing = casinoExisting[casinoId];
      if (!existing) return;
      await apiRequest("DELETE", `/api/casino-accounts/${existing.id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({ title: "Removed", description: "Casino account removed." });
    },
    onError: (err: any) => {
      toast({ title: "Could not remove", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  async function uploadWalletProof(casinoId: number, file: File) {
    if (!userId) throw new Error("Not logged in");
    const fd = new FormData();
    fd.append("casinoId", String(casinoId));
    fd.append("screenshot", file);

    const res = await fetch(`/api/users/${userId}/uploads/wallet-proof`, {
      method: "POST",
      body: fd,
      credentials: "include",
    });

    if (!res.ok) {
      const text = (await res.text()) || res.statusText;
      throw new Error(`${res.status}: ${text}`);
    }

    const json = await res.json();
    return { key: String(json?.key || "") };
  }

  const saveWalletMutation = useMutation({
    mutationFn: async (casinoId: number) => {
      if (!userId) throw new Error("Not logged in");
      const inputs = walletInputs[casinoId] || { solAddress: "", file: null };
      const solAddress = inputs.solAddress.trim();
      if (!solAddress) throw new Error("SOL address is required");

      const existing = walletExisting[casinoId];
      const isEditing = Boolean(walletEditing[casinoId]) || !existing;

      let screenshotUrl = existing?.screenshotUrl ?? "";
      if (isEditing) {
        if (!inputs.file) throw new Error("Screenshot proof is required");
        const uploaded = await uploadWalletProof(casinoId, inputs.file);
        screenshotUrl = uploaded.key;
      }

      // Idempotent upsert on the server
      const payload: any = { casinoId, solAddress };
      if (isEditing) payload.screenshotUrl = screenshotUrl;

      // Idempotent upsert on the server
      const res = await apiRequest("POST", `/api/users/${userId}/wallets`, payload);
      return (await res.json()) as UserWallet;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({ title: "Saved", description: "Wallet submitted for verification." });
    },
    onError: (err: any) => {
      toast({ title: "Could not save", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async (casinoId: number) => {
      const existing = walletExisting[casinoId];
      if (!existing) return;
      await apiRequest("DELETE", `/api/wallets/${existing.id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      toast({ title: "Removed", description: "Wallet removed." });
    },
    onError: (err: any) => {
      toast({ title: "Could not remove", description: err?.message || "Try again.", variant: "destructive" });
    },
  });

  // ------- Render helpers -------
  const loading = casinosLoading || profileLoading || session.isLoading;
  const loggedIn = Boolean(userId);

const hasCasinoLink = Boolean(profile?.casinoAccounts?.length);
const hasWalletProof = Boolean(profile?.wallets?.some((w) => Boolean(w.solAddress) && (Boolean((w as any).hasProof) || Boolean((w as any).screenshotUrl))));
const isVerified = Boolean(
  profile?.kickVerified ||
  profile?.casinoAccounts?.some((a) => Boolean((a as any).verified)) ||
  profile?.wallets?.some((w) => Boolean((w as any).verified)),
);
const setupStepsDone = (hasCasinoLink ? 1 : 0) + (hasWalletProof ? 1 : 0) + (isVerified ? 1 : 0);
const setupProgress = Math.round((setupStepsDone / 3) * 100);

  if (!loggedIn) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="pt-24 sm:pt-28 pb-24">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <EmptyState
              title="Log in to view your profile"
              description="Connect Discord to link casino accounts, upload wallet proof, and enter verified-only giveaways."
              primaryAction={{
                label: "Login with Discord",
                onClick: () => (window.location.href = "/api/auth/discord"),
              }}
            />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const nextStep = !hasCasinoLink
    ? { label: "Link a casino account", targetId: "casino-accounts" }
    : !hasWalletProof
      ? { label: "Upload wallet proof", targetId: "wallet-proofs" }
      : !isVerified
        ? { label: "Wait for verification", targetId: "profile-setup" }
        : null;

  return (
    <div className="min-h-screen">
      <Navigation />
      <div className="pt-24 sm:pt-28 pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex items-center gap-4">
            {profileLoading ? (
              <div className="h-14 w-14 rounded-full border border-white/10 bg-white/5" />
            ) : profile?.discordAvatar ? (
              <img
                src={profile.discordAvatar}
                alt="Avatar"
                className="h-14 w-14 rounded-full border border-white/10 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-14 w-14 rounded-full border border-white/10 bg-white/5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xl sm:text-2xl font-semibold truncate">{profile?.discordUsername || "User"}</div>
              <div className="text-sm text-white/60">Link casino accounts, add wallet proof, and track verification.</div>
            </div>
            {loading ? (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading
              </Badge>
            ) : (
              <Badge variant="outline">Signed in</Badge>
            )}
          </div>

          {nextStep ? (
            <Card className="glass p-4 sm:p-5 border-white/10">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-sm uppercase tracking-wider text-white/60">Next step</div>
                  <div className="text-white font-semibold">{nextStep.label}</div>
                  <div className="text-sm text-white/60">Complete your profile to unlock verified-only giveaways.</div>
                </div>
                <Button
                  variant="outline"
                  className="font-display border-white/15 text-white hover:bg-white/5"
                  onClick={() => document.getElementById(nextStep.targetId)?.scrollIntoView({ behavior: "smooth" })}
                >
                  Go
                </Button>
              </div>
            </Card>
          ) : null}

      {/* Kick */}
      <Card className="glass">
        <CardHeader>
          <CardTitle>Kick Username</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="kick">Kick Username</Label>
            <div className="flex gap-2">
              <Input
                id="kick"
                value={kickUsername}
                onChange={(e) => setKickUsername(e.target.value)}
                placeholder="e.g. get-some"
              />
              <Button
                onClick={() => updateKickMutation.mutate()}
                disabled={updateKickMutation.isPending}
                className="min-w-28"
              >
                {updateKickMutation.isPending ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving</span>
                ) : (
                  "Save"
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <VerificationBadge verified={Boolean(profile?.kickVerified)} />
            <p className="text-sm text-muted-foreground">
              Admin verification may be required before payouts.
            </p>
          </div>
        </CardContent>
      </Card>

      
	{/* Profile setup */}
	<Card id="profile-setup" className="glass border-white/10 bg-card/60">
  <CardHeader>
    <CardTitle className="flex items-center justify-between">
      <span>Profile Setup</span>
      <Badge variant={setupProgress === 100 ? "secondary" : "outline"}>
        {setupProgress === 100 ? "Complete" : `${setupProgress}%`}
      </Badge>
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <Progress value={setupProgress} />
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium flex items-center gap-2">
            {hasCasinoLink ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
	            1. Link at least one casino username
          </div>
	          <div className="text-sm text-muted-foreground">Required for casino-specific giveaways, entries, and checks.</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => document.getElementById("casino-accounts")?.scrollIntoView({ behavior: "smooth" })}>
          Manage
        </Button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium flex items-center gap-2">
            {hasWalletProof ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
	            2. Add a wallet proof screenshot
          </div>
	          <div className="text-sm text-muted-foreground">Used for payouts and manual verification.</div>
        </div>
        <Button variant="outline" size="sm" onClick={() => document.getElementById("wallet-proofs")?.scrollIntoView({ behavior: "smooth" })}>
          Manage
        </Button>
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium flex items-center gap-2">
            {isVerified ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Clock className="h-4 w-4 text-muted-foreground" />}
	            3. Get verified
          </div>
          <div className="text-sm text-muted-foreground">
            {isVerified ? "You’re verified and eligible for verified-only giveaways." : "Waiting for admin verification once your info is submitted."}
          </div>
        </div>
	        <Badge variant={isVerified ? "secondary" : "outline"}>{isVerified ? "Verified" : "Pending verification"}</Badge>
      </div>
    </div>
  </CardContent>
</Card>

	{/* Casino accounts */}
	      <Card id="casino-accounts" className="glass">
        <CardHeader>
          <CardTitle>Casino Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
	          {casinosLoading ? (
	            <div className="grid gap-4">
	              <SkeletonCard />
	              <SkeletonCard />
	            </div>
	          ) : activeCasinos.length === 0 ? (
	            <EmptyState
                  withCard={false}
                  icon={Building2}
                  title="No casino partners yet"
                  description="Check back soon — partner casinos will appear here once added."
                />
	          ) : (
            <div className="grid gap-4">
              {activeCasinos.map((casino) => {
                const existing = casinoExisting[casino.id];
                const isEditing = casinoEditing[casino.id] || !existing;
                const inputs = casinoInputs[casino.id] || { username: "", odId: "" };

                return (
	                  <Card key={casino.id} className="border-white/10 bg-white/5">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          {casino.logo ? (
                            <img src={casino.logo} alt={casino.name} className="h-10 w-10 rounded-full object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                              {casino.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{casino.name}</div>
                            <div className="text-xs text-muted-foreground">Link your username + OD ID for leaderboards / giveaways.</div>
                          </div>
                        </div>

	                        <div className="flex items-center gap-2">
	                          {existing ? statusBadge(Boolean(existing.verified)) : <Badge variant="outline">Not linked</Badge>}
                          {existing && !isEditing && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCasinoEditing((p) => ({ ...p, [casino.id]: true }))}
                              className="gap-1"
                            >
                              <Pencil className="h-4 w-4" /> Edit
                            </Button>
                          )}
                          {existing && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteCasinoAccountMutation.mutate(casino.id)}
                              disabled={deleteCasinoAccountMutation.isPending}
                              className="gap-1"
                            >
                              <Trash2 className="h-4 w-4" /> Remove
                            </Button>
                          )}
                        </div>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Casino Username</Label>
                          <Input
                            value={inputs.username}
                            onChange={(e) => setCasinoInputs((p) => ({ ...p, [casino.id]: { ...inputs, username: e.target.value } }))}
                            placeholder="Your casino username"
                            disabled={!isEditing}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>OD / User ID</Label>
                          <Input
                            value={inputs.odId}
                            onChange={(e) => setCasinoInputs((p) => ({ ...p, [casino.id]: { ...inputs, odId: e.target.value } }))}
                            placeholder="The ID shown on the casino"
                            disabled={!isEditing}
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2">
                        {existing && isEditing && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setCasinoInputs((p) => ({
                                ...p,
                                [casino.id]: { username: existing.username ?? "", odId: existing.odId ?? "" },
                              }));
                              setCasinoEditing((p) => ({ ...p, [casino.id]: false }));
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                        <Button
                          onClick={() => saveCasinoAccountMutation.mutate(casino.id)}
                          disabled={saveCasinoAccountMutation.isPending}
                          className="min-w-32"
                        >
                          {saveCasinoAccountMutation.isPending ? (
                            <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving</span>
                          ) : existing ? (
                            "Save changes"
                          ) : (
                            "Save"
                          )}
                        </Button>
                      </div>

	                      {existing && !existing.verified && (
                        <p className="text-xs text-muted-foreground">
	                          Changes reset verification. An admin will review and verify your details.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

	      {/* Wallets */}
	      <Card id="wallet-proofs" className="glass">
        <CardHeader>
          <CardTitle>SOL Wallet Proofs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
	          {casinosLoading ? (
	            <div className="grid gap-4">
	              <SkeletonCard />
	              <SkeletonCard />
	            </div>
	          ) : activeCasinos.length === 0 ? (
	            <EmptyState
                  withCard={false}
                  icon={Wallet}
                  title="No casino partners yet"
                  description="Wallet proof can be added once partner casinos are available."
                />
	          ) : (
            <div className="grid gap-4">
              {activeCasinos.map((casino) => {
                const existing = walletExisting[casino.id];
                const isEditing = walletEditing[casino.id] || !existing;
                const inputs = walletInputs[casino.id] || { solAddress: "", file: null };

                return (
	                  <Card key={casino.id} className="border-white/10 bg-white/5">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          {casino.logo ? (
                            <img src={casino.logo} alt={casino.name} className="h-10 w-10 rounded-full object-cover" />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                              {casino.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium">{casino.name}</div>
                            <div className="text-xs text-muted-foreground">Submit a SOL address + proof screenshot for payouts.</div>
                          </div>
                        </div>

	                        <div className="flex items-center gap-2">
	                          {existing ? statusBadge(Boolean(existing.verified)) : <Badge variant="outline">Not submitted</Badge>}
                          {existing && !isEditing && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setWalletEditing((p) => ({ ...p, [casino.id]: true }))}
                              className="gap-1"
                            >
                              <Pencil className="h-4 w-4" /> Edit
                            </Button>
                          )}
                          {existing && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteWalletMutation.mutate(casino.id)}
                              disabled={deleteWalletMutation.isPending}
                              className="gap-1"
                            >
                              <Trash2 className="h-4 w-4" /> Remove
                            </Button>
                          )}
                        </div>
                      </div>

                      <Separator />

                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label>SOL Wallet Address</Label>
                          <Input
                            value={inputs.solAddress}
                            onChange={(e) => setWalletInputs((p) => ({ ...p, [casino.id]: { ...inputs, solAddress: e.target.value } }))}
                            placeholder="Your SOL address"
                            disabled={!isEditing}
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label>Proof Screenshot</Label>
                          <div className="flex flex-col gap-2">
                            {(Boolean((existing as any)?.hasProof) || Boolean((existing as any)?.screenshotUrl)) ? (
                              <p className="text-sm text-muted-foreground">Proof uploaded (admin-only).</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">No proof uploaded yet.</p>
                            )}
<Input
                              type="file"
                              accept="image/*"
                              disabled={!isEditing}
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                setWalletInputs((p) => ({ ...p, [casino.id]: { ...inputs, file } }));
                              }}
                            />
                            {isEditing && (
                              <p className="text-xs text-muted-foreground">
                                {existing ? "Upload a new screenshot to replace the current proof." : "Upload a screenshot showing your SOL address."}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          {existing && isEditing && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setWalletInputs((p) => ({
                                  ...p,
                                  [casino.id]: { solAddress: existing.solAddress ?? "", file: null },
                                }));
                                setWalletEditing((p) => ({ ...p, [casino.id]: false }));
                              }}
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            onClick={() => saveWalletMutation.mutate(casino.id)}
                            disabled={saveWalletMutation.isPending || (!isEditing && Boolean(existing))}
                            className="min-w-32"
                          >
                            {saveWalletMutation.isPending ? (
                              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving</span>
                            ) : existing ? (
                              "Save changes"
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>

                        {existing && !existing.verified && (
                          <p className="text-xs text-muted-foreground">
                            Changes reset verification. An admin will review and verify your payout details.
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
        </div>
      </div>
      <Footer />
    </div>
  );
}
