/**
 * Shared types for card game logic
 */

export type CardValue = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "Joker";
export type CardSuit = "Hearts" | "Diamonds" | "Clubs" | "Spades" | null; // null for Joker

export interface Card {
  id: string;
  value: CardValue;
  suit: CardSuit;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "overflow-1" | "overflow-2" | "overflow-3" | "overflow-4";
  faceUp: boolean;
  knownBy: number[]; // User IDs who have seen this card
}

export interface PlayerGameState {
  userId: number;
  playerIndex: number;
  cards: Card[];
  score: number;
  hasCalled: boolean;
  mistakeCount: number;
  isEliminated: boolean;
  hasSeenBottomCards: boolean;
  hasTakenFinalTurn: boolean;
}

export interface GameState {
  id: string;
  roomCode: string;
  status: "lobby" | "playing" | "finished";
  gamePhase: "setup" | "playing" | "calling" | "finalTurns" | "scoring";
  players: PlayerGameState[];
  currentTurnPlayerIndex: number | null;
  calledByPlayerIndex: number | null;
  drawPile: Card[];
  discardPile: Card[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Card point values according to rules
 */
export function getCardPoints(card: Card): number {
  const { value, suit } = card;

  if (value === "Joker") return -2;
  if (value === "A") return 1;
  if (value === "K") {
    // Red Kings (Hearts, Diamonds) = 0, Black Kings (Clubs, Spades) = 10
    if (suit === "Hearts" || suit === "Diamonds") return 0;
    return 10;
  }
  if (value === "J" || value === "Q") return 10;
  if (value >= "2" && value <= "10") return parseInt(value);
  return 0;
}

/**
 * Get card display name
 */
export function getCardName(card: Card): string {
  if (card.value === "Joker") return "Joker";
  return `${card.value}${card.suit ? card.suit[0] : ""}`;
}

/**
 * Check if a card has a power
 */
export function hasCardPower(value: CardValue): boolean {
  return ["7", "8", "9", "10", "J", "Q", "K"].includes(value);
}

/**
 * Get card power type
 */
export function getCardPowerType(value: CardValue): "lookOwn" | "lookOpponent" | "blindSwap" | "lookAndSwap" | null {
  if (value === "7" || value === "8") return "lookOwn";
  if (value === "9" || value === "10") return "lookOpponent";
  if (value === "J" || value === "Q") return "blindSwap";
  if (value === "K") return "lookAndSwap";
  return null;
}

/**
 * Mistake types
 */
export type MistakeType =
  | "skipping-turn"
  | "wrong-jump-in"
  | "wrong-power-usage"
  | "illegal-peeking"
  | "double-power-use"
  | "moving-card-positions"
  | "revealing-card";

/**
 * Game action types for logging
 */
export type GameActionType =
  | "draw"
  | "discard"
  | "keep-card"
  | "jump-in-type1"
  | "jump-in-type2"
  | "call"
  | "use-power"
  | "mistake"
  | "manual-mistake-report"
  | "game-start"
  | "game-end";
