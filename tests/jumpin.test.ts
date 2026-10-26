import { describe, it, expect } from 'vitest';
import { createInitialState, transition } from '../src/engine.js';
import { CardPosition, CardRank, CardSuit, GameState } from '../src/types.js';

function setCard(state: GameState, pid: string, pos: CardPosition, value: CardRank, known_by: string[] = [], suit: CardSuit = 'Spades') {
  state.players[pid].cards = state.players[pid].cards.map(c => (c.position === pos ? { ...c, id: `${pid}-${pos}`, value, suit, known_by } : c));
}

function setTop(state: GameState, value: CardRank, suit: CardSuit = 'Hearts') {
  const top = { id: `top-${value}`, value, suit, position: 'top-left' as CardPosition, face_up: true, known_by: [] };
  state.discard_pile = [top];
  state.last_discard_card = top;
}

const jump1 = (state: GameState, pid: string, pos: CardPosition, expected?: string) =>
  transition(state, { type: 'JUMP_IN_TYPE_1', player_id: pid, card_position: pos, expected_discard_id: expected, timestamp: 5 }, 5);

const jump2 = (state: GameState, pid: string, opp: string, oppPos: CardPosition, ownPos: CardPosition, expected?: string) =>
  transition(state, { type: 'JUMP_IN_TYPE_2', player_id: pid, opponent_player_id: opp, opponent_position: oppPos, own_position: ownPos, expected_discard_id: expected, timestamp: 5 }, 5);

describe('Jump-In Type 1', () => {
  it('a matching card leaves the grid and becomes the top discard, out of turn', () => {
    const state = createInitialState(['P1', 'P2']);
    setTop(state, '7');
    setCard(state, 'P2', 'top-left', '7');
    const res = jump1(state, 'P2', 'top-left', 'top-7');
    expect(res.success).toBe(true);
    expect(res.state.players['P2'].cards.length).toBe(3);
    expect(res.state.last_discard_card?.id).toBe('P2-top-left');
    expect(res.state.current_player_index).toBe(state.current_player_index); // not a turn
  });

  it('a wrong number keeps the card and adds a penalty card', () => {
    const state = createInitialState(['P1', 'P2']);
    setTop(state, '7');
    setCard(state, 'P2', 'top-left', '5');
    const res = jump1(state, 'P2', 'top-left', 'top-7');
    expect(res.success).toBe(false);
    expect(res.state.players['P2'].cards.some(c => c.id === 'P2-top-left')).toBe(true);
    expect(res.state.players['P2'].cards.length).toBe(5);
    expect(res.state.players['P2'].mistake_count).toBe(1);
  });

  it('red and black Kings match each other; Jokers match Jokers', () => {
    const state = createInitialState(['P1', 'P2']);
    setTop(state, 'K', 'Spades');
    setCard(state, 'P2', 'top-left', 'K', [], 'Hearts');
    expect(jump1(state, 'P2', 'top-left').success).toBe(true);

    const s2 = createInitialState(['P1', 'P2']);
    setTop(s2, 'Joker', null);
    setCard(s2, 'P2', 'top-left', 'Joker', [], null);
    expect(jump1(s2, 'P2', 'top-left').success).toBe(true);
  });

  it('the player whose turn it is may jump in too, and several cards can be jumped', () => {
    const state = createInitialState(['P1', 'P2']);
    setTop(state, '4');
    setCard(state, 'P1', 'top-left', '4');
    setCard(state, 'P1', 'top-right', '4');
    const first = jump1(state, 'P1', 'top-left');
    const second = jump1(first.state, 'P1', 'top-right');
    expect(second.success).toBe(true);
    expect(second.state.players['P1'].cards.length).toBe(2);
  });

  it('race: both players saw the same 7; the second still matches the new top 7', () => {
    const state = createInitialState(['P1', 'P2', 'P3']);
    setTop(state, '7');
    setCard(state, 'P2', 'top-left', '7');
    setCard(state, 'P3', 'top-left', '7');
    const first = jump1(state, 'P2', 'top-left', 'top-7');
    const second = jump1(first.state, 'P3', 'top-left', 'top-7');
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.state.last_discard_card?.id).toBe('P3-top-left');
  });

  it('race: a jump aimed at a covered card that no longer matches is rejected without penalty', () => {
    const state = createInitialState(['P1', 'P2']);
    setTop(state, '7');
    setCard(state, 'P1', 'bottom-left', '9');
    setCard(state, 'P2', 'top-left', '7');
    // P1 takes the 7 from the discard pile, putting a 9 on top, before P2's jump arrives
    const taken = transition(state, { type: 'TAKE_DISCARD_SWAP', player_id: 'P1', target_position: 'bottom-left', timestamp: 4 }, 4);
    expect(taken.state.last_discard_card?.value).toBe('9');
    const late = jump1(taken.state, 'P2', 'top-left', 'top-7');
    expect(late.success).toBe(false);
    expect(late.error).toMatch(/Too late/);
    expect(late.state.players['P2'].mistake_count).toBe(0);
    expect(late.state.players['P2'].cards.length).toBe(4);
  });

  it('the window stays open while the next player is deciding', () => {
    const state = createInitialState(['P1', 'P2']);
    setTop(state, '6');
    setCard(state, 'P2', 'top-left', '6');
    const drawn = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 2 }, 2);
    expect(jump1(drawn.state, 'P2', 'top-left', 'top-6').success).toBe(true);
  });
});

