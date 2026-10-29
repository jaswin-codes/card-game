import {
  Card,
  CardPosition,
  CardRank,
  CardSuit,
  GameState,
  Player,
  Action,
  ActionResponse,
  TurnPhase,
  ConnectionStatus
} from './types.js';

// Positions helper
export const STARTING_POSITIONS: CardPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
export const PENALTY_POSITIONS: CardPosition[] = ['penalty-1', 'penalty-2', 'penalty-3', 'penalty-4'];

// Helper to calculate card points
export function getCardPoints(card: Card): number {
  if (card.value === 'Joker') return -2;
  if (card.value === 'A') return 1;
  if (card.value === 'J' || card.value === 'Q') return 10;
  if (card.value === 'K') {
    return card.suit === 'Hearts' || card.suit === 'Diamonds' ? 0 : 10;
  }
  return parseInt(card.value, 10);
}

// Generate a full deck of 54 cards
export function createDeck(): Card[] {
  const suits: CardSuit[] = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
  const ranks: CardRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck: Card[] = [];
  let idCounter = 1;

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        id: `card-${idCounter++}`,
        value: rank,
        suit,
        position: 'top-left', // default, reassigned when dealt
        face_up: false,
        known_by: []
      });
    }
  }

  // 2 Jokers
  for (let i = 0; i < 2; i++) {
    deck.push({
      id: `card-${idCounter++}`,
      value: 'Joker',
      suit: null,
      position: 'top-left',
      face_up: false,
      known_by: []
    });
  }

  return deck;
}

// Fisher-Yates shuffle
export function shuffleDeck(deck: Card[], randomFn = Math.random): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Get next active player in counter-clockwise order
export function getNextPlayerIndex(currentIndex: number, order: string[], players: Record<string, Player>): number {
  let idx = currentIndex;
  for (let i = 0; i < order.length; i++) {
    idx = (idx + 1) % order.length;
    const player = players[order[idx]];
    if (player && player.connection_status !== 'eliminated' && !player.is_spectator) {
      return idx;
    }
  }
  return currentIndex;
}

// Reshuffle draw pile from discard pile
export function checkAndReshuffleDrawPile(state: GameState, randomFn = Math.random): GameState {
  if (state.draw_pile.length > 0) return state;

  // Need at least one card in discard to reshuffle, and keep the top card
  if (state.discard_pile.length <= 1) return state;

  const topDiscard = state.discard_pile[state.discard_pile.length - 1];
  const cardsToShuffle = state.discard_pile.slice(0, -1).map(c => ({
    ...c,
    face_up: false,
    known_by: [] // Reset knowledge on reshuffle
  }));

  const newDrawPile = shuffleDeck(cardsToShuffle, randomFn);

  return {
    ...state,
    draw_pile: newDrawPile,
    discard_pile: [topDiscard]
  };
}

// Score calculator for a player
export function calculatePlayerScore(player: Player): number {
  return player.cards.reduce((sum, c) => sum + getCardPoints(c), 0);
}

// Apply a mistake penalty to a player.
// Returns state unchanged (and logs a warning) if the player ID is not found,
// so callers always receive a valid GameState regardless of lookup failures.
export function applyMistake(state: GameState, playerId: string, timestamp: number, randomFn = Math.random): GameState {
  const rawPlayer = state.players[playerId];
  if (!rawPlayer) {
    // Defensive: player may have already been eliminated / removed. Do not crash.
    console.warn(`[applyMistake] player '${playerId}' not found in state — skipping penalty`);
    return state;
  }

  let newState = { ...state, players: { ...state.players } };
  let player = { ...rawPlayer };

  player.mistake_count += 1;

  // Reshuffle if empty
  newState = checkAndReshuffleDrawPile(newState, randomFn);

  if (newState.draw_pile.length === 0) {
    // If no cards left to draw, cannot draw penalty card but still count mistake
    newState.players[playerId] = player;
    return newState;
  }

  // Draw penalty card
  const penaltyCard = newState.draw_pile[0];
  newState.draw_pile = newState.draw_pile.slice(1);

  const currentCardsCount = player.cards.length;

  if (currentCardsCount >= 8) {
    // 9th card would be added -> auto-elimination
    player.connection_status = 'eliminated';
    player.is_spectator = true;
    // Their cards and the 9th card go face up to the bottom of the discard pile
    newState.discard_pile = [...[...player.cards, penaltyCard].map(c => ({ ...c, face_up: true })), ...newState.discard_pile];
    player.cards = [];
    player.score = 0;
    newState.players[playerId] = player;

    const activePlayers = newState.player_order.filter(id => {
      const p = newState.players[id];
      return p && p.connection_status !== 'eliminated' && !p.is_spectator;
    });

    if (activePlayers.length <= 1 || (newState.status === 'final_round' && allFinalTurnsTaken(newState))) {
      return endRound(newState);
    }

    if (newState.player_order[newState.current_player_index] === playerId) {
      // The eliminated player was mid-turn: an undecided drawn card goes to the discard pile
      if (newState.drawn_card) {
        const discarded = { ...newState.drawn_card, face_up: true };
        newState.discard_pile = [...newState.discard_pile, discarded];
        newState.last_discard_card = discarded;
        newState.last_discard_player_id = playerId;
        newState.drawn_card = null;
      }
      newState.active_power = null;
      newState.current_player_index = nextTurnIndex(newState);
      newState.turn_phase = 'action_choice';
      newState.turn_timer_start = timestamp;
    }
    return newState;
  }

  // First empty slot: a gap left by a jump-in is refilled before a new penalty slot
  const taken = new Set(player.cards.map(c => c.position));
  const nextSlot = [...STARTING_POSITIONS, ...PENALTY_POSITIONS].find(pos => !taken.has(pos))!;
  const assignedCard: Card = {
    ...penaltyCard,
    position: nextSlot,
    face_up: false,
    known_by: []
  };

  player.cards = [...player.cards, assignedCard];
  player.score = calculatePlayerScore(player);
  newState.players[playerId] = player;

  return newState;
}

