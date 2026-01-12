import express, { type Request, Response, NextFunction } from "express";
import session, { type Store as SessionStore } from "express-session";
import MemoryStore from "memorystore";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import connectPgSimple from "connect-pg-simple";
import { createServer } from "http";
import fs from "fs";
import path from "path";

import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { setupAuth } from "./auth";
import { startLeaderboardJobs } from "./leaderboardJobs";
import { getEnv } from "./env";
import { apiAccessLogMiddleware, log, requestIdMiddleware } from "./logger";
import { pool } from "./db";

const app = express();
const httpServer = createServer(app);

// Behind reverse proxies (Railway, etc.) we must trust proxy for secure cookies.
app.set("trust proxy", 1);
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
  }
}

const MemoryStoreSession = MemoryStore(session);
const PgSessionStore = connectPgSimple(session);

async function ensureSessionTable(pgPool: typeof pool) {
  // connect-pg-simple expects a table named "session"
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL,
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    );
  `);

  // Add primary key only if missing
  await pgPool.query(`
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
  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
  `);
}

// Security + observability
app.use(requestIdMiddleware);
app.use(
  helmet({
    // CSP is app-specific; keep it off by default to avoid breaking SPA assets/HMR.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// Rate limit API calls (static assets + SPA shell are excluded)
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-7",
    legacyHeaders: false,
  }),
);

// Body parsing (capture raw body for potential signature verification)
app.use(
  express.json({
    limit: "1mb",
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));
app.use(apiAccessLogMiddleware);

// Static uploads (wallet screenshots, etc.)
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use(
  "/uploads",
  express.static(uploadsDir, {
    index: false,
    dotfiles: "ignore",
    setHeaders: (res) => {
      // uploaded assets are mutable (replaced/deleted) → do not cache
      res.setHeader("Cache-Control", "no-store");
    },
  }),
);

// Health check (safe even behind auth)
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    uptimeSec: Math.round(process.uptime()),
    env: process.env.NODE_ENV || "development",
  });
});

(async () => {
  const env = getEnv();

  // Initialize session store (Postgres) and self-heal missing tables.
  let store: SessionStore = new MemoryStoreSession({ checkPeriod: 86400000 });

  try {
    await ensureSessionTable(pool);
    log("info", "session_table_ready");
    store = new PgSessionStore({ pool, tableName: "session" });
  } catch (err) {
    log("error", "session_store_init_failed_falling_back_to_memory", { err: String(err) });
    store = new MemoryStoreSession({ checkPeriod: 86400000 });
  }

  app.use(
    session({
      name: "sid",
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store,
      rolling: true,
      cookie: {
        secure: env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    }),
  );

  // Passport strategies + session integration
  setupAuth(app);

  await registerRoutes(httpServer, app);

  // Best-effort background refresh for partner leaderboards.
  const stopLeaderboardJobs = startLeaderboardJobs();

  // API 404 (keep SPA fallback for non-API routes)
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not Found", requestId: res.locals.requestId });
  });

  // Central error handler (avoid leaking internals in production)
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const requestId = res.locals.requestId;

    const safeMessage =
      status >= 500 && env.NODE_ENV === "production"
        ? "Internal Server Error"
        : (err?.message as string) || "Internal Server Error";

    log("error", "request_error", {
      requestId,
      status,
      message: err?.message,
      stack: env.NODE_ENV === "production" ? undefined : err?.stack,
    });

    res.status(status).json({ error: safeMessage, requestId });
  });

  // Serve the client
  if (env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // IMPORTANT: serve on PORT (platform routing) — default 5000
  httpServer.listen(
    {
      port: env.PORT,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log("info", "server_listening", { port: env.PORT });
    },
  );

  const shutdown = async (signal: string) => {
    log("info", "shutdown_start", { signal });
    stopLeaderboardJobs();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

    try {
      await pool.end();
    } catch (e) {
      log("warn", "db_pool_close_failed", { err: String(e) });
    }
    log("info", "shutdown_complete");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    log("error", "unhandledRejection", { reason: String(reason) });
  });

  process.on("uncaughtException", (error) => {
    log("error", "uncaughtException", { error: String(error) });
  });
})();
