/**
 * Game board page - main gameplay interface
 */

import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useGame } from "@/contexts/GameContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GameBoardUI } from "@/components/GameBoardUI";
import { Loader2, LogOut, Play } from "lucide-react";
import { toast } from "sonner";
import { Card as CardType } from "@shared/gameTypes";

export default function GameBoard() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { gameId } = useParams<{ gameId: string }>();
  const { gameState, currentPlayer, joinGame, leaveGame, updateGameState } = useGame();
  const [isLoading, setIsLoading] = useState(false);
  const [drawnCard, setDrawnCard] = useState<CardType | null>(null);
  const [gameInitialized, setGameInitialized] = useState(false);

  // Fetch game info
  const gameQuery = trpc.game.getGame.useQuery(
    { gameId: gameId || "" },
    { enabled: !!gameId, refetchInterval: 2000 }
  );

  // Fetch game state
  const gameStateQuery = trpc.gameplay.getGameState.useQuery(
    { gameId: gameId || "" },
    { enabled: !!gameId && gameInitialized, refetchInterval: 1000 }
  );

  const initializeGameMutation = trpc.gameplay.initializeGame.useMutation({
    onSuccess: (data) => {
      setGameInitialized(true);
      updateGameState(data.gameState);
      toast.success("Game started!");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to initialize game");
    },
  });

  const startGameMutation = trpc.game.startGame.useMutation({
    onSuccess: () => {
      toast.success("Game starting...");
      // Trigger game initialization
      if (gameId) {
        initializeGameMutation.mutate({ gameId });
      }
    },
    onError: (error) => {
      setIsLoading(false);
      toast.error(error.message || "Failed to start game");
    },
  });

  const drawCardMutation = trpc.gameplay.drawCard.useMutation({
    onSuccess: (data) => {
      setDrawnCard(data.drawnCard);
      setIsLoading(false);
      updateGameState(data.gameState);
      toast.success("Card drawn!");
    },
    onError: (error) => {
      setIsLoading(false);
      toast.error(error.message || "Failed to draw card");
    },
  });

  const keepCardMutation = trpc.gameplay.keepCard.useMutation({
    onSuccess: (data) => {
      setDrawnCard(null);
      setIsLoading(false);
      updateGameState(data.gameState);
      toast.success("Card kept!");
    },
    onError: (error) => {
      setIsLoading(false);
      toast.error(error.message || "Failed to keep card");
    },
  });

  const discardCardMutation = trpc.gameplay.discardCard.useMutation({
    onSuccess: (data) => {
      setDrawnCard(null);
      setIsLoading(false);
      updateGameState(data.gameState);
      toast.success("Card discarded!");
    },
    onError: (error) => {
      setIsLoading(false);
      toast.error(error.message || "Failed to discard card");
    },
  });

  const callGameMutation = trpc.gameplay.callGame.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      updateGameState(data.gameState);
      const isWinner = data.winner.userId === user?.id;
      if (isWinner) {
        toast.success("You win!");
      } else {
        toast.error("You lose!");
      }
    },
    onError: (error) => {
      setIsLoading(false);
      toast.error(error.message || "Failed to call game");
    },
  });

  // Join game when component mounts
  useEffect(() => {
    if (gameId && gameQuery.data) {
      // For anonymous players, just use a random ID
      const playerId = user?.id || Math.floor(Math.random() * 1000000);
      const playerIndex = gameQuery.data.players.findIndex((p) => p.userId === playerId);
      if (playerIndex >= 0) {
        console.log(`[GameBoard] Joining game ${gameId} as player ${playerIndex}`);
        joinGame(gameId, playerId, playerIndex);
      }
    }
  }, [gameId, gameQuery.data, joinGame, user?.id]);

  // Initialize game when all players are ready
  useEffect(() => {
    if (gameQuery.data && gameQuery.data.status === "playing" && !gameInitialized && gameId) {
      console.log("[GameBoard] Initializing game");
      initializeGameMutation.mutate({ gameId });
    }
  }, [gameQuery.data, gameInitialized, gameId, initializeGameMutation]);

  // Update game state from query
  useEffect(() => {
    if (gameStateQuery.data) {
      console.log("[GameBoard] Updating game state from query");
      updateGameState(gameStateQuery.data);
    }
  }, [gameStateQuery.data, updateGameState]);

  const handleLeaveGame = () => {
    leaveGame();
    navigate("/");
  };

  const handleStartGame = () => {
    if (gameId && gameQuery.data) {
      setIsLoading(true);
      startGameMutation.mutate({ gameId });
    }
  };

  const handleDrawCard = () => {
    if (gameId) {
      setIsLoading(true);
      drawCardMutation.mutate({ gameId });
    }
  };

  const handleKeepCard = (drawnCardId: string, targetCardId: string) => {
    if (gameId) {
      setIsLoading(true);
      keepCardMutation.mutate({ gameId, drawnCardId, targetCardId });
    }
  };

  const handleDiscardCard = (drawnCardId: string) => {
    if (gameId) {
      setIsLoading(true);
      discardCardMutation.mutate({ gameId, drawnCardId });
    }
  };

  const handleCall = () => {
    if (gameId) {
      setIsLoading(true);
      callGameMutation.mutate({ gameId });
    }
  };

  if (gameQuery.isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-slate-400">Loading game...</p>
        </div>
      </div>
    );
  }

  if (!gameQuery.data) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="bg-slate-800 border-slate-700 max-w-md">
          <CardHeader>
            <CardTitle className="text-white">Game Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-400 mb-4">The game room could not be found.</p>
            <Button onClick={() => navigate("/")} className="w-full">
              Back to Lobby
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const game = gameQuery.data;
  const canStartGame = game.status === "lobby" && (game.playerCount || 0) >= 2;

  return (
    <div className="min-h-screen bg-slate-900 p-4">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Card Game</h1>
          <p className="text-slate-400">Room: {game.roomCode}</p>
        </div>
        <Button
          onClick={handleLeaveGame}
          variant="destructive"
          className="bg-red-600 hover:bg-red-700"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Leave
        </Button>
      </div>

      {/* Game Status */}
      {game.status === "lobby" && (
        <div className="max-w-6xl mx-auto mb-6">
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-6">
              <div className="text-center mb-6">
                <p className="text-slate-300 mb-2">Waiting for players...</p>
                <p className="text-slate-400 text-lg font-semibold">
                  Players: {game.playerCount}/{game.maxPlayers}
                </p>
              </div>

              {canStartGame && (
                <Button
                  onClick={handleStartGame}
                  disabled={isLoading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Start Game
                    </>
                  )}
                </Button>
              )}

              {!canStartGame && (
                <p className="text-slate-500 text-sm text-center">
                  Need at least 2 players to start the game
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Game Board */}
      {game.status === "playing" && gameState && currentPlayer && (
        <GameBoardUI
          gameState={gameState}
          currentPlayer={currentPlayer}
          onDrawCard={handleDrawCard}
          onKeepCard={handleKeepCard}
          onDiscardCard={handleDiscardCard}
          onTakeDiscard={() => {}} // TODO: Implement take discard
          onCall={handleCall}
          isLoading={isLoading}
          drawnCard={drawnCard}
        />
      )}

      {/* Game Finished */}
      {game.status === "finished" && (
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-slate-300 mb-4">Game finished!</p>
          <Button onClick={() => navigate("/")} className="w-full max-w-xs">
            Back to Lobby
          </Button>
        </div>
      )}
    </div>
  );
}
