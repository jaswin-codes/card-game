/**
 * Gameplay tRPC procedures - handle actual game actions
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getGameById,
  getGamePlayer,
  updateGame,
  updateGamePlayer,
  logGameAction,
  getGamePlayers,
} from "../gameDb";
import {
  initializeGameSession,
  handleDrawCard,
  handleKeepCard,
  handleDiscardCard,
  handleTakeDiscard,
  handleCall,
  calculateFinalScores,
} from "../gameSession";
import { TRPCError } from "@trpc/server";
import { GameState } from "@shared/gameTypes";

// In-memory game sessions (in production, would use database)
const gameSessions = new Map<string, GameState>();

export const gameplayRouter = router({
  /**
   * Initialize game (deal cards, start playing)
   */
  initializeGame: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const game = await getGameById(input.gameId);

      if (!game) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      const players = await getGamePlayers(input.gameId);

      if (players.length < 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Need at least 2 players to start",
        });
      }

      // Initialize game session
      const gameState = initializeGameSession(input.gameId, players.map((p) => ({ userId: p.userId, playerIndex: p.playerIndex })));

      // Store in memory
      gameSessions.set(input.gameId, gameState);

      // Update game in database
      await updateGame(input.gameId, {
        status: "playing",
        gamePhase: "playing",
        currentTurnPlayerId: players[0].userId,
        drawPile: gameState.drawPile,
        discardPile: gameState.discardPile,
      });

      // Update players with their cards
      for (const player of gameState.players) {
        await updateGamePlayer(input.gameId, player.userId, {
          cards: player.cards,
          hasSeenBottomCards: false,
        });
      }

      return { success: true, gameState };
    }),

  /**
   * Get current game state
   */
  getGameState: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      let gameState = gameSessions.get(input.gameId);

      if (!gameState) {
        // Try to load from database
        const game = await getGameById(input.gameId);
        if (!game) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Game not found",
          });
        }

        // Reconstruct game state from database
        const players = await getGamePlayers(input.gameId);
        gameState = {
          id: game.id,
          roomCode: game.roomCode,
          status: game.status as any,
          gamePhase: game.gamePhase as any,
          players: players.map((p) => ({
            userId: p.userId,
            playerIndex: p.playerIndex,
            cards: (p.cards as any) || [],
            score: p.score || 0,
            hasCalled: p.hasCalled || false,
            mistakeCount: p.mistakeCount || 0,
            isEliminated: p.isEliminated || false,
            hasSeenBottomCards: p.hasSeenBottomCards || false,
            hasTakenFinalTurn: p.hasTakenFinalTurn || false,
          })),
          currentTurnPlayerIndex: players.findIndex((p) => p.userId === game.currentTurnPlayerId),
          calledByPlayerIndex: null,
          drawPile: (game.drawPile as any) || [],
          discardPile: (game.discardPile as any) || [],
          createdAt: game.createdAt,
          updatedAt: game.updatedAt,
        };
      }

      return gameState;
    }),

  /**
   * Draw a card from the pile
   */
  drawCard: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let gameState = gameSessions.get(input.gameId);
      if (!gameState) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      const player = await getGamePlayer(input.gameId, ctx.user.id);
      if (!player) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Player not found in this game",
        });
      }

      const { gameState: updatedGameState, drawnCard, error } = handleDrawCard(gameState, player.playerIndex);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error,
        });
      }

      gameSessions.set(input.gameId, updatedGameState);

      // Log action
      await logGameAction(input.gameId, ctx.user.id, "draw", {
        cardValue: drawnCard.value,
        cardSuit: drawnCard.suit,
      });

      return { drawnCard, gameState: updatedGameState };
    }),

  /**
   * Keep a drawn card (swap with one of player's cards)
   */
  keepCard: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        drawnCardId: z.string(),
        targetCardId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let gameState = gameSessions.get(input.gameId);
      if (!gameState) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      const player = await getGamePlayer(input.gameId, ctx.user.id);
      if (!player) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Player not found in this game",
        });
      }

      const { gameState: updatedGameState, error } = handleKeepCard(gameState, player.playerIndex, input.targetCardId);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error,
        });
      }

      gameSessions.set(input.gameId, updatedGameState);

      // Update database
      await updateGame(input.gameId, {
        currentTurnPlayerId: updatedGameState.players[updatedGameState.currentTurnPlayerIndex!].userId,
        discardPile: updatedGameState.discardPile,
      });

      // Update player cards
      const updatedPlayer = updatedGameState.players[player.playerIndex];
      await updateGamePlayer(input.gameId, ctx.user.id, {
        cards: updatedPlayer.cards,
      });

      // Log action
      await logGameAction(input.gameId, ctx.user.id, "keep-card", {
        targetCardId: input.targetCardId,
        replacedCardValue: updatedGameState.discardPile[0].value,
      });

      return { gameState: updatedGameState };
    }),

  /**
   * Discard a drawn card
   */
  discardCard: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        drawnCardId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let gameState = gameSessions.get(input.gameId);
      if (!gameState) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      const player = await getGamePlayer(input.gameId, ctx.user.id);
      if (!player) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Player not found in this game",
        });
      }

      const { gameState: updatedGameState, error } = handleDiscardCard(gameState, player.playerIndex);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error,
        });
      }

      gameSessions.set(input.gameId, updatedGameState);

      // Update database
      await updateGame(input.gameId, {
        currentTurnPlayerId: updatedGameState.players[updatedGameState.currentTurnPlayerIndex!].userId,
        discardPile: updatedGameState.discardPile,
      });

      // Log action
      await logGameAction(input.gameId, ctx.user.id, "discard", {
        discardedCard: updatedGameState.discardPile[0].value,
      });

      return { gameState: updatedGameState };
    }),

  /**
   * Take the top discard card
   */
  takeDiscard: protectedProcedure
    .input(
      z.object({
        gameId: z.string(),
        targetCardId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let gameState = gameSessions.get(input.gameId);
      if (!gameState) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      const player = await getGamePlayer(input.gameId, ctx.user.id);
      if (!player) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Player not found in this game",
        });
      }

      const { gameState: updatedGameState, error } = handleTakeDiscard(gameState, player.playerIndex, input.targetCardId);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error,
        });
      }

      gameSessions.set(input.gameId, updatedGameState);

      // Update database
      await updateGame(input.gameId, {
        currentTurnPlayerId: updatedGameState.players[updatedGameState.currentTurnPlayerIndex!].userId,
        discardPile: updatedGameState.discardPile,
      });

      // Update player cards
      const updatedPlayer = updatedGameState.players[player.playerIndex];
      await updateGamePlayer(input.gameId, ctx.user.id, {
        cards: updatedPlayer.cards,
      });

      // Log action
      await logGameAction(input.gameId, ctx.user.id, "keep-card", {
        tookFromDiscard: true,
      });

      return { gameState: updatedGameState };
    }),

  /**
   * Call (declare lowest hand)
   */
  callGame: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let gameState = gameSessions.get(input.gameId);
      if (!gameState) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found",
        });
      }

      const player = await getGamePlayer(input.gameId, ctx.user.id);
      if (!player) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Player not found in this game",
        });
      }

      const { gameState: updatedGameState, error } = handleCall(gameState, player.playerIndex);

      if (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error,
        });
      }

      gameSessions.set(input.gameId, updatedGameState);

      // Update database
      await updateGame(input.gameId, {
        gamePhase: updatedGameState.gamePhase,
        calledByPlayerId: ctx.user.id,
      });

      // Calculate final scores
      const { players: finalPlayers, winner } = calculateFinalScores(updatedGameState);

      // Log action
      await logGameAction(input.gameId, ctx.user.id, "call", {
        winnerUserId: winner.userId,
        scores: finalPlayers.map((p) => ({ userId: p.userId, score: p.finalScore })),
      });

      return { gameState: updatedGameState, finalScores: finalPlayers, winner };
    }),
});
