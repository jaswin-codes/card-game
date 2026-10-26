import { describe, it, expect } from 'vitest';
import { createInitialState, transition, calculatePlayerScore } from '../src/engine.js';
import { maskGameState } from '../src/mask.js';
import { Action, Card, CardPosition, GameState } from '../src/types.js';

// Small seeded PRNG (mulberry32) so every failure can be replayed from its seed
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GAMES = 1500;
const MAX_MOVES = 3000;
const CALL_AFTER = 40; // moves before players start calling

function pick<T>(r: () => number, items: T[]): T | undefined {
  return items.length ? items[Math.floor(r() * items.length)] : undefined;
}

const positionsOf = (s: GameState, pid: string): CardPosition[] => s.players[pid]?.cards.map(c => c.position) ?? [];
const live = (s: GameState) => s.player_order.filter(id => !s.players[id].is_spectator);

// Mostly legal play, plus a steady trickle of jump-ins (right and wrong),
// out-of-turn moves and timeouts so penalties and eliminations happen too
function nextAction(s: GameState, r: () => number, move: number): Action {
  const ts = move;
  const active = s.player_order[s.current_player_index];
  const others = live(s).filter(id => id !== active);
  const roll = r();

  if (roll < 0.08) {
    const pid = pick(r, live(s))!;
    const pos = pick(r, positionsOf(s, pid));
    if (pos) return { type: 'JUMP_IN_TYPE_1', player_id: pid, card_position: pos, expected_discard_id: s.last_discard_card?.id, timestamp: ts };
  }
  if (roll < 0.11) {
    const pid = pick(r, live(s))!;
    const opp = pick(r, live(s).filter(id => id !== pid));
    const oppPos = opp && pick(r, positionsOf(s, opp));
    const ownPos = pick(r, positionsOf(s, pid));
    if (opp && oppPos && ownPos) {
      return { type: 'JUMP_IN_TYPE_2', player_id: pid, opponent_player_id: opp, opponent_position: oppPos, own_position: ownPos, timestamp: ts };
    }
  }
  if (roll < 0.13 && others.length) return { type: 'DRAW_PILE_DRAW', player_id: pick(r, others)!, timestamp: ts };
  if (roll < 0.15) return { type: 'FORCE_TIMER_EXPIRY', timestamp: ts };

  const own = positionsOf(s, active);
  const opp = pick(r, others.filter(id => id !== s.caller_id && !s.players[id].took_final_turn));
  const oppPos = opp && pick(r, positionsOf(s, opp));

  if (s.turn_phase === 'action_choice') {
    if (!s.caller_id && move > CALL_AFTER && r() < 0.05) return { type: 'CALL', player_id: active, timestamp: ts };
    if (own.length && r() < 0.2) return { type: 'TAKE_DISCARD_SWAP', player_id: active, target_position: pick(r, own)!, timestamp: ts };
    return { type: 'DRAW_PILE_DRAW', player_id: active, timestamp: ts };
  }
  if (s.turn_phase === 'draw_decide') {
    if (own.length && r() < 0.5) return { type: 'DRAW_PILE_KEEP', player_id: active, target_position: pick(r, own)!, timestamp: ts };
    return { type: 'DRAW_PILE_DISCARD', player_id: active, timestamp: ts };
  }

  // resolving_power
  const power = s.active_power!;
  const ownPos = pick(r, own);
  if (r() < 0.15 || !ownPos) return { type: 'SKIP_POWER', player_id: active, timestamp: ts };
  switch (power.power_type) {
    case '7_8':
      return { type: 'RESOLVE_POWER_7_8', player_id: active, target_position: ownPos, timestamp: ts };
    case '9_10':
      if (!opp || !oppPos) return { type: 'SKIP_POWER', player_id: active, timestamp: ts };
      return { type: 'RESOLVE_POWER_9_10', player_id: active, target_player_id: opp, target_position: oppPos, timestamp: ts };
    case 'J_Q':
      if (!opp || !oppPos) return { type: 'SKIP_POWER', player_id: active, timestamp: ts };
      return { type: 'RESOLVE_POWER_J_Q', player_id: active, own_position: ownPos, opponent_player_id: opp, opponent_position: oppPos, timestamp: ts };
    case 'K': {
      const sel = power.k_selection;
      if (sel) return { type: 'RESOLVE_POWER_K', player_id: active, ...sel, should_swap: r() < 0.5, timestamp: ts };
      if (!opp || !oppPos) return { type: 'SKIP_POWER', player_id: active, timestamp: ts };
      return { type: 'RESOLVE_POWER_K_LOOK', player_id: active, own_position: ownPos, opponent_player_id: opp, opponent_position: oppPos, timestamp: ts };
    }
  }
}

