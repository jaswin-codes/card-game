/**
 * Lobby page - create or join game rooms
 * For MVP testing: no authentication required
 */

import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

export default function Lobby() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [roomCode, setRoomCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [playerName, setPlayerName] = useState("");

  const createRoomMutation = trpc.game.createRoom.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      navigate(`/game/${data.gameId}`);
    },
    onError: (error) => {
      setIsLoading(false);
      toast.error(error.message || "Failed to create room");
    },
  });

  const joinRoomMutation = trpc.game.joinRoom.useMutation({
    onSuccess: (data) => {
      setIsLoading(false);
      navigate(`/game/${data.gameId}`);
    },
    onError: (error) => {
      setIsLoading(false);
      toast.error(error.message || "Failed to join room");
    },
  });

  const handleCreateRoom = () => {
    if (isAuthenticated) {
      setIsLoading(true);
      createRoomMutation.mutate({ maxPlayers: 4 });
    } else {
      // For testing: create anonymous room
      setIsLoading(true);
      createRoomMutation.mutate({ maxPlayers: 4 });
    }
  };

  const handleJoinRoom = () => {
    if (!roomCode.trim()) {
      toast.error("Please enter a room code");
      return;
    }
    setIsLoading(true);
    joinRoomMutation.mutate({ roomCode: roomCode.toUpperCase() });
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Card Game</h1>
          <p className="text-slate-400">Play with friends in real-time</p>
          {isAuthenticated && (
            <p className="text-slate-500 text-sm mt-2">Logged in as {user?.name}</p>
          )}
          <p className="text-slate-600 text-xs mt-2">[Testing Mode - No Login Required]</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Room Card */}
          <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
            <CardHeader>
              <CardTitle className="text-white">Create Room</CardTitle>
              <CardDescription>Start a new game and invite friends</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300 text-sm mb-4">
                You'll get a unique room code to share with friends. Up to 4 players can join.
              </p>
              <Button
                onClick={handleCreateRoom}
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create New Room"
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Join Room Card */}
          <Card className="bg-slate-800 border-slate-700 hover:border-slate-600 transition-colors">
            <CardHeader>
              <CardTitle className="text-white">Join Room</CardTitle>
              <CardDescription>Join an existing game with a room code</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Input
                  placeholder="Enter room code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="bg-slate-700 border-slate-600 text-white placeholder-slate-500"
                  maxLength={6}
                  disabled={isLoading}
                />
                <Button
                  onClick={handleJoinRoom}
                  disabled={isLoading || !roomCode.trim()}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    "Join Room"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* How to Play */}
        <Card className="mt-8 bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">How to Play</CardTitle>
          </CardHeader>
          <CardContent className="text-slate-300 space-y-2 text-sm">
            <p>• Each player starts with 4 cards in a 2×2 grid</p>
            <p>• On your turn, draw from the pile or take the top discard</p>
            <p>• Cards have special powers that activate when discarded</p>
            <p>• Jump in to match cards or steal opponent's cards</p>
            <p>• Call when you have the lowest score</p>
            <p>• Lowest total points wins the round</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
