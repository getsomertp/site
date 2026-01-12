import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

type LogLevel = "debug" | "info" | "warn" | "error";

function isProd() {
  return process.env.NODE_ENV === "production";
}

export function log(level: LogLevel, message: string, ctx: Record<string, unknown> = {}) {
  if (isProd()) {
    // JSON logs are friendlier to most production log drains.
    const payload = {
      level,
      time: new Date().toISOString(),
      message,
      ...ctx,
    };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(payload));
    return;
  }

  const ts = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  // eslint-disable-next-line no-console
  console.log(`[${ts}] [${level}] ${message}`, Object.keys(ctx).length ? ctx : "");
}

/**
 * Adds an `X-Request-Id` header and exposes it via `res.locals.requestId`.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.header("x-request-id");
  const requestId = (header && header.trim()) || crypto.randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
}

export function apiAccessLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) return;
    const durationMs = Date.now() - start;
    log("info", "api_request", {
      requestId: res.locals.requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs,
    });
  });

  next();
}
