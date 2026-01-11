import { 
  users, casinos, userCasinoAccounts, userWallets, giveaways, giveawayEntries, giveawayRequirements, leaderboardCache, userPayments,
  streamEvents, streamEventEntries, tournamentBrackets,
  siteSettings, leaderboards, leaderboardEntries,
  type User, type InsertUser,
  type Casino, type InsertCasino,
  type UserCasinoAccount, type InsertUserCasinoAccount,
  type UserWallet, type InsertUserWallet,
  type Giveaway, type InsertGiveaway,
  type GiveawayEntry, type InsertGiveawayEntry,
  type GiveawayRequirement, type InsertGiveawayRequirement,
  type UserPayment, type InsertUserPayment,
  type StreamEvent, type InsertStreamEvent,
  type StreamEventEntry, type InsertStreamEventEntry,
  type TournamentBracket, type InsertTournamentBracket,
  type SiteSetting, type InsertSiteSetting,
  type Leaderboard, type InsertLeaderboard,
  type LeaderboardEntry, type InsertLeaderboardEntry
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, ilike, or } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByDiscordId(discordId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;
  
  // Casinos
  getCasinos(): Promise<Casino[]>;
  getAllCasinos(): Promise<Casino[]>;
  getCasino(id: number): Promise<Casino | undefined>;
  getCasinoBySlug(slug: string): Promise<Casino | undefined>;
  createCasino(casino: InsertCasino): Promise<Casino>;
  updateCasino(id: number, data: Partial<InsertCasino>): Promise<Casino | undefined>;
  deleteCasino(id: number): Promise<boolean>;

  // Site settings (simple CMS)
  getSiteSettings(): Promise<SiteSetting[]>;
  getSiteSetting(key: string): Promise<SiteSetting | undefined>;
  upsertSiteSetting(setting: InsertSiteSetting): Promise<SiteSetting>;

  // Partner Leaderboards
  getLeaderboards(admin?: boolean): Promise<Leaderboard[]>;
  getActiveLeaderboards(): Promise<Leaderboard[]>;
  getLeaderboard(id: number): Promise<Leaderboard | undefined>;
  createLeaderboard(data: InsertLeaderboard): Promise<Leaderboard>;
  updateLeaderboard(id: number, data: Partial<InsertLeaderboard>): Promise<Leaderboard | undefined>;
  deleteLeaderboard(id: number): Promise<boolean>;

  getLeaderboardEntries(leaderboardId: number, limit?: number): Promise<LeaderboardEntry[]>;
  replaceLeaderboardEntries(leaderboardId: number, entries: InsertLeaderboardEntry[]): Promise<void>;
  
  // User Casino Accounts
  getUserCasinoAccounts(userId: string): Promise<UserCasinoAccount[]>;
  createUserCasinoAccount(account: InsertUserCasinoAccount): Promise<UserCasinoAccount>;
  updateUserCasinoAccount(id: number, data: Partial<InsertUserCasinoAccount>): Promise<UserCasinoAccount | undefined>;
  deleteUserCasinoAccount(id: number): Promise<boolean>;
  
  // User Wallets
  getUserWallets(userId: string): Promise<UserWallet[]>;
  createUserWallet(wallet: InsertUserWallet): Promise<UserWallet>;
  updateUserWallet(id: number, data: Partial<InsertUserWallet>): Promise<UserWallet | undefined>;
  deleteUserWallet(id: number): Promise<boolean>;
  
  // Giveaways
  getGiveaways(): Promise<Giveaway[]>;
  getActiveGiveaways(): Promise<Giveaway[]>;
  getGiveaway(id: number): Promise<Giveaway | undefined>;
  createGiveaway(giveaway: InsertGiveaway): Promise<Giveaway>;
  updateGiveaway(id: number, data: Partial<InsertGiveaway>): Promise<Giveaway | undefined>;
  deleteGiveaway(id: number): Promise<boolean>;
  
  // Giveaway Entries
  getGiveawayEntries(giveawayId: number): Promise<GiveawayEntry[]>;
  getGiveawayEntryCount(giveawayId: number): Promise<number>;
  hasUserEntered(giveawayId: number, userId: string): Promise<boolean>;
  createGiveawayEntry(entry: InsertGiveawayEntry): Promise<GiveawayEntry>;
  
  // Giveaway Requirements
  getGiveawayRequirements(giveawayId: number): Promise<GiveawayRequirement[]>;
  setGiveawayRequirements(giveawayId: number, requirements: Omit<InsertGiveawayRequirement, "giveawayId">[]): Promise<GiveawayRequirement[]>;
  
  // User Payments
  getUserPayments(userId: string): Promise<UserPayment[]>;
  createUserPayment(payment: InsertUserPayment): Promise<UserPayment>;
  getUserTotalPayments(userId: string): Promise<string>;
  
  // Admin User Lookup
  searchUsers(query: string): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  getUserFullDetails(userId: string): Promise<{
    user: User;
    casinoAccounts: (UserCasinoAccount & { casino: Casino })[];
    wallets: (UserWallet & { casino: Casino })[];
    payments: UserPayment[];
    totalPayments: string;
  } | undefined>;
  
  // Stream Events
  getStreamEvents(type?: string): Promise<StreamEvent[]>;
  getStreamEvent(id: number): Promise<StreamEvent | undefined>;
  createStreamEvent(event: InsertStreamEvent): Promise<StreamEvent>;
  updateStreamEvent(id: number, data: Partial<InsertStreamEvent>): Promise<StreamEvent | undefined>;
  deleteStreamEvent(id: number): Promise<boolean>;
  
  // Stream Event Entries
  getStreamEventEntries(eventId: number): Promise<StreamEventEntry[]>;
  getStreamEventEntry(id: number): Promise<StreamEventEntry | undefined>;
  createStreamEventEntry(entry: InsertStreamEventEntry): Promise<StreamEventEntry>;
  updateStreamEventEntry(id: number, data: Partial<InsertStreamEventEntry>): Promise<StreamEventEntry | undefined>;
  deleteStreamEventEntry(id: number): Promise<boolean>;
  
  // Tournament Brackets
  getTournamentBrackets(eventId: number): Promise<TournamentBracket[]>;
  createTournamentBracket(bracket: InsertTournamentBracket): Promise<TournamentBracket>;
  updateTournamentBracket(id: number, data: Partial<InsertTournamentBracket>): Promise<TournamentBracket | undefined>;
  clearTournamentBrackets(eventId: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByDiscordId(discordId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.discordId, discordId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  // Casinos
  async getCasinos(): Promise<Casino[]> {
    return db.select().from(casinos).where(eq(casinos.isActive, true)).orderBy(asc(casinos.sortOrder));
  }

  async getAllCasinos(): Promise<Casino[]> {
    return db.select().from(casinos).orderBy(asc(casinos.sortOrder));
  }

  async getCasino(id: number): Promise<Casino | undefined> {
    const [casino] = await db.select().from(casinos).where(eq(casinos.id, id));
    return casino || undefined;
  }

  async getCasinoBySlug(slug: string): Promise<Casino | undefined> {
    const [casino] = await db.select().from(casinos).where(eq(casinos.slug, slug));
    return casino || undefined;
  }

  async createCasino(insertCasino: InsertCasino): Promise<Casino> {
    const [casino] = await db.insert(casinos).values(insertCasino).returning();
    return casino;
  }

  async updateCasino(id: number, data: Partial<InsertCasino>): Promise<Casino | undefined> {
    const [casino] = await db.update(casinos).set(data).where(eq(casinos.id, id)).returning();
    return casino || undefined;
  }

  async deleteCasino(id: number): Promise<boolean> {
    const result = await db.delete(casinos).where(eq(casinos.id, id));
    return true;
  }

  // Site settings
  async getSiteSettings(): Promise<SiteSetting[]> {
    return db.select().from(siteSettings).orderBy(asc(siteSettings.key));
  }

  async getSiteSetting(key: string): Promise<SiteSetting | undefined> {
    const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
    return row || undefined;
  }

  async upsertSiteSetting(setting: InsertSiteSetting): Promise<SiteSetting> {
    // Postgres upsert via onConflictDoUpdate is available in drizzle's pg dialect.
    const [row] = await db
      .insert(siteSettings)
      .values({ ...setting, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: setting.value, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  // Leaderboards
  async getLeaderboards(admin = false): Promise<Leaderboard[]> {
    // For public use we only return active leaderboards.
    const q = db.select().from(leaderboards).orderBy(desc(leaderboards.createdAt));
    if (admin) return q;
    return db
      .select()
      .from(leaderboards)
      .where(eq(leaderboards.isActive, true))
      .orderBy(desc(leaderboards.createdAt));
  }

  async getActiveLeaderboards(): Promise<Leaderboard[]> {
    return db
      .select()
      .from(leaderboards)
      .where(eq(leaderboards.isActive, true))
      .orderBy(desc(leaderboards.createdAt));
  }

  async getLeaderboard(id: number): Promise<Leaderboard | undefined> {
    const [row] = await db.select().from(leaderboards).where(eq(leaderboards.id, id));
    return row || undefined;
  }

  async createLeaderboard(data: InsertLeaderboard): Promise<Leaderboard> {
    const startAt = new Date(data.startAt);
    const endAt = data.endAt ? new Date(data.endAt) : new Date(startAt.getTime() + (data.durationDays ?? 30) * 24 * 60 * 60 * 1000);
    const [row] = await db
      .insert(leaderboards)
      .values({ ...data, startAt, endAt })
      .returning();
    return row;
  }

  async updateLeaderboard(id: number, data: Partial<InsertLeaderboard>): Promise<Leaderboard | undefined> {
    const patch: any = { ...data };
    if (data.startAt) patch.startAt = new Date(data.startAt);
    if (data.endAt) patch.endAt = new Date(data.endAt);
    const [row] = await db.update(leaderboards).set(patch).where(eq(leaderboards.id, id)).returning();
    return row || undefined;
  }

  async deleteLeaderboard(id: number): Promise<boolean> {
    await db.delete(leaderboards).where(eq(leaderboards.id, id));
    return true;
  }

  async getLeaderboardEntries(leaderboardId: number, limit = 100): Promise<LeaderboardEntry[]> {
    return db
      .select()
      .from(leaderboardEntries)
      .where(eq(leaderboardEntries.leaderboardId, leaderboardId))
      .orderBy(asc(leaderboardEntries.rank))
      .limit(limit);
  }

  async replaceLeaderboardEntries(leaderboardId: number, entries: InsertLeaderboardEntry[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(leaderboardEntries).where(eq(leaderboardEntries.leaderboardId, leaderboardId));
      if (entries.length > 0) {
        await tx.insert(leaderboardEntries).values(
          entries.map((e) => ({ ...e, leaderboardId, updatedAt: new Date() })),
        );
      }
    });
  }

  // User Casino Accounts
  async getUserCasinoAccounts(userId: string): Promise<UserCasinoAccount[]> {
    return db.select().from(userCasinoAccounts).where(eq(userCasinoAccounts.userId, userId));
  }

  async createUserCasinoAccount(account: InsertUserCasinoAccount): Promise<UserCasinoAccount> {
    const [result] = await db.insert(userCasinoAccounts).values(account).returning();
    return result;
  }

  async updateUserCasinoAccount(id: number, data: Partial<InsertUserCasinoAccount>): Promise<UserCasinoAccount | undefined> {
    const [result] = await db.update(userCasinoAccounts).set(data).where(eq(userCasinoAccounts.id, id)).returning();
    return result || undefined;
  }

  async deleteUserCasinoAccount(id: number): Promise<boolean> {
    await db.delete(userCasinoAccounts).where(eq(userCasinoAccounts.id, id));
    return true;
  }

  // User Wallets
  async getUserWallets(userId: string): Promise<UserWallet[]> {
    return db.select().from(userWallets).where(eq(userWallets.userId, userId));
  }

  async createUserWallet(wallet: InsertUserWallet): Promise<UserWallet> {
    const [result] = await db.insert(userWallets).values(wallet).returning();
    return result;
  }

  async updateUserWallet(id: number, data: Partial<InsertUserWallet>): Promise<UserWallet | undefined> {
    const [result] = await db.update(userWallets).set(data).where(eq(userWallets.id, id)).returning();
    return result || undefined;
  }

  async deleteUserWallet(id: number): Promise<boolean> {
    await db.delete(userWallets).where(eq(userWallets.id, id));
    return true;
  }

  // Giveaways
  async getGiveaways(): Promise<Giveaway[]> {
    return db.select().from(giveaways).orderBy(desc(giveaways.createdAt));
  }

  async getActiveGiveaways(): Promise<Giveaway[]> {
    return db.select().from(giveaways)
      .where(and(eq(giveaways.isActive, true), sql`${giveaways.endsAt} > NOW()`))
      .orderBy(asc(giveaways.endsAt));
  }

  async getGiveaway(id: number): Promise<Giveaway | undefined> {
    const [giveaway] = await db.select().from(giveaways).where(eq(giveaways.id, id));
    return giveaway || undefined;
  }

  async createGiveaway(insertGiveaway: InsertGiveaway): Promise<Giveaway> {
    const [giveaway] = await db.insert(giveaways).values(insertGiveaway).returning();
    return giveaway;
  }

  async updateGiveaway(id: number, data: Partial<InsertGiveaway>): Promise<Giveaway | undefined> {
    const [giveaway] = await db.update(giveaways).set(data).where(eq(giveaways.id, id)).returning();
    return giveaway || undefined;
  }

  async deleteGiveaway(id: number): Promise<boolean> {
    await db.delete(giveaways).where(eq(giveaways.id, id));
    return true;
  }

  // Giveaway Entries
  async getGiveawayEntries(giveawayId: number): Promise<GiveawayEntry[]> {
    return db.select().from(giveawayEntries).where(eq(giveawayEntries.giveawayId, giveawayId));
  }

  async getGiveawayEntryCount(giveawayId: number): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(giveawayEntries)
      .where(eq(giveawayEntries.giveawayId, giveawayId));
    return Number(result[0]?.count || 0);
  }

  async hasUserEntered(giveawayId: number, userId: string): Promise<boolean> {
    const [entry] = await db.select().from(giveawayEntries)
      .where(and(eq(giveawayEntries.giveawayId, giveawayId), eq(giveawayEntries.userId, userId)));
    return !!entry;
  }

  async createGiveawayEntry(entry: InsertGiveawayEntry): Promise<GiveawayEntry> {
    const [result] = await db.insert(giveawayEntries).values(entry).returning();
    return result;
  }

  // Giveaway Requirements
  async getGiveawayRequirements(giveawayId: number): Promise<GiveawayRequirement[]> {
    return db.select().from(giveawayRequirements).where(eq(giveawayRequirements.giveawayId, giveawayId));
  }

  async setGiveawayRequirements(giveawayId: number, requirements: Omit<InsertGiveawayRequirement, "giveawayId">[]): Promise<GiveawayRequirement[]> {
    await db.delete(giveawayRequirements).where(eq(giveawayRequirements.giveawayId, giveawayId));
    
    if (requirements.length === 0) return [];
    
    const toInsert = requirements.map(r => ({ ...r, giveawayId }));
    return db.insert(giveawayRequirements).values(toInsert).returning();
  }

  // User Payments
  async getUserPayments(userId: string): Promise<UserPayment[]> {
    return db.select().from(userPayments)
      .where(eq(userPayments.userId, userId))
      .orderBy(desc(userPayments.createdAt));
  }

  async createUserPayment(payment: InsertUserPayment): Promise<UserPayment> {
    const [result] = await db.insert(userPayments).values(payment).returning();
    return result;
  }

  async getUserTotalPayments(userId: string): Promise<string> {
    const result = await db.select({ total: sql<string>`COALESCE(SUM(amount), 0)` })
      .from(userPayments)
      .where(eq(userPayments.userId, userId));
    return result[0]?.total || "0";
  }

  // Admin User Lookup
  async searchUsers(query: string): Promise<User[]> {
    const searchPattern = `%${query}%`;
    return db.select().from(users)
      .where(or(
        ilike(users.discordUsername, searchPattern),
        ilike(users.kickUsername, searchPattern),
        ilike(users.discordId, searchPattern)
      ))
      .orderBy(desc(users.createdAt))
      .limit(50);
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt)).limit(100);
  }

  async getUserFullDetails(userId: string): Promise<{
    user: User;
    casinoAccounts: (UserCasinoAccount & { casino: Casino })[];
    wallets: (UserWallet & { casino: Casino })[];
    payments: UserPayment[];
    totalPayments: string;
  } | undefined> {
    const user = await this.getUser(userId);
    if (!user) return undefined;

    const accounts = await db.select({
      id: userCasinoAccounts.id,
      userId: userCasinoAccounts.userId,
      casinoId: userCasinoAccounts.casinoId,
      username: userCasinoAccounts.username,
      odId: userCasinoAccounts.odId,
      verified: userCasinoAccounts.verified,
      createdAt: userCasinoAccounts.createdAt,
      casino: casinos,
    }).from(userCasinoAccounts)
      .leftJoin(casinos, eq(userCasinoAccounts.casinoId, casinos.id))
      .where(eq(userCasinoAccounts.userId, userId));

    const walletRows = await db.select({
      id: userWallets.id,
      userId: userWallets.userId,
      casinoId: userWallets.casinoId,
      solAddress: userWallets.solAddress,
      screenshotUrl: userWallets.screenshotUrl,
      verified: userWallets.verified,
      createdAt: userWallets.createdAt,
      casino: casinos,
    }).from(userWallets)
      .leftJoin(casinos, eq(userWallets.casinoId, casinos.id))
      .where(eq(userWallets.userId, userId));

    const payments = await this.getUserPayments(userId);
    const totalPayments = await this.getUserTotalPayments(userId);

    return {
      user,
      casinoAccounts: accounts.map(a => ({ ...a, casino: a.casino! })).filter(a => a.casino),
      wallets: walletRows.map(w => ({ ...w, casino: w.casino! })).filter(w => w.casino),
      payments,
      totalPayments,
    };
  }

  // Stream Events
  async getStreamEvents(type?: string): Promise<StreamEvent[]> {
    if (type) {
      return db.select().from(streamEvents).where(eq(streamEvents.type, type)).orderBy(desc(streamEvents.createdAt));
    }
    return db.select().from(streamEvents).orderBy(desc(streamEvents.createdAt));
  }

  async getStreamEvent(id: number): Promise<StreamEvent | undefined> {
    const [event] = await db.select().from(streamEvents).where(eq(streamEvents.id, id));
    return event || undefined;
  }

  async createStreamEvent(event: InsertStreamEvent): Promise<StreamEvent> {
    const [result] = await db.insert(streamEvents).values(event).returning();
    return result;
  }

  async updateStreamEvent(id: number, data: Partial<InsertStreamEvent>): Promise<StreamEvent | undefined> {
    const [result] = await db.update(streamEvents).set({ ...data, updatedAt: new Date() }).where(eq(streamEvents.id, id)).returning();
    return result || undefined;
  }

  async deleteStreamEvent(id: number): Promise<boolean> {
    await db.delete(streamEvents).where(eq(streamEvents.id, id));
    return true;
  }

  // Stream Event Entries
  async getStreamEventEntries(eventId: number): Promise<StreamEventEntry[]> {
    return db.select().from(streamEventEntries).where(eq(streamEventEntries.eventId, eventId)).orderBy(asc(streamEventEntries.createdAt));
  }

  async getStreamEventEntry(id: number): Promise<StreamEventEntry | undefined> {
    const [entry] = await db.select().from(streamEventEntries).where(eq(streamEventEntries.id, id));
    return entry || undefined;
  }

  async createStreamEventEntry(entry: InsertStreamEventEntry): Promise<StreamEventEntry> {
    const [result] = await db.insert(streamEventEntries).values(entry).returning();
    return result;
  }

  async updateStreamEventEntry(id: number, data: Partial<InsertStreamEventEntry>): Promise<StreamEventEntry | undefined> {
    const [result] = await db.update(streamEventEntries).set(data).where(eq(streamEventEntries.id, id)).returning();
    return result || undefined;
  }

  async deleteStreamEventEntry(id: number): Promise<boolean> {
    await db.delete(streamEventEntries).where(eq(streamEventEntries.id, id));
    return true;
  }

  // Tournament Brackets
  async getTournamentBrackets(eventId: number): Promise<TournamentBracket[]> {
    return db.select().from(tournamentBrackets).where(eq(tournamentBrackets.eventId, eventId)).orderBy(asc(tournamentBrackets.round), asc(tournamentBrackets.matchIndex));
  }

  async createTournamentBracket(bracket: InsertTournamentBracket): Promise<TournamentBracket> {
    const [result] = await db.insert(tournamentBrackets).values(bracket).returning();
    return result;
  }

  async updateTournamentBracket(id: number, data: Partial<InsertTournamentBracket>): Promise<TournamentBracket | undefined> {
    const [result] = await db.update(tournamentBrackets).set(data).where(eq(tournamentBrackets.id, id)).returning();
    return result || undefined;
  }

  async clearTournamentBrackets(eventId: number): Promise<boolean> {
    await db.delete(tournamentBrackets).where(eq(tournamentBrackets.eventId, eventId));
    return true;
  }
}

export const storage = new DatabaseStorage();
