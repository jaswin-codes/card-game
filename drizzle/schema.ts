import {
  boolean,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Game rooms/sessions
 */
export const games = mysqlTable("games", {
  id: varchar("id", { length: 36 }).primaryKey(), // UUID
  roomCode: varchar("roomCode", { length: 8 }).notNull().unique(), // Shareable room code
  status: mysqlEnum("status", ["lobby", "playing", "finished"]).default("lobby").notNull(),
  createdBy: int("createdBy").notNull(), // User ID of room creator
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  
  // Game state
  currentTurnPlayerId: int("currentTurnPlayerId"), // User ID of player whose turn it is
  gamePhase: mysqlEnum("gamePhase", ["setup", "playing", "calling", "finalTurns", "scoring"]).default("setup"),
  calledByPlayerId: int("calledByPlayerId"), // User ID of player who called
  
  // Card state (serialized)
  drawPile: json("drawPile").$type<Array<{ value: string; suit: string | null }>>().default([]),
  discardPile: json("discardPile").$type<Array<{ value: string; suit: string | null }>>().default([]),
  
  // Metadata
  playerCount: int("playerCount").default(0),
  maxPlayers: int("maxPlayers").default(4),
});

export type Game = typeof games.$inferSelect;
export type InsertGame = typeof games.$inferInsert;

/**
 * Players in a game
 */
export const gamePlayers = mysqlTable("gamePlayers", {
  id: int("id").autoincrement().primaryKey(),
  gameId: varchar("gameId", { length: 36 }).notNull(),
  userId: int("userId").notNull(),
  playerIndex: int("playerIndex").notNull(), // 0-3 for turn order
  
  // Card state
  cards: json("cards").$type<Array<{
    id: string;
    value: string;
    suit: string | null;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "overflow-1" | "overflow-2" | "overflow-3" | "overflow-4";
    faceUp: boolean;
    knownBy: number[]; // User IDs who have seen this card
  }>>().default([]),
  
  // Game state
  score: int("score").default(0),
  hasCalled: boolean("hasCalled").default(false),
  mistakeCount: int("mistakeCount").default(0),
  isEliminated: boolean("isEliminated").default(false),
  hasSeenBottomCards: boolean("hasSeenBottomCards").default(false),
  
  // Final turn tracking (after call)
  hasTakenFinalTurn: boolean("hasTakenFinalTurn").default(false),
  
  // Metadata
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
  lastActionAt: timestamp("lastActionAt").defaultNow().onUpdateNow(),
});

export type GamePlayer = typeof gamePlayers.$inferSelect;
export type InsertGamePlayer = typeof gamePlayers.$inferInsert;

/**
 * Game action log for debugging and replay
 */
export const gameActions = mysqlTable("gameActions", {
  id: int("id").autoincrement().primaryKey(),
  gameId: varchar("gameId", { length: 36 }).notNull(),
  userId: int("userId").notNull(),
  actionType: varchar("actionType", { length: 64 }).notNull(), // e.g., "draw", "discard", "jump-in", "call", "mistake"
  actionData: json("actionData").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GameAction = typeof gameActions.$inferSelect;
export type InsertGameAction = typeof gameActions.$inferInsert;

/**
 * Mistake reports (for manual "Call Mistake" system)
 */
export const mistakeReports = mysqlTable("mistakeReports", {
  id: int("id").autoincrement().primaryKey(),
  gameId: varchar("gameId", { length: 36 }).notNull(),
  reportedByUserId: int("reportedByUserId").notNull(),
  offendingUserId: int("offendingUserId").notNull(),
  mistakeType: varchar("mistakeType", { length: 64 }).notNull(),
  description: text("description"),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MistakeReport = typeof mistakeReports.$inferSelect;
export type InsertMistakeReport = typeof mistakeReports.$inferInsert;
