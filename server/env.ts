import { z } from "zod";

/**
 * Runtime environment validation.
 *
 * - Keep this minimal to avoid blocking local dev unnecessarily.
 * - Validate the few env vars that must exist for a safe production boot.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),

  DATABASE_URL: z.string().min(1).optional(),

  SESSION_SECRET: z.string().min(16),

  ADMIN_SECRET: z.string().min(8).optional(),

  DISCORD_CLIENT_ID: z.string().min(1).optional(),
  DISCORD_CLIENT_SECRET: z.string().min(1).optional(),
  DISCORD_CALLBACK_URL: z.string().url().optional(),

  UPLOADS_DIR: z.string().min(1).default("uploads"),
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid environment:\n- ${issues.join("\n- ")}`);
  }

  // Require DATABASE_URL in production (DB-backed app).
  if (parsed.data.NODE_ENV === "production" && !parsed.data.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set in production.");
  }

  return parsed.data;
}
