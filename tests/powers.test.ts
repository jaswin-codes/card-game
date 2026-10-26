import { describe, it, expect } from 'vitest';
import { createInitialState, transition } from '../src/engine.js';
import { maskGameState } from '../src/mask.js';
import { Card, CardRank, GameState } from '../src/types.js';

const card = (id: string, value: CardRank): Card => ({ id, value, suit: 'Spades', position: 'top-left', face_up: false, known_by: [] });

// P1 draws `value` and discards it, leaving the power to resolve
function withPower(value: CardRank, players = ['P1', 'P2']): GameState {
  const state = createInitialState(players);
  state.draw_pile[0] = card('power', value);
  const drawn = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1 }, 1);
  return transition(drawn.state, { type: 'DRAW_PILE_DISCARD', player_id: 'P1', timestamp: 2 }, 2).state;
}

describe('Card powers', () => {
  it.each([['7', '7_8'], ['8', '7_8'], ['9', '9_10'], ['10', '9_10'], ['J', 'J_Q'], ['Q', 'J_Q'], ['K', 'K']] as const)(
    'discarding a drawn %s activates the %s power',
    (value, type) => {
      const state = withPower(value);
      expect(state.turn_phase).toBe('resolving_power');
      expect(state.active_power?.power_type).toBe(type);
    }
  );

  it('keeping a drawn power card does not activate a power', () => {
    const state = createInitialState(['P1', 'P2']);
    state.draw_pile[0] = card('power', 'K');
    const drawn = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1 }, 1);
    const kept = transition(drawn.state, { type: 'DRAW_PILE_KEEP', player_id: 'P1', target_position: 'top-left', timestamp: 2 }, 2);
    expect(kept.state.active_power).toBeNull();
    expect(kept.state.player_order[kept.state.current_player_index]).toBe('P2');
  });

  it('7/8 reveals an own card to the player only', () => {
    const state = withPower('7');
    const res = transition(state, { type: 'RESOLVE_POWER_7_8', player_id: 'P1', target_position: 'top-left', timestamp: 3 }, 3);
    expect(res.success).toBe(true);
    const target = res.state.players['P1'].cards.find(c => c.position === 'top-left')!;
    expect(maskGameState(res.state, 'P1', false).players['P1'].cards.find((c: Card) => c.position === 'top-left').value).toBe(target.value);
    expect(maskGameState(res.state, 'P2', false).players['P1'].cards.find((c: Card) => c.position === 'top-left').value).toBeNull();
  });

  it('9/10 reveals an opponent card to the player only, not to its owner', () => {
    const state = withPower('9');
    const res = transition(state, { type: 'RESOLVE_POWER_9_10', player_id: 'P1', target_player_id: 'P2', target_position: 'top-left', timestamp: 3 }, 3);
    expect(res.success).toBe(true);
    expect(maskGameState(res.state, 'P1', false).players['P2'].cards.find((c: Card) => c.position === 'top-left').value).not.toBeNull();
    expect(maskGameState(res.state, 'P2', false).players['P2'].cards.find((c: Card) => c.position === 'top-left').value).toBeNull();
  });

  it('King: look first, then decide; the decision must use the cards looked at', () => {
    const state = withPower('K');
    const sel = { own_position: 'top-left' as const, opponent_player_id: 'P2', opponent_position: 'top-right' as const };
    const looked = transition(state, { type: 'RESOLVE_POWER_K_LOOK', player_id: 'P1', ...sel, timestamp: 3 }, 3);
    expect(looked.success).toBe(true);
    expect(looked.state.turn_phase).toBe('resolving_power'); // still P1's decision
    expect(maskGameState(looked.state, 'P1', false).players['P2'].cards.find((c: Card) => c.position === 'top-right').value).not.toBeNull();

    const other = transition(looked.state, { type: 'RESOLVE_POWER_K', player_id: 'P1', ...sel, opponent_position: 'bottom-left', should_swap: true, timestamp: 4 }, 4);
    expect(other.success).toBe(false);
    expect(other.state.players['P1'].mistake_count).toBe(0);

    const oppCardId = looked.state.players['P2'].cards.find(c => c.position === 'top-right')!.id;
    const swapped = transition(looked.state, { type: 'RESOLVE_POWER_K', player_id: 'P1', ...sel, should_swap: true, timestamp: 4 }, 4);
    expect(swapped.success).toBe(true);
    expect(swapped.state.players['P1'].cards.find(c => c.position === 'top-left')!.id).toBe(oppCardId);
    expect(swapped.state.player_order[swapped.state.current_player_index]).toBe('P2');
  });

  it('a power can be skipped, which ends the turn', () => {
    const state = withPower('J');
    const res = transition(state, { type: 'SKIP_POWER', player_id: 'P1', timestamp: 3 }, 3);
    expect(res.success).toBe(true);
    expect(res.state.active_power).toBeNull();
    expect(res.state.player_order[res.state.current_player_index]).toBe('P2');
  });

  it('using a power twice from one card is a mistake', () => {
    const state = withPower('8');
    const once = transition(state, { type: 'RESOLVE_POWER_7_8', player_id: 'P1', target_position: 'top-left', timestamp: 3 }, 3);
    const twice = transition(once.state, { type: 'RESOLVE_POWER_7_8', player_id: 'P1', target_position: 'top-right', timestamp: 4 }, 4);
    expect(twice.success).toBe(false);
    expect(twice.state.players['P1'].mistake_count).toBe(1);
  });
});

describe('Hidden information in the masked state', () => {
  it('no hidden card exposes its value, suit or real id', () => {
    const state = createInitialState(['P1', 'P2', 'P3']);
    const view = maskGameState(state, 'P2', false);
    for (const pid of state.player_order) {
      for (const real of state.players[pid].cards) {
        const seen = view.players[pid].cards.find((c: Card) => c.position === real.position);
        const canSee = real.known_by.includes('P2');
        if (!canSee) {
          expect(seen.value).toBeNull();
          expect(seen.suit).toBeNull();
          expect(seen.id).not.toBe(real.id);
        }
      }
    }
  });

  it('scores are hidden until the game ends', () => {
    const view = maskGameState(createInitialState(['P1', 'P2']), 'P1', false);
    expect(view.players['P1'].score).toBeNull();
    expect(view.players['P2'].score).toBeNull();
  });

  it('only the drawer sees the drawn card', () => {
    const state = createInitialState(['P1', 'P2']);
    const drawn = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1 }, 1).state;
    expect(maskGameState(drawn, 'P1', false).drawn_card.value).not.toBeNull();
    const other = maskGameState(drawn, 'P2', false).drawn_card;
    expect(other.value).toBeNull();
    expect(other.id).not.toBe(drawn.drawn_card!.id);
  });

  it('spectators and eliminated players see no face-down values', () => {
    let state = createInitialState(['P1', 'P2', 'P3']);
    state = { ...state, players: { ...state.players, P3: { ...state.players['P3'], is_spectator: true, connection_status: 'eliminated' } } };
    for (const view of [maskGameState(state, 'watcher', true), maskGameState(state, 'P3', false)]) {
      for (const pid of ['P1', 'P2']) {
        expect(view.players[pid].cards.every((c: Card) => c.value === null)).toBe(true);
      }
    }
  });
});
