import { describe, it, expect } from 'vitest';
import { createInitialState, transition, applyMistake } from '../src/engine.js';
import { Action, GameState } from '../src/types.js';

describe('Automatic mistake penalties', () => {
  it.each<[string, Action]>([
    ['drawing out of turn', { type: 'DRAW_PILE_DRAW', player_id: 'P2', timestamp: 1 }],
    ['taking the discard out of turn', { type: 'TAKE_DISCARD_SWAP', player_id: 'P2', target_position: 'top-left', timestamp: 1 }],
    ['calling out of turn', { type: 'CALL', player_id: 'P2', timestamp: 1 }],
    ['using a power with no power card', { type: 'RESOLVE_POWER_9_10', player_id: 'P2', target_player_id: 'P1', target_position: 'top-left', timestamp: 1 }]
  ])('%s costs a face-down penalty card and is logged for everyone', (_, action) => {
    const state = createInitialState(['P1', 'P2']);
    const res = transition(state, action, 1);
    expect(res.success).toBe(false);
    const p2 = res.state.players['P2'];
    expect(p2.mistake_count).toBe(1);
    expect(p2.cards.length).toBe(5);
    const penalty = p2.cards.find(c => c.position === 'penalty-1')!;
    expect(penalty.face_up).toBe(false);
    expect(penalty.known_by).toEqual([]); // drawn without looking
    expect(res.state.mistake_log).toEqual([{ player_id: 'P2', reason: res.error, timestamp: 1 }]);
  });

  it('a penalty refills a gap left by a jump-in before opening a new slot', () => {
    const state = createInitialState(['P1', 'P2']);
    state.players['P1'].cards = state.players['P1'].cards.filter(c => c.position !== 'top-right');
    const res = applyMistake(state, 'P1', 1);
    const positions = res.players['P1'].cards.map(c => c.position);
    expect(positions).toContain('top-right');
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('penalty slots never collide after cards leave the penalty row', () => {
    let state: GameState = createInitialState(['P1', 'P2']);
    state = applyMistake(applyMistake(state, 'P1', 1), 'P1', 2); // penalty-1, penalty-2
    state.players['P1'].cards = state.players['P1'].cards.filter(c => c.position !== 'penalty-1');
    state = applyMistake(state, 'P1', 3);
    const positions = state.players['P1'].cards.map(c => c.position);
    expect(new Set(positions).size).toBe(positions.length);
    expect(positions.every(Boolean)).toBe(true);
  });

  it('a 9th card eliminates the player and no card leaves the game', () => {
    let state: GameState = createInitialState(['P1', 'P2', 'P3']);
    for (let i = 0; i < 4; i++) state = applyMistake(state, 'P2', i);
    expect(state.players['P2'].cards.length).toBe(8);
    state = applyMistake(state, 'P2', 9);
    expect(state.players['P2'].connection_status).toBe('eliminated');
    const total =
      state.draw_pile.length +
      state.discard_pile.length +
      Object.values(state.players).reduce((n, p) => n + p.cards.length, 0);
    expect(total).toBe(54);
  });

  it('the log keeps only the most recent entries', () => {
    let state = createInitialState(['P1', 'P2']);
    for (let i = 0; i < 25; i++) {
      // Trim back to 4 cards so P2 is never eliminated
      state.players['P2'] = { ...state.players['P2'], cards: state.players['P2'].cards.slice(0, 4) };
      state = transition(state, { type: 'FORCE_MISTAKE', player_id: 'P2', mistake_type: `m${i}`, timestamp: i }, i).state;
    }
    expect(state.mistake_log.length).toBe(20);
    expect(state.mistake_log[19].reason).toBe('m24');
  });
});
