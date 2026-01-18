import express, { type Request, Response, NextFunction } from "express";
import session, { type Store as SessionStore } from "express-session";
import MemoryStore from "memorystore";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pg from "pg";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { startLeaderboardJobs } from "./leaderboardJobs";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupAuth } from "./auth";
import * as Sentry from "@sentry/node";

const app = express();
const httpServer = createServer(app);
// Basic uptime telemetry (used by /api/uptime)
const telemetry = {
  startedAt: Date.now(),
  requests: 0,
  apiRequests: 0,
  errors: 0,
  lastErrorPath: null as string | null,
  lastErrorAt: null as string | null,
};
(app as any).locals.telemetry = telemetry;



// Optional Sentry (backend). If SENTRY_DSN is not set, this is a no-op.
const sentryEnabled = Boolean(process.env.SENTRY_DSN);
if (sentryEnabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  });
}
// Capture unexpected crashes
process.on("unhandledRejection", (reason: any) => {
  console.error("⚠️ unhandledRejection", reason);
  if (sentryEnabled) {
    try { Sentry.captureException(reason); } catch {}
  }
});
process.on("uncaughtException", (err: any) => {
  console.error("💥 uncaughtException", err);
  if (sentryEnabled) {
    try { Sentry.captureException(err); } catch {}
  }
});



// Behind reverse proxies (Railway, etc.) we must trust proxy for secure cookies.
app.set("trust proxy", 1);

// Reduce fingerprinting / minor hardening
app.disable("x-powered-by");

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    isAdmin?: boolean;
    userId?: string;
    staffRole?: string;
    staffLabel?: string;
  }
}

const MemoryStoreSession = MemoryStore(session);
const PgSessionStore = connectPgSimple(session);

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required");
}

const pgPool = process.env.DATABASE_URL
  ? new pg.Pool({ connectionString: process.env.DATABASE_URL })
  : null;

async function ensureSessionTable(pool: pg.Pool) {
  // Some parts of the schema use gen_random_uuid() (pgcrypto). We try to enable it
  // automatically so first-time deploys don"t break Discord login / user creation.
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    log("✅ pgcrypto extension ready", "db");
  } catch (err) {
    console.error("⚠️ Failed to ensure pgcrypto extension", err);
  }

  // connect-pg-simple expects a table named "session"
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
  `);

  // Add primary key only if missing
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
      ) THEN
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid");
      END IF;
    END $$;
  `);

  // Helpful index for cleanup queries
  await pool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}

// Body parsing
// Admin/login and most APIs send JSON.
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

// Basic security headers
// Note: We intentionally do NOT enable a strict CSP here because the UI loads
// external images (e.g., Discord avatars) and embeds partner links.
app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

// General API rate limit (separate from the stricter admin login limiter)
app.use(
  "/api",
  rateLimit({
    windowMs: 10 * 60_000, // 10 minutes
    limit: 600, // generous for normal usage; protects against obvious abuse
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

// Simple health checks for Railway / load balancers
app.get("/health", (_req, res) => res.status(200).json({ ok: true }));
app.get("/api/health", (_req, res) => res.status(200).json({ ok: true }));

// Basic SEO helpers (robots + sitemap). These are served by the backend so we can
// emit absolute URLs based on the live deployment domain.
function getBaseUrl(req: Request) {
  const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = xfProto || req.protocol || "https";
  const xfHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = xfHost || req.get("host") || "";
  return `${proto}://${host}`;
}

app.get("/robots.txt", (req, res) => {
  const base = getBaseUrl(req);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(["User-agent: *", "Allow: /", `Sitemap: ${base}/sitemap.xml`, ""].join("\n"));
});

app.get("/sitemap.xml", (req, res) => {
  const base = getBaseUrl(req);
  const urls = [
    "/",
    "/partners",
    "/giveaways",
    "/winners",
    "/leaderboard",
    "/stream-games",
    "/affiliates",
    "/profile",
  ];

  const lastmod = new Date().toISOString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((p) => `  <url><loc>${base}${p}</loc><lastmod>${lastmod}</lastmod></url>`).join("\n") +
    `\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(xml);
});

export function log(message: string, source = "express") {
  // In production, emit structured JSON logs (easy to query and debug).
  if ((process.env.NODE_ENV || "development") === "production") {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        source,
        msg: message,
      }),
    );
    return;
  }

  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}


app.use((req, res, next) => {
  telemetry.requests += 1;
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const isApi = path.startsWith("/api");

    if (isApi) telemetry.apiRequests += 1;

    if (res.statusCode >= 500) {
      telemetry.errors += 1;
      telemetry.lastErrorPath = `${req.method} ${path}`;
      telemetry.lastErrorAt = new Date().toISOString();
    }

    if (isApi) {
      log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
    }
  });

  next();
});

(async () => {
// Initialize session store (Postgres in production, memory in dev) and self-heal missing tables.
const sessionStore = (() => {
  const memory = new MemoryStoreSession({ checkPeriod: 86400000 });

  if (!pgPool) return memory;

  // We'll return a placeholder for now; actual init happens below.
  return memory as unknown as SessionStore;
})();

let store: SessionStore = sessionStore;

if (pgPool) {
  try {
    await ensureSessionTable(pgPool);
    log("✅ session table ready", "db");

    store = new PgSessionStore({
      pool: pgPool,
      tableName: "session",
      createTableIfMissing: true,
    });
  } catch (err) {
    console.error("⚠️ Failed to initialize session table/store; falling back to in-memory sessions.", err);
    store = new MemoryStoreSession({ checkPeriod: 86400000 });
  }
}

app.use(
  session({
    // When behind a proxy (Railway), this helps secure cookies behave correctly
    // (Together with app.set('trust proxy', 1) above.)
    proxy: true,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      // Use "auto" in production so cookies still set correctly when HTTPS
      // terminates at the proxy (Railway) and the app sees proxied traffic.
      // Type cast is needed because TS types are boolean-only.
      secure: (process.env.NODE_ENV === "production" ? ("auto" as any) : false),
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  }),
);

  // Passport strategies + session integration
  setupAuth(app);

  await registerRoutes(httpServer, app);

  // Start best-effort background refresh for partner leaderboards.
  startLeaderboardJobs();

  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;

    telemetry.errors += 1;
    telemetry.lastErrorPath = `${req.method} ${req.path}`;
    telemetry.lastErrorAt = new Date().toISOString();

    if (sentryEnabled) {
      try { Sentry.captureException(err); } catch {}
    }

    const message = err.message || "Internal Server Error";
    res.status(status).json({ error: message });

    // Never throw after responding; log instead.
    console.error(err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