describe('Jump-In Type 2', () => {
  it('needs prior knowledge, even when the guess is right', () => {
    const state = createInitialState(['P1', 'P2']);
    setTop(state, '8');
    setCard(state, 'P2', 'top-left', '8');
    const res = jump2(state, 'P1', 'P2', 'top-left', 'top-left', 'top-8');
    expect(res.success).toBe(false);
    expect(res.state.players['P1'].mistake_count).toBe(1);
  });

  it('a known match is discarded and the jumper gives one card into the empty slot', () => {
    const state = createInitialState(['P1', 'P2']);
    setTop(state, '8');
    setCard(state, 'P2', 'top-left', '8', ['P1']);
    setCard(state, 'P1', 'bottom-right', 'J', ['P1']);
    const res = jump2(state, 'P1', 'P2', 'top-left', 'bottom-right', 'top-8');
    expect(res.success).toBe(true);
    expect(res.state.players['P1'].cards.length).toBe(3);
    const given = res.state.players['P2'].cards.find(c => c.position === 'top-left')!;
    expect(given.id).toBe('P1-bottom-right');
    expect(given.known_by).toEqual(['P1']); // the receiver does not get to see it
  });

  it('a known card that no longer matches is a mistake', () => {
    const state = createInitialState(['P1', 'P2']);
    setTop(state, '8');
    setCard(state, 'P2', 'top-left', '3', ['P1']);
    const res = jump2(state, 'P1', 'P2', 'top-left', 'top-left', 'top-8');
    expect(res.success).toBe(false);
    expect(res.state.players['P1'].mistake_count).toBe(1);
  });

  it('race: first click wins; the second jumper on the same card gets no penalty', () => {
    const state = createInitialState(['P1', 'P2', 'P3']);
    setTop(state, '8');
    setCard(state, 'P2', 'top-left', '8', ['P1', 'P3']);
    const first = jump2(state, 'P1', 'P2', 'top-left', 'top-left', 'top-8');
    expect(first.success).toBe(true);
    // P3 targets the same slot, which now holds P1's card (P3 has no knowledge of it)
    const second = jump2(first.state, 'P3', 'P2', 'top-left', 'top-left', 'top-8');
    expect(second.success).toBe(false);
    expect(second.state.players['P3'].mistake_count).toBe(0);
  });

  it("cannot take from the caller's cards in the final round", () => {
    let state = createInitialState(['P1', 'P2', 'P3']);
    setTop(state, '8');
    setCard(state, 'P1', 'top-left', '8', ['P2']);
    state = transition(state, { type: 'CALL', player_id: 'P1', timestamp: 2 }, 2).state;
    const res = jump2(state, 'P2', 'P1', 'top-left', 'top-left', 'top-8');
    expect(res.success).toBe(false);
    expect(res.state.players['P2'].mistake_count).toBe(0);
  });
});
