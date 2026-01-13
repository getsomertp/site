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

const app = express();
const httpServer = createServer(app);

// Behind reverse proxies (Railway, etc.) we must trust proxy for secure cookies.
app.set("trust proxy", 1);

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

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
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

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
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
