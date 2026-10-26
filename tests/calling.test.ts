import { describe, it, expect } from 'vitest';
import { createInitialState, transition } from '../src/engine.js';
import { Card, CardRank, GameState } from '../src/types.js';

const cards = (values: CardRank[]): Card[] =>
  values.map((value, i) => ({
    id: `c-${value}-${i}-${Math.random()}`,
    value,
    suit: 'Spades',
    position: (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const)[i],
    face_up: false,
    known_by: []
  }));

const active = (s: GameState) => s.player_order[s.current_player_index];

// Ends the active player's turn with a plain draw-and-discard of a 2 (no power)
function passTurn(state: GameState): GameState {
  const s = { ...state, draw_pile: [{ ...state.draw_pile[0], value: '2' as CardRank }, ...state.draw_pile.slice(1)] };
  const pid = active(s);
  const drawn = transition(s, { type: 'DRAW_PILE_DRAW', player_id: pid, timestamp: 1 }, 1);
  return transition(drawn.state, { type: 'DRAW_PILE_DISCARD', player_id: pid, timestamp: 1 }, 1).state;
}

describe('Calling and final turns', () => {
  it('every other player gets exactly one final turn, in order, then the game is scored', () => {
    let state = createInitialState(['P1', 'P2', 'P3', 'P4']);
    state = transition(state, { type: 'CALL', player_id: 'P1', timestamp: 1 }, 1).state;
    expect(state.status).toBe('final_round');

    const order: string[] = [];
    while (state.status === 'final_round') {
      order.push(active(state));
      state = passTurn(state);
    }
    expect(order).toEqual(['P2', 'P3', 'P4']);
    expect(state.status).toBe('ended');
    expect(Object.values(state.players).every(p => p.cards.every(c => c.face_up))).toBe(true);
  });

  it('can only call at the start of your own turn', () => {
    const state = createInitialState(['P1', 'P2']);
    const drawn = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1 }, 1);
    expect(transition(drawn.state, { type: 'CALL', player_id: 'P1', timestamp: 2 }, 2).success).toBe(false);

    const outOfTurn = transition(state, { type: 'CALL', player_id: 'P2', timestamp: 2 }, 2);
    expect(outOfTurn.success).toBe(false);
    expect(outOfTurn.state.players['P2'].mistake_count).toBe(1);
  });

  it('the round cannot be called twice', () => {
    let state = createInitialState(['P1', 'P2', 'P3']);
    state = transition(state, { type: 'CALL', player_id: 'P1', timestamp: 1 }, 1).state;
    expect(transition(state, { type: 'CALL', player_id: 'P2', timestamp: 2 }, 2).success).toBe(false);
  });

  it('lowest total wins; the caller wins a tie', () => {
    let state = createInitialState(['P1', 'P2', 'P3']);
    state.players['P1'].cards = cards(['A', '2', '3', '4']); // 10
    state.players['P2'].cards = cards(['A', '2', '3', '4']); // 10
    state.players['P3'].cards = cards(['K', 'K', 'K', 'K']); // 40 (black)
    state = transition(state, { type: 'CALL', player_id: 'P1', timestamp: 1 }, 1).state;
    // Final turns swap in a card of equal value, so scores stay as dealt
    while (state.status === 'final_round') {
      const pid = active(state);
      const top = state.discard_pile[state.discard_pile.length - 1];
      const target = state.players[pid].cards[0];
      state = {
        ...state,
        discard_pile: [...state.discard_pile.slice(0, -1), { ...top, value: target.value, suit: target.suit }]
      };
      state = transition(state, { type: 'TAKE_DISCARD_SWAP', player_id: pid, target_position: target.position, timestamp: 2 }, 2).state;
    }
    expect(state.winner_ids).toEqual(['P1']);
  });

  it('a tie without the caller gives joint winners', () => {
    let state = createInitialState(['P1', 'P2', 'P3']);
    state.players['P1'].cards = cards(['K', 'K', 'K', 'K']);
    state.players['P2'].cards = cards(['A', 'A', 'A', 'A']);
    state.players['P3'].cards = cards(['A', 'A', 'A', 'A']);
    state = transition(state, { type: 'CALL', player_id: 'P1', timestamp: 1 }, 1).state;
    while (state.status === 'final_round') {
      const pid = active(state);
      const drawn = transition({ ...state, draw_pile: [{ ...state.draw_pile[0], value: '2' as CardRank }, ...state.draw_pile.slice(1)] },
        { type: 'DRAW_PILE_DRAW', player_id: pid, timestamp: 2 }, 2);
      state = transition(drawn.state, { type: 'DRAW_PILE_DISCARD', player_id: pid, timestamp: 2 }, 2).state;
    }
    expect(state.winner_ids.sort()).toEqual(['P2', 'P3']);
  });

  it('a player with 0 cards is not forced to call', () => {
    let state = createInitialState(['P1', 'P2']);
    state.players['P1'].cards = [];
    const drawn = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1 }, 1);
    expect(drawn.success).toBe(true);
  });

  it('a player eliminated during the final round does not hand the turn back to the caller', () => {
    let state = createInitialState(['P1', 'P2', 'P3']);
    state = transition(state, { type: 'CALL', player_id: 'P1', timestamp: 1 }, 1).state;
    expect(active(state)).toBe('P2');
    // P2 is on 8 cards; one more mistake eliminates them during their final turn
    state.players['P2'].cards = [
      ...state.players['P2'].cards,
      ...cards(['A', 'A', 'A', 'A']).map((c, i) => ({ ...c, position: `penalty-${i + 1}` as Card['position'] }))
    ];
    state.last_discard_card = { ...state.last_discard_card!, value: '5' }; // the A can't match
    state = transition(state, { type: 'JUMP_IN_TYPE_1', player_id: 'P2', card_position: 'penalty-1', timestamp: 2 }, 2).state;
    expect(state.players['P2'].connection_status).toBe('eliminated');
    expect(state.status).toBe('final_round');
    expect(active(state)).toBe('P3');
    state = passTurn(state);
    expect(state.status).toBe('ended');
  });
});