// Initial Game Setup
export function createInitialState(playerIds: string[], dealerId?: string, randomFn = Math.random): GameState {
  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new Error('Player count must be between 2 and 4');
  }

  const rawDeck = createDeck();
  const shuffled = shuffleDeck(rawDeck, randomFn);

  let deckIndex = 0;
  const players: Record<string, Player> = {};

  for (const id of playerIds) {
    const playerCards: Card[] = [];
    for (let i = 0; i < 4; i++) {
      const card = shuffled[deckIndex++];
      const pos = STARTING_POSITIONS[i];
      playerCards.push({
        ...card,
        position: pos,
        known_by: i >= 2 ? [id] : [] // bottom two are known by the owner
      });
    }

    players[id] = {
      id,
      name: `Player ${id}`,
      cards: playerCards,
      score: 0, // initially 0 or calculated
      has_called: false,
      mistake_count: 0,
      connection_status: 'connected',
      disconnect_timestamp: null,
      is_spectator: false,
      took_final_turn: false
    };
    players[id].score = calculatePlayerScore(players[id]);
  }

  const drawPile = shuffled.slice(deckIndex);
  const discardStartCard = { ...drawPile[0], face_up: true };
  const finalDrawPile = drawPile.slice(1);

  // Winner goes first. If not provided, starting player is index 0
  let startIndex = 0;
  if (dealerId && playerIds.includes(dealerId)) {
    startIndex = playerIds.indexOf(dealerId);
  }

  return {
    players,
    player_order: playerIds,
    current_player_index: startIndex,
    draw_pile: finalDrawPile,
    discard_pile: [discardStartCard],
    caller_id: null,
    status: 'playing',
    turn_phase: 'action_choice',
    drawn_card: null,
    last_discard_card: discardStartCard,
    last_discard_player_id: null,
    jump_in_window_open: true,
    active_power: null,
    turn_timer_start: null,
    winner_ids: [],
    mistake_log: [],
    recent_tops: []
  };
}

// Reducer State Transition Function
export function transition(state: GameState, action: Action, timestamp: number, randomFn = Math.random): ActionResponse {
  if (!action || typeof action.type !== 'string') {
    return { state, success: false, error: 'Invalid action' };
  }

  const result = trackRecentTops(state, logMistakes(state, action, runAction(state, action, timestamp, randomFn), timestamp));

  // Immutability contract: a returned state must never share its players map
  // object with the input state, so callers can safely persist/compare either.
  if (result.state !== state && result.state.players === state.players) {
    return { ...result, state: { ...result.state, players: { ...result.state.players } } };
  }
  return result;
}

const MISTAKE_LOG_SIZE = 20;
const RACE_WINDOW = 5; // top discards that may change between seeing a card and the jump arriving

function trackRecentTops(before: GameState, result: ActionResponse): ActionResponse {
  const prevTop = before.last_discard_card;
  if (!prevTop || result.state.last_discard_card?.id === prevTop.id) return result;
  const recent = [...(result.state.recent_tops ?? []), { id: prevTop.id, value: prevTop.value }].slice(-RACE_WINDOW);
  return { ...result, state: { ...result.state, recent_tops: recent } };
}

function logMistakes(before: GameState, action: Action, result: ActionResponse, timestamp: number): ActionResponse {
  if (result.state === before) return result;
  const reason =
    result.error ??
    (action.type === 'FORCE_TIMER_EXPIRY' ? 'Ran out of time' : action.type === 'FORCE_MISTAKE' ? action.mistake_type : 'Mistake');
  const entries = Object.keys(result.state.players)
    .filter(id => result.state.players[id].mistake_count > (before.players[id]?.mistake_count ?? 0))
    .map(player_id => ({ player_id, reason, timestamp }));
  if (entries.length === 0) return result;
  const log = [...(result.state.mistake_log ?? []), ...entries].slice(-MISTAKE_LOG_SIZE);
  return { ...result, state: { ...result.state, mistake_log: log } };
}

