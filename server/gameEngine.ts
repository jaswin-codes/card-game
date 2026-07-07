/**
 * Core game rules engine
 * Implements all card game logic according to the rules document
 */

import { Card, CardValue, GameState, PlayerGameState, getCardPoints, getCardPowerType } from "@shared/gameTypes";
import { nanoid } from "nanoid";

/**
 * Create a standard 52-card deck + 2 Jokers
 */
export function createDeck(): Card[] {
  const cards: Card[] = [];
  const suits: Array<"Hearts" | "Diamonds" | "Clubs" | "Spades"> = ["Hearts", "Diamonds", "Clubs", "Spades"];
  const values: CardValue[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  for (const suit of suits) {
    for (const value of values) {
      cards.push({
        id: nanoid(),
        value,
        suit,
        position: "top-left", // Placeholder, will be set during deal
        faceUp: false,
        knownBy: [],
      });
    }
  }

  // Add 2 Jokers
  for (let i = 0; i < 2; i++) {
    cards.push({
      id: nanoid(),
      value: "Joker",
      suit: null,
      position: "top-left", // Placeholder
      faceUp: false,
      knownBy: [],
    });
  }

  return cards.sort(() => Math.random() - 0.5); // Shuffle
}

/**
 * Deal initial cards to players (4 cards each in 2x2 grid)
 */
export function dealInitialCards(
  players: PlayerGameState[],
  deck: Card[]
): { players: PlayerGameState[]; remainingDeck: Card[] } {
  const positions: Array<"top-left" | "top-right" | "bottom-left" | "bottom-right"> = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ];

  let deckIndex = 0;
  const updatedPlayers = players.map((player) => ({
    ...player,
    cards: positions.map((position) => {
      const card = { ...deck[deckIndex] };
      card.position = position;
      card.faceUp = false;
      deckIndex++;
      return card;
    }),
  }));

  return {
    players: updatedPlayers,
    remainingDeck: deck.slice(deckIndex),
  };
}

/**
 * Get the next player index (counter-clockwise)
 */
export function getNextPlayerIndex(currentIndex: number, playerCount: number): number {
  return (currentIndex + 1) % playerCount;
}

/**
 * Get the previous player index (clockwise)
 */
export function getPreviousPlayerIndex(currentIndex: number, playerCount: number): number {
  return (currentIndex - 1 + playerCount) % playerCount;
}

/**
 * Calculate total score for a player (sum of visible card points)
 */
export function calculatePlayerScore(player: PlayerGameState): number {
  return player.cards.reduce((sum, card) => sum + getCardPoints(card), 0);
}

/**
 * Check if a card matches another card by value
 */
export function cardsMatch(card1: Card, card2: Card): boolean {
  // For Jokers, they match other Jokers only
  if (card1.value === "Joker" && card2.value === "Joker") return true;
  if (card1.value === "Joker" || card2.value === "Joker") return false;

  // For numbered cards, match by value
  return card1.value === card2.value;
}

/**
 * Check if a player can jump in Type 1 (matching own card)
 */
export function canJumpInType1(player: PlayerGameState, discardTopCard: Card): boolean {
  return player.cards.some((card) => cardsMatch(card, discardTopCard));
}

/**
 * Get matching cards for Type 1 jump-in
 */
export function getMatchingCardsType1(player: PlayerGameState, discardTopCard: Card): Card[] {
  return player.cards.filter((card) => cardsMatch(card, discardTopCard));
}

/**
 * Check if a player can jump in Type 2 (knowledge-based steal)
 */
export function canJumpInType2(
  jumpingPlayer: PlayerGameState,
  targetPlayer: PlayerGameState,
  discardTopCard: Card
): boolean {
  // Find if jumping player knows about a matching card in target player's grid
  return targetPlayer.cards.some(
    (card) => cardsMatch(card, discardTopCard) && card.knownBy.includes(jumpingPlayer.userId)
  );
}

/**
 * Get the card that can be stolen in Type 2 jump-in
 */
export function getStealableCardType2(
  jumpingPlayer: PlayerGameState,
  targetPlayer: PlayerGameState,
  discardTopCard: Card
): Card | null {
  return (
    targetPlayer.cards.find(
      (card) => cardsMatch(card, discardTopCard) && card.knownBy.includes(jumpingPlayer.userId)
    ) || null
  );
}

/**
 * Mark cards as known by a player (used for power effects)
 */
export function markCardsAsKnown(cards: Card[], byUserId: number): Card[] {
  return cards.map((card) => {
    const knownBySet = new Set(card.knownBy);
    knownBySet.add(byUserId);
    return {
      ...card,
      knownBy: Array.from(knownBySet),
    };
  });
}

/**
 * Check if a player can call (has lowest score)
 */
export function canCall(callingPlayer: PlayerGameState, allPlayers: PlayerGameState[]): boolean {
  const callingScore = calculatePlayerScore(callingPlayer);
  const otherScores = allPlayers
    .filter((p) => p.userId !== callingPlayer.userId && !p.isEliminated)
    .map((p) => calculatePlayerScore(p));

  // Player can call if their score is <= all other scores
  return otherScores.every((score) => callingScore <= score);
}

/**
 * Determine the winner after calling
 */
