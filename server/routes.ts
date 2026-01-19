import express, { type Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import homeLeaderboardRouter from "./routes/homeLeaderboard";
import passport from "passport";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import { clearStatsCache, getAdminStats, getPublicStats } from "./stats";
import { 
  insertCasinoSchema, 
  insertGiveawaySchema,
  insertUserCasinoAccountSchema,
  insertUserWalletSchema,
  insertUserPaymentSchema,
  insertStreamEventSchema,
  insertStreamEventEntrySchema,
  insertSiteSettingSchema,
  insertLeaderboardSchema
} from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Private uploads (wallet proofs, etc). Never exposed via a public static route.
const privateUploadsDir = path.join(process.cwd(), "uploads_private");
if (!fs.existsSync(privateUploadsDir)) fs.mkdirSync(privateUploadsDir, { recursive: true });

// Use memory storage so we can send to S3/R2
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

function normalizeBool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}


function setPublicCache(res: Response, seconds: number, swrSeconds?: number) {
  const swr = swrSeconds ?? Math.max(30, seconds * 10);
  res.setHeader("Cache-Control", `public, max-age=${seconds}, stale-while-revalidate=${swr}`);
}

// Hide server-side provably-fair secret seed from all API responses.
function stripGiveawaySecrets(g: any) {
  if (!g) return g;
  const { pfSeed, ...rest } = g;
  return rest;
}

function envFirst(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

type ObjectStorageConfig = {
  endpoint?: string;
  region: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBase?: string;
  forcePathStyle: boolean;
  useProxy: boolean;
  isRailway: boolean;
  isR2: boolean;
};

let _objCfg: ObjectStorageConfig | null = null;

function getObjectStorageConfig(): ObjectStorageConfig {
  if (_objCfg) return _objCfg;

  const bucket = envFirst("S3_BUCKET", "R2_BUCKET");
  const publicBase = envFirst("S3_PUBLIC_BASE_URL", "R2_PUBLIC_BASE_URL");
  const accessKeyId = envFirst("S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID");
  const secretAccessKey = envFirst("S3_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY");
  const region = envFirst("S3_REGION", "R2_REGION") || "auto";

  const runningOnRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_ID);

  let endpoint =
    envFirst("S3_ENDPOINT", "R2_ENDPOINT") ||
    (envFirst("R2_ACCOUNT_ID") ? `https://${envFirst("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com` : undefined);

  // If creds+bucket exist on Railway but endpoint was omitted, use Railway object storage endpoint.
  if (!endpoint && runningOnRailway && bucket && accessKeyId && secretAccessKey) {
    endpoint = "https://storage.railway.app";
  }

  const isRailway = Boolean(String(endpoint || "").includes("storage.railway.app") || String(publicBase || "").includes("storage.railway.app"));
  const isR2 = Boolean(String(endpoint || "").includes("r2.cloudflarestorage.com"));

  // R2 prefers path-style; Railway prefers virtual-hosted-style.
  const defaultForcePathStyle = isR2 ? true : isRailway ? false : Boolean(endpoint && !String(endpoint).includes("amazonaws.com"));
  const forcePathStyle = normalizeBool(envFirst("S3_FORCE_PATH_STYLE", "R2_FORCE_PATH_STYLE"), defaultForcePathStyle);

  // Default to proxying if:
  // - Railway object storage (typically private)
  // - Cloudflare R2 (typically private)
  // - no public base URL is configured
  const defaultUseProxy = isRailway || isR2 || !publicBase;
  const useProxy = normalizeBool(envFirst("S3_USE_PROXY", "R2_USE_PROXY"), defaultUseProxy);

  _objCfg = {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBase,
    forcePathStyle,
    useProxy,
    isRailway,
    isR2,
  };

  return _objCfg;
}

function isRailwayObjectStorage(): boolean {
  return getObjectStorageConfig().isRailway;
}

function shouldProxyPublicObjects(): boolean {
  return getObjectStorageConfig().useProxy;
}

function getPublicUrl(key: string) {
  if (shouldProxyPublicObjects()) return `/api/public/files/${encodeURIComponent(key)}`;
  const base = getObjectStorageConfig().publicBase;
  if (base) return `${base.replace(/\/$/, "")}/${key}`;
  return null;
}

function privateFileUrl(key: string) {
  // Always served via auth-gated proxy route
  return `/api/files/${encodeURIComponent(key)}`;
}

function normalizeWalletProofUrl(value: any): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // already a route URL
  if (s.startsWith("/api/files/")) return s;
  // legacy full URL
  if (/^https?:\/\//i.test(s)) return s;
  // stored key
  if (s.startsWith("wallets/")) return privateFileUrl(s);
  // fallback: treat as key
  return privateFileUrl(s);
}

function privateLocalPathFromKey(key: string) {
  const safeKey = String(key || "").replace(/\\/g, "/");
  const localName = safeKey.replace(/\//g, "_");
  return path.join(privateUploadsDir, localName);
}

function privateLocalPath(key: string) {
  // Store nested keys as a flat filename to keep things simple on Railway.
  const safe = key.replace(/\//g, "_");
  return path.join(privateUploadsDir, safe);
}

function s3Client() {
  const cfg = getObjectStorageConfig();
  if (!cfg.endpoint || !cfg.accessKeyId || !cfg.secretAccessKey) return null;

  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    forcePathStyle: cfg.forcePathStyle,
  });
}


// ============ STAFF AUTH / PERMISSIONS ============

type StaffRole = "owner" | "admin" | "mod" | null;

type StaffPermissions = {
  canManageCasinos: boolean;
  canManageSiteSettings: boolean;
  canManageLeaderboards: boolean;
  canManageStreamEvents: boolean;
  canViewPlayers: boolean;
  canVerifyUsers: boolean;
  canViewGiveawayEntries: boolean;
  canEndGiveaways: boolean;
  canPickWinners: boolean;
  canViewAuditLogs: boolean;
  canManagePayments: boolean;
};

function getStaffRole(req: Request): StaffRole {
  const r = (req.session as any)?.staffRole;
  if (r === "owner" || r === "admin" || r === "mod") return r;
  // Back-compat: older sessions only set isAdmin
  if ((req.session as any)?.isAdmin) return "admin";
  return null;
}

function getStaffLabel(req: Request): string | null {
  const label = (req.session as any)?.staffLabel;
  return label ? String(label) : null;
}

function staffAuth(req: Request, res: Response, next: NextFunction) {
  const role = getStaffRole(req);
  if (role) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// Admin (Owner/Admin) middleware
function adminAuth(req: Request, res: Response, next: NextFunction) {
  const role = getStaffRole(req);
  if (role === "owner" || role === "admin") return next();
  return res.status(401).json({ error: "Unauthorized - Admin required" });
}

function permsForRole(role: StaffRole): StaffPermissions {
  if (role === "owner" || role === "admin") {
    return {
      canManageCasinos: true,
      canManageSiteSettings: true,
      canManageLeaderboards: true,
      canManageStreamEvents: true,
      canViewPlayers: true,
      canVerifyUsers: true,
      canViewGiveawayEntries: true,
      canEndGiveaways: true,
      canPickWinners: true,
      canViewAuditLogs: true,
      canManagePayments: true,
    };
  }

  if (role === "mod") {
    return {
      canManageCasinos: false,
      canManageSiteSettings: false,
      canManageLeaderboards: false,
      canManageStreamEvents: false,
      canViewPlayers: true,
      canVerifyUsers: true,
      canViewGiveawayEntries: true,
      canEndGiveaways: true,
      canPickWinners: true,
      canViewAuditLogs: false,
      canManagePayments: false,
    };
  }

  return {
    canManageCasinos: false,
    canManageSiteSettings: false,
    canManageLeaderboards: false,
    canManageStreamEvents: false,
    canViewPlayers: false,
    canVerifyUsers: false,
    canViewGiveawayEntries: false,
    canEndGiveaways: false,
    canPickWinners: false,
    canViewAuditLogs: false,
    canManagePayments: false,
  };
}

async function auditAction(
  req: Request,
  action: string,
  entityType?: string,
  entityId?: string | number,
  details?: any,
) {
  try {
    const role = getStaffRole(req);
    if (!role) return;
    const actorUserId = getAuthedUserId(req) || null;
    const actorLabel = getStaffLabel(req) || (role === "owner" ? "Owner" : role);

    await storage.createAdminAuditLog({
      action,
      entityType: entityType ?? null,
      entityId: entityId !== undefined && entityId !== null ? String(entityId) : null,
      details: details ? JSON.stringify(details) : null,
      actorUserId,
      actorRole: role,
      actorLabel,
      ip: req.ip || null,
      userAgent: req.get("user-agent") || null,
    } as any);
  } catch {
    // Never block the main request on audit logging
  }
}

// Blocks most CSRF attempts without requiring client-side CSRF tokens.
// Ensures state-changing requests originate from the same site.
function requireSameOrigin(req: Request, res: Response, next: NextFunction) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();

  const origin = req.headers.origin;
  // If there is no Origin header, allow (mobile apps / server-to-server).
  if (!origin) return next();

  const host = req.headers.host;
  if (!host) return res.status(400).json({ error: "Bad Request" });

  const expected = `${req.secure ? "https" : "http"}://${host}`;
  if (origin !== expected) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
}

function getAuthedUserId(req: Request): string | undefined {
  // Primary: our own session field
  const sessionId = req.session?.userId;
  if (sessionId) return sessionId;

  // Fallback: passport user (if present)
  const passportUser = (req.user as any)?.id ?? (req.session as any)?.passport?.user;
  if (passportUser) return String(passportUser);

  return undefined;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const userId = getAuthedUserId(req);
  if (userId) {
    // Self-heal: if passport authenticated but our session.userId isn't set, persist it.
    if (req.session && !req.session.userId) req.session.userId = userId;
    return next();
  }
  return res.status(401).json({ error: "Unauthorized - Login required" });
}

function requireAuthOrAdmin(req: Request, res: Response, next: NextFunction) {
  // Admin sessions may not have a linked userId (admin password login),
  // but should still be able to access admin-only resources.
  if (getStaffRole(req)) return next();
  return requireAuth(req, res, next);
}


