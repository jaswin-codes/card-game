/**
 * Game state context for managing real-time game state across the app
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { GameState, PlayerGameState } from "@shared/gameTypes";

interface GameContextType {
  gameState: GameState | null;
  currentPlayer: PlayerGameState | null;
  socket: Socket | null;
  isConnected: boolean;
  joinGame: (gameId: string, userId: number, playerIndex: number) => void;
  leaveGame: () => void;
  emitAction: (event: string, data: any) => void;
  updateGameState: (gameState: GameState) => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider = ({ children }: { children: React.ReactNode }) => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerGameState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(window.location.origin, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    newSocket.on("connect", () => {
      console.log("[GameContext] Connected to WebSocket");
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log("[GameContext] Disconnected from WebSocket");
      setIsConnected(false);
    });

    newSocket.on("game-state-updated", (data: { gameState: GameState }) => {
      console.log("[GameContext] Game state updated:", data.gameState.id);
      setGameState(data.gameState);
      // Update current player if in this game
      const player = data.gameState.players.find((p) => p.playerIndex === currentPlayer?.playerIndex);
      if (player) {
        setCurrentPlayer(player);
      }
    });

    newSocket.on("player-joined", (data: { userId: number; playerIndex: number }) => {
      console.log(`[GameContext] Player ${data.userId} joined at index ${data.playerIndex}`);
    });

    newSocket.on("player-left", (data: { userId: number }) => {
      console.log(`[GameContext] Player ${data.userId} left`);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [currentPlayer?.playerIndex]);

  const joinGame = useCallback(
    (gameId: string, userId: number, playerIndex: number) => {
      console.log(`[GameContext] Joining game ${gameId} as player ${playerIndex}`);
      setCurrentPlayer({
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
      if (socket) {
        socket.emit("join-game", { gameId, userId, playerIndex });
      }
    },
    [socket]
  );

  const leaveGame = useCallback(() => {
    console.log("[GameContext] Leaving game");
    if (socket && gameState) {
      socket.emit("leave-game", { gameId: gameState.id, userId: currentPlayer?.userId });
    }
    setGameState(null);
    setCurrentPlayer(null);
  }, [socket, gameState, currentPlayer]);

  const emitAction = useCallback(
    (event: string, data: any) => {
      if (socket) {
        socket.emit(event, data);
      }
    },
    [socket]
  );

  const updateGameState = useCallback((newGameState: GameState) => {
    console.log("[GameContext] Updating game state:", newGameState.id);
    setGameState(newGameState);
    const player = newGameState.players.find((p) => p.playerIndex === currentPlayer?.playerIndex);
    if (player) {
      setCurrentPlayer(player);
    }
  }, [currentPlayer?.playerIndex]);

  const value: GameContextType = {
    gameState,
    currentPlayer,
    socket,
    isConnected,
    joinGame,
    leaveGame,
    emitAction,
    updateGameState,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error("useGame must be used within GameProvider");
  }
  return context;
};