// Plain assertion: Vitest's expect is too slow to call millions of times
function check(ok: boolean, message: string) {
  if (!ok) throw new Error(message);
}

function checkInvariants(s: GameState, label: string) {
  const all: Card[] = [
    ...s.draw_pile,
    ...s.discard_pile,
    ...(s.drawn_card ? [s.drawn_card] : []),
    ...Object.values(s.players).flatMap(p => p.cards)
  ];
  check(all.length === 54, `${label}: card count`);
  check(new Set(all.map(c => c.id)).size === 54, `${label}: duplicate card`);

  for (const id of s.player_order) {
    const p = s.players[id];
    const pos = p.cards.map(c => c.position);
    check(pos.every(Boolean) === true, `${label}: undefined slot`);
    check(new Set(pos).size === pos.length, `${label}: shared slot`);
    check(p.cards.length <= 8, `${label}: over 8 cards`);
    if (p.is_spectator) check(p.cards.length === 0, `${label}: eliminated player holds cards`);
  }

  if (s.status === 'ended') {
    for (const id of s.player_order) {
      check(s.players[id].score === calculatePlayerScore(s.players[id]), `${label}: final score`);
    }
    return;
  }

  const active = s.players[s.player_order[s.current_player_index]];
  check(active.is_spectator === false, `${label}: eliminated player has the turn`);
  if (s.status === 'final_round') {
    check(active.id !== s.caller_id, `${label}: caller got another turn`);
    check(active.took_final_turn === false, `${label}: second final turn`);
  }
}

// The server must never send a card's value or real id to someone who may not see it
function checkMasking(s: GameState, label: string) {
  const viewers: [string, boolean][] = [...s.player_order.map(id => [id, false] as [string, boolean]), ['watcher', true]];
  const activeId = s.player_order[s.current_player_index];
  for (const [viewer, spectator] of viewers) {
    const view = maskGameState(s, viewer, spectator);
    const blind = spectator || s.players[viewer]?.is_spectator;
    for (const pid of s.player_order) {
      for (const real of s.players[pid].cards) {
        const seen = view.players[pid].cards.find((c: Card) => c.position === real.position);
        const allowed = real.face_up || (!blind && real.known_by.includes(viewer));
        if (!allowed) {
          check(seen.value === null, `${label}: ${viewer} sees ${pid}'s hidden value`);
          check(seen.id !== real.id, `${label}: ${viewer} sees ${pid}'s hidden id`);
        }
      }
    }
    if (s.drawn_card && (blind || viewer !== activeId)) {
      check(view.drawn_card.value === null, `${label}: ${viewer} sees the drawn card`);
    }
    if (s.status !== 'ended') {
      check(Object.values(view.players).every((p: any) => p.score === null) === true, `${label}: live score leaked`);
    }
  }
}

describe('Random play simulation', () => {
  it(`${GAMES} seeded games with 2–4 players keep every invariant and all end`, () => {
    let totalMoves = 0;
    let eliminations = 0;
    let called = 0;
    for (let seed = 1; seed <= GAMES; seed++) {
      const r = rng(seed);
      const n = 2 + (seed % 3);
      let s = createInitialState(Array.from({ length: n }, (_, i) => `P${i + 1}`), undefined, r);
      let move = 0;
      while (s.status !== 'ended') {
        expect(move, `seed ${seed}: game never ended`).toBeLessThan(MAX_MOVES);
        const action = nextAction(s, r, move);
        let res;
        expect(() => { res = transition(s, action, move, r); }, `seed ${seed} move ${move}: threw on ${action.type}`).not.toThrow();
        s = res!.state;
        const label = `seed ${seed} move ${move} (${action.type})`;
        checkInvariants(s, label);
        if (move % 4 === 0 || s.status === 'ended') checkMasking(s, label);
        move++;
      }
      totalMoves += move;
      eliminations += Object.values(s.players).filter(p => p.is_spectator).length;
      if (s.caller_id) called++;
    }
    // Make sure the run actually exercised long games and eliminations
    expect(totalMoves).toBeGreaterThan(GAMES * 20);
    expect(eliminations).toBeGreaterThan(0);
    expect(called).toBeGreaterThan(GAMES / 2);
  }, 120000);
});