function runAction(state: GameState, action: Action, timestamp: number, randomFn: () => number): ActionResponse {
  if (state.status === 'ended' && action.type !== 'START_GAME') {
    return { state, success: false, error: 'Game has ended' };
  }

  switch (action.type) {
    case 'START_GAME': {
      try {
        const nextState = createInitialState(action.player_ids, action.dealer_id, randomFn);
        nextState.turn_timer_start = action.timestamp;
        return { state: nextState, success: true };
      } catch (err: any) {
        return { state, success: false, error: err.message };
      }
    }

    case 'LOOK_BOTTOM_CARDS': {
      const player = state.players[action.player_id];
      if (!player || player.is_spectator) {
        return { state, success: false, error: 'Invalid player' };
      }
      // Add player to bottom cards knowledge
      const nextPlayers = { ...state.players };
      const nextCards = player.cards.map(c => {
        if (c.position === 'bottom-left' || c.position === 'bottom-right') {
          if (!c.known_by.includes(action.player_id)) {
            return { ...c, known_by: [...c.known_by, action.player_id] };
          }
        }
        return c;
      });
      nextPlayers[action.player_id] = { ...player, cards: nextCards };
      return { state: { ...state, players: nextPlayers }, success: true };
    }

    case 'DRAW_PILE_DRAW': {
      const activePlayerId = state.player_order[state.current_player_index];
      if (action.player_id !== activePlayerId) {
        // Skipping turn/playing out of order mistake
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Skipped turn / out of order action' };
      }

      if (state.turn_phase !== 'action_choice') {
        return { state, success: false, error: 'Cannot draw card in this phase' };
      }

      // Check draw pile exhaustion
      let nextState = checkAndReshuffleDrawPile(state, randomFn);
      if (nextState.draw_pile.length === 0) {
        return { state: nextState, success: false, error: 'Draw pile is empty' };
      }

      const drawn = nextState.draw_pile[0];
      const drawnWithKnowledge = { ...drawn, known_by: [action.player_id] }; // Drawer gets to see it

      return {
        state: {
          ...nextState,
          draw_pile: nextState.draw_pile.slice(1),
          drawn_card: drawnWithKnowledge,
          turn_phase: 'draw_decide'
          // Jump-in window on the previous discard stays open until this player
          // actually places a card on the discard pile.
        },
        success: true
      };
    }

    case 'DRAW_PILE_KEEP': {
      const activePlayerId = state.player_order[state.current_player_index];
      if (action.player_id !== activePlayerId) {
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Out of order action' };
      }

      if (state.turn_phase !== 'draw_decide' || !state.drawn_card) {
        return { state, success: false, error: 'No drawn card to swap' };
      }

      const player = state.players[action.player_id];
      const targetCard = player.cards.find(c => c.position === action.target_position);
      if (!targetCard) {
        return { state, success: false, error: 'Target position not found' };
      }

      // Cannot interact with caller or already-finished players' cards if final round
      if (state.status === 'final_round') {
        if (state.caller_id === action.player_id || player.took_final_turn) {
          // Can interact with own cards but let's double check if player is already finished
          return { state, success: false, error: 'Already took final turn' };
        }
      }

      // Swap
      const discardedCard = { ...targetCard, face_up: true, position: 'top-left' as CardPosition };
      const newCardInGrid = { ...state.drawn_card, position: action.target_position };

      const nextCards = player.cards.map(c => (c.position === action.target_position ? newCardInGrid : c));
      const nextPlayer = { ...player, cards: nextCards };
      nextPlayer.score = calculatePlayerScore(nextPlayer);

      const nextPlayers = { ...state.players, [action.player_id]: nextPlayer };

      let nextGameState: GameState = {
        ...state,
        players: nextPlayers,
        discard_pile: [...state.discard_pile, discardedCard],
        drawn_card: null,
        last_discard_card: discardedCard,
        last_discard_player_id: action.player_id,
        jump_in_window_open: true
      };

      return completeTurn(nextGameState, action.player_id, timestamp);
    }

    case 'DRAW_PILE_DISCARD': {
      const activePlayerId = state.player_order[state.current_player_index];
      if (action.player_id !== activePlayerId) {
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Out of order action' };
      }

      if (state.turn_phase !== 'draw_decide' || !state.drawn_card) {
        return { state, success: false, error: 'No drawn card to discard' };
      }

      const discarded = { ...state.drawn_card, face_up: true };

      // Check if it has power
      const hasPower = ['7', '8', '9', '10', 'J', 'Q', 'K'].includes(discarded.value);

      let nextGameState: GameState = {
        ...state,
        discard_pile: [...state.discard_pile, discarded],
        drawn_card: null,
        last_discard_card: discarded,
        last_discard_player_id: action.player_id,
        jump_in_window_open: true
      };

      if (hasPower) {
        let pType: '7_8' | '9_10' | 'J_Q' | 'K' = '7_8';
        if (discarded.value === '7' || discarded.value === '8') pType = '7_8';
        else if (discarded.value === '9' || discarded.value === '10') pType = '9_10';
        else if (discarded.value === 'J' || discarded.value === 'Q') pType = 'J_Q';
        else if (discarded.value === 'K') pType = 'K';

        nextGameState.turn_phase = 'resolving_power';
        nextGameState.active_power = {
          card_id: discarded.id,
          power_type: pType,
          player_id: action.player_id,
          timer_start: timestamp
        };
        return { state: nextGameState, success: true };
      } else {
        return completeTurn(nextGameState, action.player_id, timestamp);
      }
    }

    case 'TAKE_DISCARD_SWAP': {
      const activePlayerId = state.player_order[state.current_player_index];
      if (action.player_id !== activePlayerId) {
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Out of order action' };
      }

      if (state.turn_phase !== 'action_choice') {
        return { state, success: false, error: 'Cannot take discard in this phase' };
      }

      if (state.discard_pile.length === 0) {
        return { state, success: false, error: 'Discard pile is empty' };
      }

      const player = state.players[action.player_id];
      const targetCard = player.cards.find(c => c.position === action.target_position);
      if (!targetCard) {
        return { state, success: false, error: 'Target position not found' };
      }

      const takenCard = state.discard_pile[state.discard_pile.length - 1];
      const discardedCard = { ...targetCard, face_up: true, position: 'top-left' as CardPosition };

      // Swap
      const newCardInGrid = {
        ...takenCard,
        position: action.target_position,
        face_up: false, // goes face down
        known_by: [action.player_id] // the active player and everyone knows (since it was taken from public discard)
      };

      // Add to known_by for everyone? The spec says "Everyone can see which card you took and where you placed it"
      // So everyone knows this card.
      newCardInGrid.known_by = Object.keys(state.players);

      const nextCards = player.cards.map(c => (c.position === action.target_position ? newCardInGrid : c));
      const nextPlayer = { ...player, cards: nextCards };
      nextPlayer.score = calculatePlayerScore(nextPlayer);

      const nextPlayers = { ...state.players, [action.player_id]: nextPlayer };

      let nextGameState: GameState = {
        ...state,
        players: nextPlayers,
        discard_pile: [...state.discard_pile.slice(0, -1), discardedCard],
        last_discard_card: discardedCard,
        last_discard_player_id: action.player_id,
        jump_in_window_open: true
      };

      return completeTurn(nextGameState, action.player_id, timestamp);
    }

    case 'RESOLVE_POWER_7_8': {
      if (!state.active_power || state.active_power.power_type !== '7_8' || state.active_power.player_id !== action.player_id) {
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Wrong power usage' };
      }

      const player = state.players[action.player_id];
      const targetCard = player.cards.find(c => c.position === action.target_position);
      if (!targetCard) {
        return { state, success: false, error: 'Card position not found' };
      }

      // Add to known_by
      const nextCards = player.cards.map(c => {
        if (c.position === action.target_position) {
          return { ...c, known_by: Array.from(new Set([...c.known_by, action.player_id])) };
        }
        return c;
      });

      const nextPlayer = { ...player, cards: nextCards };
      const nextPlayers = { ...state.players, [action.player_id]: nextPlayer };

      let nextGameState: GameState = {
        ...state,
        players: nextPlayers,
        active_power: null,
        turn_phase: 'action_choice'
      };

      return completeTurn(nextGameState, action.player_id, timestamp);
    }

    case 'RESOLVE_POWER_9_10': {
      if (!state.active_power || state.active_power.power_type !== '9_10' || state.active_power.player_id !== action.player_id) {
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Wrong power usage' };
      }

      if (action.target_player_id === action.player_id) {
        return { state, success: false, error: 'Cannot target yourself with 9/10' };
      }

      // Restriction: cannot interact with caller's cards or finished players' cards in final round
      if (state.status === 'final_round') {
        const targetP = state.players[action.target_player_id];
        if (action.target_player_id === state.caller_id || (targetP && targetP.took_final_turn)) {
          return { state, success: false, error: 'Cannot interact with caller or finished player cards' };
        }
      }

      const targetPlayer = state.players[action.target_player_id];
      if (!targetPlayer) {
        return { state, success: false, error: 'Target player not found' };
      }

      const targetCard = targetPlayer.cards.find(c => c.position === action.target_position);
      if (!targetCard) {
        return { state, success: false, error: 'Card position not found' };
      }

      // Add to known_by
      const nextCards = targetPlayer.cards.map(c => {
        if (c.position === action.target_position) {
          return { ...c, known_by: Array.from(new Set([...c.known_by, action.player_id])) };
        }
        return c;
      });

      const nextPlayers = {
        ...state.players,
        [action.target_player_id]: { ...targetPlayer, cards: nextCards }
      };

      let nextGameState: GameState = {
        ...state,
        players: nextPlayers,
        active_power: null,
        turn_phase: 'action_choice'
      };

      return completeTurn(nextGameState, action.player_id, timestamp);
    }

    case 'RESOLVE_POWER_J_Q': {
      if (!state.active_power || state.active_power.power_type !== 'J_Q' || state.active_power.player_id !== action.player_id) {
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Wrong power usage' };
      }

      if (action.opponent_player_id === action.player_id) {
        return { state, success: false, error: 'Cannot target yourself' };
      }

      if (state.status === 'final_round') {
        const opp = state.players[action.opponent_player_id];
        if (action.opponent_player_id === state.caller_id || (opp && opp.took_final_turn)) {
          return { state, success: false, error: 'Cannot interact with finished player' };
        }
      }

      const ownPlayer = state.players[action.player_id];
      const oppPlayer = state.players[action.opponent_player_id];
      if (!ownPlayer || !oppPlayer) {
        return { state, success: false, error: 'Players not found' };
      }

      const ownCard = ownPlayer.cards.find(c => c.position === action.own_position);
      const oppCard = oppPlayer.cards.find(c => c.position === action.opponent_position);
      if (!ownCard || !oppCard) {
        return { state, success: false, error: 'Card position not found' };
      }

      // Swap
      const nextOwnCards = ownPlayer.cards.map(c => {
        if (c.position === action.own_position) {
          return { ...oppCard, position: action.own_position };
        }
        return c;
      });

      const nextOppCards = oppPlayer.cards.map(c => {
        if (c.position === action.opponent_position) {
          return { ...ownCard, position: action.opponent_position };
        }
        return c;
      });

      const nextPlayers = {
        ...state.players,
        [action.player_id]: {
          ...ownPlayer,
          cards: nextOwnCards,
          score: ownPlayer.cards.reduce((sum, c) => sum + getCardPoints(c), 0) // recalculate below
        },
        [action.opponent_player_id]: {
          ...oppPlayer,
          cards: nextOppCards,
          score: oppPlayer.cards.reduce((sum, c) => sum + getCardPoints(c), 0)
        }
      };

      nextPlayers[action.player_id].score = calculatePlayerScore(nextPlayers[action.player_id]);
      nextPlayers[action.opponent_player_id].score = calculatePlayerScore(nextPlayers[action.opponent_player_id]);

      let nextGameState: GameState = {
        ...state,
        players: nextPlayers,
        active_power: null,
        turn_phase: 'action_choice'
      };

      return completeTurn(nextGameState, action.player_id, timestamp);
    }

    case 'RESOLVE_POWER_K_LOOK':
    case 'RESOLVE_POWER_K': {
      if (!state.active_power || state.active_power.power_type !== 'K' || state.active_power.player_id !== action.player_id) {
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Wrong power usage' };
      }

      if (action.opponent_player_id === action.player_id) {
        return { state, success: false, error: 'Cannot target yourself' };
      }

      // After looking, the swap decision applies to exactly the cards looked at
      const sel = state.active_power.k_selection;
      if (sel && (sel.own_position !== action.own_position || sel.opponent_player_id !== action.opponent_player_id || sel.opponent_position !== action.opponent_position)) {
        return { state, success: false, error: 'You already looked at other cards' };
      }

      if (state.status === 'final_round') {
        const opp = state.players[action.opponent_player_id];
        if (action.opponent_player_id === state.caller_id || (opp && opp.took_final_turn)) {
          return { state, success: false, error: 'Cannot interact with finished player' };
        }
      }

      const ownPlayer = state.players[action.player_id];
      const oppPlayer = state.players[action.opponent_player_id];
      if (!ownPlayer || !oppPlayer || oppPlayer.is_spectator) {
        return { state, success: false, error: 'Players not found' };
      }

      const ownCard = ownPlayer.cards.find(c => c.position === action.own_position);
      const oppCard = oppPlayer.cards.find(c => c.position === action.opponent_position);
      if (!ownCard || !oppCard) {
        return { state, success: false, error: 'Card position not found' };
      }

      if (action.type === 'RESOLVE_POWER_K_LOOK') {
        if (sel) return { state, success: false, error: 'Already looked' };
        const learn = (c: Card) => ({ ...c, known_by: Array.from(new Set([...c.known_by, action.player_id])) });
        return {
          state: {
            ...state,
            players: {
              ...state.players,
              [action.player_id]: { ...ownPlayer, cards: ownPlayer.cards.map(c => (c.position === action.own_position ? learn(c) : c)) },
              [action.opponent_player_id]: { ...oppPlayer, cards: oppPlayer.cards.map(c => (c.position === action.opponent_position ? learn(c) : c)) }
            },
            active_power: {
              ...state.active_power,
              k_selection: { own_position: action.own_position, opponent_player_id: action.opponent_player_id, opponent_position: action.opponent_position }
            }
          },
          success: true
        };
      }

      // Add to known_by of both cards
      const ownCardWithKnowledge = {
        ...ownCard,
        known_by: Array.from(new Set([...ownCard.known_by, action.player_id]))
      };
      const oppCardWithKnowledge = {
        ...oppCard,
        known_by: Array.from(new Set([...oppCard.known_by, action.player_id]))
      };

      let nextOwnCards = ownPlayer.cards.map(c => (c.position === action.own_position ? ownCardWithKnowledge : c));
      let nextOppCards = oppPlayer.cards.map(c => (c.position === action.opponent_position ? oppCardWithKnowledge : c));

      if (action.should_swap) {
        // Swap
        nextOwnCards = ownPlayer.cards.map(c => {
          if (c.position === action.own_position) {
            return { ...oppCardWithKnowledge, position: action.own_position };
          }
          return c;
        });
        nextOppCards = oppPlayer.cards.map(c => {
          if (c.position === action.opponent_position) {
            return { ...ownCardWithKnowledge, position: action.opponent_position };
          }
          return c;
        });
      }

      const nextPlayers = {
        ...state.players,
        [action.player_id]: {
          ...ownPlayer,
          cards: nextOwnCards,
          score: 0
        },
        [action.opponent_player_id]: {
          ...oppPlayer,
          cards: nextOppCards,
          score: 0
        }
      };

      nextPlayers[action.player_id].score = calculatePlayerScore(nextPlayers[action.player_id]);
      nextPlayers[action.opponent_player_id].score = calculatePlayerScore(nextPlayers[action.opponent_player_id]);

      let nextGameState: GameState = {
        ...state,
        players: nextPlayers,
        active_power: null,
        turn_phase: 'action_choice'
      };

      return completeTurn(nextGameState, action.player_id, timestamp);
    }

    case 'SKIP_POWER': {
      // Powers are optional ("you may now activate it")
      if (!state.active_power || state.active_power.player_id !== action.player_id) {
        return { state, success: false, error: 'No power to skip' };
      }
      return completeTurn({ ...state, active_power: null, turn_phase: 'action_choice' }, action.player_id, timestamp);
    }

    case 'JUMP_IN_TYPE_1': {
      if (!state.jump_in_window_open || !state.last_discard_card) {
        return { state, success: false, error: 'Jump-in window is closed' };
      }

      // Check final round restriction: cannot jump-in from finished player's cards
      if (state.status === 'final_round') {
        const jumper = state.players[action.player_id];
        if (action.player_id === state.caller_id || (jumper && jumper.took_final_turn)) {
          return { state, success: false, error: 'Already took final turn / cannot jump in' };
        }
      }

      const player = state.players[action.player_id];
      if (!player || player.is_spectator) {
        return { state, success: false, error: 'Invalid player' };
      }

      const card = player.cards.find(c => c.position === action.card_position);
      if (!card) {
        return { state, success: false, error: 'Card not found' };
      }

      // King matching checks
      // Ranks compare by value only, so red and black Kings match each other
      if (card.value === state.last_discard_card.value) {
        // Valid jump-in
        const discarded = { ...card, face_up: true, position: 'top-left' as CardPosition };
        const nextCards = player.cards.filter(c => c.position !== action.card_position);

        const nextPlayer = { ...player, cards: nextCards };
        nextPlayer.score = calculatePlayerScore(nextPlayer);

        const nextPlayers = { ...state.players, [action.player_id]: nextPlayer };

        let nextGameState = {
          ...state,
          players: nextPlayers,
          discard_pile: [...state.discard_pile, discarded],
          last_discard_card: discarded,
          last_discard_player_id: action.player_id,
          jump_in_window_open: true // window remains open for new discard
        };

        return { state: nextGameState, success: true };
      } else if (lostJumpInRace(state, action.expected_discard_id, card.value)) {
        return { state, success: false, error: 'Too late — someone else jumped in first' };
      } else {
        // Wrong jump-in number mistake
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Wrong jump-in number' };
      }
    }

    case 'JUMP_IN_TYPE_2': {
      if (!state.jump_in_window_open || !state.last_discard_card) {
        return { state, success: false, error: 'Jump-in window is closed' };
      }

      if (action.opponent_player_id === action.player_id) {
        return { state, success: false, error: 'Cannot use Type 2 jump-in on yourself' };
      }

      // Check final round restrictions
      if (state.status === 'final_round') {
        const jumper = state.players[action.player_id];
        const opponent = state.players[action.opponent_player_id];
        if (action.player_id === state.caller_id || (jumper && jumper.took_final_turn)) {
          return { state, success: false, error: 'Already took final turn / cannot jump in' };
        }
        if (action.opponent_player_id === state.caller_id || (opponent && opponent.took_final_turn)) {
          return { state, success: false, error: 'Cannot interact with caller or finished player' };
        }
      }

      const jumper = state.players[action.player_id];
      const opponent = state.players[action.opponent_player_id];
      if (!jumper || !opponent || jumper.is_spectator || opponent.is_spectator) {
        return { state, success: false, error: 'Player not found' };
      }

      const oppCard = opponent.cards.find(c => c.position === action.opponent_position);
      const ownCard = jumper.cards.find(c => c.position === action.own_position);
      if (!oppCard || !ownCard) {
        return { state, success: false, error: 'Card not found' };
      }

      // Check if jumper has seen the opponent's card (prior knowledge)
      const hasPriorKnowledge = oppCard.known_by.includes(action.player_id);
      const matches = oppCard.value === state.last_discard_card.value;
      if (!(hasPriorKnowledge && matches) && targetJumpedByOther(state, action.expected_opponent_card_id, oppCard.id)) {
        return { state, success: false, error: 'Too late — someone else jumped in first' };
      }
      if (!hasPriorKnowledge) {
        // Mistake: illegal peeking / wrong jump-in / knowledge requirement not met
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'No prior knowledge of opponent card' };
      }

      if (matches) {
        // Valid jump-in: discard opponent's card, give opponent own card
        const discarded = { ...oppCard, face_up: true, position: 'top-left' as CardPosition };

        // Opponent loses their matching card, gets the ownCard face-down
        const nextOppCards = opponent.cards
          .filter(c => c.position !== action.opponent_position)
          .concat({
            ...ownCard,
            position: action.opponent_position,
            face_up: false,
            // Only the jumper keeps knowledge of the card they handed over
            known_by: ownCard.known_by.includes(action.player_id) ? [action.player_id] : []
          });

        // Jumper loses ownCard
        const nextOwnCards = jumper.cards.filter(c => c.position !== action.own_position);

        const nextJumper = { ...jumper, cards: nextOwnCards };
        nextJumper.score = calculatePlayerScore(nextJumper);

        const nextOpponent = { ...opponent, cards: nextOppCards };
        nextOpponent.score = calculatePlayerScore(nextOpponent);

        const nextPlayers = {
          ...state.players,
          [action.player_id]: nextJumper,
          [action.opponent_player_id]: nextOpponent
        };

        let nextGameState = {
          ...state,
          players: nextPlayers,
          discard_pile: [...state.discard_pile, discarded],
          last_discard_card: discarded,
          last_discard_player_id: action.player_id,
          jump_in_window_open: true
        };

        return { state: nextGameState, success: true };
      } else {
        // Wrong matching number
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Wrong jump-in card rank' };
      }
    }

    case 'CALL': {
      const activePlayerId = state.player_order[state.current_player_index];
      if (action.player_id !== activePlayerId) {
        const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
        return { state: nextState, success: false, error: 'Cannot call out of order' };
      }

      if (state.turn_phase !== 'action_choice') {
        return { state, success: false, error: 'Can only call at start of turn' };
      }

      if (state.caller_id !== null) {
        return { state, success: false, error: 'Round has already been called' };
      }

      // Set caller and transition to final round
      const caller = { ...state.players[action.player_id], has_called: true };
      const nextPlayers = { ...state.players, [action.player_id]: caller };

      let nextGameState: GameState = {
        ...state,
        players: nextPlayers,
        caller_id: action.player_id,
        status: 'final_round'
      };

      // Since calling ends the turn, proceed
      return completeTurn(nextGameState, action.player_id, timestamp);
    }

    case 'DISCONNECT': {
      const player = state.players[action.player_id];
      if (!player) return { state, success: false, error: 'Player not found' };

      const nextPlayers = {
        ...state.players,
        [action.player_id]: {
          ...player,
          connection_status: 'disconnected' as ConnectionStatus,
          disconnect_timestamp: action.timestamp
        }
      };

      return { state: { ...state, players: nextPlayers }, success: true };
    }

    case 'RECONNECT': {
      const player = state.players[action.player_id];
      if (!player) return { state, success: false, error: 'Player not found' };
      if (player.connection_status === 'eliminated') {
        return { state, success: false, error: 'Player is eliminated' };
      }

      const nextPlayers = {
        ...state.players,
        [action.player_id]: {
          ...player,
          connection_status: 'connected' as ConnectionStatus,
          disconnect_timestamp: null
        }
      };

      return { state: { ...state, players: nextPlayers }, success: true };
    }

    case 'FORCE_MISTAKE': {
      const nextState = applyMistake(state, action.player_id, timestamp, randomFn);
      return { state: nextState, success: true };
    }

    case 'FORCE_TIMER_EXPIRY': {
      // Handle turn timer expiry (30s) or power activation timer expiry (30s)
      if (state.active_power) {
        // Power forfeited
        const activePlayerId = state.active_power.player_id;
        let nextGameState: GameState = {
          ...state,
          active_power: null,
          turn_phase: 'action_choice'
        };
        return completeTurn(nextGameState, activePlayerId, timestamp);
      } else {
        // Turn timer expired: active player gets a penalty card and turn is passed
        const activeIndex = state.current_player_index;
        const activePlayerId = state.player_order[activeIndex];
        let nextGameState: GameState = { ...state };

        // A card drawn but never decided on goes to the discard pile (no power)
        if (nextGameState.drawn_card) {
          const discarded = { ...nextGameState.drawn_card, face_up: true };
          nextGameState = {
            ...nextGameState,
            discard_pile: [...nextGameState.discard_pile, discarded],
            drawn_card: null,
            last_discard_card: discarded,
            last_discard_player_id: activePlayerId,
            jump_in_window_open: true
          };
        }

        // No penalty for eliminated players, or for disconnected ones: they have
        // 5 minutes to reconnect, and a card per missed turn would eliminate them first
        if (state.players[activePlayerId]?.connection_status === 'connected') {
          nextGameState = applyMistake(nextGameState, activePlayerId, timestamp, randomFn);
        }
        if (nextGameState.status === 'ended') {
          return { state: nextGameState, success: true };
        }

        // applyMistake may already have advanced past an eliminated player; rewind so
        // completeTurn advances exactly once and records the final turn if needed.
        nextGameState = { ...nextGameState, current_player_index: activeIndex };
        return completeTurn(nextGameState, activePlayerId, timestamp);
      }
    }

    default:
      return { state, success: false, error: 'Unknown action' };
  }
}

