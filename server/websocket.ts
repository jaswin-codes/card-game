/**
 * WebSocket event handlers for real-time multiplayer synchronization
 */

import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { GameState, PlayerGameState } from "@shared/gameTypes";

// In-memory game state store (in production, would use database)
const gameStates = new Map<string, GameState>();
const playerSockets = new Map<number, string>(); // userId -> socketId

export function setupWebSocket(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === "production" ? undefined : "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    /**
     * Player joins a game room
     */
    socket.on("join-game", (data: { gameId: string; userId: number; playerIndex: number }) => {
      const { gameId, userId, playerIndex } = data;

      socket.join(gameId);
      playerSockets.set(userId, socket.id);

      console.log(`[WebSocket] User ${userId} joined game ${gameId}`);

      // Notify other players
      io.to(gameId).emit("player-joined", {
        userId,
        playerIndex,
        timestamp: Date.now(),
      });
    });

    /**
     * Player leaves a game room
     */
    socket.on("leave-game", (data: { gameId: string; userId: number }) => {
      const { gameId, userId } = data;

      socket.leave(gameId);
      playerSockets.delete(userId);

      console.log(`[WebSocket] User ${userId} left game ${gameId}`);

      io.to(gameId).emit("player-left", {
        userId,
        timestamp: Date.now(),
      });
    });

    /**
     * Sync game state to all players
     */
    socket.on("sync-game-state", (data: { gameId: string; gameState: GameState }) => {
      const { gameId, gameState } = data;

      gameStates.set(gameId, gameState);

      io.to(gameId).emit("game-state-updated", {
        gameState,
        timestamp: Date.now(),
      });
    });

    /**
     * Player draws a card
     */
    socket.on("player-draw", (data: { gameId: string; userId: number; drawnCard: any }) => {
      const { gameId, userId, drawnCard } = data;

      io.to(gameId).emit("card-drawn", {
        userId,
        drawnCard,
        timestamp: Date.now(),
      });
    });

    /**
     * Player discards a card
     */
    socket.on("player-discard", (data: { gameId: string; userId: number; discardedCard: any; cardToRemove?: any }) => {
      const { gameId, userId, discardedCard, cardToRemove } = data;

      io.to(gameId).emit("card-discarded", {
        userId,
        discardedCard,
        cardToRemove,
        timestamp: Date.now(),
      });
    });

    /**
     * Player attempts Jump-In Type 1
     */
    socket.on("jump-in-type1", (data: { gameId: string; userId: number; cardIds: string[] }) => {
      const { gameId, userId, cardIds } = data;

      // Emit to all players - first to process wins
      io.to(gameId).emit("jump-in-type1-attempt", {
        userId,
        cardIds,
        timestamp: Date.now(),
      });
    });

    /**
     * Player attempts Jump-In Type 2
     */
    socket.on("jump-in-type2", (data: { gameId: string; userId: number; targetUserId: number; targetCardId: string; swapCardId: string }) => {
      const { gameId, userId, targetUserId, targetCardId, swapCardId } = data;

      // First-click wins - emit to all players immediately
      io.to(gameId).emit("jump-in-type2-attempt", {
        userId,
        targetUserId,
        targetCardId,
        swapCardId,
        timestamp: Date.now(),
      });
    });

    /**
     * Player calls the game
     */
    socket.on("player-call", (data: { gameId: string; userId: number }) => {
      const { gameId, userId } = data;

      io.to(gameId).emit("player-called", {
        userId,
        timestamp: Date.now(),
      });
    });

    /**
     * Player uses a card power
     */
    socket.on("use-power", (data: { gameId: string; userId: number; cardValue: string; powerType: string; targetData?: any }) => {
      const { gameId, userId, cardValue, powerType, targetData } = data;

      io.to(gameId).emit("power-used", {
        userId,
        cardValue,
        powerType,
        targetData,
        timestamp: Date.now(),
      });
    });

    /**
     * Player reports a mistake
     */
    socket.on("report-mistake", (data: { gameId: string; reportedByUserId: number; offendingUserId: number; mistakeType: string; description?: string }) => {
      const { gameId, reportedByUserId, offendingUserId, mistakeType, description } = data;

      io.to(gameId).emit("mistake-reported", {
        reportedByUserId,
        offendingUserId,
        mistakeType,
        description,
        timestamp: Date.now(),
      });
    });

    /**
     * Player sends a chat message
     */
    socket.on("chat-message", (data: { gameId: string; userId: number; message: string }) => {
      const { gameId, userId, message } = data;

      io.to(gameId).emit("chat-message-received", {
        userId,
        message,
        timestamp: Date.now(),
      });
    });

    /**
     * Player sends an emoji reaction
     */
    socket.on("emoji-reaction", (data: { gameId: string; userId: number; emoji: string }) => {
      const { gameId, userId, emoji } = data;

      io.to(gameId).emit("emoji-reaction-received", {
        userId,
        emoji,
        timestamp: Date.now(),
      });
    });

    /**
     * Disconnect handler
     */
    socket.on("disconnect", () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
      // Find and remove the user
      let userToRemove: number | null = null;
      playerSockets.forEach((socketId, userId) => {
        if (socketId === socket.id) {
          userToRemove = userId;
        }
      });
      if (userToRemove !== null) {
        playerSockets.delete(userToRemove);
      }
    });
  });

  return io;
}

/**
 * Get game state from store
 */
export function getGameState(gameId: string): GameState | undefined {
  return gameStates.get(gameId);
}

/**
 * Store game state
 */
export function storeGameState(gameId: string, gameState: GameState): void {
  gameStates.set(gameId, gameState);
}

/**
 * Remove game state from store
 */
export function removeGameState(gameId: string): void {
  gameStates.delete(gameId);
}

/**
 * Get all players in a game
 */
export function getGamePlayers(gameId: string): Map<number, string> {
  const players = new Map<number, string>();
  playerSockets.forEach((socketId, userId) => {
    players.set(userId, socketId);
  });
  return players;
}
