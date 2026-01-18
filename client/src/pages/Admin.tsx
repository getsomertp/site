import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Settings, Plus, Trash2, Edit, Save, X, ExternalLink, Trophy, Gift, Lock, Users, Search, DollarSign, Wallet, Image, Tv, LogIn, LogOut, Download, ScrollText, BadgeCheck, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { useSeo } from "@/lib/seo";
import { StreamEvents } from "@/components/StreamEvents";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { downloadCsv } from "@/lib/csv";
import type { Casino, Giveaway, GiveawayRequirement, User, UserPayment, UserCasinoAccount, UserWallet } from "@shared/schema";

// IMPORTANT: Don't import the Drizzle schema module (shared/schema.ts) into the browser bundle.
// It pulls in server/database-only dependencies and can crash the Admin page at runtime.
// Keep any small shared constants we need for the UI here instead.
const CASINO_TIERS = ["platinum", "gold", "silver", "none"] as const;

type RequirementForm = {
  type: string;
  casinoId: number | null;
  value: string;
};

type LeaderboardForm = {
  id?: number;
  casinoId: number | null;
  name: string;
  description: string;
  periodType: string;
  durationDays: number;
  startsAt: string;
  endsAt: string;
  refreshIntervalSec: number;
  apiEndpoint: string;
  apiMethod: string;
  apiHeadersJson: string;
  apiBodyJson: string;
  apiMappingJson: string;
  isActive: boolean;
};

// Helper for admin API calls - uses session cookies
async function adminFetch(url: string, options: RequestInit = {}) {
  const headers = {
    ...options.headers,
    "Content-Type": "application/json",
  };
  const res = await fetch(url, { ...options, headers, credentials: "include" });
  if (!res.ok) {
    const payload: any = await res.json().catch(() => ({ error: "Request failed" }));
    // payload.error can be a string OR a Zod errors array
    if (Array.isArray(payload?.error) && payload.error.length) {
      const first = payload.error[0];
      const msg = first?.message || first?.code || "Validation failed";
      const path = Array.isArray(first?.path) && first.path.length ? first.path.join(".") : "";
      throw new Error(path ? `${path}: ${msg}` : msg);
    }
    throw new Error(payload?.error || payload?.message || "Request failed");
  }
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const preview = (await res.text()).slice(0, 120);
    throw new Error(`Non-JSON response from ${url} (${res.status}). This usually means the API route was not found and the app returned HTML instead. Preview: ${preview}`);
  }
  return res.json();
}

async function uploadCasinoLogo(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("logo", file);
  const res = await fetch("/api/admin/uploads/casino-logo", {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    // Try JSON first, fall back to raw text
    try {
      const j = JSON.parse(txt);
      throw new Error(j?.error || j?.message || "Upload failed");
    } catch {
      throw new Error(txt || "Upload failed");
    }
  }
  const data = await res.json();
  if (!data?.url) throw new Error("Upload failed: missing url");
  return data.url as string;
}

async function uploadSiteLogo(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("logo", file);
  const res = await fetch("/api/admin/uploads/site-logo", {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      throw new Error(j?.error || j?.message || "Upload failed");
    } catch {
      throw new Error(txt || "Upload failed");
    }
  }
  const data = await res.json();
  if (!data?.url) throw new Error("Upload failed: missing url");
  return data.url as string;
}

async function uploadSiteBackground(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("background", file);
  const res = await fetch("/api/admin/uploads/site-background", {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    try {
      const j = JSON.parse(txt);
      throw new Error(j?.error || j?.message || "Upload failed");
    } catch {
      throw new Error(txt || "Upload failed");
    }
  }
  const data = await res.json();
  if (!data?.url) throw new Error("Upload failed: missing url");
  return data.url as string;
}

type CasinoFormData = {
  name: string;
  slug: string;
  color: string;
  tier: string;
  affiliateCode: string;
  affiliateLink: string;
  bonus: string;
  rakeback: string;
  description: string;
  leaderboardApiUrl: string;
  leaderboardApiKey: string;
  logo: string;
  features: string;
  sortOrder: number;
  isActive: boolean;
};

const defaultCasinoForm: CasinoFormData = {
  name: "",
  slug: "",
  color: "#7c3aed",
  tier: "silver",
  affiliateCode: "",
  affiliateLink: "",
  bonus: "",
  rakeback: "",
  description: "",
  leaderboardApiUrl: "",
  leaderboardApiKey: "",
  logo: "",
  features: "",
  sortOrder: 0,
  isActive: true,
};

type GiveawayFormData = {
  title: string;
  description: string;
  prize: string;
  maxEntries: number | null;
  casinoId: number | null;
  requirements: RequirementForm[];
  endsAt: string;
  isActive: boolean;
};

const defaultGiveawayForm: GiveawayFormData = {
  title: "",
  description: "",
  prize: "",
  maxEntries: null,
  casinoId: null,
  requirements: [],
  endsAt: "",
  isActive: true,
};

type WinnerSummary = {
  id: string;
  discordUsername?: string | null;
  discordAvatar?: string | null;
  discordAvatarUrl?: string | null;
  kickUsername?: string | null;
  kickVerified?: boolean | null;
};

type GiveawayAdmin = Giveaway & {
  entries: number;
  requirements: GiveawayRequirement[];
  winner?: WinnerSummary | null;
};

type AdminAuditLog = {
  id: number;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt?: string | null;
};


type GiveawayEntryAdmin = {
  id: number;
  giveawayId: number;
  userId: string;
  createdAt: string | Date | null;
  user: WinnerSummary | null;
};


function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        credentials: "include",
      });
      
      if (res.ok) {
        onLogin();
      } else {
        const data = await res.json();
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="glass p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-purple to-neon-gold flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="font-display text-3xl font-bold text-white">Admin Access</h1>
            <p className="text-muted-foreground mt-2">Enter admin password to continue</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="bg-white/5"
                data-testid="input-admin-password"
              />
            </div>
            
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
            
            <Button
              type="submit"
              className="w-full font-display bg-gradient-to-r from-neon-purple to-neon-gold"
              disabled={loading}
              data-testid="button-admin-login"
            >
              <LogIn className="w-4 h-4 mr-2" />
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}