// Clients are untrusted, so a "too late" excuse is only granted when the server
// can confirm it from its own record of recent top discards.

// Type 1: the discard the player saw was the top card moments ago and their
// card matched it, so they lost a race rather than made a mistake
function lostJumpInRace(state: GameState, expectedDiscardId: string | undefined, cardValue: Card['value']): boolean {
  return !!expectedDiscardId && (state.recent_tops ?? []).some(t => t.id === expectedDiscardId && t.value === cardValue);
}

// Type 2: the exact opponent card the player targeted was itself just jumped by
// someone else (it is now the top discard, or was moments ago)
function targetJumpedByOther(state: GameState, expectedCardId: string | undefined, cardNowInSlot: string): boolean {
  if (!expectedCardId || expectedCardId === cardNowInSlot) return false;
  return state.last_discard_card?.id === expectedCardId || (state.recent_tops ?? []).some(t => t.id === expectedCardId);
}

// Complete the active turn and advance logic
function completeTurn(state: GameState, playerId: string, timestamp: number): ActionResponse {
  // Deep-clone the players map so we never mutate the input state in-place.
  let nextState: GameState = { ...state, players: { ...state.players } };

  if (nextState.status === 'final_round') {
    // Mark took_final_turn — only if the player actually exists and hasn't been eliminated
    if (playerId !== nextState.caller_id && nextState.players[playerId]) {
      nextState.players[playerId] = { ...nextState.players[playerId], took_final_turn: true };
    }

    if (allFinalTurnsTaken(nextState)) {
      return { state: endRound(nextState), success: true };
    }
  }

  // Advance turn to next active player
  nextState.current_player_index = nextTurnIndex(nextState);
  nextState.turn_phase = 'action_choice';
  nextState.turn_timer_start = timestamp;

  return { state: nextState, success: true };
}