function requireSelfOrAdmin(req: Request, res: Response, next: NextFunction) {
  const targetUserId = req.params.id;
  const userId = getAuthedUserId(req);
  if (req.session?.isAdmin || (userId && userId === targetUserId)) return next();
  return res.status(403).json({ error: "Forbidden" });
}

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

function shuffleCrypto<T>(arr: T[]): T[] {
  // Fisher-Yates using crypto.randomInt
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


function getErrorMessage(err: any, fallback: string) {
  // Zod errors are handled separately in most routes
  const code = err?.code;
  if (code === "23505") return "Duplicate value (already exists).";
  if (code === "23502") return "Missing a required value.";
  if (code === "22P02") return "Invalid input format.";
  // Prefer pg detail for admin debugging
  if (typeof err?.detail === "string" && err.detail.trim()) return err.detail;
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return fallback;
}

function normalizeHttpUrl(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  // allow local relative URLs like /uploads/... or /api/...
  if (s.startsWith("/") || s.startsWith("data:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s.replace(/^\/\/+/, "")}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Same-origin enforcement for state-changing requests (CSRF mitigation)
  app.use("/api", requireSameOrigin);

  // ============ USER AUTH (DISCORD) ============

    // Public home routes
  app.use("/api/home", homeLeaderboardRouter);

// Serve locally stored uploads (used when S3/R2 not configured)
app.use("/uploads", express.static(uploadsDir));

// Public file proxy for S3/R2/Railway object storage.
// We intentionally only allow a small set of public prefixes.
app.get("/api/public/files/:key(*)", async (req: Request, res: Response) => {
  try {
    const rawKey = String((req.params as any).key || "");
    const key = decodeURIComponent(rawKey).replace(/\\/g, "/");
    if (!key || key.includes("..")) return res.status(400).json({ error: "Bad key" });

    // Public assets only. Everything else should use an auth-gated route.
    // - casinos/: partner logos
    // - site/: header logo + background theme image
    if (!(key.startsWith("casinos/") || key.startsWith("site/"))) {
      return res.status(404).json({ error: "Not found" });
    }

    const bucket = getObjectStorageConfig().bucket;
    const client = s3Client();
    if (!bucket || !client) return res.status(404).json({ error: "File not available" });

    const signed = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 60 },
    );

    return res.redirect(signed);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch file" });
  }
});

// Private file proxy (wallet proofs, etc). Admin-only.
app.get("/api/files/:key(*)", staffAuth, async (req: Request, res: Response) => {
  try {
    const rawKey = String((req.params as any).key || "");
    const key = decodeURIComponent(rawKey).replace(/\\/g, "/");
    if (!key || key.includes("..")) return res.status(400).json({ error: "Bad key" });

    // Only private wallet proof assets for now
    if (!key.startsWith("wallets/")) {
      return res.status(404).json({ error: "Not found" });
    }

    // Security: never cache private proofs
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const bucket = getObjectStorageConfig().bucket;
    const client = s3Client();
    if (bucket && client) {
      const signed = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: 60 },
      );
      return res.redirect(signed);
    }

    // Local fallback (private directory)
    const localPath = privateLocalPathFromKey(key);
    if (!fs.existsSync(localPath)) return res.status(404).json({ error: "Not found" });
    return res.sendFile(localPath);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to fetch file" });
  }
});

// User: upload wallet proof screenshot (stored privately)
app.post(
  "/api/users/:id/uploads/wallet-proof",
  requireAuth,
  requireSelfOrAdmin,
  upload.single("screenshot"),
  async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const casinoIdRaw = (req.body?.casinoId ?? req.query?.casinoId) as any;
      const casinoId = Number(casinoIdRaw);
      if (!Number.isFinite(casinoId) || casinoId <= 0) {
        return res.status(400).json({ error: "casinoId is required" });
      }

      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "No file uploaded" });
      if (!String(file.mimetype || "").startsWith("image/")) {
        return res.status(400).json({ error: "Screenshot must be an image" });
      }

      const ext = (file.originalname.split(".").pop() || "png")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      const key = `wallets/${userId}/${casinoId}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;

      const bucket = getObjectStorageConfig().bucket;
      const client = s3Client();

      if (client && bucket) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype || "application/octet-stream",
            CacheControl: "no-store",
            ContentDisposition: "inline",
          }),
        );
        return res.json({ key });
      }

      const outPath = privateLocalPathFromKey(key);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, file.buffer);
      return res.json({ key });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to upload wallet proof" });
    }
  },
);

// Admin: upload casino logo (S3/R2 if configured, else local)
app.post("/api/admin/uploads/casino-logo", adminAuth, upload.single("logo"), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const ext = (file.originalname.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = `casinos/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    auditAction(req, "casino.logo.upload", "file", key, { mimetype: file.mimetype, size: file.size });

    const bucket = getObjectStorageConfig().bucket;
    const client = s3Client();

    // Prefer S3/R2 if configured
    if (client && bucket) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || "application/octet-stream",
        CacheControl: "public, max-age=31536000, immutable",
      }));

      const publicUrl = getPublicUrl(key);
      if (!publicUrl) {
        return res.status(500).json({ error: "Uploaded, but no public URL can be formed. Set S3_PUBLIC_BASE_URL or enable S3_USE_PROXY." });
      }
      return res.json({ url: publicUrl, key });
    }

    // Fallback: local filesystem
    const localName = key.replace(/\//g, "_");
    const outPath = path.join(uploadsDir, localName);
    fs.writeFileSync(outPath, file.buffer);
    return res.json({ url: `/uploads/${localName}` });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to upload logo" });
  }
});

// Admin: upload site logo (S3/R2 if configured, else local)
app.post("/api/admin/uploads/site-logo", adminAuth, upload.single("logo"), async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const ext = (file.originalname.split(".").pop() || "png")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const key = `site/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    auditAction(req, "site.logo.upload", "file", key, { mimetype: file.mimetype, size: file.size });

    const bucket = getObjectStorageConfig().bucket;
    const client = s3Client();

    if (client && bucket) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype || "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );

      const publicUrl = getPublicUrl(key);
      if (!publicUrl) {
        return res.status(500).json({
          error:
            "Uploaded, but no public URL can be formed. Set S3_PUBLIC_BASE_URL or enable S3_USE_PROXY.",
        });
      }
      return res.json({ url: publicUrl, key });
    }

    // Fallback: local filesystem
    const localName = key.replace(/\//g, "_");
    const outPath = path.join(uploadsDir, localName);
    fs.writeFileSync(outPath, file.buffer);
    return res.json({ url: `/uploads/${localName}` });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to upload logo" });
  }
});

// Admin: upload site background image (S3/R2 if configured, else local)
app.post(
  "/api/admin/uploads/site-background",
  adminAuth,
  upload.single("background"),
  async (req: Request, res: Response) => {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: "No file uploaded" });

      const ext = (file.originalname.split(".").pop() || "webp")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const key = `site/background/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
      auditAction(req, "site.background.upload", "file", key, { mimetype: file.mimetype, size: file.size });

      const bucket = getObjectStorageConfig().bucket;
      const client = s3Client();

      if (client && bucket) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype || "application/octet-stream",
            CacheControl: "public, max-age=31536000, immutable",
          }),
        );

        const publicUrl = getPublicUrl(key);
        if (!publicUrl) {
          return res.status(500).json({
            error:
              "Uploaded, but no public URL can be formed. Set S3_PUBLIC_BASE_URL or enable S3_USE_PROXY.",
          });
        }
        return res.json({ url: publicUrl, key });
      }

      // Fallback: local filesystem
      const localName = key.replace(/\//g, "_");
      const outPath = path.join(uploadsDir, localName);
      fs.writeFileSync(outPath, file.buffer);
      return res.json({ url: `/uploads/${localName}` });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Failed to upload background" });
    }
  },
);