export function determineWinner(
  players: PlayerGameState[],
  calledByPlayerIndex: number
): { winner: PlayerGameState; tiebreaker: boolean } {
  const activePlayers = players.filter((p) => !p.isEliminated);
  const scores = activePlayers.map((p) => ({
    player: p,
    score: calculatePlayerScore(p),
  }));

  const minScore = Math.min(...scores.map((s) => s.score));
  const winners = scores.filter((s) => s.score === minScore);

  if (winners.length === 1) {
    return { winner: winners[0].player, tiebreaker: false };
  }

  // Tiebreaker: caller wins
  const calledPlayer = activePlayers[calledByPlayerIndex];
  const calledPlayerWins = winners.some((w) => w.player.userId === calledPlayer?.userId);

  if (calledPlayerWins) {
    return { winner: calledPlayer!, tiebreaker: true };
  }

  // Shouldn't reach here, but return first winner as fallback
  return { winner: winners[0].player, tiebreaker: false };
}

/**
 * Apply a mistake penalty (add a card from draw pile)
 */
export function applyMistakePenalty(
  player: PlayerGameState,
  drawPile: Card[]
): { updatedPlayer: PlayerGameState; updatedDrawPile: Card[]; eliminated: boolean } {
  // Check if player would exceed 8 cards (auto-elimination)
  if (player.cards.length >= 8) {
    return {
      updatedPlayer: { ...player, isEliminated: true },
      updatedDrawPile: drawPile,
      eliminated: true,
    };
  }

  if (drawPile.length === 0) {
    // No cards left to draw - shouldn't happen in normal play
    return {
      updatedPlayer: player,
      updatedDrawPile: drawPile,
      eliminated: false,
    };
  }

  const penaltyCard = { ...drawPile[0] };
  const positions: Array<"overflow-1" | "overflow-2" | "overflow-3" | "overflow-4"> = [
    "overflow-1",
    "overflow-2",
    "overflow-3",
    "overflow-4",
  ];

  // Find next available overflow position
  const usedOverflows = player.cards
    .filter((c) => c.position.startsWith("overflow"))
    .map((c) => parseInt(c.position.split("-")[1]));
  const nextOverflowIndex = Math.max(...usedOverflows, 0);
  const nextPosition = positions[nextOverflowIndex] || "overflow-4";

  penaltyCard.position = nextPosition;
  penaltyCard.faceUp = false;

  return {
    updatedPlayer: {
      ...player,
      cards: [...player.cards, penaltyCard],
      mistakeCount: player.mistakeCount + 1,
    },
    updatedDrawPile: drawPile.slice(1),
    eliminated: false,
  };
}

/**
 * Remove cards from player's grid (for jump-in)
 */
export function removeCardsFromPlayer(player: PlayerGameState, cardIds: string[]): PlayerGameState {
  return {
    ...player,
    cards: player.cards.filter((c) => !cardIds.includes(c.id)),
  };
}

/**
 * Add cards to player's grid (for Type 2 jump-in swap)
 */
export function addCardsToPlayer(player: PlayerGameState, cards: Card[]): PlayerGameState {
  // Find next available positions
  const positions: Array<"overflow-1" | "overflow-2" | "overflow-3" | "overflow-4"> = [
    "overflow-1",
    "overflow-2",
    "overflow-3",
    "overflow-4",
  ];

  const usedOverflows = player.cards
    .filter((c) => c.position.startsWith("overflow"))
    .map((c) => parseInt(c.position.split("-")[1]));
  const nextOverflowIndex = Math.max(...usedOverflows, 0);

  const newCards = cards.map((card, index) => ({
    ...card,
    position: positions[nextOverflowIndex + index] || "overflow-4",
    faceUp: false,
  }));

  return {
    ...player,
    cards: [...player.cards, ...newCards],
  };
}

/**
 * Validate a draw action
 */
export function validateDrawAction(
  player: PlayerGameState,
  gameState: GameState,
  playerIndex: number
): { valid: boolean; error?: string } {
  // Check if it's player's turn
  if (gameState.currentTurnPlayerIndex !== playerIndex) {
    return { valid: false, error: "Not your turn" };
  }

  // Check if game is in playing phase
  if (gameState.gamePhase !== "playing" && gameState.gamePhase !== "finalTurns") {
    return { valid: false, error: "Game is not in playing phase" };
  }

  // Check if draw pile has cards
  if (gameState.drawPile.length === 0) {
    return { valid: false, error: "Draw pile is empty" };
  }

  return { valid: true };
}

/**
 * Validate a discard action
 */
export function validateDiscardAction(
  player: PlayerGameState,
  cardId: string,
  gameState: GameState,
  playerIndex: number
): { valid: boolean; error?: string } {
  // Check if it's player's turn
  if (gameState.currentTurnPlayerIndex !== playerIndex) {
    return { valid: false, error: "Not your turn" };
  }

  // Check if game is in playing phase
  if (gameState.gamePhase !== "playing" && gameState.gamePhase !== "finalTurns") {
    return { valid: false, error: "Game is not in playing phase" };
  }

  // Check if player has the card
  const card = player.cards.find((c) => c.id === cardId);
  if (!card) {
    return { valid: false, error: "Card not found in your hand" };
  }

  return { valid: true };
}
