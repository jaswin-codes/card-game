export type CardRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'Joker';
export type CardSuit = 'Hearts' | 'Diamonds' | 'Clubs' | 'Spades' | null;

export type CardPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'penalty-1'
  | 'penalty-2'
  | 'penalty-3'
  | 'penalty-4';

export interface Card {
  id: string; // unique card id to track identities
  value: CardRank;
  suit: CardSuit;
  position: CardPosition;
  face_up: boolean;
  known_by: string[]; // player IDs who have seen this card
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'eliminated';

export interface Player {
  id: string;
  name: string;
  cards: Card[];
  score: number; // calculated point sum
  has_called: boolean;
  mistake_count: number;
  connection_status: ConnectionStatus;
  disconnect_timestamp: number | null; // ms timestamp
  is_spectator: boolean;
  took_final_turn: boolean;
}

export type GameStatus = 'setup' | 'playing' | 'final_round' | 'ended';

export interface PowerState {
  card_id: string;
  power_type: '7_8' | '9_10' | 'J_Q' | 'K';
  player_id: string; // player who discarded and is resolving power
  timer_start: number; // timestamp
  // King: the two cards already looked at, so the swap decision must use them
  k_selection?: { own_position: CardPosition; opponent_player_id: string; opponent_position: CardPosition };
}

export type TurnPhase = 'action_choice' | 'draw_decide' | 'resolving_power';

export interface GameState {
  players: Record<string, Player>;
  player_order: string[]; // Counter-clockwise order
  current_player_index: number;
  draw_pile: Card[];
  discard_pile: Card[];
  caller_id: string | null;
  status: GameStatus;
  turn_phase: TurnPhase;
  drawn_card: Card | null;
  // Jump-in window tracking
  last_discard_card: Card | null;
  last_discard_player_id: string | null;
  jump_in_window_open: boolean;
  // Active power resolution state
  active_power: PowerState | null;
  // Timers/Logs
  turn_timer_start: number | null;
  winner_ids: string[];
}

// State Machine Actions
export type Action =
  | { type: 'START_GAME'; player_ids: string[]; dealer_id?: string; timestamp: number }
  | { type: 'LOOK_BOTTOM_CARDS'; player_id: string; timestamp: number }
  | { type: 'DRAW_PILE_DRAW'; player_id: string; timestamp: number }
  | { type: 'DRAW_PILE_KEEP'; player_id: string; target_position: CardPosition; timestamp: number }
  | { type: 'DRAW_PILE_DISCARD'; player_id: string; timestamp: number }
  | { type: 'TAKE_DISCARD_SWAP'; player_id: string; target_position: CardPosition; timestamp: number }
  | { type: 'RESOLVE_POWER_7_8'; player_id: string; target_position: CardPosition; timestamp: number }
  | { type: 'RESOLVE_POWER_9_10'; player_id: string; target_player_id: string; target_position: CardPosition; timestamp: number }
  | { type: 'RESOLVE_POWER_J_Q'; player_id: string; own_position: CardPosition; opponent_player_id: string; opponent_position: CardPosition; timestamp: number }
  | { type: 'RESOLVE_POWER_K_LOOK'; player_id: string; own_position: CardPosition; opponent_player_id: string; opponent_position: CardPosition; timestamp: number }
  | { type: 'RESOLVE_POWER_K'; player_id: string; own_position: CardPosition; opponent_player_id: string; opponent_position: CardPosition; should_swap: boolean; timestamp: number }
  | { type: 'SKIP_POWER'; player_id: string; timestamp: number }
  | { type: 'JUMP_IN_TYPE_1'; player_id: string; card_position: CardPosition; timestamp: number }
  | { type: 'JUMP_IN_TYPE_2'; player_id: string; opponent_player_id: string; opponent_position: CardPosition; own_position: CardPosition; timestamp: number }
  | { type: 'CALL'; player_id: string; timestamp: number }
  | { type: 'DISCONNECT'; player_id: string; timestamp: number }
  | { type: 'RECONNECT'; player_id: string; timestamp: number }
  | { type: 'FORCE_MISTAKE'; player_id: string; mistake_type: string; timestamp: number }
  | { type: 'FORCE_TIMER_EXPIRY'; timestamp: number };

export interface ActionResponse {
  state: GameState;
  success: boolean;
  error?: string;
}