app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const userId = getAuthedUserId(req);
      if (!userId) return res.json({ user: null });

      // Self-heal: persist userId into our session for downstream APIs.
      if (req.session && !req.session.userId) {
        req.session.userId = userId;
      }

      const user = await storage.getUser(userId);
      if (!user) {
        req.session.userId = undefined;
        req.session.isAdmin = false;
        return res.json({ user: null });
      }
      // Do not leak sensitive linkage data here.
      res.json({
        user: {
          id: user.id,
          discordId: user.discordId,
          discordUsername: user.discordUsername,
          discordAvatar: user.discordAvatar,
          kickUsername: user.kickUsername,
          kickVerified: user.kickVerified,
          isAdmin: user.isAdmin,
          role: (user as any).role || "user",
          isStaff: Boolean((user as any).isAdmin) || String((user as any).role || "").toLowerCase() === "mod" || String((user as any).role || "").toLowerCase() === "admin",
        },
      });
    } catch {
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  app.get("/api/auth/discord", (req: Request, res: Response, next: NextFunction) => {
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET || !process.env.DISCORD_CALLBACK_URL) {
      return res.status(503).json({ error: "Discord auth is not configured" });
    }
    // Continue into passport
    return passport.authenticate("discord")(req, res, next);
  });

  app.get(
    "/api/auth/discord/callback",
    (req: Request, res: Response, next: NextFunction) => {
      if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET || !process.env.DISCORD_CALLBACK_URL) {
        return res.status(503).json({ error: "Discord auth is not configured" });
      }
      return passport.authenticate("discord", { failureRedirect: "/" })(req, res, next);
    },
    async (req: Request, res: Response) => {
      const user = req.user as any;
      if (!user?.id) {
        return res.redirect("/");
      }

      // Regenerate session on login to avoid session fixation and ensure a fresh
      // session id is issued after OAuth.
      req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error("⚠️ Session regenerate failed", regenErr);
          // Best-effort fallback: still try to set session fields
          req.session.userId = user.id;
        // Map DB role to staff session role
        const dbRole = String((user as any).role || "user").toLowerCase();
        const staffRole: any = dbRole === "mod" ? "mod" : (Boolean((user as any).isAdmin) || dbRole === "admin" ? "admin" : null);
        req.session.staffRole = staffRole || undefined;
        req.session.staffLabel = (user as any).discordUsername || (user as any).kickUsername || undefined;
        // Back-compat: isAdmin means Owner/Admin (mods are false)
        req.session.isAdmin = staffRole === "admin";
          return req.session.save(() => res.redirect("/"));
        }

        req.session.userId = user.id;
        // Map DB role to staff session role
        const dbRole = String((user as any).role || "user").toLowerCase();
        const staffRole: any = dbRole === "mod" ? "mod" : (Boolean((user as any).isAdmin) || dbRole === "admin" ? "admin" : null);
        req.session.staffRole = staffRole || undefined;
        req.session.staffLabel = (user as any).discordUsername || (user as any).kickUsername || undefined;
        // Back-compat: isAdmin means Owner/Admin (mods are false)
        req.session.isAdmin = staffRole === "admin";

        req.session.save((saveErr) => {
          if (saveErr) console.error("⚠️ Session save failed", saveErr);
          res.redirect("/");
        });
      });
    },
  );

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: getErrorMessage(err, "Logout failed") });
      res.json({ success: true });
    });
  });
  
  // ============ ADMIN AUTH ============
  
  // Admin login (rate limited)
  app.post("/api/admin/login", adminLoginLimiter, async (req: Request, res: Response) => {
    try {
      // Be forgiving about common copy/paste issues (trailing spaces/newlines)
      // while still requiring a match of the intended secret.
      const normalize = (v: unknown) => {
        let s = String(v ?? "").trim();
        // If someone pasted quotes into Railway variables ("secret") or ('secret'),
        // strip one layer of matching surrounding quotes.
        if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
          s = s.slice(1, -1).trim();
        }
        return s;
      };

      const password = normalize(req.body?.password);
      const adminSecret = normalize(process.env.ADMIN_SECRET);
      
      if (!adminSecret) {
        return res.status(503).json({ error: "Admin not configured" });
      }
      
      // Constant-time compare to avoid timing differences.
      const a = Buffer.from(password, "utf8");
      const b = Buffer.from(adminSecret, "utf8");
      const isMatch = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);

      if (isMatch) {
        req.session.regenerate((err) => {
          if (err) {
            return res.status(500).json({ error: "Login failed" });
          }
          req.session.isAdmin = true;
          req.session.staffRole = "owner";
          req.session.staffLabel = "Owner";
          req.session.save((err) => {
            if (err) {
              return res.status(500).json({ error: getErrorMessage(err, "Login failed") });
            }
            auditAction(req, "admin.login");
            return res.json({ success: true });
          });
        });
        return;
      }
      
      return res.status(401).json({ error: "Invalid password" });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Login failed") });
    }
  });
  
  // Admin logout
  app.post("/api/admin/logout", (req: Request, res: Response) => {
    // Log before destroying session
    auditAction(req, "admin.logout");
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: getErrorMessage(err, "Logout failed") });
      }
      res.json({ success: true });
    });
  });
  
  // Check staff status + permissions
  app.get("/api/admin/me", (req: Request, res: Response) => {
    const role = getStaffRole(req);
    const permissions = permsForRole(role);
    return res.json({
      isStaff: Boolean(role),
      role,
      permissions,
      // Back-compat
      isAdmin: role === "owner" || role === "admin",
    });
  });
  
  // Basic uptime endpoint (for monitors)
  app.get("/api/uptime", async (req: Request, res: Response) => {
    try {
      const tel = (req.app as any).locals.telemetry || {};
      const startedAt = typeof tel.startedAt === "number" ? tel.startedAt : Date.now();
      const uptimeMs = Date.now() - startedAt;
      res.json({
        ok: true,
        uptimeMs,
        startedAt: new Date(startedAt).toISOString(),
        requests: tel.requests ?? null,
        apiRequests: tel.apiRequests ?? null,
        errors: tel.errors ?? null,
        lastErrorPath: tel.lastErrorPath ?? null,
        lastErrorAt: tel.lastErrorAt ?? null,
        version: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || null,
      });
    } catch {
      res.status(500).json({ ok: false });
    }
  });

// ============ CASINOS ============
  
  // Get all active casinos
  app.get("/api/casinos", async (req: Request, res: Response) => {
    try {
      setPublicCache(res, 60);
      const casinos = await storage.getCasinos();
      res.json(casinos);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch casinos") });
    }
  });

