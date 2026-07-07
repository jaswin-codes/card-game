/**
 * Game management tRPC procedures
 */

import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createGame,
  getGameByRoomCode,
  getGameById,
  addPlayerToGame,
  getGamePlayers,
  getGamePlayer,
  updateGame,
  updateGamePlayer,
  logGameAction,
  reportMistake,
  generateRoomCode,
} from "../gameDb";
import { TRPCError } from "@trpc/server";

export const gameRouter = router({
  /**
   * Create a new game room
   */
  createRoom: publicProcedure
    .input(z.object({ maxPlayers: z.number().min(2).max(4).default(4) }))
    .mutation(async ({ ctx, input }) => {
      const roomCode = generateRoomCode();
      const userId = ctx.user?.id || Math.floor(Math.random() * 1000000);
      const game = await createGame(roomCode, userId, input.maxPlayers);

      if (!game) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create game",
        });
      }

      // Add creator as first player
      await addPlayerToGame(game.id, userId, 0);

      return {
        gameId: game.id,
        roomCode: game.roomCode,
      };
    }),

  /**
   * Join an existing game room
   */
  joinRoom: publicProcedure
    .input(z.object({ roomCode: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const game = await getGameByRoomCode(input.roomCode);

      if (!game) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game room not found",
        });
      }

      if (game.status !== "lobby") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Game has already started",
        });
      }

      if ((game.playerCount || 0) >= (game.maxPlayers || 4)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Game room is full",
        });
      }

      const userId = ctx.user?.id || Math.floor(Math.random() * 1000000);

      // Check if user is already in the game
      const existingPlayer = await getGamePlayer(game.id, userId);
      if (existingPlayer) {
        return {
          gameId: game.id,
          playerIndex: existingPlayer.playerIndex,
        };
      }

      // Add player to game
      const nextPlayerIndex = game.playerCount || 0;
      await addPlayerToGame(game.id, userId, nextPlayerIndex);

      return {
        gameId: game.id,
        playerIndex: nextPlayerIndex,
      };
    }),

  /**
   * Get game state
   */
  getGame: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const game = await getGameById(input.gameId);

      if (!game) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      const players = await getGamePlayers(input.gameId);

      return {
        ...game,
        players: players.map((p) => ({
          userId: p.userId,
          playerIndex: p.playerIndex,
          cardCount: (p.cards || []).length,
          score: p.score,
          hasCalled: p.hasCalled,
          mistakeCount: p.mistakeCount,
          isEliminated: p.isEliminated,
        })),
      };
    }),

  /**
   * Get game players
   */
  getPlayers: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const players = await getGamePlayers(input.gameId);

      return players.map((p) => ({
        userId: p.userId,
        playerIndex: p.playerIndex,
        cardCount: (p.cards || []).length,
        score: p.score,
        hasCalled: p.hasCalled,
        mistakeCount: p.mistakeCount,
        isEliminated: p.isEliminated,
        hasSeenBottomCards: p.hasSeenBottomCards,
      }));
    }),

  /**
   * Get current player state
   */
  getPlayerState: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const player = await getGamePlayer(input.gameId, ctx.user.id);

      if (!player) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Player not found in this game",
        });
      }

      return {
        userId: player.userId,
        playerIndex: player.playerIndex,
        cards: player.cards || [],
        score: player.score,
        hasCalled: player.hasCalled,
        mistakeCount: player.mistakeCount,
        isEliminated: player.isEliminated,
        hasSeenBottomCards: player.hasSeenBottomCards,
        hasTakenFinalTurn: player.hasTakenFinalTurn,
      };
    }),

  /**
   * Start a game
   */
  startGame: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const game = await getGameById(input.gameId);

      if (!game) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      // Allow any player to start the game (for testing)
      // In production, you might want to restrict this to the room creator

      if ((game.playerCount || 0) < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Need at least 2 players to start",
        });
      }

      if (game.status !== "lobby") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Game has already started",
        });
      }

      await updateGame(input.gameId, {
        status: "playing",
        gamePhase: "setup",
      });

      return { success: true };
    }),

  /**
   * Report a mistake
   */
  reportMistake: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        offendingUserId: z.number(),
        mistakeType: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const game = await getGameById(input.gameId);

      if (!game) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      const report = await reportMistake(
        input.gameId,
        ctx.user.id,
        input.offendingUserId,
        input.mistakeType,
        input.description
      );

      if (!report) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to report mistake",
        });
      }

      // Log the action
      await logGameAction(input.gameId, ctx.user.id, "manual-mistake-report", {
        offendingUserId: input.offendingUserId,
        mistakeType: input.mistakeType,
      });

      return { success: true };
    }),

  /**
   * Update game phase
   */
  updateGamePhase: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        gamePhase: z.enum(["setup", "playing", "calling", "finalTurns", "scoring"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const game = await getGameById(input.gameId);

      if (!game) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      await updateGame(input.gameId, {
        gamePhase: input.gamePhase,
      });

      return { success: true };
    }),
});
