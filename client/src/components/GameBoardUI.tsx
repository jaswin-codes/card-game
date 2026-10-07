/**
 * Game board UI component - displays cards and game state
 */

import { useState, useEffect } from "react";
import { GameState, PlayerGameState, Card } from "@shared/gameTypes";
import { Button } from "@/components/ui/button";
import { Card as UICard, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface GameBoardUIProps {
  gameState: GameState;
  currentPlayer: PlayerGameState | null;
  onDrawCard: () => void;
  onKeepCard: (drawnCardId: string, targetCardId: string) => void;
  onDiscardCard: (drawnCardId: string) => void;
  onTakeDiscard: (targetCardId: string) => void;
  onCall: () => void;
  isLoading: boolean;
  drawnCard: Card | null;
}

export function GameBoardUI({
  gameState,
  currentPlayer,
  onDrawCard,
  onKeepCard,
  onDiscardCard,
  onTakeDiscard,
  onCall,
  isLoading,
  drawnCard,
}: GameBoardUIProps) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [showKeepOptions, setShowKeepOptions] = useState(false);
  const [revealedCardIndices, setRevealedCardIndices] = useState<Set<number>>(new Set());
  const [isDrawing, setIsDrawing] = useState(false);
  const [isKeeping, setIsKeeping] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const isCurrentPlayerTurn = gameState.currentTurnPlayerIndex !== null && gameState.currentTurnPlayerIndex === currentPlayer?.playerIndex;
  const opponentIndex = (currentPlayer?.playerIndex === 0 ? 1 : 0) % gameState.players.length;
  const opponent = gameState.players[opponentIndex];

  // Show bottom 2 cards for 3 seconds on mount
  useEffect(() => {
    if (currentPlayer?.cards && currentPlayer.cards.length === 4) {
      // Show cards at indices 2 and 3 (bottom 2)
      setRevealedCardIndices(new Set([2, 3]));
      
      // Hide them after 3 seconds
      const timer = setTimeout(() => {
        setRevealedCardIndices(new Set());
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [currentPlayer?.cards]);

  const handleDrawClick = () => {
    setIsDrawing(true);
    onDrawCard();
    setShowKeepOptions(true);
  };

  const handleKeepCard = (targetCardId: string) => {
    if (drawnCard) {
      setIsKeeping(true);
      onKeepCard(drawnCard.id, targetCardId);
      setShowKeepOptions(false);
      setSelectedCard(null);
      setTimeout(() => setIsKeeping(false), 500);
    }
  };

  const handleDiscardClick = () => {
    if (drawnCard) {
      setIsDiscarding(true);
      onDiscardCard(drawnCard.id);
      setShowKeepOptions(false);
      setTimeout(() => setIsDiscarding(false), 500);
    }
  };

  const handleTakeDiscardClick = (cardId: string) => {
    setSelectedCard(cardId);
    setShowKeepOptions(true);
  };

  const getCardDisplay = (card: Card) => {
    if (card.value === "Joker") return "🃏";
    const suitSymbol = {
      Hearts: "♥",
      Diamonds: "♦",
      Clubs: "♣",
      Spades: "♠",
    }[card.suit || "Spades"];
    return `${card.value}${suitSymbol}`;
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      {/* Game Status Bar */}
      <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-slate-400 text-sm">Current Turn</p>
            <p className="text-white font-semibold">
              {isCurrentPlayerTurn ? "Your Turn" : `Player ${(gameState.currentTurnPlayerIndex ?? 0) + 1}'s Turn`}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Draw Pile</p>
            <p className="text-white font-semibold">{gameState.drawPile.length} cards</p>
          </div>
          <div>
            <p className="text-slate-400 text-sm">Discard Pile</p>
            <p className="text-white font-semibold">{gameState.discardPile.length} cards</p>
          </div>
        </div>
      </div>

      {/* Main Game Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Opponent Cards */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-white font-semibold mb-4">Opponent</h3>
          <div className="grid grid-cols-2 gap-3">
            {opponent?.cards.slice(0, 4).map((card, idx) => (
              <div
                key={card.id}
                className="bg-slate-700 rounded p-3 text-center border border-slate-600 aspect-square flex items-center justify-center"
              >
                <span className="text-slate-400 text-sm">?</span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-sm">
            <p className="text-slate-400">Cards: {opponent?.cards.length}</p>
            <p className="text-slate-400">Score: {opponent?.score || 0}</p>
          </div>
        </div>

        {/* Draw and Discard Piles */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 flex flex-col items-center justify-center">
          <div className="mb-6">
            <p className="text-slate-400 text-sm mb-2">Draw Pile</p>
            <button
              onClick={handleDrawClick}
              disabled={!isCurrentPlayerTurn || isDrawing || gameState.drawPile.length === 0}
              className="w-24 h-32 bg-gradient-to-br from-blue-600 to-blue-800 rounded border-2 border-blue-400 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white font-bold transition-all"
            >
              {isDrawing ? <Loader2 className="animate-spin" /> : gameState.drawPile.length}
            </button>
          </div>

          <div className="w-full h-px bg-slate-600 my-4" />

          <div>
            <p className="text-slate-400 text-sm mb-2">Discard Pile</p>
            {gameState.discardPile.length > 0 && (
              <button
                onClick={() => handleTakeDiscardClick(gameState.discardPile[0].id)}
                disabled={!isCurrentPlayerTurn || isDrawing}
                className="w-24 h-32 bg-gradient-to-br from-green-600 to-green-800 rounded border-2 border-green-400 hover:border-green-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white text-center text-sm font-bold p-2 transition-all"
              >
                {getCardDisplay(gameState.discardPile[0])}
              </button>
            )}
          </div>
        </div>

        {/* Your Cards */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-white font-semibold mb-4">Your Cards</h3>
          <div className="grid grid-cols-2 gap-3">
            {currentPlayer?.cards.slice(0, 4).map((card, idx) => {
              const isRevealed = revealedCardIndices.has(idx);
              const isFaceDown = idx < 2; // Top 2 cards are always face down

              return (
                <button
                  key={card.id}
                  onClick={() => {
                    if (showKeepOptions && drawnCard) {
                      handleKeepCard(card.id);
                    } else {
                      setSelectedCard(card.id);
                    }
                  }}
                  className={`bg-slate-700 rounded p-3 text-center border-2 aspect-square flex items-center justify-center font-bold text-sm transition-colors ${
                    selectedCard === card.id
                      ? "border-yellow-400 bg-slate-600"
                      : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  {isFaceDown && !isRevealed ? (
                    <span className="text-slate-400">?</span>
                  ) : (
                    <span className="text-white">{getCardDisplay(card)}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-sm">
            <p className="text-slate-400">Cards: {currentPlayer?.cards.length}</p>
            <p className="text-slate-400">Score: {currentPlayer?.score || 0}</p>
          </div>
        </div>
      </div>

      {/* Drawn Card Display */}
      {drawnCard && showKeepOptions && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 mb-6">
          <h3 className="text-white font-semibold mb-4">You drew: {getCardDisplay(drawnCard)}</h3>
          <p className="text-slate-400 text-sm mb-4">Select a card to replace or discard</p>
          <div className="flex gap-4">
            <Button
              onClick={handleDiscardClick}
              disabled={isKeeping || isDiscarding}
              className="flex-1 bg-red-600 hover:bg-red-700"
            >
              {isDiscarding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Discard"}
            </Button>
            <Button
              onClick={() => {
                if (selectedCard) {
                  handleKeepCard(selectedCard);
                } else {
                  toast.error("Select a card to replace");
                }
              }}
              disabled={!selectedCard || isKeeping || isDiscarding}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {isKeeping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Keep"}
            </Button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4 justify-center">
        {isCurrentPlayerTurn && !showKeepOptions && (
          <>
            <Button
              onClick={handleDrawClick}
              disabled={isDrawing || gameState.drawPile.length === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isDrawing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Draw Card"}
            </Button>
            <Button
              onClick={onCall}
              disabled={isDrawing}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {isDrawing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Call (Declare Win)"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