app.get("/api/admin/audit", adminAuth, async (req: Request, res: Response) => {
  try {
    const q = String(req.query?.q || "").trim();
    const limit = Number(req.query?.limit || 200);
    const offset = Number(req.query?.offset || 0);
    const rows = await storage.listAdminAuditLogs({ q, limit, offset });
    return res.json(rows);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Failed to load audit log" });
  }
});


  // Get single casino
  app.get("/api/casinos/:id", async (req: Request, res: Response) => {
    try {
      setPublicCache(res, 60);
      const id = parseInt(req.params.id);
      const casino = await storage.getCasino(id);
      if (!casino) {
        return res.status(404).json({ error: "Casino not found" });
      }
      res.json(casino);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch casino") });
    }
  });

  // Get all casinos including inactive (admin only)
  app.get("/api/admin/casinos", adminAuth, async (req: Request, res: Response) => {
    try {
      const casinos = await storage.getAllCasinos();
      res.json(casinos);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch casinos") });
    }
  });

  // Create casino (admin only)
  app.post("/api/admin/casinos", adminAuth, async (req: Request, res: Response) => {
    try {
      const parsed = insertCasinoSchema.parse(req.body);
      const data = {
        ...parsed,
        affiliateLink: normalizeHttpUrl(parsed.affiliateLink) || parsed.affiliateLink,
        leaderboardApiUrl: normalizeHttpUrl(parsed.leaderboardApiUrl) || parsed.leaderboardApiUrl,
        // logo can be a public URL or an internal /uploads... path
        logo: normalizeHttpUrl(parsed.logo) || parsed.logo,
      };
      const casino = await storage.createCasino(data);
      auditAction(req, "casino.create", "casino", casino.id, { name: casino.name });
      res.status(201).json(casino);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error, "Failed to create casino") });
    }
  });

  // Update casino (admin only)
  app.patch("/api/admin/casinos/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const parsed = insertCasinoSchema.partial().parse(req.body);
      const data = {
        ...parsed,
        ...(parsed.affiliateLink !== undefined ? { affiliateLink: normalizeHttpUrl(parsed.affiliateLink) || parsed.affiliateLink } : {}),
        ...(parsed.leaderboardApiUrl !== undefined ? { leaderboardApiUrl: normalizeHttpUrl(parsed.leaderboardApiUrl) || parsed.leaderboardApiUrl } : {}),
        ...(parsed.logo !== undefined ? { logo: normalizeHttpUrl(parsed.logo) || parsed.logo } : {}),
      };
      const casino = await storage.updateCasino(id, data);
      if (casino) { auditAction(req, "casino.update", "casino", id, { name: casino.name }); }
      if (!casino) {
        return res.status(404).json({ error: "Casino not found" });
      }
      res.json(casino);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error, "Failed to update casino") });
    }
  });

  // Delete casino (admin only)
  app.delete("/api/admin/casinos/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCasino(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to delete casino") });
    }
  });

  // ============ SITE SETTINGS (CMS) ============
  // Public: minimal settings for buttons/links
  app.get("/api/site/settings", async (_req: Request, res: Response) => {
    try {
      setPublicCache(res, 60);
      const rows = await storage.getSiteSettings();
      const out: Record<string, string> = {};
      for (const r of rows) out[r.key] = r.value;
      res.json(out);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch site settings") });
    }
  });

  // Public: homepage stats (computed + manual adjustments)
  app.get("/api/site/stats", async (_req: Request, res: Response) => {
    try {
      setPublicCache(res, 15);
      const stats = await getPublicStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch site stats") });
    }
  });

  // Admin: list settings as a simple key/value object (matches the client UI expectations)
  const siteSettingsAsRecord = async (_req: Request, res: Response) => {
    try {
      const rows = await storage.getSiteSettings();
      const out: Record<string, string> = {};
      for (const r of rows) out[r.key] = r.value;
      res.json(out);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch site settings") });
    }
  };

  app.get("/api/admin/site/settings", adminAuth, siteSettingsAsRecord);
  // Back-compat alias (older UI used the hyphenated route)
  app.get("/api/admin/site-settings", adminAuth, siteSettingsAsRecord);

  app.post("/api/admin/site/settings", adminAuth, async (req: Request, res: Response) => {
    try {
      const data = insertSiteSettingSchema.parse(req.body);
      const row = await storage.upsertSiteSetting(data);
      res.status(201).json(row);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: getErrorMessage(error, "Failed to upsert site setting") });
    }
  });

  // Back-compat alias for POST
  app.post("/api/admin/site-settings", adminAuth, async (req: Request, res: Response) => {
    try {
      const data = insertSiteSettingSchema.parse(req.body);
      const row = await storage.upsertSiteSetting(data);
      res.status(201).json(row);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: getErrorMessage(error, "Failed to upsert site setting") });
    }
  });

  // Admin: configure homepage stats (manual tweaks / discord sync)
  app.get("/api/admin/site/stats", adminAuth, async (_req: Request, res: Response) => {
    try {
      const out = await getAdminStats();
      res.json(out);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch site stats") });
    }
  });

  const updateSiteStatsSchema = z
    .object({
      communityMode: z.enum(["users", "discord", "manual"]).optional(),
      discordGuildId: z.string().trim().optional().nullable(),
      communityManual: z.coerce.number().int().min(0).optional(),
      communityExtra: z.coerce.number().int().optional(),
      givenAwayExtra: z.coerce.number().optional(),
      winnersExtra: z.coerce.number().int().optional(),
      liveHoursManual: z.coerce.number().int().min(0).optional(),
    })
    .strict();

  app.put("/api/admin/site/stats", adminAuth, async (req: Request, res: Response) => {
    try {
      const body = updateSiteStatsSchema.parse(req.body || {});
      const patch: any = {};
      if (body.communityMode !== undefined) patch.communityMode = body.communityMode;
      if (body.discordGuildId !== undefined) {
        const v = body.discordGuildId === null ? "" : String(body.discordGuildId || "");
        patch.discordGuildId = v.trim() ? v.trim() : null;
      }
      if (body.communityManual !== undefined) patch.communityManual = Number(body.communityManual);
      if (body.communityExtra !== undefined) patch.communityExtra = Number(body.communityExtra);
      if (body.givenAwayExtra !== undefined) {
        const n = Number(body.givenAwayExtra);
        patch.givenAwayExtra = Number.isFinite(n) ? String(n) : "0";
      }
      if (body.winnersExtra !== undefined) patch.winnersExtra = Number(body.winnersExtra);
      if (body.liveHoursManual !== undefined) patch.liveHoursManual = Number(body.liveHoursManual);

      await storage.updateSiteStats(patch);
      clearStatsCache();

      // Audit
      try {
        await storage.createAdminAuditLog({
          action: "site.stats.update",
          entityType: "site_stats",
          entityId: "1",
          details: JSON.stringify(patch),
          actorUserId: (req.session as any)?.userId,
          actorRole: (req.session as any)?.staffRole || ((req.session as any)?.isAdmin ? "admin" : undefined),
          actorLabel: (req.session as any)?.staffLabel,
          ip: getClientIp(req),
          userAgent: String(req.headers["user-agent"] || ""),
        } as any);
      } catch {}

      const out = await getAdminStats();
      res.json(out);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: getErrorMessage(error, "Failed to update site stats") });
    }
  });

  // ============ LEADERBOARDS (per partner) ============
  // Public: list active leaderboards (no secrets)
  app.get("/api/leaderboards/active", async (_req: Request, res: Response) => {
    try {
      setPublicCache(res, 15);
      const lbs = await storage.getActiveLeaderboards();
      // Strip sensitive API config for public responses
      const publicLbs = lbs.map((l) => ({
        id: l.id,
        casinoId: l.casinoId,
        name: l.name,
        periodType: l.periodType,
        durationDays: l.durationDays,
        startAt: l.startAt,
        endAt: l.endAt,
        refreshIntervalSec: l.refreshIntervalSec,
        isActive: l.isActive,
        lastFetchedAt: l.lastFetchedAt,
        lastFetchError: l.lastFetchError,
      }));
      res.json(publicLbs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch leaderboards" });
    }
  });

  app.get("/api/leaderboards/:id/entries", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const limit = req.query.limit ? Math.min(500, Math.max(1, parseInt(String(req.query.limit)))) : 100;
      const entries = await storage.getLeaderboardEntries(id, limit);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch leaderboard entries") });
    }
  });

  // Admin CRUD
  app.get("/api/admin/leaderboards", adminAuth, async (_req: Request, res: Response) => {
    try {
      const lbs = await storage.getLeaderboards(true);
      res.json(lbs);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch leaderboards") });
    }
  });

  app.post("/api/admin/leaderboards", adminAuth, async (req: Request, res: Response) => {
    try {
      const data = insertLeaderboardSchema.parse(req.body);
      const lb = await storage.createLeaderboard(data);
      auditAction(req, "leaderboard.create", "leaderboard", lb.id, { name: lb.name, casinoId: lb.casinoId });
      res.status(201).json(lb);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: getErrorMessage(error, "Failed to create leaderboard") });
    }
  });

  app.patch("/api/admin/leaderboards/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertLeaderboardSchema.partial().parse(req.body);
      const lb = await storage.updateLeaderboard(id, data);
      if (!lb) return res.status(404).json({ error: "Leaderboard not found" });
      res.json(lb);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
      res.status(500).json({ error: getErrorMessage(error, "Failed to update leaderboard") });
    }
  });

  app.delete("/api/admin/leaderboards/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteLeaderboard(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to delete leaderboard") });
    }
  });

  // ============ GIVEAWAYS ============
  // If a giveaway is tied to a casino, we implicitly require that casino to be linked
  // (so selecting a casino in the admin UI can't accidentally create an unenforced giveaway).
  const withImplicitGiveawayRequirements = (giveaway: any, reqs: any[]) => {
    const requirements = Array.isArray(reqs) ? [...reqs] : [];
    const casinoId = giveaway?.casinoId ? Number(giveaway.casinoId) : null;
    if (casinoId) {
      const hasSpecific = requirements.some(
        (r) => r?.type === "linked_account" && Number(r?.casinoId) === casinoId
      );
      if (!hasSpecific) {
        requirements.push({
          id: 0,
          giveawayId: giveaway.id,
          type: "linked_account",
          casinoId,
          value: "linked",
          createdAt: new Date(),
        });
      }
    }
    return requirements;
  };



  const toWinnerSummary = (u: any) => {
    if (!u) return null;
    const discordAvatarUrl = u.discordAvatar && u.discordId
      ? `https://cdn.discordapp.com/avatars/${u.discordId}/${u.discordAvatar}.png`
      : null;
    return {
      id: u.id,
      discordUsername: u.discordUsername,
      discordAvatar: u.discordAvatar,
      discordAvatarUrl,
      kickUsername: u.kickUsername,
      kickVerified: u.kickVerified,
    };
  };

  const isGiveawayActiveNow = (g: any) => {
    try {
      return Boolean(g?.isActive) && new Date(g.endsAt) > new Date();
    } catch {
      return false;
    }
  };
  // Get all giveaways
  app.get("/api/giveaways", async (req: Request, res: Response) => {
    try {
      setPublicCache(res, 10);
      const giveaways = await storage.getGiveaways();
      const userId = (req.session as any)?.userId as string | undefined;

      const winnerIds = giveaways.map((g: any) => g?.winnerId).filter(Boolean) as string[];
      const winnerUsers = winnerIds.length ? await storage.getUsersByIds(winnerIds) : [];
      const winnerMap = new Map(winnerUsers.map((u: any) => [u.id, u]));

      const enteredSet = userId ? new Set(await storage.getUserEnteredGiveawayIds(userId)) : null;

      const giveawayIds = giveaways.map((g: any) => Number(g.id));
      const countsMap = await storage.getGiveawayEntryCounts(giveawayIds);
      const reqsMap = await storage.getGiveawayRequirementsForGiveaways(giveawayIds);

      const giveawaysWithDetails = giveaways.map((g: any) => ({
        ...stripGiveawaySecrets(g),
        entries: Number(countsMap[Number(g.id)] || 0),
        requirements: withImplicitGiveawayRequirements(g, reqsMap[Number(g.id)] || []),
        hasEntered: enteredSet ? enteredSet.has(Number(g.id)) : false,
        winner: g.winnerId ? toWinnerSummary(winnerMap.get(String(g.winnerId))) : null,
      }));

      res.json(giveawaysWithDetails);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch giveaways" });
    }
  });

  // Get active giveaways
  app.get("/api/giveaways/active", async (req: Request, res: Response) => {
    try {
      const giveaways = await storage.getActiveGiveaways();
      const userId = (req.session as any)?.userId as string | undefined;

      const winnerIds = giveaways.map((g: any) => g?.winnerId).filter(Boolean) as string[];
      const winnerUsers = winnerIds.length ? await storage.getUsersByIds(winnerIds) : [];
      const winnerMap = new Map(winnerUsers.map((u: any) => [u.id, u]));

      const enteredSet = userId ? new Set(await storage.getUserEnteredGiveawayIds(userId)) : null;

      const giveawayIds = giveaways.map((g: any) => Number(g.id));
      const countsMap = await storage.getGiveawayEntryCounts(giveawayIds);
      const reqsMap = await storage.getGiveawayRequirementsForGiveaways(giveawayIds);

      const giveawaysWithDetails = giveaways.map((g: any) => ({
        ...stripGiveawaySecrets(g),
        entries: Number(countsMap[Number(g.id)] || 0),
        requirements: withImplicitGiveawayRequirements(g, reqsMap[Number(g.id)] || []),
        hasEntered: enteredSet ? enteredSet.has(Number(g.id)) : false,
        winner: g.winnerId ? toWinnerSummary(winnerMap.get(String(g.winnerId))) : null,
      }));

      res.json(giveawaysWithDetails);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch active giveaways" });
    }
  });


  // Recent giveaway winners (public)
  app.get("/api/giveaways/winners", async (req: Request, res: Response) => {
    try {
      const limit = Number((req.query as any)?.limit || 6);
      const rows = await storage.getRecentGiveawayWinners(limit);
      const payload = rows.map(({ giveaway, winner, casino }) => ({
        ...stripGiveawaySecrets(giveaway),
        casino: casino ? { id: casino.id, name: casino.name, slug: casino.slug, logo: (casino as any).logo || null } : null,
        winner: toWinnerSummary(winner),
      }));
      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error, "Failed to fetch winners") });
    }
  });

  // Get single giveaway
  app.get("/api/giveaways/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const giveaway = await storage.getGiveaway(id);
      if (!giveaway) {
        return res.status(404).json({ error: "Giveaway not found" });
      }

      const entries = await storage.getGiveawayEntryCount(id);
      const requirements = withImplicitGiveawayRequirements(giveaway, await storage.getGiveawayRequirements(id));
      const userId = (req.session as any)?.userId as string | undefined;
      const hasEntered = userId ? await storage.hasUserEntered(id, userId) : false;

      const winnerUser = giveaway.winnerId ? await storage.getUser(String(giveaway.winnerId)) : undefined;
      res.json({ ...stripGiveawaySecrets(giveaway), entries, requirements, hasEntered, winner: giveaway.winnerId ? toWinnerSummary(winnerUser) : null });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch giveaway") });
    }
  });


  // Public: provably-fair proof payload (lets anyone reproduce the winner selection)
  app.get("/api/giveaways/:id/proof", async (req: Request, res: Response) => {
    try {
      const giveawayId = parseInt(req.params.id);
      if (!Number.isFinite(giveawayId)) return res.status(400).json({ error: "Invalid id" });

      const giveaway = await storage.getGiveaway(giveawayId);
      if (!giveaway) return res.status(404).json({ error: "Giveaway not found" });

      const entries = await storage.getGiveawayEntries(giveawayId); // ordered by id asc
      const entryIds = entries.map((e: any) => Number(e.id));
      const entryIdsCsv = entryIds.map((id) => String(id)).join(",");
      const entriesHash = sha256Hex(entryIdsCsv);

      const seedCommitHash = (giveaway as any).pfSeedHash || null;
      const revealedSeed = (giveaway as any).winnerSeed || null;

      let computed: any = null;
      let ok = false;
      if (revealedSeed && entryIds.length > 0) {
        const pickHash = sha256Hex(`${revealedSeed}|${giveawayId}|${entryIdsCsv}`);
        const winnerIndex = Number(BigInt("0x" + pickHash) % BigInt(entryIds.length));
        const winnerEntry = entries[winnerIndex];
        computed = { pickHash, winnerIndex, winnerEntryId: winnerEntry?.id || null, winnerUserId: winnerEntry?.userId || null };
        ok = Boolean((giveaway as any).winnerId) && String((giveaway as any).winnerId) === String(computed.winnerUserId);
      }

      const winnerUser = (giveaway as any).winnerId ? await storage.getUser(String((giveaway as any).winnerId)) : null;
      return res.json({
        giveawayId,
        title: giveaway.title,
        endsAt: giveaway.endsAt,
        entryCount: entryIds.length,
        entryIds,
        entriesHash,
        seedCommitHash,
        revealedSeed,
        stored: {
          pfEntriesHash: (giveaway as any).pfEntriesHash || null,
          pfWinnerIndex: (giveaway as any).pfWinnerIndex ?? null,
          pfWinnerEntryId: (giveaway as any).pfWinnerEntryId ?? null,
          winnerId: (giveaway as any).winnerId || null,
        },
        computed,
        ok,
        winner: winnerUser ? toWinnerSummary(winnerUser) : null,
      });
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error, "Failed to build proof") });
    }
  });

  // Admin: get all giveaways (current + old) with entry counts, requirements, and winner info
  app.get("/api/admin/giveaways", staffAuth, async (req: Request, res: Response) => {
    try {
      const status = String((req.query as any)?.status || "all").toLowerCase(); // all|active|ended
      const all = await storage.getGiveaways();
      const now = new Date();
      const filtered = all.filter((g: any) => {
        const active = Boolean(g?.isActive) && new Date(g.endsAt) > now;
        if (status === "active") return active;
        if (status === "ended") return !active;
        return true;
      });

      const winnerIds = filtered.map((g: any) => g?.winnerId).filter(Boolean) as string[];
      const winnerUsers = winnerIds.length ? await storage.getUsersByIds(winnerIds) : [];
      const winnerMap = new Map(winnerUsers.map((u: any) => [u.id, u]));

      const out = await Promise.all(
        filtered.map(async (g: any) => ({
          ...stripGiveawaySecrets(g),
          entries: await storage.getGiveawayEntryCount(g.id),
          requirements: withImplicitGiveawayRequirements(g, await storage.getGiveawayRequirements(g.id)),
          winner: g.winnerId ? toWinnerSummary(winnerMap.get(String(g.winnerId))) : null,
        }))
      );

      res.json(out);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch giveaways") });
    }
  });

  // Admin: giveaway entry log (who entered + when)
  app.get("/api/admin/giveaways/:id/entries", staffAuth, async (req: Request, res: Response) => {
    try {
      const giveawayId = parseInt(req.params.id);
      if (!Number.isFinite(giveawayId)) return res.status(400).json({ error: "Invalid id" });

      const giveaway = await storage.getGiveaway(giveawayId);
      if (!giveaway) return res.status(404).json({ error: "Giveaway not found" });

      const rows = await storage.getGiveawayEntriesWithUsers(giveawayId);
      const entries = rows.map((e: any) => ({
        id: e.id,
        giveawayId: e.giveawayId,
        userId: e.userId,
        createdAt: e.createdAt,
        user: toWinnerSummary(e.user),
      }));

      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch giveaway entries") });
    }
  });

  // Staff: end a giveaway early (immediately sets endsAt=now)
  app.post("/api/admin/giveaways/:id/end", staffAuth, async (req: Request, res: Response) => {
    try {
      const role = getStaffRole(req);
      const permissions = permsForRole(role);
      if (!permissions.canEndGiveaways) return res.status(403).json({ error: "Forbidden" });

      const giveawayId = parseInt(req.params.id);
      if (!Number.isFinite(giveawayId)) return res.status(400).json({ error: "Invalid id" });

      const giveaway = await storage.getGiveaway(giveawayId);
      if (!giveaway) return res.status(404).json({ error: "Giveaway not found" });

      const now = new Date();
      const updated = await storage.updateGiveaway(giveawayId, { isActive: false, endsAt: now } as any);
      await auditAction(req, "giveaway.end", "giveaway", giveawayId, { title: giveaway.title });
      return res.json(stripGiveawaySecrets(updated || { ...giveaway, isActive: false, endsAt: now }));
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error, "Failed to end giveaway") });
    }
  });

  // Staff: pick and lock a winner (provably-fair, deterministic from seed) for an ended giveaway
  app.post("/api/admin/giveaways/:id/pick-winner", staffAuth, async (req: Request, res: Response) => {
    try {
      const role = getStaffRole(req);
      const permissions = permsForRole(role);
      if (!permissions.canPickWinners) return res.status(403).json({ error: "Forbidden" });

      const giveawayId = parseInt(req.params.id);
      if (!Number.isFinite(giveawayId)) return res.status(400).json({ error: "Invalid id" });

      const giveaway = await storage.getGiveaway(giveawayId);
      if (!giveaway) return res.status(404).json({ error: "Giveaway not found" });

      const force = Boolean((req.body as any)?.force) || String((req.query as any)?.force || "") === "1";
      if (force && role !== "owner" && role !== "admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const now = new Date();
      const endsAt = new Date(giveaway.endsAt);
      if (!(endsAt.getTime() <= now.getTime())) {
        return res.status(400).json({ error: "Giveaway has not ended yet" });
      }

      if (giveaway.winnerId && !force) {
        const winnerUser = await storage.getUser(String(giveaway.winnerId));
        return res.json({
          giveaway: { ...stripGiveawaySecrets(giveaway), winner: giveaway.winnerId ? toWinnerSummary(winnerUser) : null },
          winnerId: giveaway.winnerId,
          winner: giveaway.winnerId ? toWinnerSummary(winnerUser) : null,
          alreadyPicked: true,
        });
      }

      const entries = await storage.getGiveawayEntries(giveawayId); // ordered by id asc (storage enforces)
      if (!entries.length) {
        return res.status(400).json({ error: "No entries to pick from" });
      }

      // Use a committed secret seed (pfSeed). For new giveaways we commit at creation.
      // For legacy giveaways (missing commit), we commit on first pick; this is still auditable but not as strong.
      const priorPfSeed = String((giveaway as any).pfSeed || "");
      const priorPfSeedHash = String((giveaway as any).pfSeedHash || "");
      const generatedNewSeed = force || !priorPfSeed || !priorPfSeedHash;
      const pfSeed = generatedNewSeed ? crypto.randomBytes(32).toString("hex") : priorPfSeed;
      const pfSeedHash = generatedNewSeed ? sha256Hex(pfSeed) : priorPfSeedHash;

      // Deterministic snapshot of entry IDs (ordered)
      const entryIdsCsv = entries.map((e: any) => String(e.id)).join(",");
      const entriesHash = sha256Hex(entryIdsCsv);

      // Deterministic winner index derived from (seed | giveawayId | entryIdsCsv)
      const hashHex = sha256Hex(`${pfSeed}|${giveawayId}|${entryIdsCsv}`);
      const idx = Number(BigInt("0x" + hashHex) % BigInt(entries.length));
      const winnerEntry = entries[idx];
      const winnerId = winnerEntry.userId;

      const actor = getStaffLabel(req) || getAuthedUserId(req) || (role === "owner" ? "Owner" : String(role));
      const updated = await storage.updateGiveaway(giveawayId, {
        winnerId,
        isActive: false,
        winnerPickedAt: now,
        winnerPickedBy: actor,

        // reveal seed after winner is picked
        winnerSeed: pfSeed,

        // provably-fair metadata
        pfSeed,
        pfSeedHash,
        pfEntriesHash: entriesHash,
        pfWinnerEntryId: winnerEntry.id,
        pfWinnerIndex: idx,
      } as any);
      const winnerUser = await storage.getUser(String(winnerId));

      await auditAction(req, "giveaway.pick_winner", "giveaway", giveawayId, {
        title: giveaway.title,
        winnerId,
        entries: entries.length,
        forced: force,
        seedCommitHash: pfSeedHash,
        entriesHash,
        winnerIndex: idx,
        winnerEntryId: winnerEntry.id,
        pickHash: hashHex,
        committedNow: generatedNewSeed && (!priorPfSeed || !priorPfSeedHash) && !force,
      });

      return res.json({
        giveaway: updated
          ? { ...stripGiveawaySecrets(updated), winner: toWinnerSummary(winnerUser) }
          : { ...stripGiveawaySecrets(giveaway), winnerId, winner: toWinnerSummary(winnerUser) },
        winnerId,
        winner: toWinnerSummary(winnerUser),
        alreadyPicked: false,
      });

    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to pick winner") });
    }
  });

  // Create giveaway (admin only)
  app.post("/api/admin/giveaways", adminAuth, async (req: Request, res: Response) => {
    try {
      const { requirements, ...giveawayDataRaw } = req.body;
      const giveawayData: any = { ...giveawayDataRaw };

      // The client sends timestamps as ISO strings. Coerce to Date for schema validation.
      if (typeof giveawayData.endsAt === "string") giveawayData.endsAt = new Date(giveawayData.endsAt);
      if (giveawayData.endsAt instanceof Date && Number.isNaN(giveawayData.endsAt.getTime())) {
        return res.status(400).json({ error: [{ path: ["endsAt"], message: "Invalid date" }] });
      }
      if (typeof giveawayData.maxEntries === "string") {
        const n = Number(giveawayData.maxEntries);
        giveawayData.maxEntries = Number.isFinite(n) ? n : null;
      }

      // Provably-fair seed commitment: we generate a secret seed now and only reveal it after the giveaway ends.
      // Users can see pfSeedHash immediately (commitment), and later verify once winnerSeed is revealed.
      const pfSeed = crypto.randomBytes(32).toString("hex");
      const pfSeedHash = sha256Hex(pfSeed);
      const data = insertGiveawaySchema.parse({ ...giveawayData, pfSeed, pfSeedHash });
      const giveaway = await storage.createGiveaway(data);
      auditAction(req, "giveaway.create", "giveaway", giveaway.id, { title: giveaway.title, casinoId: giveaway.casinoId });
      
      if (requirements && Array.isArray(requirements)) {
        await storage.setGiveawayRequirements(giveaway.id, requirements);
      }
      
      const reqs = withImplicitGiveawayRequirements(giveaway, await storage.getGiveawayRequirements(giveaway.id));
      res.status(201).json({ ...stripGiveawaySecrets(giveaway), requirements: reqs });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error, "Failed to create giveaway") });
    }
  });

  // Update giveaway (admin only)
  app.patch("/api/admin/giveaways/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { requirements, ...giveawayDataRaw } = req.body;
      const giveawayData: any = { ...giveawayDataRaw };

      if (typeof giveawayData.endsAt === "string") giveawayData.endsAt = new Date(giveawayData.endsAt);
      if (giveawayData.endsAt instanceof Date && Number.isNaN(giveawayData.endsAt.getTime())) {
        return res.status(400).json({ error: [{ path: ["endsAt"], message: "Invalid date" }] });
      }
      if (typeof giveawayData.maxEntries === "string") {
        const n = Number(giveawayData.maxEntries);
        giveawayData.maxEntries = Number.isFinite(n) ? n : null;
      }


      // Do not allow editing any provably-fair or winner-determinant fields from the client.
      delete giveawayData.pfSeed;
      delete giveawayData.pfSeedHash;
      delete giveawayData.pfEntriesHash;
      delete giveawayData.pfWinnerEntryId;
      delete giveawayData.pfWinnerIndex;
      delete giveawayData.winnerSeed;

      const data = insertGiveawaySchema.partial().parse(giveawayData);
      const giveaway = await storage.updateGiveaway(id, data);
      if (giveaway) { auditAction(req, "giveaway.update", "giveaway", id, { title: giveaway.title, casinoId: giveaway.casinoId }); }
      if (!giveaway) {
        return res.status(404).json({ error: "Giveaway not found" });
      }
      
      if (requirements !== undefined && Array.isArray(requirements)) {
        await storage.setGiveawayRequirements(id, requirements);
      }
      
      const reqs = withImplicitGiveawayRequirements(giveaway, await storage.getGiveawayRequirements(id));
      res.json({ ...stripGiveawaySecrets(giveaway), requirements: reqs });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error, "Failed to update giveaway") });
    }
  });

  // Delete giveaway (admin only)
  app.delete("/api/admin/giveaways/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGiveaway(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to delete giveaway") });
    }
  });

  // Enter giveaway (requires logged-in user; userId is taken from session)
  app.post("/api/giveaways/:id/enter", requireAuth, async (req: Request, res: Response) => {
    try {
      const giveawayId = parseInt(req.params.id);
      const userId = req.session!.userId!;

      // Check if giveaway exists and is active
      const giveaway = await storage.getGiveaway(giveawayId);
      if (!giveaway) {
        return res.status(404).json({ error: "Giveaway not found" });
      }
      if (!giveaway.isActive || new Date(giveaway.endsAt) < new Date()) {
        return res.status(400).json({ error: "Giveaway is not active" });
      }

      // Check if user already entered
      const hasEntered = await storage.hasUserEntered(giveawayId, userId);
      if (hasEntered) {
        return res.status(400).json({ error: "Already entered this giveaway" });
      }

      // Enforce requirements (supports discord + linked_account; other types are not yet implemented)
      const requirements = withImplicitGiveawayRequirements(
        giveaway,
        await storage.getGiveawayRequirements(giveawayId)
      );

      for (const r of requirements) {
        if (r.type === "discord") {
          // Already satisfied if logged in via Discord (requireAuth)
          continue;
        }

        if (r.type === "linked_account") {
          const accounts = await storage.getUserCasinoAccounts(userId);
          const requiredCasinoId = r.casinoId ? Number(r.casinoId) : null;

          const v = String(r.value || "").trim().toLowerCase();
          const requireVerified = v === "verified" || v === "true" || v === "1" || v === "yes";

          const ok = accounts.some((a) => {
            const casinoOk = requiredCasinoId ? Number(a.casinoId) === requiredCasinoId : true;
            const verifiedOk = requireVerified ? Boolean(a.verified) : true;
            return casinoOk && verifiedOk;
          });

          if (!ok) {
            return res.status(403).json({
              error: requireVerified
                ? "Requirement not met: verified linked casino account"
                : "Requirement not met: linked casino account",
              requirement: {
                type: "linked_account",
                casinoId: requiredCasinoId,
                verified: requireVerified,
              },
            });
          }
          continue;
        }

        if (r.type === "vip") {
          // VIP status not implemented in this codebase
          return res.status(501).json({ error: "Requirement type not implemented: vip" });
        }

        if (r.type === "wager") {
          // Wager checks require external casino integration (not implemented)
          return res.status(501).json({ error: "Requirement type not implemented: wager" });
        }
      }

      // Check max entries
      if (giveaway.maxEntries) {
        const currentEntries = await storage.getGiveawayEntryCount(giveawayId);
        if (currentEntries >= giveaway.maxEntries) {
          return res.status(400).json({ error: "Giveaway is full" });
        }
      }

      const entry = await storage.createGiveawayEntry({ giveawayId, userId });
      res.status(201).json(entry);
    } catch (error) {
      res.status(500).json({ error: "Failed to enter giveaway" });
    }
  });

  // ============ USER PROFILE ============
  
  // Get user profile with accounts and wallets
  app.get("/api/users/:id", requireAuth, requireSelfOrAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const casinoAccounts = await storage.getUserCasinoAccounts(id);
      const walletsRaw = await storage.getUserWallets(id);

      const wallets = (walletsRaw || []).map((w: any) => {
        const hasProof = Boolean(w?.screenshotUrl);
        if (req.session?.isAdmin) {
          return { ...w, screenshotUrl: normalizeWalletProofUrl(w?.screenshotUrl) };
        }
        return { ...w, screenshotUrl: null, hasProof };
      });
      res.json({ ...user, casinoAccounts, wallets });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // Update user profile
  app.patch("/api/users/:id", requireAuth, requireSelfOrAdmin, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const { kickUsername, kickVerified } = req.body;
      const data: any = {};
      if (kickUsername !== undefined) data.kickUsername = kickUsername;
      // Only admins can set kickVerified
      if (kickVerified !== undefined) {
        if (!req.session?.isAdmin) {
          return res.status(403).json({ error: "Forbidden" });
        }
        data.kickVerified = Boolean(kickVerified);
      }
      const user = await storage.updateUser(id, data);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  // Add casino account for user
  app.post("/api/users/:id/casino-accounts", requireAuth, requireSelfOrAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const data = insertUserCasinoAccountSchema.parse({ ...req.body, userId });
      const account = await storage.createUserCasinoAccount(data);
      res.status(201).json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to add casino account" });
    }
  });

  // Update casino account
  app.patch("/api/casino-accounts/:id", requireAuthOrAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

      const existing = await storage.getUserCasinoAccount(id);
      if (!existing) return res.status(404).json({ error: "Casino account not found" });

      const requesterId = getAuthedUserId(req);
      if (!req.session?.isAdmin && (!requesterId || requesterId !== existing.userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const userPatchSchema = z.object({
        username: z.string().min(1).optional(),
        odId: z.string().min(1).optional(),
      });

      const role = getStaffRole(req);
      const isAdminLike = role === "owner" || role === "admin" || Boolean(req.session?.isAdmin);
      const isMod = role === "mod";

      const patch = isAdminLike
        ? insertUserCasinoAccountSchema.partial().parse(req.body)
        : isMod
          ? z.object({ verified: z.boolean() }).parse(req.body)
          : userPatchSchema.parse(req.body);

      // If a non-staff user changes anything, require re-verification
      const data = (isAdminLike || isMod) ? patch : { ...patch, verified: false };

      const account = await storage.updateUserCasinoAccount(id, data);
      if (!account) {
        return res.status(404).json({ error: "Casino account not found" });
      }

      // Audit verification toggles when performed by an admin
      if (req.session?.isAdmin && typeof (patch as any).verified === "boolean" && (patch as any).verified !== (existing as any).verified) {
        auditAction(
          req,
          (patch as any).verified ? "user.casino_account.verify" : "user.casino_account.unverify",
          "user_casino_account",
          id,
          { userId: existing.userId, casinoId: existing.casinoId },
        );
      }

      res.json(account);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update casino account" });
    }
  });

  // Delete casino account
  app.delete("/api/casino-accounts/:id", requireAuthOrAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

      const existing = await storage.getUserCasinoAccount(id);
      if (!existing) return res.status(404).json({ error: "Casino account not found" });

      const requesterId = getAuthedUserId(req);
      if (!req.session?.isAdmin && (!requesterId || requesterId !== existing.userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.deleteUserCasinoAccount(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete casino account" });
    }
  });

  // Add wallet for user
  app.post("/api/users/:id/wallets", requireAuth, requireSelfOrAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const data = insertUserWalletSchema.parse({ ...req.body, userId });

      // For wallet proofs we store the object *key* (e.g. wallets/...) not a URL.
      // Accept legacy /api/files/... values by converting them back to the key.
      let screenshotUrl = (data as any).screenshotUrl as any;
      if (typeof screenshotUrl === "string") {
        const s = screenshotUrl.trim();
        if (s) {
          if (s.startsWith("/api/files/")) {
            screenshotUrl = decodeURIComponent(s.slice("/api/files/".length));
          } else {
            screenshotUrl = s;
          }
          if (!String(screenshotUrl).startsWith("wallets/")) {
            return res.status(400).json({ error: "Invalid wallet proof key" });
          }
        } else {
          screenshotUrl = undefined;
        }
      }

      const wallet = await storage.createUserWallet({ ...(data as any), screenshotUrl });
      res.status(201).json(wallet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to add wallet" });
    }
  });

  // Update wallet
  app.patch("/api/wallets/:id", requireAuthOrAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

      const existing = await storage.getUserWallet(id);
      if (!existing) return res.status(404).json({ error: "Wallet not found" });

      const requesterId = getAuthedUserId(req);
      if (!req.session?.isAdmin && (!requesterId || requesterId !== existing.userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const userPatchSchema = z.object({
        solAddress: z.string().min(1).optional(),
        screenshotUrl: z.string().min(1).optional(),
      });

      const role = getStaffRole(req);
      const isAdminLike = role === "owner" || role === "admin" || Boolean(req.session?.isAdmin);
      const isMod = role === "mod";

      const patch = isAdminLike
        ? insertUserWalletSchema.partial().parse(req.body)
        : isMod
          ? z.object({ verified: z.boolean() }).parse(req.body)
          : userPatchSchema.parse(req.body);

      const data = (isAdminLike || isMod) ? patch : { ...patch, verified: false };
      const wallet = await storage.updateUserWallet(id, data);
      if (!wallet) {
        return res.status(404).json({ error: "Wallet not found" });
      }

      // Audit verification toggles when performed by an admin
      if (req.session?.isAdmin && typeof (patch as any).verified === "boolean" && (patch as any).verified !== (existing as any).verified) {
        auditAction(
          req,
          (patch as any).verified ? "user.wallet.verify" : "user.wallet.unverify",
          "user_wallet",
          id,
          { userId: existing.userId, casinoId: existing.casinoId, solAddress: existing.solAddress },
        );
      }

      res.json(wallet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update wallet" });
    }
  });

  // Delete wallet
  app.delete("/api/wallets/:id", requireAuthOrAdmin, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

      const existing = await storage.getUserWallet(id);
      if (!existing) return res.status(404).json({ error: "Wallet not found" });

      const requesterId = getAuthedUserId(req);
      if (!req.session?.isAdmin && (!requesterId || requesterId !== existing.userId)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      await storage.deleteUserWallet(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete wallet" });
    }
  });

  // ============ LEADERBOARD ============
  
  // Get leaderboard data (pulls from configured APIs)
  app.get("/api/leaderboard/:casinoSlug/:period", async (req: Request, res: Response) => {
    try {
      const { casinoSlug, period } = req.params;
      const casino = await storage.getCasinoBySlug(casinoSlug);
      if (!casino) return res.status(404).json({ error: "Casino not found" });

      // This endpoint returns cached leaderboard entries (fetched server-side) so the site never uses placeholders.
      // Prefer an active leaderboard that matches the requested periodType, otherwise fall back to the most recent.
      const active = (await storage.getActiveLeaderboards()).filter((lb) => lb.casinoId === casino.id);
      const wanted = active.find((lb) => lb.periodType === period) || active[0];
      if (!wanted) {
        return res.json({ casino: casino.name, period, leaderboardId: null, lastFetchedAt: null, entries: [] });
      }

      const entries = await storage.getLeaderboardEntries(wanted.id, 500);
      res.json({
        casino: casino.name,
        period,
        leaderboardId: wanted.id,
        lastFetchedAt: wanted.lastFetchedAt,
        lastFetchError: wanted.lastFetchError,
        entries,
      });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch leaderboard") });
    }
  });

  // ============ ADMIN USER MANAGEMENT ============
  
  // Get all users (admin only)
  app.get("/api/admin/users", staffAuth, async (req: Request, res: Response) => {
    try {
      const search = req.query.search as string | undefined;
      const users = search 
        ? await storage.searchUsers(search)
        : await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch users") });
    }
  });

  // Get user full details (admin only)
  app.get("/api/admin/users/:id", staffAuth, async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const details = await storage.getUserFullDetails(id);
      if (!details) {
        return res.status(404).json({ error: "User not found" });
      }

      const wallets = (details.wallets || []).map((w: any) => ({
        ...w,
        screenshotUrl: normalizeWalletProofUrl((w as any).screenshotUrl),
      }));

      const role = getStaffRole(req);
      const isAdminLike = role === "owner" || role === "admin" || Boolean(req.session?.isAdmin);
      const safe = isAdminLike ? { ...details, wallets } : { ...details, wallets, payments: [], totalPayments: "0" };

      res.json(safe);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch user details") });
    }
  });

  // Add payment for user (admin only)

  // Admin: pending verification queue (casino accounts + wallet proofs)
  app.get("/api/admin/verifications", staffAuth, async (req: Request, res: Response) => {
    try {
      const q = String((req.query as any)?.q || "").trim();
      const limit = Number((req.query as any)?.limit || 200);
      const data = await storage.getPendingVerifications({ q, limit });

      // Normalize private wallet proof URLs for admin viewing
      const wallets = (data.wallets || []).map((w: any) => ({
        ...w,
        screenshotUrl: normalizeWalletProofUrl((w as any).screenshotUrl),
      }));

      return res.json({ ...data, wallets });
    } catch (error) {
      return res.status(500).json({ error: getErrorMessage(error, "Failed to load verifications") });
    }
  });


  // Admin: set user role (user|mod|admin)
  app.patch("/api/admin/users/:id/role", adminAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const schema = z.object({ role: z.enum(["user", "mod", "admin"]) });
      const { role } = schema.parse(req.body);
      const updated = await storage.updateUser(userId, {
        role,
        isAdmin: role === "admin",
      } as any);

      await auditAction(req, "user.role.update", "user", userId, { role });
      res.json({ success: true, user: updated });
    } catch (error) {
      res.status(400).json({ error: getErrorMessage(error, "Failed to update role") });
    }
  });

  app.post("/api/admin/users/:id/payments", adminAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const data = insertUserPaymentSchema.parse({ ...req.body, userId });
      const payment = await storage.createUserPayment(data);
      res.status(201).json(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error, "Failed to add payment") });
    }
  });

  // Get user payments (admin only)
  app.get("/api/admin/users/:id/payments", adminAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.params.id;
      const payments = await storage.getUserPayments(userId);
      const total = await storage.getUserTotalPayments(userId);
      res.json({ payments, total });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch payments") });
    }
  });

  // ============ STREAM EVENTS ============
  
  // Get all stream events (optionally filter by type)
  
