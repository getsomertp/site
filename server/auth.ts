import type { Express, Request } from "express";
import passport from "passport";
import { Strategy as DiscordStrategy, type Profile as DiscordProfile } from "passport-discord";
import { storage } from "./storage";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    isAdmin?: boolean;
  }
}

export function setupAuth(app: Express) {
  // NOTE: We intentionally keep auth optional at boot; if Discord creds are missing,
  // endpoints will return 503 and the rest of the site can still run.
  const clientID = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const callbackURL = process.env.DISCORD_CALLBACK_URL;

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user || null);
    } catch (err) {
      done(err as any);
    }
  });

  if (clientID && clientSecret && callbackURL) {
    passport.use(
      new DiscordStrategy(
        {
          clientID,
          clientSecret,
          callbackURL,
          scope: ["identify"],
        },
        async (_accessToken: string, _refreshToken: string, profile: DiscordProfile, done) => {
          try {
            const discordId = profile.id;
            const discordUsername = `${profile.username}${profile.discriminator && profile.discriminator !== "0" ? `#${profile.discriminator}` : ""}`;
            const discordAvatar = (profile as any).avatar || null;

            const existing = await storage.getUserByDiscordId(discordId);
            const user = existing
              ? (await storage.updateUser(existing.id, { discordUsername, discordAvatar })) || existing
              : await storage.createUser({
                  id: crypto.randomUUID(),
                  discordId,
                  discordUsername,
                  discordAvatar,
                  // kick fields default
                } as any);

            done(null, user);
          } catch (err) {
            console.error("Discord auth error:", err);
            done(err as any);
          }
        },
      ),
    );
  }

  app.use(passport.initialize());
  app.use(passport.session());
}

export function isAuthed(req: Request): boolean {
  return Boolean(req.session?.userId);
}
