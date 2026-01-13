import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, serial, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// NOTE: This app stores some flexible configuration as JSON strings (text columns).
// That keeps partner/API integrations easy to add without constant migrations.

// Valid tier options including "none"
export const CASINO_TIERS = ["platinum", "gold", "silver", "none"] as const;
export type CasinoTier = typeof CASINO_TIERS[number];

// Casinos - Admin managed
export const casinos = pgTable("casinos", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  color: text("color").notNull().default("#7c3aed"),
  tier: text("tier").notNull().default("none"),
  affiliateCode: text("affiliate_code").notNull(),
  affiliateLink: text("affiliate_link").notNull(),
  bonus: text("bonus"),
  rakeback: text("rakeback"),
  features: text("features").array(),
  description: text("description"),
  leaderboardApiUrl: text("leaderboard_api_url"),
  leaderboardApiKey: text("leaderboard_api_key"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const casinosRelations = relations(casinos, ({ many }) => ({
  userAccounts: many(userCasinoAccounts),
  userWallets: many(userWallets),
  giveaways: many(giveaways),
}));

// Users - Discord linked
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  discordId: text("discord_id").unique(),
  discordUsername: text("discord_username"),
  discordAvatar: text("discord_avatar"),
  kickUsername: text("kick_username"),
  kickVerified: boolean("kick_verified").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  casinoAccounts: many(userCasinoAccounts),
  wallets: many(userWallets),
  giveawayEntries: many(giveawayEntries),
  payments: many(userPayments),
}));

// User Payments - track money given to users
export const userPayments = pgTable("user_payments", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  type: text("type").notNull().default("manual"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userPaymentsRelations = relations(userPayments, ({ one }) => ({
  user: one(users, { fields: [userPayments.userId], references: [users.id] }),
}));

// User Casino Accounts - Links user to casino with their username/ID
export const userCasinoAccounts = pgTable("user_casino_accounts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  casinoId: integer("casino_id").notNull().references(() => casinos.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  odId: text("od_id").notNull(),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userCasinoAccountsRelations = relations(userCasinoAccounts, ({ one }) => ({
  user: one(users, { fields: [userCasinoAccounts.userId], references: [users.id] }),
  casino: one(casinos, { fields: [userCasinoAccounts.casinoId], references: [casinos.id] }),
}));