// Public stream games (read-only list, enriched with entry counts + user's entry status)
app.get("/api/stream-events", async (req, res) => {
  try {
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const events = await storage.getStreamEvents(type);
    const userId = req.session?.userId;

    const publicEvents = (events || []).filter((e: any) => e.status !== "draft" && e.isPublic !== false);

    const enriched = await Promise.all(
      publicEvents.map(async (e: any) => {
        const entriesCount = await storage.getStreamEventEntryCount(e.id);
        const hasEntered = userId ? Boolean(await storage.getStreamEventEntryForUser(e.id, userId)) : false;
        const isGuess = String(e.type || "").toLowerCase().includes("guess");
        const isOpen = e.status === "open";
        const isFull = typeof e.maxPlayers === "number" && e.maxPlayers > 0 && entriesCount >= e.maxPlayers;
        const canEnter = Boolean(userId) && isOpen && !isGuess && !hasEntered && !isFull;
        return { ...e, entriesCount, hasEntered, canEnter };
      }),
    );

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to fetch stream events" });
  }
});

// User entry endpoint (Discord auth required)
app.post("/api/stream-events/:id/entries", requireAuth, async (req: Request, res: Response) => {
  try {
    const eventId = parseInt(req.params.id);
    const event = await storage.getStreamEvent(eventId);
    if (!event || event.status === "draft" || (event as any).isPublic === false) {
      return res.status(404).json({ error: "Stream event not found" });
    }

    const type = String((event as any).type || "").toLowerCase();
    const isGuess = type.includes("guess");
    if (isGuess) {
      return res.status(501).json({ error: "Guess balance entries are coming soon" });
    }

    if ((event as any).status !== "open") {
      return res.status(400).json({ error: "Event is not open for entries" });
    }

    const userId = req.session!.userId!;
    const existing = await storage.getStreamEventEntryForUser(eventId, userId);
    if (existing) {
      return res.status(409).json({ error: "You already entered this event" });
    }

    const entriesCount = await storage.getStreamEventEntryCount(eventId);
    const maxPlayers = (event as any).maxPlayers;
    if (typeof maxPlayers === "number" && maxPlayers > 0 && entriesCount >= maxPlayers) {
      return res.status(400).json({ error: "Event is full" });
    }

    const user = await storage.getUser(userId);
    const displayName = (user?.discordUsername || user?.kickUsername || "Player").toString();
    const slotChoice = String(req.body?.slotChoice || "").trim();
    if (!slotChoice) {
      return res.status(400).json({ error: "Slot is required" });
    }

    const entry = await storage.createStreamEventEntry({
      eventId,
      userId,
      displayName,
      slotChoice,
      status: "pending",
    } as any);

    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: getErrorMessage(error, "Failed to enter event") });
  }
});