export default function Admin() {
  useSeo({
    title: "Admin",
    description: "Manage casinos, giveaways, users, and site settings.",
    path: "/admin",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adminInfo, setAdminInfo] = useState<any | null>(null);
  const isStaff = adminInfo?.isStaff === true;
  const isAdminLike = adminInfo?.isAdmin === true;
  const perms = adminInfo?.permissions || {};
  const [casinoDialogOpen, setCasinoDialogOpen] = useState(false);
  const [giveawayDialogOpen, setGiveawayDialogOpen] = useState(false);
  const [editingCasino, setEditingCasino] = useState<Casino | null>(null);
  const [editingGiveaway, setEditingGiveaway] = useState<Giveaway | null>(null);
  const [casinoForm, setCasinoForm] = useState<CasinoFormData>(defaultCasinoForm);
  const [giveawayForm, setGiveawayForm] = useState<GiveawayFormData>(defaultGiveawayForm);
  const [giveawayListMode, setGiveawayListMode] = useState<"all" | "active" | "ended">("all");
  const [entriesDialogOpen, setEntriesDialogOpen] = useState(false);
  const [selectedGiveawayForEntries, setSelectedGiveawayForEntries] = useState<GiveawayAdmin | null>(null);

  // Quick filters / search (pro pass)
  const [casinoSearch, setCasinoSearch] = useState("");
  const [casinoStatusFilter, setCasinoStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [casinoApiFilter, setCasinoApiFilter] = useState<"all" | "configured" | "not_configured">("all");
  const [giveawaySearch, setGiveawaySearch] = useState("");
  const [giveawayWinnerFilter, setGiveawayWinnerFilter] = useState<"all" | "with_winner" | "no_winner">("all");

const [auditSearch, setAuditSearch] = useState("");

  // Site settings
  const [siteKickUrl, setSiteKickUrl] = useState("https://kick.com/get-some");
  const [siteDiscordUrl, setSiteDiscordUrl] = useState("https://discord.gg/");
  const [siteBrandName, setSiteBrandName] = useState("GETSOME");
  const [siteBrandLogoUrl, setSiteBrandLogoUrl] = useState("");
  const [uploadingSiteLogo, setUploadingSiteLogo] = useState(false);

  // Theme
  const [themeBgUrl, setThemeBgUrl] = useState("");
  const [themeOverlay, setThemeOverlay] = useState(0.78);
  const [themeAccent, setThemeAccent] = useState("#b026ff");
  const [uploadingThemeBg, setUploadingThemeBg] = useState(false);

  // Leaderboards
  const [leaderboardDialogOpen, setLeaderboardDialogOpen] = useState(false);
  const [editingLeaderboard, setEditingLeaderboard] = useState<any | null>(null);
  const [leaderboardForm, setLeaderboardForm] = useState<LeaderboardForm>({
    casinoId: null,
    name: "",
    description: "",
    periodType: "monthly",
    durationDays: 30,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    refreshIntervalSec: 300,
    apiEndpoint: "",
    apiMethod: "GET",
    apiHeadersJson: "{}",
    apiBodyJson: "{}",
    apiMappingJson: JSON.stringify({ itemsPath: "data.items", rankField: "rank", usernameField: "username", valueField: "value" }, null, 2),
    isActive: true,
  });
  
  useEffect(() => {
    fetch("/api/admin/me", { credentials: "include" })
      .then(res => res.json())
      .then(data => setAdminInfo(data))
      .catch(() => setAdminInfo({ isStaff: false, isAdmin: false, role: null, permissions: {} }));
  }, []);

  // Fetch all casinos including inactive (admin endpoint)
  const { data: casinos = [], isLoading: loadingCasinos } = useQuery<Casino[]>({
    queryKey: ["/api/admin/casinos"],
    queryFn: () => adminFetch("/api/admin/casinos"),
    enabled: isAdminLike === true,
  });

  // Site settings
  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/admin/site/settings"],
    queryFn: () => adminFetch("/api/admin/site/settings"),
    enabled: isAdminLike === true,
  });

// Admin audit log
const { data: auditLogs = [], isLoading: loadingAuditLogs } = useQuery<AdminAuditLog[]>({
  queryKey: ["/api/admin/audit", auditSearch],
  queryFn: () => adminFetch(`/api/admin/audit?q=${encodeURIComponent(auditSearch)}`),
  enabled: isAdminLike === true,
});


  useEffect(() => {
    if (siteSettings?.kickUrl) setSiteKickUrl(siteSettings.kickUrl);
    if (siteSettings?.discordUrl) setSiteDiscordUrl(siteSettings.discordUrl);
    if (siteSettings?.brandName) setSiteBrandName(siteSettings.brandName);
    if (siteSettings?.brandLogoUrl) setSiteBrandLogoUrl(siteSettings.brandLogoUrl);

    if (siteSettings?.themeBackgroundUrl !== undefined) {
      setThemeBgUrl(siteSettings.themeBackgroundUrl || "");
    }
    if (siteSettings?.themeOverlay !== undefined) {
      const n = Number(String(siteSettings.themeOverlay || "").trim());
      if (Number.isFinite(n)) {
        const v = n > 1.2 ? n / 100 : n; // allow 78 (percent) or 0.78
        setThemeOverlay(Math.max(0.4, Math.min(0.9, v)));
      }
    }
    if (siteSettings?.themeAccent) setThemeAccent(siteSettings.themeAccent);
  }, [siteSettings]);

  // Leaderboards
  const { data: leaderboards = [], isLoading: loadingLeaderboards } = useQuery<any[]>({
    queryKey: ["/api/admin/leaderboards"],
    queryFn: () => adminFetch("/api/admin/leaderboards"),
    enabled: isAdminLike === true,
  });

  // Fetch giveaways  
  const { data: giveaways = [], isLoading: loadingGiveaways } = useQuery<GiveawayAdmin[]>({
    queryKey: ["/api/admin/giveaways"],
    queryFn: () => adminFetch("/api/admin/giveaways"),
    enabled: isStaff === true,
  });

  const { data: giveawayEntries = [], isLoading: loadingGiveawayEntries } = useQuery<GiveawayEntryAdmin[]>({
    queryKey: [selectedGiveawayForEntries ? `/api/admin/giveaways/${selectedGiveawayForEntries.id}/entries` : "/api/admin/giveaways/0/entries"],
    queryFn: () => adminFetch(`/api/admin/giveaways/${selectedGiveawayForEntries!.id}/entries`),
    enabled: isStaff === true && entriesDialogOpen && !!selectedGiveawayForEntries?.id,
  });


  // Casino mutations
  const createCasino = useMutation({
    mutationFn: async (data: CasinoFormData) => {
      const name = (data.name || "").trim();
      if (!name) throw new Error("Casino name is required");
      const rawSlug = (data.slug || "").trim();
      if (!rawSlug) throw new Error("Slug is required");
      const slug = rawSlug
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "");
      if (!slug) throw new Error("Slug must contain letters or numbers");

      const features = data.features.split(",").map(f => f.trim()).filter(Boolean);
      return adminFetch("/api/admin/casinos", {
        method: "POST",
        body: JSON.stringify({ ...data, name, slug, features }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/casinos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/casinos"] });
      setCasinoDialogOpen(false);
      setCasinoForm(defaultCasinoForm);
      toast({ title: "Casino created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create casino", description: err?.message || "Request failed", variant: "destructive" });
    },
  });

  const updateCasino = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CasinoFormData> }) => {
      const features = data.features?.split(",").map(f => f.trim()).filter(Boolean);
      const payload: any = { ...data, ...(features ? { features } : {}) };
      if (typeof data.name === "string") payload.name = data.name.trim();
      if (typeof data.slug === "string") {
        const slug = data.slug
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]+/g, "-")
          .replace(/^-+|-+$/g, "");
        payload.slug = slug;
      }
      return adminFetch(`/api/admin/casinos/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/casinos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/casinos"] });
      setCasinoDialogOpen(false);
      setEditingCasino(null);
      setCasinoForm(defaultCasinoForm);
      toast({ title: "Casino updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update casino", description: err?.message || "Request failed", variant: "destructive" });
    },
  });

  const deleteCasino = useMutation({
    mutationFn: async (id: number) => {
      return adminFetch(`/api/admin/casinos/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/casinos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/casinos"] });
      toast({ title: "Casino deleted successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete casino", description: err?.message || "Request failed", variant: "destructive" });
    },
  });

  // Site settings mutation
  const saveSiteSettings = useMutation({
    mutationFn: async () => {
      await adminFetch("/api/admin/site/settings", {
        method: "POST",
        body: JSON.stringify({ key: "brandName", value: (siteBrandName || "GETSOME").trim() || "GETSOME" }),
      });
      await adminFetch("/api/admin/site/settings", {
        method: "POST",
        body: JSON.stringify({ key: "brandLogoUrl", value: siteBrandLogoUrl || "" }),
      });
      await adminFetch("/api/admin/site/settings", {
        method: "POST",
        body: JSON.stringify({ key: "kickUrl", value: siteKickUrl }),
      });
      await adminFetch("/api/admin/site/settings", {
        method: "POST",
        body: JSON.stringify({ key: "discordUrl", value: siteDiscordUrl }),
      });

      await adminFetch("/api/admin/site/settings", {
        method: "POST",
        body: JSON.stringify({ key: "themeBackgroundUrl", value: themeBgUrl || "" }),
      });
      await adminFetch("/api/admin/site/settings", {
        method: "POST",
        body: JSON.stringify({ key: "themeOverlay", value: String(Math.round(themeOverlay * 100) / 100) }),
      });
      await adminFetch("/api/admin/site/settings", {
        method: "POST",
        body: JSON.stringify({ key: "themeAccent", value: themeAccent || "" }),
      });
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/site/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/site/settings"] });
      toast({ title: "Site settings saved" });
    },
    onError: (err: any) => toast({ title: "Failed to save site settings", description: err?.message || "Request failed", variant: "destructive" }),
  });

  // Leaderboard mutations
  const createLeaderboard = useMutation({
    mutationFn: async (data: LeaderboardForm) => {
      return adminFetch("/api/admin/leaderboards", {
        method: "POST",
        body: JSON.stringify({
          casinoId: data.casinoId,
          name: data.name,
                    periodType: data.periodType,
          durationDays: data.durationDays,
          startAt: new Date(data.startsAt),
          endAt: new Date(data.endsAt),
          refreshIntervalSec: data.refreshIntervalSec,
          apiEndpoint: data.apiUrl,
          apiMethod: data.apiMethod,
          apiHeadersJson: data.apiHeadersJson,
          apiBodyJson: data.apiBodyJson,
          apiMappingJson: data.mappingJson,
          isActive: data.isActive,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leaderboards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboards/active"] });
      setLeaderboardDialogOpen(false);
      setEditingLeaderboard(null);
      toast({ title: "Leaderboard saved" });
    },
    onError: (err: any) => toast({ title: "Failed to save leaderboard", description: err?.message || "Request failed", variant: "destructive" }),
  });

const updateLeaderboard = useMutation({
  mutationFn: async ({ id, data }: { id: number; data: Partial<LeaderboardForm> }) => {
    return adminFetch(`/api/admin/leaderboards/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(data.casinoId !== undefined ? { casinoId: data.casinoId } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.periodType !== undefined ? { periodType: data.periodType } : {}),
        ...(data.durationDays !== undefined ? { durationDays: data.durationDays } : {}),
        ...(data.refreshIntervalSec !== undefined ? { refreshIntervalSec: data.refreshIntervalSec } : {}),
        ...(data.startsAt !== undefined ? { startAt: new Date(data.startsAt) } : {}),
        ...(data.endsAt !== undefined ? { endAt: new Date(data.endsAt) } : {}),
        ...(data.apiUrl !== undefined ? { apiEndpoint: data.apiUrl } : {}),
        ...(data.apiMethod !== undefined ? { apiMethod: data.apiMethod } : {}),
        ...(data.apiHeadersJson !== undefined ? { apiHeadersJson: data.apiHeadersJson } : {}),
        ...(data.apiBodyJson !== undefined ? { apiBodyJson: data.apiBodyJson } : {}),
        ...(data.mappingJson !== undefined ? { apiMappingJson: data.mappingJson } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      }),
    });
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/leaderboards"] });
    queryClient.invalidateQueries({ queryKey: ["/api/leaderboards/active"] });
    setLeaderboardDialogOpen(false);
    setEditingLeaderboard(null);
    toast({ title: "Leaderboard updated" });
  },
  onError: (err: any) => toast({ title: "Failed to update leaderboard", description: err?.message || "Request failed", variant: "destructive" }),
});

const deleteLeaderboard = useMutation({
    mutationFn: async (id: number) => {
      return adminFetch(`/api/admin/leaderboards/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leaderboards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/leaderboards/active"] });
      toast({ title: "Leaderboard deleted" });
    },
    onError: (err: any) => toast({ title: "Failed to delete leaderboard", description: err?.message || "Request failed", variant: "destructive" }),
  });

  // Giveaway mutations
  const createGiveaway = useMutation({
    mutationFn: async (data: GiveawayFormData) => {
      // Client-side validation (prevents confusing "title: Required" / "endsAt" errors)
      if (!data.title?.trim()) throw new Error("Title is required");
      if (!data.prize?.trim()) throw new Error("Prize is required");
      if (!data.endsAt?.trim()) throw new Error("Ends At is required");

      const cleanRequirements = (data.requirements || [])
        .filter((r) => r && r.type && r.type !== "none")
        .map((r) => ({
          type: r.type,
          casinoId: r.casinoId ?? null,
          value: r.value ? String(r.value) : null,
        }));

      return adminFetch("/api/admin/giveaways", {
        method: "POST",
        body: JSON.stringify({
          title: data.title,
          description: data.description || null,
          prize: data.prize,
          maxEntries: data.maxEntries ?? null,
          casinoId: data.casinoId ?? null,
          endsAt: new Date(data.endsAt),
          isActive: data.isActive,
          requirements: cleanRequirements,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/giveaways"] });
      setGiveawayDialogOpen(false);
      setGiveawayForm(defaultGiveawayForm);
      toast({ title: "Giveaway created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create giveaway", description: err?.message || "Request failed", variant: "destructive" });
    },
  });

  const updateGiveaway = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<GiveawayFormData> }) => {
      const { requirements, ...rest } = data;
      return adminFetch(`/api/admin/giveaways/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ 
          ...rest, 
          endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
          requirements: requirements?.filter(r => r.type !== "none"),
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/giveaways"] });
      setGiveawayDialogOpen(false);
      setEditingGiveaway(null);
      setGiveawayForm(defaultGiveawayForm);
      toast({ title: "Giveaway updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update giveaway", description: err?.message || "Request failed", variant: "destructive" });
    },
  });

  const deleteGiveaway = useMutation({
    mutationFn: async (id: number) => {
      return adminFetch(`/api/admin/giveaways/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/giveaways"] });
      toast({ title: "Giveaway deleted successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete giveaway", description: err?.message || "Request failed", variant: "destructive" });
    },
  });

  const pickGiveawayWinner = useMutation({
    mutationFn: async (giveawayId: number) => {
      return adminFetch(`/api/admin/giveaways/${giveawayId}/pick-winner`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/giveaways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways"] });
      queryClient.invalidateQueries({ queryKey: ["/api/giveaways/active"] });
      if (selectedGiveawayForEntries?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/admin/giveaways/${selectedGiveawayForEntries.id}/entries`] });
      }
      toast({ title: "Winner selected" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to pick winner", description: err?.message || "Request failed", variant: "destructive" });
    },
  });

  
  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setAdminInfo({ isStaff: false, isAdmin: false, role: null, permissions: {} });
  };
  
  if (adminInfo === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }
  
  if (!isStaff) {
    return <AdminLogin onLogin={async () => {
      try {
        const data = await fetch("/api/admin/me", { credentials: "include" }).then(r => r.json());
        setAdminInfo(data);
      } catch {
        setAdminInfo({ isStaff: false, isAdmin: false, role: null, permissions: {} });
      }
    }} />;
  }

  const openEditCasino = (casino: Casino) => {
    setEditingCasino(casino);
    setCasinoForm({
      name: casino.name,
      slug: casino.slug,
      color: casino.color,
      tier: casino.tier,
      affiliateCode: casino.affiliateCode,
      affiliateLink: casino.affiliateLink,
      bonus: casino.bonus || "",
      rakeback: casino.rakeback || "",
      description: casino.description || "",
      leaderboardApiUrl: casino.leaderboardApiUrl || "",
      leaderboardApiKey: casino.leaderboardApiKey || "",
      logo: casino.logo || "",
      features: casino.features?.join(", ") || "",
      sortOrder: casino.sortOrder,
      isActive: casino.isActive,
    });
    setCasinoDialogOpen(true);
  };

  const openEditGiveaway = (giveaway: Giveaway & { requirements?: GiveawayRequirement[] }) => {
    setEditingGiveaway(giveaway);
    setGiveawayForm({
      title: giveaway.title,
      description: giveaway.description || "",
      prize: giveaway.prize,
      maxEntries: giveaway.maxEntries,
      casinoId: giveaway.casinoId,
      requirements: (giveaway.requirements || []).map(r => ({
        type: r.type,
        casinoId: r.casinoId,
        value: r.value || "",
      })),
      endsAt: new Date(giveaway.endsAt).toISOString().slice(0, 16),
      isActive: giveaway.isActive,
    });
    setGiveawayDialogOpen(true);
  };

  const adminGiveawaysFiltered = (() => {
    const now = new Date();
    return (giveaways || []).filter((g: any) => {
      const active = Boolean(g?.isActive) && new Date(g.endsAt) > now;
      if (giveawayListMode === "active") return active;
      if (giveawayListMode === "ended") return !active;
      return true;
    });
  })();

  const adminCasinosFiltered = (() => {
    const q = casinoSearch.trim().toLowerCase();
    return (casinos || []).filter((c) => {
      if (casinoStatusFilter === "active" && !c.isActive) return false;
      if (casinoStatusFilter === "inactive" && c.isActive) return false;
      const apiConfigured = Boolean((c as any).leaderboardApiUrl);
      if (casinoApiFilter === "configured" && !apiConfigured) return false;
      if (casinoApiFilter === "not_configured" && apiConfigured) return false;
      if (!q) return true;
      return (
        (c.name || "").toLowerCase().includes(q) ||
        (c.slug || "").toLowerCase().includes(q) ||
        (c.affiliateCode || "").toLowerCase().includes(q)
      );
    });
  })();

  const adminGiveawaysSearchFiltered = (() => {
    const q = giveawaySearch.trim().toLowerCase();
    return (adminGiveawaysFiltered || []).filter((g: any) => {
      if (giveawayWinnerFilter === "with_winner" && !g.winnerId) return false;
      if (giveawayWinnerFilter === "no_winner" && g.winnerId) return false;
      if (!q) return true;
      return (
        String(g.title || "").toLowerCase().includes(q) ||
        String(g.prize || "").toLowerCase().includes(q)
      );
    });
  })();

  return (
    <div className="min-h-screen">
      <Navigation />
      
      <div className="pt-24 sm:pt-28 pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center justify-center gap-4 mb-4">
              <Settings className="w-12 h-12 text-neon-gold" />
              <h1 className="font-display text-5xl sm:text-6xl font-bold text-white">
                Admin Dashboard
              </h1>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="ml-4"
                data-testid="button-admin-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
            <p className="text-muted-foreground text-lg">
              Manage casinos, affiliate links, leaderboard APIs, and giveaways
            </p>
          </motion.div>

          <Tabs defaultValue={isAdminLike ? "casinos" : "giveaways"} className="w-full">
            <TabsList className="grid w-full grid-cols-4 md:grid-cols-8 mb-8 bg-card/50">
              {isAdminLike && (
              <TabsTrigger value="casinos" className="font-display" data-testid="admin-tab-casinos">
                <Trophy className="w-4 h-4 mr-2" /> Casinos
              </TabsTrigger>
              )}
              <TabsTrigger value="giveaways" className="font-display" data-testid="admin-tab-giveaways">
                <Gift className="w-4 h-4 mr-2" /> Giveaways
              </TabsTrigger>
              <TabsTrigger value="players" className="font-display" data-testid="admin-tab-players">
                <Users className="w-4 h-4 mr-2" /> Players
              </TabsTrigger>
              <TabsTrigger value="verifications" className="font-display" data-testid="admin-tab-verifications">
                <BadgeCheck className="w-4 h-4 mr-2" /> Verifications
              </TabsTrigger>
              {isAdminLike && (
              <TabsTrigger value="stream-events" className="font-display" data-testid="admin-tab-stream-events">
                <Tv className="w-4 h-4 mr-2" /> Stream Events
              </TabsTrigger>
              )}
              {isAdminLike && (
              <TabsTrigger value="leaderboards" className="font-display" data-testid="admin-tab-leaderboards">
                <Trophy className="w-4 h-4 mr-2" /> Leaderboards
              </TabsTrigger>
              )}
              {isAdminLike && (
              <TabsTrigger value="site" className="font-display" data-testid="admin-tab-site">
                <Settings className="w-4 h-4 mr-2" /> Site
              </TabsTrigger>
              )}
              {isAdminLike && (
                <TabsTrigger value="audit" className="font-display" data-testid="admin-tab-audit">
                  <ScrollText className="w-4 h-4 mr-2" /> Audit
                </TabsTrigger>
              )}
</TabsList>

            <TabsContent value="casinos">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-display text-2xl font-bold text-white">Manage Casinos</h2>
                <Dialog open={casinoDialogOpen} onOpenChange={(open) => {
                  setCasinoDialogOpen(open);
                  if (!open) {
                    setEditingCasino(null);
                    setCasinoForm(defaultCasinoForm);
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button className="font-display bg-neon-purple hover:bg-neon-purple/80" data-testid="button-add-casino">
                      <Plus className="w-4 h-4 mr-2" /> Add Casino
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="font-display text-2xl">
                        {editingCasino ? "Edit Casino" : "Add New Casino"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                      <div>
                        <Label>Casino Name</Label>
                        <Input 
                          value={casinoForm.name}
                          onChange={(e) => setCasinoForm({ ...casinoForm, name: e.target.value })}
                          placeholder="Stake"
                          className="bg-white/5"
                          data-testid="input-casino-name"
                        />
                      </div>
                      <div>
                        <Label>Slug (URL-friendly)</Label>
                        <Input 
                          value={casinoForm.slug}
                          onChange={(e) => setCasinoForm({ ...casinoForm, slug: e.target.value })}
                          placeholder="stake"
                          className="bg-white/5"
                          data-testid="input-casino-slug"
                        />
                      
</div>
                      <div>
                        <Label>Casino Logo</Label>
                        <div className="flex items-center gap-3">
                          {casinoForm.logo ? (
                            <img loading="lazy" decoding="async" src={casinoForm.logo} alt="Casino logo" className="w-12 h-12 rounded-xl object-cover border border-white/10" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white font-semibold">
                              {(casinoForm.name || "").slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 space-y-2">
                            <Input
                              value={casinoForm.logo}
                              onChange={(e) => setCasinoForm({ ...casinoForm, logo: e.target.value })}
                              placeholder="https://.../logo.png (optional)"
                              className="bg-white/5"
                              data-testid="input-casino-logo"
                            />
                            <Input
                              type="file"
                              accept="image/*"
                              className="bg-white/5"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const url = await uploadCasinoLogo(file);
                                  setCasinoForm({ ...casinoForm, logo: url });
                                } catch (err: any) {
                                  toast({ title: "Logo upload failed", description: err?.message || String(err), variant: "destructive" });
                                } finally {
                                  e.currentTarget.value = "";
                                }
                              }}
                            />
                            <div className="text-xs text-muted-foreground">Uploads to S3/R2 when configured. Falls back to local uploads if not.</div>
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label>Affiliate Code</Label>

                        <Input 
                          value={casinoForm.affiliateCode}
                          onChange={(e) => setCasinoForm({ ...casinoForm, affiliateCode: e.target.value })}
                          placeholder="GETSOME"
                          className="bg-white/5"
                          data-testid="input-affiliate-code"
                        />
                      </div>
                      <div>
                        <Label>Affiliate Link</Label>
                        <Input 
                          value={casinoForm.affiliateLink}
                          onChange={(e) => setCasinoForm({ ...casinoForm, affiliateLink: e.target.value })}
                          placeholder="https://stake.com/?c=GETSOME"
                          className="bg-white/5"
                          data-testid="input-affiliate-link"
                        />
                      </div>
                      <div>
                        <Label>Bonus Description</Label>
                        <Input 
                          value={casinoForm.bonus}
                          onChange={(e) => setCasinoForm({ ...casinoForm, bonus: e.target.value })}
                          placeholder="200% Deposit Bonus"
                          className="bg-white/5"
                          data-testid="input-bonus"
                        />
                      </div>
                      <div>
                        <Label>Rakeback %</Label>
                        <Input 
                          value={casinoForm.rakeback}
                          onChange={(e) => setCasinoForm({ ...casinoForm, rakeback: e.target.value })}
                          placeholder="10%"
                          className="bg-white/5"
                          data-testid="input-rakeback"
                        />
                      </div>
                      <div>
                        <Label>Tier</Label>
                        <Select value={casinoForm.tier} onValueChange={(v) => setCasinoForm({ ...casinoForm, tier: v })}>
                          <SelectTrigger className="bg-white/5" data-testid="select-tier">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="platinum">Platinum</SelectItem>
                            <SelectItem value="gold">Gold</SelectItem>
                            <SelectItem value="silver">Silver</SelectItem>
                            <SelectItem value="none">None (No Tier)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Brand Color</Label>
                        <div className="flex gap-2">
                          <Input 
                            type="color"
                            value={casinoForm.color}
                            onChange={(e) => setCasinoForm({ ...casinoForm, color: e.target.value })}
                            className="w-12 h-10 p-1"
                          />
                          <Input 
                            value={casinoForm.color}
                            onChange={(e) => setCasinoForm({ ...casinoForm, color: e.target.value })}
                            className="bg-white/5 flex-1"
                            data-testid="input-color"
                          />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <Label>Features (comma-separated)</Label>
                        <Input 
                          value={casinoForm.features}
                          onChange={(e) => setCasinoForm({ ...casinoForm, features: e.target.value })}
                          placeholder="Instant Withdrawals, VIP Program, 24/7 Support"
                          className="bg-white/5"
                          data-testid="input-features"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Description</Label>
                        <Textarea 
                          value={casinoForm.description}
                          onChange={(e) => setCasinoForm({ ...casinoForm, description: e.target.value })}
                          placeholder="Casino description..."
                          className="bg-white/5"
                          data-testid="input-description"
                        />
                      </div>
                      <div className="col-span-2 border-t border-white/10 pt-4 mt-2">
                        <h3 className="font-display font-bold text-white mb-4">Leaderboard API Configuration</h3>
                      </div>
                      <div className="col-span-2">
                        <Label>Leaderboard API URL</Label>
                        <Input 
                          value={casinoForm.leaderboardApiUrl}
                          onChange={(e) => setCasinoForm({ ...casinoForm, leaderboardApiUrl: e.target.value })}
                          placeholder="https://api.stake.com/leaderboard"
                          className="bg-white/5"
                          data-testid="input-leaderboard-url"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Leaderboard API Key</Label>
                        <Input 
                          type="password"
                          value={casinoForm.leaderboardApiKey}
                          onChange={(e) => setCasinoForm({ ...casinoForm, leaderboardApiKey: e.target.value })}
                          placeholder="Your API key"
                          className="bg-white/5"
                          data-testid="input-leaderboard-key"
                        />
                      </div>
                      <div>
                        <Label>Sort Order</Label>
                        <Input 
                          type="number"
                          value={casinoForm.sortOrder}
                          onChange={(e) => setCasinoForm({ ...casinoForm, sortOrder: parseInt(e.target.value) || 0 })}
                          className="bg-white/5"
                          data-testid="input-sort-order"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button 
                          className="w-full font-display bg-gradient-to-r from-neon-purple to-neon-gold"
                          onClick={() => {
                            if (editingCasino) {
                              updateCasino.mutate({ id: editingCasino.id, data: casinoForm });
                            } else {
                              createCasino.mutate(casinoForm);
                            }
                          }}
                          disabled={createCasino.isPending || updateCasino.isPending}
                          data-testid="button-save-casino"
                        >
                          <Save className="w-4 h-4 mr-2" />
                          {editingCasino ? "Update Casino" : "Create Casino"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={casinoSearch}
                    onChange={(e) => setCasinoSearch(e.target.value)}
                    placeholder="Search casinos (name, slug, code)"
                    className="pl-10 bg-white/5"
                    data-testid="input-casino-search"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={casinoStatusFilter} onValueChange={(v: any) => setCasinoStatusFilter(v)}>
                    <SelectTrigger className="bg-white/5 w-[150px]" data-testid="select-casino-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={casinoApiFilter} onValueChange={(v: any) => setCasinoApiFilter(v)}>
                    <SelectTrigger className="bg-white/5 w-[180px]" data-testid="select-casino-api">
                      <SelectValue placeholder="API" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All APIs</SelectItem>
                      <SelectItem value="configured">API configured</SelectItem>
                      <SelectItem value="not_configured">No API</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loadingCasinos ? (
                <div className="text-center py-12 text-muted-foreground">Loading casinos...</div>
              ) : (casinos || []).length === 0 ? (
                <Card className="glass p-12 text-center">
                  <Trophy className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-display text-xl text-white mb-2">No Casinos Yet</h3>
                  <p className="text-muted-foreground mb-6">Add your first casino partner to get started</p>
                  <Button onClick={() => setCasinoDialogOpen(true)} className="font-display bg-neon-purple">
                    <Plus className="w-4 h-4 mr-2" /> Add Casino
                  </Button>
                </Card>
              ) : adminCasinosFiltered.length === 0 ? (
                <Card className="glass p-12 text-center">
                  <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-display text-xl text-white mb-2">No casinos found</h3>
                  <p className="text-muted-foreground">Try clearing your filters or searching a different term.</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {adminCasinosFiltered.map((casino) => (
                    <Card key={casino.id} className="glass p-6" data-testid={`admin-casino-${casino.id}`}>
                      <div className="flex items-center gap-4">
                        {casino.logo ? (
                          <img loading="lazy" decoding="async"
                            src={casino.logo}
                            alt={`${casino.name} logo`}
                            className="w-14 h-14 rounded-xl object-cover border border-white/10 bg-white/5"
                          />
                        ) : (
                          <div
                            className="w-14 h-14 rounded-xl flex items-center justify-center font-display font-bold text-white"
                            style={{ backgroundColor: casino.color }}
                          >
                            {casino.name.slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-display font-bold text-white text-lg">{casino.name}</h3>
                            <Badge className={
                              casino.tier === "platinum" ? "bg-neon-gold/20 text-neon-gold" :
                              casino.tier === "gold" ? "bg-neon-purple/20 text-neon-purple" :
                              "bg-muted text-muted-foreground"
                            }>
                              {casino.tier}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                            <span>Code: <span className="text-neon-cyan font-mono">{casino.affiliateCode}</span></span>
                            <span>Bonus: {casino.bonus || "—"}</span>
                            <span>Rakeback: {casino.rakeback || "—"}</span>
                            {casino.leaderboardApiUrl && (
                              <Badge variant="outline" className="text-green-400 border-green-400/50">
                                API Configured
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openEditCasino(casino)}
                            data-testid={`button-edit-casino-${casino.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => {
                              if (confirm(`Delete ${casino.name}?`)) {
                                deleteCasino.mutate(casino.id);
                              }
                            }}
                            data-testid={`button-delete-casino-${casino.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="giveaways">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-display text-2xl font-bold text-white">Manage Giveaways</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="font-display"
                    onClick={() => {
                      const rows = giveaways
                        .filter((g) => !!g.winnerId)
                        .map((g) => ({
                          giveawayId: g.id,
                          title: g.title,
                          prize: g.prize,
                          casinoId: g.casinoId,
                          endsAt: g.endsAt,
                          winnerId: g.winnerId,
                          winnerPickedAt: (g as any).winnerPickedAt || "",
                          winnerPickedBy: (g as any).winnerPickedBy || "",
                          winnerSeed: (g as any).winnerSeed || "",
                        }));
                      downloadCsv(`giveaway_winners_${new Date().toISOString().slice(0, 10)}.csv`, rows);
                    }}
                    data-testid="button-export-winners"
                  >
                    Export Winners CSV
                  </Button>

                  {isAdminLike && (
                    <Dialog open={giveawayDialogOpen} onOpenChange={(open) => {
                  setGiveawayDialogOpen(open);
                  if (!open) {
                    setEditingGiveaway(null);
                    setGiveawayForm(defaultGiveawayForm);
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button className="font-display bg-neon-cyan hover:bg-neon-cyan/80 text-black" data-testid="button-add-giveaway">
                      <Plus className="w-4 h-4 mr-2" /> Add Giveaway
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="glass border-white/10 max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="font-display text-2xl">
                        {editingGiveaway ? "Edit Giveaway" : "Add New Giveaway"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <Label>Title</Label>
                        <Input 
                          value={giveawayForm.title}
                          onChange={(e) => setGiveawayForm({ ...giveawayForm, title: e.target.value })}
                          placeholder="Weekly Cash Drop"
                          className="bg-white/5"
                          data-testid="input-giveaway-title"
                        />
                      </div>
                      <div>
                        <Label>Prize</Label>
                        <Input 
                          value={giveawayForm.prize}
                          onChange={(e) => setGiveawayForm({ ...giveawayForm, prize: e.target.value })}
                          placeholder="$10,000"
                          className="bg-white/5"
                          data-testid="input-giveaway-prize"
                        />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Textarea 
                          value={giveawayForm.description}
                          onChange={(e) => setGiveawayForm({ ...giveawayForm, description: e.target.value })}
                          placeholder="Giveaway details..."
                          className="bg-white/5"
                          data-testid="input-giveaway-description"
                        />
                      </div>
                      <div>
                        <Label>Casino (optional - leave empty for general giveaway)</Label>
                        <Select 
                          value={giveawayForm.casinoId?.toString() || "none"} 
                          onValueChange={(v) => setGiveawayForm({ ...giveawayForm, casinoId: v === "none" ? null : parseInt(v) })}
                        >
                          <SelectTrigger className="bg-white/5" data-testid="select-giveaway-casino">
                            <SelectValue placeholder="Select casino..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No specific casino</SelectItem>
                            {casinos.map(casino => (
                              <SelectItem key={casino.id} value={casino.id.toString()}>{casino.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="border-t border-white/10 pt-4">
                        <div className="flex justify-between items-center mb-2">
                          <Label>Requirements</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setGiveawayForm({
                              ...giveawayForm,
                              requirements: [...(giveawayForm.requirements || []), { type: "discord", casinoId: null, value: "" }]
                            })}
                            data-testid="button-add-requirement"
                          >
                            <Plus className="w-3 h-3 mr-1" /> Add Requirement
                          </Button>
                        </div>
                        {(!giveawayForm.requirements || giveawayForm.requirements.length === 0) ? (
                          <p className="text-sm text-muted-foreground py-2">No requirements - anyone can enter</p>
                        ) : (
                          <div className="space-y-3">
                            {giveawayForm.requirements.map((req, idx) => (
                              <div key={idx} className="flex gap-2 items-end p-3 bg-white/5 rounded-lg">
                                <div className="flex-1">
                                  <Label className="text-xs">Type</Label>
                                  <Select 
                                    value={req.type} 
                                    onValueChange={(v) => {
                                      const newReqs = [...giveawayForm.requirements];
                                      newReqs[idx] = { ...newReqs[idx], type: v };
                                      setGiveawayForm({ ...giveawayForm, requirements: newReqs });
                                    }}
                                  >
                                    <SelectTrigger className="bg-white/5 h-8" data-testid={`select-req-type-${idx}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="discord">Discord Member</SelectItem>
                                      <SelectItem value="wager">Wager Amount</SelectItem>
                                      <SelectItem value="vip">VIP Status</SelectItem>
                                      <SelectItem value="linked_account">Linked Casino Account</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {(req.type === "wager" || req.type === "linked_account") && (
                                  <div className="flex-1">
                                    <Label className="text-xs">Casino</Label>
                                    <Select 
                                      value={req.casinoId?.toString() || "any"} 
                                      onValueChange={(v) => {
                                        const newReqs = [...giveawayForm.requirements];
                                        newReqs[idx] = { ...newReqs[idx], casinoId: v === "any" ? null : parseInt(v) };
                                        setGiveawayForm({ ...giveawayForm, requirements: newReqs });
                                      }}
                                    >
                                      <SelectTrigger className="bg-white/5 h-8" data-testid={`select-req-casino-${idx}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="any">Any casino</SelectItem>
                                        {casinos.map(casino => (
                                          <SelectItem key={casino.id} value={casino.id.toString()}>{casino.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                                {req.type === "wager" && (
                                  <div className="flex-1">
                                    <Label className="text-xs">Amount</Label>
                                    <Input 
                                      value={req.value}
                                      onChange={(e) => {
                                        const newReqs = [...giveawayForm.requirements];
                                        newReqs[idx] = { ...newReqs[idx], value: e.target.value };
                                        setGiveawayForm({ ...giveawayForm, requirements: newReqs });
                                      }}
                                      placeholder="$1,000"
                                      className="bg-white/5 h-8"
                                      data-testid={`input-req-value-${idx}`}
                                    />
                                  </div>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                                  onClick={() => {
                                    const newReqs = giveawayForm.requirements.filter((_, i) => i !== idx);
                                    setGiveawayForm({ ...giveawayForm, requirements: newReqs });
                                  }}
                                  data-testid={`button-remove-req-${idx}`}
                                >
                                  <X className="w-4 h-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Max Entries (optional)</Label>
                          <Input 
                            type="number"
                            value={giveawayForm.maxEntries || ""}
                            onChange={(e) => setGiveawayForm({ 
                              ...giveawayForm, 
                              maxEntries: e.target.value ? parseInt(e.target.value) : null 
                            })}
                            placeholder="10000"
                            className="bg-white/5"
                            data-testid="input-max-entries"
                          />
                        </div>
                        <div>
                          <Label>Ends At</Label>
                          <Input 
                            type="datetime-local"
                            value={giveawayForm.endsAt}
                            onChange={(e) => setGiveawayForm({ ...giveawayForm, endsAt: e.target.value })}
                            className="bg-white/5"
                            data-testid="input-ends-at"
                          />
                        </div>
                      </div>
                      <Button 
                        className="w-full font-display bg-gradient-to-r from-neon-cyan to-neon-purple"
                        onClick={() => {
                          if (editingGiveaway) {
                            updateGiveaway.mutate({ id: editingGiveaway.id, data: giveawayForm });
                          } else {
                            createGiveaway.mutate(giveawayForm);
                          }
                        }}
                        disabled={createGiveaway.isPending || updateGiveaway.isPending}
                        data-testid="button-save-giveaway"
                      >
                        <Save className="w-4 h-4 mr-2" />
                        {editingGiveaway ? "Update Giveaway" : "Create Giveaway"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                  )}
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <Button
                    variant={giveawayListMode === "all" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setGiveawayListMode("all")}
                    data-testid="filter-giveaways-all"
                  >
                    All
                  </Button>
                  <Button
                    variant={giveawayListMode === "active" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setGiveawayListMode("active")}
                    data-testid="filter-giveaways-active"
                  >
                    Current
                  </Button>
                  <Button
                    variant={giveawayListMode === "ended" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setGiveawayListMode("ended")}
                    data-testid="filter-giveaways-ended"
                  >
                    Previous
                  </Button>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={giveawaySearch}
                      onChange={(e) => setGiveawaySearch(e.target.value)}
                      placeholder="Search giveaways (title, prize)"
                      className="pl-10 bg-white/5 w-full sm:w-[280px]"
                      data-testid="input-giveaway-search"
                    />
                  </div>
                  <Select value={giveawayWinnerFilter} onValueChange={(v: any) => setGiveawayWinnerFilter(v)}>
                    <SelectTrigger className="bg-white/5 w-full sm:w-[200px]" data-testid="select-giveaway-winner">
                      <SelectValue placeholder="Winner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All winners</SelectItem>
                      <SelectItem value="with_winner">Has winner</SelectItem>
                      <SelectItem value="no_winner">No winner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {loadingGiveaways ? (
                <div className="text-center py-12 text-muted-foreground">Loading giveaways...</div>
              ) : (giveaways || []).length === 0 ? (
                <Card className="glass p-12 text-center">
                  <Gift className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-display text-xl text-white mb-2">No Giveaways Yet</h3>
                  <p className="text-muted-foreground mb-6">Create your first giveaway to engage your community</p>
                  <Button onClick={() => setGiveawayDialogOpen(true)} className="font-display bg-neon-cyan text-black">
                    <Plus className="w-4 h-4 mr-2" /> Create Giveaway
                  </Button>
                </Card>
              ) : adminGiveawaysFiltered.length === 0 ? (
                <Card className="glass p-12 text-center">
                  <Gift className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-display text-xl text-white mb-2">
                    No {giveawayListMode === "active" ? "Current" : giveawayListMode === "ended" ? "Previous" : ""} Giveaways
                  </h3>
                  <p className="text-muted-foreground">Try a different filter.</p>
                </Card>
              ) : adminGiveawaysSearchFiltered.length === 0 ? (
                <Card className="glass p-12 text-center">
                  <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="font-display text-xl text-white mb-2">No giveaways found</h3>
                  <p className="text-muted-foreground">Try clearing your search or winner filter.</p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {adminGiveawaysSearchFiltered.map((giveaway) => {
                    const isActive = giveaway.isActive && new Date(giveaway.endsAt) > new Date();
                    const winnerName = giveaway.winner?.discordUsername || giveaway.winner?.kickUsername || "Winner selected";
                    return (
                      <Card key={giveaway.id} className="glass p-6" data-testid={`admin-giveaway-${giveaway.id}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
                            isActive ? "bg-neon-cyan/20" : "bg-muted"
                          }`}>
                            <Gift className={`w-7 h-7 ${isActive ? "text-neon-cyan" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-display font-bold text-white text-lg">{giveaway.title}</h3>
                              <Badge className={isActive ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}>
                                {isActive ? "Active" : "Ended"}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mt-1">
                              <span className="text-neon-gold font-display font-bold">{giveaway.prize}</span>
                              <span>{giveaway.entries || 0} entries</span>
                              <span>Ends: {new Date(giveaway.endsAt).toLocaleDateString()}</span>
                              {giveaway.winnerId && (
                                <span className="flex items-center gap-1 text-neon-gold">
                                  <Trophy className="w-4 h-4" />
                                  {winnerName}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedGiveawayForEntries(giveaway);
                                setEntriesDialogOpen(true);
                              }}
                              title="View entries"
                              data-testid={`button-entries-giveaway-${giveaway.id}`}
                            >
                              <Users className="w-4 h-4" />
                            </Button>

                            {!isActive && !giveaway.winnerId && (giveaway.entries || 0) > 0 && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => pickGiveawayWinner.mutate(giveaway.id)}
                                disabled={pickGiveawayWinner.isPending}
                                title="Pick winner"
                                data-testid={`button-pick-winner-${giveaway.id}`}
                              >
                                <Trophy className="w-4 h-4" />
                              </Button>
                            )}

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditGiveaway(giveaway)}
                              data-testid={`button-edit-giveaway-${giveaway.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                if (confirm(`Delete "${giveaway.title}"?`)) {
                                  deleteGiveaway.mutate(giveaway.id);
                                }
                              }}
                              data-testid={`button-delete-giveaway-${giveaway.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}

              <Dialog
                open={entriesDialogOpen}
                onOpenChange={(open) => {
                  setEntriesDialogOpen(open);
                  if (!open) setSelectedGiveawayForEntries(null);
                }}
              >
                <DialogContent className="glass border-white/10 max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="font-display text-xl text-white">
                      Entries — {selectedGiveawayForEntries?.title || ""}
                    </DialogTitle>
                  </DialogHeader>

                  {selectedGiveawayForEntries && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-sm text-muted-foreground">
                          {(selectedGiveawayForEntries.entries || 0).toLocaleString()} entries
                        </p>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const g = selectedGiveawayForEntries;
                              const winnerName = g.winner?.discordUsername || g.winner?.kickUsername || "";
                              const rows = (giveawayEntries || []).map((e: any) => ({
                                giveawayId: g.id,
                                giveawayTitle: g.title,
                                winnerUserId: g.winnerId || "",
                                winnerName,
                                userId: e.userId,
                                discordUsername: e.user?.discordUsername || "",
                                kickUsername: e.user?.kickUsername || "",
                                enteredAt: e.createdAt ? new Date(e.createdAt as any).toISOString() : "",
                              }));

                              downloadCsv(
                                `giveaway-${g.id}-entries.csv`,
                                rows,
                                [
                                  "giveawayId",
                                  "giveawayTitle",
                                  "winnerUserId",
                                  "winnerName",
                                  "userId",
                                  "discordUsername",
                                  "kickUsername",
                                  "enteredAt",
                                ],
                              );
                            }}
                            disabled={loadingGiveawayEntries || (giveawayEntries?.length || 0) === 0}
                            data-testid="button-export-giveaway-entries-csv"
                            title={giveawayEntries.length ? "Download entries as CSV" : "No entries to export"}
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                          </Button>

                          {(() => {
                            const ended = !(selectedGiveawayForEntries.isActive && new Date(selectedGiveawayForEntries.endsAt) > new Date());
                            const canPick = ended && !selectedGiveawayForEntries.winnerId && (selectedGiveawayForEntries.entries || 0) > 0;
                            if (!canPick) return null;
                            return (
                              <Button
                                size="sm"
                                onClick={() => pickGiveawayWinner.mutate(selectedGiveawayForEntries.id)}
                                disabled={pickGiveawayWinner.isPending}
                                className="font-display"
                                data-testid="button-pick-winner-modal"
                              >
                                <Trophy className="w-4 h-4 mr-2" />
                                Pick Winner
                              </Button>
                            );
                          })()}
                        </div>
                      </div>

                      {selectedGiveawayForEntries.winnerId && (
                        <Card className="glass p-4">
                          <div className="flex items-center gap-3">
                            <Trophy className="w-5 h-5 text-neon-gold" />
                            <div>
                              <p className="text-xs text-muted-foreground">Winner</p>
                              <p className="text-white font-display font-bold">
                                {selectedGiveawayForEntries.winner?.discordUsername ||
                                  selectedGiveawayForEntries.winner?.kickUsername ||
                                  "Winner selected"}
                              </p>
                            </div>
                          </div>
                        </Card>
                      )}

                      <Card className="glass p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-sm font-display text-white">Entry Log</p>
                          <p className="text-xs text-muted-foreground">Newest first</p>
                        </div>

                        {loadingGiveawayEntries ? (
                          <div className="text-center py-6 text-muted-foreground">Loading entries...</div>
                        ) : giveawayEntries.length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground">No entries yet.</div>
                        ) : (
                          <ScrollArea className="h-72 pr-4">
                            <div className="space-y-2">
                              {giveawayEntries.map((e) => (
                                <div key={e.id} className="flex items-center justify-between gap-3 p-2 rounded-md bg-white/5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-xs text-white">
                                      {e.user?.discordAvatarUrl ? (
                                        <img loading="lazy" decoding="async" src={e.user.discordAvatarUrl} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        (e.user?.discordUsername || e.user?.kickUsername || "?")
                                          .slice(0, 1)
                                          .toUpperCase()
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-white text-sm truncate">
                                        {e.user?.discordUsername || e.user?.kickUsername || e.userId}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">{e.userId}</p>
                                    </div>
                                  </div>
                                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    {e.createdAt ? new Date(e.createdAt as any).toLocaleString() : ""}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                      </Card>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </TabsContent>

            <PlayersTab casinos={casinos} canManagePayments={isAdminLike} />

            
<TabsContent value="leaderboards">
  <Card className="glass p-6">
    <div className="flex items-center justify-between gap-4 mb-6">
      <div>
        <h2 className="font-display text-2xl text-white">Partner Leaderboards</h2>
        <p className="text-muted-foreground">Configure each partner&apos;s leaderboard API and mapping. The server fetches and caches entries.</p>
      </div>

      <Button
        onClick={() => {
          setEditingLeaderboard(null);
          setLeaderboardForm({
            casinoId: casinos[0]?.id ?? null,
            name: "Monthly Leaderboard",
            description: "",
            periodType: "monthly",
            durationDays: 30,
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
            refreshIntervalSec: 300,
            apiEndpoint: "",
            apiMethod: "GET",
            apiHeadersJson: "{}",
            apiBodyJson: "{}",
            apiMappingJson: JSON.stringify(
              {
                itemsPath: "data.items",
                rankFieldPath: "rank",
                usernameFieldPath: "username",
                userIdFieldPath: "id",
                valueFieldPath: "value",
              },
              null,
              2,
            ),
            isActive: true,
          });
          setLeaderboardDialogOpen(true);
        }}
        className="font-display bg-neon-cyan text-black"
      >
        <Plus className="w-4 h-4 mr-2" /> Add Leaderboard
      </Button>
    </div>

    {loadingLeaderboards ? (
      <div className="text-center py-12 text-muted-foreground">Loading leaderboards...</div>
    ) : leaderboards.length === 0 ? (
      <div className="text-center py-12 text-muted-foreground">No leaderboards yet. Add one above.</div>
    ) : (
      <div className="space-y-4">
        {leaderboards.map((lb: any) => (
          <Card key={lb.id} className="bg-card/40 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-lg text-white truncate">{lb.name}</h3>
                  <Badge className={lb.isActive ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}>
                    {lb.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {lb.lastFetchError ? (
                  <div className="text-xs text-red-400 mt-2 truncate">Last error: {lb.lastFetchError}</div>
                ) : null}
                <div className="text-xs text-muted-foreground mt-2">
                  Period: {lb.periodType} • Refresh: {lb.refreshIntervalSec}s
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingLeaderboard(lb);
                    // Server fields: startAt/endAt, apiEndpoint, apiMappingJson
                    setLeaderboardForm({
                      id: lb.id,
                      casinoId: lb.casinoId,
                      name: lb.name,
                      description: "",
                      periodType: lb.periodType,
                      durationDays: lb.durationDays,
                      startsAt: (lb.startAt ? new Date(lb.startAt).toISOString() : new Date().toISOString()),
                      endsAt: (lb.endAt ? new Date(lb.endAt).toISOString() : new Date().toISOString()),
                      refreshIntervalSec: lb.refreshIntervalSec,
                      apiEndpoint: lb.apiEndpoint || "",
                      apiMethod: lb.apiMethod || "GET",
                      apiHeadersJson: lb.apiHeadersJson || "{}",
                      apiBodyJson: lb.apiBodyJson || "{}",
                      apiMappingJson: lb.apiMappingJson || "{}",
                      isActive: Boolean(lb.isActive),
                    });
                    setLeaderboardDialogOpen(true);
                  }}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm(`Delete leaderboard "${lb.name}"?`)) deleteLeaderboard.mutate(lb.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    )}
  </Card>

  <Dialog
    open={leaderboardDialogOpen}
    onOpenChange={(open) => {
      setLeaderboardDialogOpen(open);
      if (!open) setEditingLeaderboard(null);
    }}
  >
    <DialogContent className="glass border-white/10 max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="font-display text-2xl">
          {editingLeaderboard ? "Edit Leaderboard" : "Add Leaderboard"}
        </DialogTitle>
      </DialogHeader>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
        <div className="space-y-2">
          <Label>Partner (Casino)</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={leaderboardForm.casinoId ?? ""}
            onChange={(e) => setLeaderboardForm((p) => ({ ...p, casinoId: Number(e.target.value) }))}
          >
            <option value="" disabled>Select...</option>
            {casinos.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={leaderboardForm.name} onChange={(e) => setLeaderboardForm((p) => ({ ...p, name: e.target.value }))} />
        </div>

        <div className="space-y-2">
          <Label>Period Type</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={leaderboardForm.periodType}
            onChange={(e) => setLeaderboardForm((p) => ({ ...p, periodType: e.target.value }))}
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label>Duration (days)</Label>
          <Input type="number" value={leaderboardForm.durationDays} onChange={(e) => setLeaderboardForm((p) => ({ ...p, durationDays: Number(e.target.value || 0) }))} />
        </div>

        <div className="space-y-2">
          <Label>Start (ISO)</Label>
          <Input value={leaderboardForm.startsAt} onChange={(e) => setLeaderboardForm((p) => ({ ...p, startsAt: e.target.value }))} />
        </div>

        <div className="space-y-2">
          <Label>End (ISO)</Label>
          <Input value={leaderboardForm.endsAt} onChange={(e) => setLeaderboardForm((p) => ({ ...p, endsAt: e.target.value }))} />
        </div>

        <div className="space-y-2">
          <Label>Refresh interval (seconds)</Label>
          <Input type="number" value={leaderboardForm.refreshIntervalSec} onChange={(e) => setLeaderboardForm((p) => ({ ...p, refreshIntervalSec: Number(e.target.value || 0) }))} />
        </div>

        <div className="space-y-2">
          <Label>Active</Label>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={leaderboardForm.isActive} onChange={(e) => setLeaderboardForm((p) => ({ ...p, isActive: e.target.checked }))} />
            <span className="text-sm text-muted-foreground">Show publicly + refresh</span>
          </div>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>API Endpoint</Label>
          <Input placeholder="https://partner.com/api/leaderboard" value={leaderboardForm.apiUrl} onChange={(e) => setLeaderboardForm((p) => ({ ...p, apiEndpoint: e.target.value }))} />
        </div>

        <div className="space-y-2">
          <Label>Method</Label>
          <select
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={leaderboardForm.apiMethod}
            onChange={(e) => setLeaderboardForm((p) => ({ ...p, apiMethod: e.target.value }))}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
          </select>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Headers JSON (server-only)</Label>
          <Textarea rows={4} value={leaderboardForm.apiHeadersJson} onChange={(e) => setLeaderboardForm((p) => ({ ...p, apiHeadersJson: e.target.value }))} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Body JSON (for POST)</Label>
          <Textarea rows={4} value={leaderboardForm.apiBodyJson} onChange={(e) => setLeaderboardForm((p) => ({ ...p, apiBodyJson: e.target.value }))} />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label>Mapping JSON</Label>
          <Textarea rows={8} value={leaderboardForm.mappingJson} onChange={(e) => setLeaderboardForm((p) => ({ ...p, apiMappingJson: e.target.value }))} />
          <p className="text-xs text-muted-foreground">Example: {{"itemsPath":"data.items","rankFieldPath":"rank","usernameFieldPath":"username","userIdFieldPath":"id","valueFieldPath":"value"}}</p>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setLeaderboardDialogOpen(false)}>Cancel</Button>
        <Button
          className="font-display bg-neon-cyan text-black"
          onClick={() => {
            if (editingLeaderboard?.id) {
              updateLeaderboard.mutate({ id: editingLeaderboard.id, data: leaderboardForm });
            } else {
              createLeaderboard.mutate(leaderboardForm);
            }
          }}
          disabled={!leaderboardForm.casinoId || !leaderboardForm.name}
        >
          Save
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</TabsContent>


            <TabsContent value="site">
              <Card className="glass p-6">
                <h2 className="font-display text-2xl text-white mb-2">Site Settings</h2>
                <p className="text-muted-foreground mb-6">Branding + public links (no code changes).</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Brand Name</Label>
                    <Input value={siteBrandName} onChange={(e) => setSiteBrandName(e.target.value)} placeholder="GETSOME" />
                  </div>
                  <div className="space-y-2">
                    <Label>Header Logo</Label>
                    <div className="flex items-center gap-4">
                      {siteBrandLogoUrl ? (
                        <img loading="lazy" decoding="async"
                          src={siteBrandLogoUrl}
                          alt="Site logo"
                          className="w-12 h-12 rounded-xl object-cover bg-white/5 border border-white/10"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white font-semibold">
                          GS
                        </div>
                      )}
                      <div className="flex-1">
                        <Input
                          type="file"
                          accept="image/*"
                          disabled={uploadingSiteLogo}
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            // allow selecting the same file again later
                            e.currentTarget.value = "";
                            if (!f) return;
                            setUploadingSiteLogo(true);
                            try {
                              const url = await uploadSiteLogo(f);
                              setSiteBrandLogoUrl(url);
                              toast({ title: "Logo uploaded" });
                            } catch (err: any) {
                              toast({ title: "Logo upload failed", description: err?.message || "Upload failed", variant: "destructive" });
                            } finally {
                              setUploadingSiteLogo(false);
                            }
                          }}
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setSiteBrandLogoUrl("")} disabled={!siteBrandLogoUrl || uploadingSiteLogo}>
                            Clear
                          </Button>
                          {uploadingSiteLogo ? (
                            <span className="text-xs text-muted-foreground">Uploading...</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Square PNG/SVG recommended</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Kick Live URL</Label>
                    <Input value={siteKickUrl} onChange={(e) => setSiteKickUrl(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Discord Invite URL</Label>
                    <Input value={siteDiscordUrl} onChange={(e) => setSiteDiscordUrl(e.target.value)} />
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/10">
                  <h3 className="font-display text-xl text-white mb-2">Theme</h3>
                  <p className="text-muted-foreground mb-6">Background + accents (applies site-wide).</p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <Label>Background Image</Label>
                      <div className="flex items-start gap-4">
                        <div className="w-24 h-16 rounded-xl overflow-hidden border border-white/10 bg-white/5 shrink-0">
                          <div className="w-full h-full bg-cover bg-center" style={{ backgroundImage: themeBgUrl ? `url(${themeBgUrl})` : "none" }} />
                        </div>
                        <div className="flex-1 space-y-2">
                          <Input value={themeBgUrl} onChange={(e) => setThemeBgUrl(e.target.value)} placeholder="https://... (or upload below)" />
                          <Input
                            type="file"
                            accept="image/*"
                            disabled={uploadingThemeBg}
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.currentTarget.value = "";
                              if (!f) return;
                              setUploadingThemeBg(true);
                              try {
                                const url = await uploadSiteBackground(f);
                                setThemeBgUrl(url);
                                toast({ title: "Background uploaded" });
                              } catch (err: any) {
                                toast({ title: "Upload failed", description: err?.message || "Upload failed", variant: "destructive" });
                              } finally {
                                setUploadingThemeBg(false);
                              }
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setThemeBgUrl("")} disabled={uploadingThemeBg || !themeBgUrl}>
                              Clear
                            </Button>
                            {uploadingThemeBg ? (
                              <span className="text-xs text-muted-foreground">Uploading...</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">WebP recommended (keeps size small)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="space-y-3">
                        <Label>Overlay Darkness</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[Math.round(themeOverlay * 100)]}
                            min={40}
                            max={90}
                            step={1}
                            onValueChange={(v) => setThemeOverlay(Math.max(0.4, Math.min(0.9, (v?.[0] ?? 78) / 100)))}
                          />
                          <div className="w-14 text-right text-sm text-white/80 tabular-nums">{Math.round(themeOverlay * 100)}%</div>
                        </div>
                        <p className="text-xs text-muted-foreground">Higher = darker background (better readability).</p>
                      </div>

                      <div className="space-y-3">
                        <Label>Accent Color</Label>
                        <div className="flex items-center gap-3">
                          <Input type="color" value={themeAccent} onChange={(e) => setThemeAccent(e.target.value)} className="h-10 w-14 p-1" />
                          <Input value={themeAccent} onChange={(e) => setThemeAccent(e.target.value)} className="font-mono" />
                          <Button type="button" variant="outline" size="sm" onClick={() => setThemeAccent("#b026ff")}>
                            Reset
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Controls primary buttons, focus rings, and glow accents.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end mt-6">
                  <Button className="font-display bg-neon-cyan text-black" onClick={() => saveSiteSettings.mutate()} disabled={saveSiteSettings.isPending}>
                    Save Settings
                  </Button>
                </div>
              </Card>
            </TabsContent>

<TabsContent value="audit">
  <div className="flex flex-col gap-4">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <h2 className="font-display text-2xl font-bold text-white">Audit Log</h2>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search action, entity, ip..."
          value={auditSearch}
          onChange={(e) => setAuditSearch(e.target.value)}
          className="w-full md:w-[320px]"
        />
        <Button variant="outline" onClick={() => setAuditSearch("")}>Clear</Button>
      </div>
    </div>

    <Card className="bg-card/60 border border-white/10">
      <CardContent className="pt-6">
        {loadingAuditLogs ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading audit log...
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">No audit log entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-white/10">
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Entity</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2 pr-4">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((row) => (
                  <tr key={row.id} className="border-b border-white/5">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "-"}
                    </td>
                    <td className="py-2 pr-4 font-medium">{row.action}</td>
                    <td className="py-2 pr-4">
                      <span className="text-muted-foreground">{row.entityType || "-"}</span>
                      {row.entityId ? <span className="ml-2 text-white/90">#{row.entityId}</span> : null}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{row.ip || "-"}</td>
                    <td className="py-2 pr-4 max-w-[480px]">
                      <div className="truncate text-white/80">
                        {row.details ? row.details : "-"}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  </div>
</TabsContent>



            <TabsContent value="verifications">
              <VerificationsTab />
            </TabsContent>

            <TabsContent value="stream-events">
              <StreamEvents adminFetch={adminFetch} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Footer />
    </div>
  );
}

type UserFullDetails = {
  user: User;
  casinoAccounts: (UserCasinoAccount & { casino: Casino })[];
  wallets: (UserWallet & { casino: Casino })[];
  payments: UserPayment[];
  totalPayments: string;
};

type PendingCasinoAccount = UserCasinoAccount & { user: User; casino: Casino };
type PendingWallet = UserWallet & { user: User; casino: Casino };
type PendingVerificationsResponse = { casinoAccounts: PendingCasinoAccount[]; wallets: PendingWallet[] };

function discordAvatarUrl(u: any) {
  if (!u?.discordId || !u?.discordAvatar) return null;
  return `https://cdn.discordapp.com/avatars/${u.discordId}/${u.discordAvatar}.png`;
}

function VerificationsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");

  const { data, isLoading, error } = useQuery<PendingVerificationsResponse>({
    queryKey: ["/api/admin/verifications", q],
    queryFn: () => adminFetch(`/api/admin/verifications${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });

  const verifyCasinoAccount = useMutation({
    mutationFn: async (payload: { id: number; verified: boolean }) => {
      return adminFetch(`/api/casino-accounts/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({ verified: payload.verified }),
      });
    },
    onSuccess: () => {
      toast({ title: "Casino account verified" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/verifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to verify", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const verifyWallet = useMutation({
    mutationFn: async (payload: { id: number; verified: boolean }) => {
      return adminFetch(`/api/wallets/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({ verified: payload.verified }),
      });
    },
    onSuccess: () => {
      toast({ title: "Wallet verified" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/verifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to verify", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const casinoAccounts = data?.casinoAccounts || [];
  const wallets = data?.wallets || [];
  const total = casinoAccounts.length + wallets.length;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl font-bold text-white">Verification Queue</h2>
          <p className="text-muted-foreground">Review pending casino links and wallet proof uploads.</p>
        </div>
        <div className="relative w-full md:w-[360px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search user, casino, wallet, or ID..."
            className="pl-10 bg-white/5"
            data-testid="input-verification-search"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-white flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-neon-cyan" /> Pending Casino Accounts
            </h3>
            <Badge className={casinoAccounts.length ? "bg-yellow-500/20 text-yellow-300" : "bg-green-500/20 text-green-400"}>
              {casinoAccounts.length ? `${casinoAccounts.length} pending` : "All clear"}
            </Badge>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Loading...</div>
          ) : casinoAccounts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No pending casino accounts.</div>
          ) : (
            <ScrollArea className="h-[520px] pr-4">
              <div className="space-y-3">
                {casinoAccounts.map((a) => (
                  <Card key={a.id} className="bg-white/5 p-4" data-testid={`verification-casino-${a.id}`}> 
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-xs text-white shrink-0">
                          {discordAvatarUrl(a.user) ? (
                            <img loading="lazy" decoding="async" src={discordAvatarUrl(a.user)!} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (a.user.discordUsername || a.user.kickUsername || "?").slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-semibold truncate">{a.user.discordUsername || a.user.kickUsername || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground truncate">{a.user.discordId}</div>
                          <div className="text-sm text-muted-foreground mt-2">
                            <span className="text-white font-medium">{a.casino.name}</span> • Username: <span className="text-white">{a.username}</span>
                          </div>
                          <div className="text-xs text-muted-foreground font-mono break-all mt-1">OD: {a.odId}</div>
                          <div className="text-xs text-muted-foreground mt-2">
                            Submitted: {a.createdAt ? new Date(a.createdAt as any).toLocaleString() : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => verifyCasinoAccount.mutate({ id: a.id, verified: true })}
                          disabled={verifyCasinoAccount.isPending}
                        >
                          Verify
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </Card>

        <Card className="glass p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg text-white flex items-center gap-2">
              <Wallet className="w-5 h-5 text-neon-purple" /> Pending Wallet Proofs
            </h3>
            <Badge className={wallets.length ? "bg-yellow-500/20 text-yellow-300" : "bg-green-500/20 text-green-400"}>
              {wallets.length ? `${wallets.length} pending` : "All clear"}
            </Badge>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground">Loading...</div>
          ) : wallets.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No pending wallet proofs.</div>
          ) : (
            <ScrollArea className="h-[520px] pr-4">
              <div className="space-y-3">
                {wallets.map((w) => (
                  <Card key={w.id} className="bg-white/5 p-4" data-testid={`verification-wallet-${w.id}`}> 
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-xs text-white shrink-0">
                          {discordAvatarUrl(w.user) ? (
                            <img loading="lazy" decoding="async" src={discordAvatarUrl(w.user)!} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (w.user.discordUsername || w.user.kickUsername || "?").slice(0, 1).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-semibold truncate">{w.user.discordUsername || w.user.kickUsername || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground truncate">{w.user.discordId}</div>
                          <div className="text-sm text-muted-foreground mt-2">
                            <span className="text-white font-medium">{w.casino.name}</span>
                          </div>
                          <div className="text-xs text-muted-foreground font-mono break-all mt-1">{w.solAddress}</div>
                          <div className="text-xs text-muted-foreground mt-2">
                            Submitted: {w.createdAt ? new Date(w.createdAt as any).toLocaleString() : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {w.screenshotUrl ? (
                          <a
                            href={w.screenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-neon-cyan hover:text-neon-cyan/80"
                            title="View proof"
                          >
                            <Image className="w-5 h-5" />
                          </a>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => verifyWallet.mutate({ id: w.id, verified: true })}
                          disabled={verifyWallet.isPending}
                        >
                          Verify
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </Card>
      </div>

      {error ? (
        <div className="mt-6 text-sm text-red-400">{(error as any)?.message || "Failed to load verifications"}</div>
      ) : null}

      <div className="mt-6 text-xs text-muted-foreground">Total pending items: {total}</div>
    </div>
  );
}

function PlayersTab({ casinos, canManagePayments }: { casinos: Casino[]; canManagePayments: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", type: "manual", notes: "" });

  const { data: users = [], isLoading: loadingUsers } = useQuery<User[]>({
    queryKey: ["/api/admin/users", searchQuery],
    queryFn: () => adminFetch(`/api/admin/users${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ""}`),
  });

  const { data: userDetails, isLoading: loadingDetails } = useQuery<UserFullDetails>({
    queryKey: ["/api/admin/users", selectedUserId],
    queryFn: () => adminFetch(`/api/admin/users/${selectedUserId}`),
    enabled: !!selectedUserId,
  });

  const addPayment = useMutation({
    mutationFn: async (data: { amount: string; type: string; notes: string }) => {
      return adminFetch(`/api/admin/users/${selectedUserId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: data.amount,
          type: data.type,
          notes: data.notes || null,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: "Payment added successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUserId] });
      setPaymentDialogOpen(false);
      setPaymentForm({ amount: "", type: "manual", notes: "" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add payment", description: error.message, variant: "destructive" });
    },
  });

  const verifyCasinoAccount = useMutation({
    mutationFn: async (payload: { id: number; verified: boolean }) => {
      return adminFetch(`/api/casino-accounts/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({ verified: payload.verified }),
      });
    },
    onSuccess: () => {
      toast({ title: "Casino account verified" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUserId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to verify", description: error.message, variant: "destructive" });
    },
  });

  const verifyWallet = useMutation({
    mutationFn: async (payload: { id: number; verified: boolean }) => {
      return adminFetch(`/api/wallets/${payload.id}`, {
        method: "PATCH",
        body: JSON.stringify({ verified: payload.verified }),
      });
    },
    onSuccess: () => {
      toast({ title: "Wallet verified" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", selectedUserId] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to verify", description: error.message, variant: "destructive" });
    },
  });

  const getCasinoName = (casinoId: number) => {
    return casinos.find(c => c.id === casinoId)?.name || "Unknown Casino";
  };

  return (
    <TabsContent value="players">
      <div className="flex justify-between items-center mb-6">
        <h2 className="font-display text-2xl font-bold text-white">Player Lookup</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass p-4 lg:col-span-1">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by Discord username or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white/5"
              data-testid="input-player-search"
            />
          </div>

          <ScrollArea className="h-[600px]">
            {loadingUsers ? (
              <div className="text-center py-8 text-muted-foreground">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? "No users found" : "No users yet"}
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => setSelectedUserId(user.id)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedUserId === user.id ? "bg-neon-purple/20 border border-neon-purple/50" : "bg-white/5 hover:bg-white/10"
                    }`}
                    data-testid={`player-item-${user.id}`}
                  >
                    <div className="flex items-center gap-3">
                      {user.discordAvatar ? (
                        <img loading="lazy" decoding="async" 
                          src={`https://cdn.discordapp.com/avatars/${user.discordId}/${user.discordAvatar}.png`} 
                          alt="" 
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-neon-purple/20 flex items-center justify-center">
                          <Users className="w-5 h-5 text-neon-purple" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-white">{user.discordUsername || "Unknown"}</div>
                        <div className="text-xs text-muted-foreground">{user.discordId}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </Card>

        <Card className="glass p-6 lg:col-span-2">
          {!selectedUserId ? (
            <div className="flex flex-col items-center justify-center h-[600px] text-muted-foreground">
              <Users className="w-16 h-16 mb-4" />
              <p>Select a player to view their details</p>
            </div>
          ) : loadingDetails ? (
            <div className="flex items-center justify-center h-[600px] text-muted-foreground">
              Loading user details...
            </div>
          ) : userDetails ? (
            <ScrollArea className="h-[600px]">
              <div className="space-y-6">
                <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                  {userDetails.user.discordAvatar ? (
                    <img loading="lazy" decoding="async" 
                      src={`https://cdn.discordapp.com/avatars/${userDetails.user.discordId}/${userDetails.user.discordAvatar}.png`} 
                      alt="" 
                      className="w-16 h-16 rounded-full"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-neon-purple/20 flex items-center justify-center">
                      <Users className="w-8 h-8 text-neon-purple" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-display text-2xl font-bold text-white">
                      {userDetails.user.discordUsername || "Unknown User"}
                    </h3>
                    <p className="text-muted-foreground">Discord ID: {userDetails.user.discordId}</p>
                    {userDetails.user.kickUsername && (
                      <p className="text-sm text-muted-foreground">Kick: {userDetails.user.kickUsername}</p>
                    )}
                  </div>
{canManagePayments && (
                  <div className="ml-auto text-right">
                    <div className="text-sm text-muted-foreground">Total Paid</div>
                    <div className="font-display text-2xl font-bold text-neon-gold">
                      ${parseFloat(userDetails.totalPayments || "0").toFixed(2)}
                    </div>
                  </div>
                )}
                </div>

                <div>
                  <h4 className="font-display text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-neon-cyan" /> Casino Accounts
                  </h4>
                  {userDetails.casinoAccounts.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No casino accounts linked</p>
                  ) : (
                    <div className="space-y-3">
                      {userDetails.casinoAccounts.map((account) => (
                        <Card key={account.id} className="bg-white/5 p-4" data-testid={`casino-account-${account.id}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-bold text-white">{account.casino.name}</div>
                              <div className="text-sm text-muted-foreground">
                                Username: <span className="text-white">{account.username}</span>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                ID: <span className="text-white font-mono">{account.odId}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {!account.verified && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => verifyCasinoAccount.mutate({ id: account.id, verified: true })}
                                  disabled={verifyCasinoAccount.isPending}
                                  data-testid={`button-verify-casino-account-${account.id}`}
                                >
                                  Verify
                                </Button>
                              )}
                              {account.verified && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => verifyCasinoAccount.mutate({ id: account.id, verified: false })}
                                  disabled={verifyCasinoAccount.isPending}
                                  data-testid={`button-unverify-casino-account-${account.id}`}
                                >
                                  Unverify
                                </Button>
                              )}
                              <Badge className={account.verified ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}>
                                {account.verified ? "Verified" : "Pending verification"}
                              </Badge>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-display text-lg font-bold text-white mb-3 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-neon-purple" /> SOL Wallets
                  </h4>
                  {userDetails.wallets.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No wallets linked</p>
                  ) : (
                    <div className="space-y-3">
                      {userDetails.wallets.map((wallet) => (
                        <Card key={wallet.id} className="bg-white/5 p-4" data-testid={`wallet-${wallet.id}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="font-bold text-white">{wallet.casino.name}</div>
                              <div className="text-sm font-mono text-muted-foreground break-all mt-1">
                                {wallet.solAddress}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              {wallet.screenshotUrl && (
                                <a 
                                  href={wallet.screenshotUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-neon-cyan hover:text-neon-cyan/80"
                                >
                                  <Image className="w-5 h-5" />
                                </a>
                              )}
                              {!wallet.verified && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => verifyWallet.mutate({ id: wallet.id, verified: true })}
                                  disabled={verifyWallet.isPending}
                                  data-testid={`button-verify-wallet-${wallet.id}`}
                                >
                                  Verify
                                </Button>
                              )}
                              {wallet.verified && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => verifyWallet.mutate({ id: wallet.id, verified: false })}
                                  disabled={verifyWallet.isPending}
                                  data-testid={`button-unverify-wallet-${wallet.id}`}
                                >
                                  Unverify
                                </Button>
                              )}
                              <Badge className={wallet.verified ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}>
                                {wallet.verified ? "Verified" : "Pending verification"}
                              </Badge>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-display text-lg font-bold text-white flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-neon-gold" /> Payment History
                    </h4>
                    {canManagePayments && (
                    <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="font-display bg-neon-gold text-black hover:bg-neon-gold/80" data-testid="button-add-payment">
                          <Plus className="w-4 h-4 mr-1" /> Add Payment
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="glass border-white/10">
                        <DialogHeader>
                          <DialogTitle className="font-display text-xl">Add Payment</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div>
                            <Label>Amount ($)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={paymentForm.amount}
                              onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                              placeholder="100.00"
                              className="bg-white/5"
                              data-testid="input-payment-amount"
                            />
                          </div>
                          <div>
                            <Label>Type</Label>
                            <Select 
                              value={paymentForm.type} 
                              onValueChange={(value) => setPaymentForm({ ...paymentForm, type: value })}
                            >
                              <SelectTrigger className="bg-white/5" data-testid="select-payment-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="manual">Manual Payment</SelectItem>
                                <SelectItem value="giveaway">Giveaway Prize</SelectItem>
                                <SelectItem value="leaderboard">Leaderboard Prize</SelectItem>
                                <SelectItem value="bonus">Bonus</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Notes (optional)</Label>
                            <Textarea
                              value={paymentForm.notes}
                              onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                              placeholder="Payment sent via Solana on 1/15..."
                              className="bg-white/5"
                              data-testid="input-payment-notes"
                            />
                          </div>
                          <Button
                            className="w-full font-display bg-neon-gold text-black hover:bg-neon-gold/80"
                            onClick={() => addPayment.mutate(paymentForm)}
                            disabled={!paymentForm.amount || addPayment.isPending}
                            data-testid="button-save-payment"
                          >
                            <Save className="w-4 h-4 mr-2" /> Save Payment
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    )}
                  </div>
                  {userDetails.payments.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No payments recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {userDetails.payments.map((payment) => (
                        <Card key={payment.id} className="bg-white/5 p-3" data-testid={`payment-${payment.id}`}>
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-display font-bold text-neon-gold">
                                  ${parseFloat(payment.amount).toFixed(2)}
                                </span>
                                <Badge className="bg-white/10 text-white/80">
                                  {payment.type}
                                </Badge>
                              </div>
                              {payment.notes && (
                                <p className="text-sm text-muted-foreground mt-1">{payment.notes}</p>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : ""}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="flex items-center justify-center h-[600px] text-muted-foreground">
              Failed to load user details
            </div>
          )}
        </Card>
      </div>
    </TabsContent>
  );
}