// Next player to act; in the final round the caller and players who already
// had their final turn are skipped
function nextTurnIndex(state: GameState): number {
  let idx = state.current_player_index;
  for (let i = 0; i < state.player_order.length; i++) {
    idx = getNextPlayerIndex(idx, state.player_order, state.players);
    const id = state.player_order[idx];
    if (state.status !== 'final_round' || (id !== state.caller_id && !state.players[id].took_final_turn)) return idx;
  }
  return idx;
}

function allFinalTurnsTaken(state: GameState): boolean {
  return state.player_order
    .filter(id => id !== state.caller_id)
    .every(id => {
      const p = state.players[id];
      return !p || p.connection_status === 'eliminated' || p.is_spectator || p.took_final_turn;
    });
}

// Flip every card face up, score, and pick winners (the caller wins ties)
export function endRound(state: GameState): GameState {
  const players = { ...state.players };
  for (const id of state.player_order) {
    const p = players[id];
    players[id] = { ...p, cards: p.cards.map(c => ({ ...c, face_up: true })), score: calculatePlayerScore(p) };
  }

  let minScore = Infinity;
  let candidates: string[] = [];
  for (const id of state.player_order) {
    const p = players[id];
    if (p.connection_status === 'eliminated' || p.is_spectator) continue;
    const s = calculatePlayerScore(p);
    if (s < minScore) {
      minScore = s;
      candidates = [id];
    } else if (s === minScore) {
      candidates.push(id);
    }
  }

  const callerWins = !!state.caller_id && candidates.includes(state.caller_id);
  return {
    ...state,
    players,
    status: 'ended',
    // A card still being decided on goes to the discard pile rather than vanishing
    discard_pile: state.drawn_card ? [...state.discard_pile, { ...state.drawn_card, face_up: true }] : state.discard_pile,
    drawn_card: null,
    active_power: null,
    winner_ids: callerWins ? [state.caller_id!] : candidates
  };
}