app.get("/api/admin/stream-events", adminAuth, async (req: Request, res: Response) => {
    try {
      const type = req.query.type as string | undefined;
      const events = await storage.getStreamEvents(type);
      const eventsWithEntries = await Promise.all(
        events.map(async (e) => ({
          ...e,
          entries: await storage.getStreamEventEntries(e.id),
          brackets: e.type === "tournament" ? await storage.getTournamentBrackets(e.id) : [],
        }))
      );
      res.json(eventsWithEntries);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch stream events") });
    }
  });

  // Get single stream event with all details
  app.get("/api/admin/stream-events/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getStreamEvent(id);
      if (!event) {
        return res.status(404).json({ error: "Stream event not found" });
      }
      const entries = await storage.getStreamEventEntries(id);
      const brackets = event.type === "tournament" ? await storage.getTournamentBrackets(id) : [];
      res.json({ ...event, entries, brackets });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to fetch stream event") });
    }
  });

  // Create stream event
  app.post("/api/admin/stream-events", adminAuth, async (req: Request, res: Response) => {
    try {
      const data = insertStreamEventSchema.parse(req.body);
      const seed = crypto.randomBytes(16).toString("hex");
      const event = await storage.createStreamEvent({ ...data, seed });
      auditAction(req, "stream_event.create", "stream_event", event.id, { title: event.title });
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error, "Failed to create stream event") });
    }
  });

  // Update stream event
  app.patch("/api/admin/stream-events/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const data = insertStreamEventSchema.partial().parse(req.body);
      const event = await storage.updateStreamEvent(id, data);
      if (event) { auditAction(req, "stream_event.update", "stream_event", id, { title: event.title }); }
      if (!event) {
        return res.status(404).json({ error: "Stream event not found" });
      }
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error, "Failed to update stream event") });
    }
  });

  // Delete stream event
  app.delete("/api/admin/stream-events/:id", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteStreamEvent(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to delete stream event") });
    }
  });

  // Add entry to stream event
  app.post("/api/admin/stream-events/:id/entries", adminAuth, async (req: Request, res: Response) => {
    try {
      const eventId = parseInt(req.params.id);
      const event = await storage.getStreamEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Stream event not found" });
      }
      if (event.status !== "open") {
        return res.status(400).json({ error: "Event is not open for entries" });
      }
      const data = insertStreamEventEntrySchema.parse({ ...req.body, eventId });
      const entry = await storage.createStreamEventEntry(data);
      res.status(201).json(entry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: getErrorMessage(error, "Failed to add entry") });
    }
  });

  // Delete entry from stream event
  app.delete("/api/admin/stream-events/:eventId/entries/:entryId", adminAuth, async (req: Request, res: Response) => {
    try {
      const entryId = parseInt(req.params.entryId);
      await storage.deleteStreamEventEntry(entryId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to delete entry") });
    }
  });

  // Close entries and randomize players for tournament
  app.post("/api/admin/stream-events/:id/lock", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getStreamEvent(id);
      if (!event) {
        return res.status(404).json({ error: "Stream event not found" });
      }
      if (event.status !== "open") {
        return res.status(400).json({ error: "Event must be open to lock entries" });
      }
      
      const entries = await storage.getStreamEventEntries(id);

      const shuffle = <T,>(arr: T[]): T[] => {
        // Fisher-Yates shuffle using crypto RNG
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
          const j = crypto.randomInt(0, i + 1);
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      };
      
      if (event.type === "tournament") {
        const maxPlayers = event.maxPlayers || 8;
        
        // Shuffle entries using crypto RNG
        const shuffled = shuffle(entries);
        const selected = shuffled.slice(0, maxPlayers);
        
        // Mark selected players
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const isSelected = selected.some(s => s.id === entry.id);
          await storage.updateStreamEventEntry(entry.id, {
            status: isSelected ? "selected" : "eliminated",
            seed: isSelected ? selected.findIndex(s => s.id === entry.id) : null,
          });
        }
        
        // Generate bracket
        await storage.clearTournamentBrackets(id);
        const numPlayers = selected.length;
        const numRounds = Math.ceil(Math.log2(numPlayers));
        
        // First round matches
        const shuffledSelected = shuffle(selected);
        for (let i = 0; i < Math.ceil(numPlayers / 2); i++) {
          const playerA = shuffledSelected[i * 2];
          const playerB = shuffledSelected[i * 2 + 1] || null;
          await storage.createTournamentBracket({
            eventId: id,
            round: 1,
            matchIndex: i,
            playerAId: playerA.id,
            playerBId: playerB?.id || null,
            winnerId: playerB ? null : playerA.id, // Bye
            status: playerB ? "scheduled" : "resolved",
          });
        }
        
        // Create empty brackets for subsequent rounds
        for (let round = 2; round <= numRounds; round++) {
          const matchesInRound = Math.ceil(numPlayers / Math.pow(2, round));
          for (let i = 0; i < matchesInRound; i++) {
            await storage.createTournamentBracket({
              eventId: id,
              round,
              matchIndex: i,
              playerAId: null,
              playerBId: null,
              winnerId: null,
              status: "scheduled",
            });
          }
        }
      } else if (event.type === "bonus_hunt") {
        // For bonus hunt, mark all as waiting and pick first random entry
        for (const entry of entries) {
          await storage.updateStreamEventEntry(entry.id, { status: "waiting" });
        }
        
        if (entries.length > 0) {
          const randomIndex = crypto.randomInt(0, entries.length);
          await storage.updateStreamEventEntry(entries[randomIndex].id, { status: "current" });
          await storage.updateStreamEvent(id, { currentEntryId: entries[randomIndex].id });
        }
      }
      
      const updated = await storage.updateStreamEvent(id, { status: "locked" });
      const updatedEntries = await storage.getStreamEventEntries(id);
      const brackets = event.type === "tournament" ? await storage.getTournamentBrackets(id) : [];
      
      res.json({ ...updated, entries: updatedEntries, brackets });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: getErrorMessage(error, "Failed to lock event") });
    }
  });

  // Start event (set to in_progress)
  app.post("/api/admin/stream-events/:id/start", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getStreamEvent(id);
      if (!event) {
        return res.status(404).json({ error: "Stream event not found" });
      }
      if (event.status !== "locked") {
        return res.status(400).json({ error: "Event must be locked before starting" });
      }
      
      const updated = await storage.updateStreamEvent(id, { status: "in_progress" });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to start event") });
    }
  });

  // Complete event
  app.post("/api/admin/stream-events/:id/complete", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updated = await storage.updateStreamEvent(id, { status: "completed" });
      if (!updated) {
        return res.status(404).json({ error: "Stream event not found" });
      }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to complete event") });
    }
  });

  // Update tournament bracket match result
  app.patch("/api/admin/stream-events/:eventId/brackets/:bracketId", adminAuth, async (req: Request, res: Response) => {
    try {
      const bracketId = parseInt(req.params.bracketId);
      const { winnerId } = req.body;
      
      const bracket = await storage.updateTournamentBracket(bracketId, {
        winnerId,
        status: "resolved",
      });
      
      if (!bracket) {
        return res.status(404).json({ error: "Bracket not found" });
      }
      
      // Advance winner to next round
      const allBrackets = await storage.getTournamentBrackets(bracket.eventId);
      const nextRoundBrackets = allBrackets.filter(b => b.round === bracket.round + 1);
      
      if (nextRoundBrackets.length > 0) {
        const nextMatchIndex = Math.floor(bracket.matchIndex / 2);
        const nextMatch = nextRoundBrackets.find(b => b.matchIndex === nextMatchIndex);
        
        if (nextMatch) {
          const isFirstSlot = bracket.matchIndex % 2 === 0;
          await storage.updateTournamentBracket(nextMatch.id, {
            [isFirstSlot ? "playerAId" : "playerBId"]: winnerId,
          });
        }
      }
      
      res.json(bracket);
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to update bracket") });
    }
  });

  // Bonus Hunt: Mark current slot as bonused
  app.post("/api/admin/stream-events/:id/bonus/bonused", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getStreamEvent(id);
      if (!event || event.type !== "bonus_hunt") {
        return res.status(404).json({ error: "Bonus hunt not found" });
      }
      
      if (event.currentEntryId) {
        await storage.updateStreamEventEntry(event.currentEntryId, { status: "bonused" });
      }
      
      // Pick next random waiting entry
      const entries = await storage.getStreamEventEntries(id);
      const waiting = entries.filter(e => e.status === "waiting");
      
      if (waiting.length > 0) {
        const randomIndex = crypto.randomInt(0, waiting.length);
        await storage.updateStreamEventEntry(waiting[randomIndex].id, { status: "current" });
        await storage.updateStreamEvent(id, { currentEntryId: waiting[randomIndex].id });
      } else {
        await storage.updateStreamEvent(id, { currentEntryId: null });
      }
      
      const updatedEvent = await storage.getStreamEvent(id);
      const updatedEntries = await storage.getStreamEventEntries(id);
      res.json({ ...updatedEvent, entries: updatedEntries });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to mark as bonused") });
    }
  });

  // Bonus Hunt: Mark current slot as no bonus (remove)
  app.post("/api/admin/stream-events/:id/bonus/no-bonus", adminAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const event = await storage.getStreamEvent(id);
      if (!event || event.type !== "bonus_hunt") {
        return res.status(404).json({ error: "Bonus hunt not found" });
      }
      
      if (event.currentEntryId) {
        await storage.updateStreamEventEntry(event.currentEntryId, { status: "removed" });
      }
      
      // Pick next random waiting entry
      const entries = await storage.getStreamEventEntries(id);
      const waiting = entries.filter(e => e.status === "waiting");
      
      if (waiting.length > 0) {
        const randomIndex = crypto.randomInt(0, waiting.length);
        await storage.updateStreamEventEntry(waiting[randomIndex].id, { status: "current" });
        await storage.updateStreamEvent(id, { currentEntryId: waiting[randomIndex].id });
      } else {
        await storage.updateStreamEvent(id, { currentEntryId: null });
      }
      
      const updatedEvent = await storage.getStreamEvent(id);
      const updatedEntries = await storage.getStreamEventEntries(id);
      res.json({ ...updatedEvent, entries: updatedEntries });
    } catch (error) {
      res.status(500).json({ error: getErrorMessage(error, "Failed to mark as no bonus") });
    }
  });

  // Bonus Hunt: Update payout for bonused entry
  app.patch("/api/admin/stream-events/:eventId/entries/:entryId/payout", adminAuth, async (req: Request, res: Response) => {
    try {
      const entryId = parseInt(req.params.entryId);
      const { payout } = req.body;
      
      const entry = await storage.updateStreamEventEntry(entryId, { payout: payout.toString() });
      if (!entry) {
        return res.status(404).json({ error: "Entry not found" });
      }
      res.json(entry);
    } catch (error) {
      res.status(500).json({ error: "Failed to update payout" });
    }
  });

  return httpServer;
}