// User SOL Wallets per casino
export const userWallets = pgTable("user_wallets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  casinoId: integer("casino_id").notNull().references(() => casinos.id, { onDelete: "cascade" }),
  solAddress: text("sol_address").notNull(),
  screenshotUrl: text("screenshot_url"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userWalletsRelations = relations(userWallets, ({ one }) => ({
  user: one(users, { fields: [userWallets.userId], references: [users.id] }),
  casino: one(casinos, { fields: [userWallets.casinoId], references: [casinos.id] }),
}));

// Giveaways - can be linked to a specific casino
export const giveaways = pgTable("giveaways", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  prize: text("prize").notNull(),
  maxEntries: integer("max_entries"),
  casinoId: integer("casino_id").references(() => casinos.id, { onDelete: "set null" }),
  endsAt: timestamp("ends_at").notNull(),
  winnerId: varchar("winner_id").references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const giveawaysRelations = relations(giveaways, ({ one, many }) => ({
  casino: one(casinos, { fields: [giveaways.casinoId], references: [casinos.id] }),
  winner: one(users, { fields: [giveaways.winnerId], references: [users.id] }),
  entries: many(giveawayEntries),
  requirements: many(giveawayRequirements),
}));

// Giveaway Requirements - multiple requirements per giveaway
export const giveawayRequirements = pgTable("giveaway_requirements", {
  id: serial("id").primaryKey(),
  giveawayId: integer("giveaway_id").notNull().references(() => giveaways.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  casinoId: integer("casino_id").references(() => casinos.id, { onDelete: "cascade" }),
  value: text("value"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const giveawayRequirementsRelations = relations(giveawayRequirements, ({ one }) => ({
  giveaway: one(giveaways, { fields: [giveawayRequirements.giveawayId], references: [giveaways.id] }),
  casino: one(casinos, { fields: [giveawayRequirements.casinoId], references: [casinos.id] }),
}));

// Giveaway Entries
export const giveawayEntries = pgTable("giveaway_entries", {
  id: serial("id").primaryKey(),
  giveawayId: integer("giveaway_id").notNull().references(() => giveaways.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const giveawayEntriesRelations = relations(giveawayEntries, ({ one }) => ({
  giveaway: one(giveaways, { fields: [giveawayEntries.giveawayId], references: [giveaways.id] }),
  user: one(users, { fields: [giveawayEntries.userId], references: [users.id] }),
}));

// Leaderboard cache
export const leaderboardCache = pgTable("leaderboard_cache", {
  id: serial("id").primaryKey(),
  casinoId: integer("casino_id").notNull().references(() => casinos.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  data: text("data").notNull(),
  fetchedAt: timestamp("fetched_at").defaultNow(),
});

// Site settings (simple CMS controlled from the admin panel)
export const siteSettings = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Partner Leaderboards (configured per-casino and fetched server-side)
// Mapping is stored as JSON string for maximum flexibility.
export const leaderboards = pgTable("leaderboards", {
  id: serial("id").primaryKey(),
  casinoId: integer("casino_id").notNull().references(() => casinos.id, { onDelete: "cascade" }),
  name: text("name").notNull(),

  // Period configuration
  periodType: text("period_type").notNull().default("monthly"), // weekly|biweekly|monthly|custom
  durationDays: integer("duration_days").notNull().default(30),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),

  // Fetch configuration
  apiEndpoint: text("api_endpoint").notNull(),
  apiMethod: text("api_method").notNull().default("GET"),
  apiHeadersJson: text("api_headers_json"),
  apiBodyJson: text("api_body_json"),
  apiQueryJson: text("api_query_json"),

  // Response mapping: { itemsPath, rankField?, usernameField, externalUserIdField?, valueField }
  apiMappingJson: text("api_mapping_json").notNull(),
  refreshIntervalSec: integer("refresh_interval_sec").notNull().default(300),
  isActive: boolean("is_active").notNull().default(true),
  lastFetchedAt: timestamp("last_fetched_at"),
  lastFetchError: text("last_fetch_error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const leaderboardEntries = pgTable("leaderboard_entries", {
  id: serial("id").primaryKey(),
  leaderboardId: integer("leaderboard_id").notNull().references(() => leaderboards.id, { onDelete: "cascade" }),
  rank: integer("rank").notNull(),
  username: text("username").notNull(),
  externalUserId: text("external_user_id"),
  value: numeric("value", { precision: 18, scale: 6 }).notNull().default("0"),
  rawDataJson: text("raw_data_json"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const leaderboardsRelations = relations(leaderboards, ({ one, many }) => ({
  casino: one(casinos, { fields: [leaderboards.casinoId], references: [casinos.id] }),
  entries: many(leaderboardEntries),
}));

export const leaderboardEntriesRelations = relations(leaderboardEntries, ({ one }) => ({
  leaderboard: one(leaderboards, { fields: [leaderboardEntries.leaderboardId], references: [leaderboards.id] }),
}));

// Stream Event Types
export const STREAM_EVENT_TYPES = ["tournament", "bonus_hunt", "guess_balance"] as const;
export type StreamEventType = typeof STREAM_EVENT_TYPES[number];

export const STREAM_EVENT_STATUSES = ["draft", "open", "locked", "in_progress", "completed"] as const;
export type StreamEventStatus = typeof STREAM_EVENT_STATUSES[number];

// Stream Events - Main event table for tournaments, bonus hunts, etc.
export const streamEvents = pgTable("stream_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("draft"),
  maxPlayers: integer("max_players"),
  startingBalance: numeric("starting_balance", { precision: 12, scale: 2 }),
  currentEntryId: integer("current_entry_id"),
  seed: text("seed"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stream Event Entries - Players who entered tournaments or bonus hunts
export const streamEventEntries = pgTable("stream_event_entries", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => streamEvents.id, { onDelete: "cascade" }),
  // Optional linkage to a site user (Discord auth). When present, we can enforce
  // one entry per user per event.
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  displayName: text("display_name").notNull(),
  slotChoice: text("slot_choice").notNull(),
  category: text("category"),
  status: text("status").notNull().default("pending"),
  seed: integer("seed"),
  payout: numeric("payout", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const streamEventEntriesRelations = relations(streamEventEntries, ({ one }) => ({
  event: one(streamEvents, { fields: [streamEventEntries.eventId], references: [streamEvents.id] }),
}));

// Tournament Brackets
export const tournamentBrackets = pgTable("tournament_brackets", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull().references(() => streamEvents.id, { onDelete: "cascade" }),
  round: integer("round").notNull(),
  matchIndex: integer("match_index").notNull(),
  playerAId: integer("player_a_id").references(() => streamEventEntries.id),
  playerBId: integer("player_b_id").references(() => streamEventEntries.id),
  winnerId: integer("winner_id").references(() => streamEventEntries.id),
  status: text("status").notNull().default("scheduled"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tournamentBracketsRelations = relations(tournamentBrackets, ({ one }) => ({
  event: one(streamEvents, { fields: [tournamentBrackets.eventId], references: [streamEvents.id] }),
  playerA: one(streamEventEntries, { fields: [tournamentBrackets.playerAId], references: [streamEventEntries.id] }),
  playerB: one(streamEventEntries, { fields: [tournamentBrackets.playerBId], references: [streamEventEntries.id] }),
  winner: one(streamEventEntries, { fields: [tournamentBrackets.winnerId], references: [streamEventEntries.id] }),
}));

// Insert schemas
export const insertCasinoSchema = createInsertSchema(casinos).omit({ id: true, createdAt: true }).extend({
  tier: z.enum(CASINO_TIERS).default("none"),
});
export const insertUserSchema = createInsertSchema(users).omit({ createdAt: true, updatedAt: true });
export const insertUserCasinoAccountSchema = createInsertSchema(userCasinoAccounts).omit({ id: true, createdAt: true });
export const insertUserWalletSchema = createInsertSchema(userWallets).omit({ id: true, createdAt: true });
export const insertGiveawaySchema = createInsertSchema(giveaways).omit({ id: true, createdAt: true });
export const insertGiveawayEntrySchema = createInsertSchema(giveawayEntries).omit({ id: true, createdAt: true });
export const insertGiveawayRequirementSchema = createInsertSchema(giveawayRequirements).omit({ id: true, createdAt: true });
export const insertUserPaymentSchema = createInsertSchema(userPayments).omit({ id: true, createdAt: true }).extend({
  amount: z.string().min(1),
});
export const insertStreamEventSchema = createInsertSchema(streamEvents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStreamEventEntrySchema = createInsertSchema(streamEventEntries).omit({ id: true, createdAt: true });
export const insertTournamentBracketSchema = createInsertSchema(tournamentBrackets).omit({ id: true, createdAt: true });

export const insertSiteSettingSchema = createInsertSchema(siteSettings).omit({ id: true, updatedAt: true });

export const insertLeaderboardSchema = createInsertSchema(leaderboards).omit({ id: true, createdAt: true, lastFetchedAt: true }).extend({
  periodType: z.enum(["weekly", "biweekly", "monthly", "custom"]).default("monthly"),
  durationDays: z.coerce.number().int().min(1).default(30),
  refreshIntervalSec: z.coerce.number().int().min(30).default(300),
});

export const insertLeaderboardEntrySchema = createInsertSchema(leaderboardEntries).omit({ id: true, updatedAt: true });

// Types
export type Casino = typeof casinos.$inferSelect;
export type InsertCasino = z.infer<typeof insertCasinoSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserCasinoAccount = typeof userCasinoAccounts.$inferSelect;
export type InsertUserCasinoAccount = z.infer<typeof insertUserCasinoAccountSchema>;
export type UserWallet = typeof userWallets.$inferSelect;
export type InsertUserWallet = z.infer<typeof insertUserWalletSchema>;
export type Giveaway = typeof giveaways.$inferSelect;
export type InsertGiveaway = z.infer<typeof insertGiveawaySchema>;
export type GiveawayEntry = typeof giveawayEntries.$inferSelect;
export type InsertGiveawayEntry = z.infer<typeof insertGiveawayEntrySchema>;
export type GiveawayRequirement = typeof giveawayRequirements.$inferSelect;
export type InsertGiveawayRequirement = z.infer<typeof insertGiveawayRequirementSchema>;
export type UserPayment = typeof userPayments.$inferSelect;
export type InsertUserPayment = z.infer<typeof insertUserPaymentSchema>;
export type StreamEvent = typeof streamEvents.$inferSelect;
export type InsertStreamEvent = z.infer<typeof insertStreamEventSchema>;
export type StreamEventEntry = typeof streamEventEntries.$inferSelect;
export type InsertStreamEventEntry = z.infer<typeof insertStreamEventEntrySchema>;
export type TournamentBracket = typeof tournamentBrackets.$inferSelect;
export type InsertTournamentBracket = z.infer<typeof insertTournamentBracketSchema>;

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;

export type Leaderboard = typeof leaderboards.$inferSelect;
export type InsertLeaderboard = z.infer<typeof insertLeaderboardSchema>;
export type LeaderboardEntry = typeof leaderboardEntries.$inferSelect;
export type InsertLeaderboardEntry = z.infer<typeof insertLeaderboardEntrySchema>;
