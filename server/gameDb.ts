/**
 * Database helpers for game operations
 */

import { eq, and } from "drizzle-orm";
import { games, gamePlayers, gameActions, mistakeReports } from "../drizzle/schema";
import { getDb } from "./db";
import { nanoid } from "nanoid";
import { Game, GamePlayer, GameAction, MistakeReport } from "../drizzle/schema";

/**
 * Create a new game room
 */
export async function createGame(
  roomCode: string,
  createdBy: number,
  maxPlayers: number = 4
): Promise<Game | null> {
  const db = await getDb();
  if (!db) return null;

  const gameId = nanoid();
  const result = await db.insert(games).values({
    id: gameId,
    roomCode,
    status: "lobby",
    createdBy,
    maxPlayers,
    playerCount: 0,
  });

  return {
    id: gameId,
    roomCode,
    status: "lobby",
    createdBy,
    maxPlayers,
    playerCount: 0,
    currentTurnPlayerId: null,
    gamePhase: "setup",
    calledByPlayerId: null,
    drawPile: [],
    discardPile: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Get game by room code
 */
export async function getGameByRoomCode(roomCode: string): Promise<Game | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(games).where(eq(games.roomCode, roomCode)).limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Get game by ID
 */
export async function getGameById(gameId: string): Promise<Game | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(games).where(eq(games.id, gameId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

/**
 * Add player to game
 */
export async function addPlayerToGame(
  gameId: string,
  userId: number,
  playerIndex: number
): Promise<GamePlayer | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(gamePlayers).values({
    gameId,
    userId,
    playerIndex,
    cards: [],
    score: 0,
    hasCalled: false,
    mistakeCount: 0,
    isEliminated: false,
    hasSeenBottomCards: false,
    hasTakenFinalTurn: false,
  });

  // Update game player count
  const game = await getGameById(gameId);
  if (game) {
    await db
      .update(games)
      .set({ playerCount: (game.playerCount || 0) + 1 })
      .where(eq(games.id, gameId));
  }

  return {
    id: 0, // Will be auto-generated
    gameId,
    userId,
    playerIndex,
    cards: [],
    score: 0,
    hasCalled: false,
    mistakeCount: 0,
    isEliminated: false,
    hasSeenBottomCards: false,
    hasTakenFinalTurn: false,
    joinedAt: new Date(),
    lastActionAt: new Date(),
  };
}

/**
 * Get all players in a game
 */
export async function getGamePlayers(gameId: string): Promise<GamePlayer[]> {
  const db = await getDb();
  if (!db) return [];

  return await db.select().from(gamePlayers).where(eq(gamePlayers.gameId, gameId));
}

/**
 * Get a specific player in a game
 */
export async function getGamePlayer(gameId: string, userId: number): Promise<GamePlayer | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select()
    .from(gamePlayers)
    .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Update game state
 */
export async function updateGame(gameId: string, updates: Partial<Game>): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.update(games).set(updates).where(eq(games.id, gameId));
}

/**
 * Update player state
 */
export async function updateGamePlayer(
  gameId: string,
  userId: number,
  updates: Partial<GamePlayer>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(gamePlayers)
    .set(updates)
    .where(and(eq(gamePlayers.gameId, gameId), eq(gamePlayers.userId, userId)));
}

/**
 * Log a game action
 */
export async function logGameAction(
  gameId: string,
  userId: number,
  actionType: string,
  actionData: Record<string, unknown>
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(gameActions).values({
    gameId,
    userId,
    actionType,
    actionData,
  });
}

/**
 * Report a mistake
 */
export async function reportMistake(
  gameId: string,
  reportedByUserId: number,
  offendingUserId: number,
  mistakeType: string,
  description?: string | null
): Promise<MistakeReport | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.insert(mistakeReports).values({
    gameId,
    reportedByUserId,
    offendingUserId,
    mistakeType,
    description: description || null,
    resolved: false,
  });

  return {
    id: 0, // Will be auto-generated
    gameId,
    reportedByUserId,
    offendingUserId,
    mistakeType,
    description: description || null,
    resolved: false,
    createdAt: new Date(),
  };
}

/**
 * Get unresolved mistakes for a player in a game
 */
export async function getUnresolvedMistakes(gameId: string, userId: number): Promise<MistakeReport[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(mistakeReports)
    .where(
      and(
        eq(mistakeReports.gameId, gameId),
        eq(mistakeReports.offendingUserId, userId),
        eq(mistakeReports.resolved, false)
      )
    );
}

/**
 * Generate a unique room code
 */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
