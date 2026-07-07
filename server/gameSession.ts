/**
 * Game session manager - handles active game state and turn management
 */

import { GameState, PlayerGameState, Card } from "@shared/gameTypes";
import {
  createDeck,
  dealInitialCards,
  getNextPlayerIndex,
  calculatePlayerScore,
  removeCardsFromPlayer,
  applyMistakePenalty,
} from "./gameEngine";
import { nanoid } from "nanoid";

// Store drawn cards per player per game
const drawnCards = new Map<string, Map<number, Card>>();

/**
 * Initialize a new game session
 */
export function initializeGameSession(
  gameId: string,
  players: Array<{ userId: number; playerIndex: number }>
): GameState {
  // Create and shuffle deck
  const deck = createDeck();

  // Deal initial cards
  const playerStates: PlayerGameState[] = players.map((p) => ({
    userId: p.userId,
    playerIndex: p.playerIndex,
    cards: [],
    score: 0,
    hasCalled: false,
    mistakeCount: 0,
    isEliminated: false,
    hasSeenBottomCards: false,
    hasTakenFinalTurn: false,
  }));

  const { players: dealtPlayers, remainingDeck } = dealInitialCards(playerStates, deck);

  // Flip top card to start discard pile
  const discardCard = remainingDeck[0];
  const drawPile = remainingDeck.slice(1);

  // Initialize drawn cards storage for this game
  drawnCards.set(gameId, new Map());

  return {
    id: gameId,
    roomCode: "", // Will be set elsewhere
    status: "playing",
    gamePhase: "playing",
    players: dealtPlayers,
    currentTurnPlayerIndex: 0, // First player goes first
    calledByPlayerIndex: null,
    drawPile: drawPile,
    discardPile: [discardCard],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Handle a player drawing from the pile
 */
export function handleDrawCard(
  gameState: GameState,
  playerIndex: number
): { gameState: GameState; drawnCard: Card; error?: string } {
  // Validate it's this player's turn
  if (gameState.currentTurnPlayerIndex !== playerIndex) {
    return { gameState, drawnCard: null as any, error: "Not your turn" };
  }

  // Check if draw pile has cards
  if (gameState.drawPile.length === 0) {
    return { gameState, drawnCard: null as any, error: "Draw pile is empty" };
  }

  // Draw the top card
  const drawnCard = gameState.drawPile[0];
  const updatedDrawPile = gameState.drawPile.slice(1);

  // Store the drawn card for this player
  if (!drawnCards.has(gameState.id)) {
    drawnCards.set(gameState.id, new Map());
  }
  drawnCards.get(gameState.id)!.set(playerIndex, drawnCard);

  return {
    gameState: {
      ...gameState,
      drawPile: updatedDrawPile,
      updatedAt: new Date(),
    },
    drawnCard,
  };
}

/**
 * Handle a player keeping a drawn card (swap with one of their cards)
 */
export function handleKeepCard(
  gameState: GameState,
  playerIndex: number,
  targetCardId: string
): { gameState: GameState; error?: string } {
  const player = gameState.players[playerIndex];
  if (!player) {
    return { gameState, error: "Player not found" };
  }

  // Get the currently drawn card
  const drawnCard = drawnCards.get(gameState.id)?.get(playerIndex);
  if (!drawnCard) {
    return { gameState, error: "No card currently drawn" };
  }

  // Find the card to replace
  const targetCard = player.cards.find((c) => c.id === targetCardId);
  if (!targetCard) {
    return { gameState, error: "Target card not found" };
  }

  // Replace the card
  const updatedCards = player.cards.map((c) => {
    if (c.id === targetCardId) {
      return { ...drawnCard, position: c.position };
    }
    return c;
  });

  // Add replaced card to discard pile
  const updatedDiscardPile = [{ ...targetCard, faceUp: true }, ...gameState.discardPile];

  // Update player
  const updatedPlayers = gameState.players.map((p) => {
    if (p.playerIndex === playerIndex) {
      return { ...p, cards: updatedCards };
    }
    return p;
  });

  // Clear the drawn card
  drawnCards.get(gameState.id)?.delete(playerIndex);

  // Move to next player's turn
  const nextTurnIndex = (playerIndex + 1) % gameState.players.length;

  return {
    gameState: {
      ...gameState,
      players: updatedPlayers,
      discardPile: updatedDiscardPile,
      currentTurnPlayerIndex: nextTurnIndex,
      updatedAt: new Date(),
    },
  };
}

/**
 * Handle a player discarding a drawn card
 */
export function handleDiscardCard(
  gameState: GameState,
  playerIndex: number
): { gameState: GameState; error?: string } {
  // Get the currently drawn card
  const drawnCard = drawnCards.get(gameState.id)?.get(playerIndex);
  if (!drawnCard) {
    return { gameState, error: "No card currently drawn" };
  }

  // Add card to discard pile
  const updatedDiscardPile = [{ ...drawnCard, faceUp: true }, ...gameState.discardPile];

  // Clear the drawn card
  drawnCards.get(gameState.id)?.delete(playerIndex);

  // Move to next player's turn
  const nextTurnIndex = (playerIndex + 1) % gameState.players.length;

  return {
    gameState: {
      ...gameState,
      discardPile: updatedDiscardPile,
      currentTurnPlayerIndex: nextTurnIndex,
      updatedAt: new Date(),
    },
  };
}

/**
 * Handle a player taking the top discard
 */
export function handleTakeDiscard(
  gameState: GameState,
  playerIndex: number,
  targetCardId: string
): { gameState: GameState; error?: string } {
  const player = gameState.players[playerIndex];
  if (!player) {
    return { gameState, error: "Player not found" };
  }

  // Validate it's this player's turn
  if (gameState.currentTurnPlayerIndex !== playerIndex) {
    return { gameState, error: "Not your turn" };
  }

  // Get the top discard card
  const topDiscard = gameState.discardPile[0];
  if (!topDiscard) {
    return { gameState, error: "No discard pile card available" };
  }

  // Find the card to replace
  const targetCard = player.cards.find((c) => c.id === targetCardId);
  if (!targetCard) {
    return { gameState, error: "Target card not found" };
  }

  // Replace the card
  const updatedCards = player.cards.map((c) => {
    if (c.id === targetCardId) {
      return { ...topDiscard, position: c.position };
    }
    return c;
  });

  // Add replaced card to discard pile
  const updatedDiscardPile = [{ ...targetCard, faceUp: true }, ...gameState.discardPile.slice(1)];

  // Update player
  const updatedPlayers = gameState.players.map((p) => {
    if (p.playerIndex === playerIndex) {
      return { ...p, cards: updatedCards };
    }
    return p;
  });

  // Move to next player's turn
  const nextTurnIndex = (playerIndex + 1) % gameState.players.length;

  return {
    gameState: {
      ...gameState,
      players: updatedPlayers,
      discardPile: updatedDiscardPile,
      currentTurnPlayerIndex: nextTurnIndex,
      updatedAt: new Date(),
    },
  };
}

/**
 * Handle a player calling (declaring they have lowest score)
 */
export function handleCall(
  gameState: GameState,
  playerIndex: number
): { gameState: GameState; error?: string } {
  const player = gameState.players[playerIndex];
  if (!player) {
    return { gameState, error: "Player not found" };
  }

  // Mark player as called
  const updatedPlayers = gameState.players.map((p) => {
    if (p.playerIndex === playerIndex) {
      return { ...p, hasCalled: true };
    }
    return p;
  });

  // Calculate scores for all players
  const scoresWithPlayers = updatedPlayers.map((p) => ({
    player: p,
    score: calculatePlayerScore(p),
  }));

  // Check if caller has the lowest score
  const callerScore = calculatePlayerScore(player);
  const hasLowest = scoresWithPlayers.every((sp) => callerScore <= sp.score);

  if (!hasLowest) {
    // Caller doesn't have lowest - they lose!
    return {
      gameState,
      error: "You don't have the lowest score! Game over - you lose.",
    };
  }

  // Caller has the lowest - they win!
  return {
    gameState: {
      ...gameState,
      players: updatedPlayers,
      gamePhase: "scoring",
      calledByPlayerIndex: playerIndex,
      updatedAt: new Date(),
    },
  };
}

/**
 * Calculate final scores and determine winner
 */
export function calculateFinalScores(gameState: GameState): {
  players: Array<PlayerGameState & { finalScore: number }>;
  winner: PlayerGameState & { finalScore: number };
} {
  const playersWithScores = gameState.players.map((p) => ({
    ...p,
    finalScore: calculatePlayerScore(p),
  }));

  // Find winner (lowest score)
  let winner = playersWithScores[0];
  for (const player of playersWithScores) {
    if (player.finalScore < winner.finalScore) {
      winner = player;
    }
  }

  return { players: playersWithScores, winner };
}
