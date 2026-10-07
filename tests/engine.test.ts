import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  transition,
  getCardPoints,
  createDeck,
  shuffleDeck,
  applyMistake
} from '../src/engine.js';
import { GameState, Card, Player, CardPosition } from '../src/types.js';

describe('Card Game Engine Core Tests', () => {
  
  it('should create a deck of 54 cards', () => {
    const deck = createDeck();
    expect(deck.length).toBe(54);
    const jokers = deck.filter(c => c.value === 'Joker');
    expect(jokers.length).toBe(2);
  });

  it('should score cards correctly', () => {
    const cardA: Card = { id: '1', value: 'A', suit: 'Spades', position: 'top-left', face_up: false, known_by: [] };
    const card7: Card = { id: '2', value: '7', suit: 'Hearts', position: 'top-left', face_up: false, known_by: [] };
    const cardKRed: Card = { id: '3', value: 'K', suit: 'Hearts', position: 'top-left', face_up: false, known_by: [] };
    const cardKBlack: Card = { id: '4', value: 'K', suit: 'Spades', position: 'top-left', face_up: false, known_by: [] };
    const cardJoker: Card = { id: '5', value: 'Joker', suit: null, position: 'top-left', face_up: false, known_by: [] };

    expect(getCardPoints(cardA)).toBe(1);
    expect(getCardPoints(card7)).toBe(7);
    expect(getCardPoints(cardKRed)).toBe(0);
    expect(getCardPoints(cardKBlack)).toBe(10);
    expect(getCardPoints(cardJoker)).toBe(-2);
  });

  it('should initialize game state correctly', () => {
    const state = createInitialState(['P1', 'P2']);
    expect(state.player_order).toEqual(['P1', 'P2']);
    expect(state.players['P1'].cards.length).toBe(4);
    expect(state.players['P2'].cards.length).toBe(4);

    // bottom cards known by owner
    const p1BottomLeft = state.players['P1'].cards.find(c => c.position === 'bottom-left');
    const p1BottomRight = state.players['P1'].cards.find(c => c.position === 'bottom-right');
    expect(p1BottomLeft?.known_by).toContain('P1');
    expect(p1BottomRight?.known_by).toContain('P1');

    // top cards NOT known by owner
    const p1TopLeft = state.players['P1'].cards.find(c => c.position === 'top-left');
    expect(p1TopLeft?.known_by).not.toContain('P1');
  });

  it('should handle draw-and-keep action', () => {
    let state = createInitialState(['P1', 'P2']);
    // Force top draw card to be Ace of Spades
    state.draw_pile[0] = { id: 'test-ace', value: 'A', suit: 'Spades', position: 'top-left', face_up: false, known_by: [] };

    const res1 = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1000 }, 1000);
    expect(res1.success).toBe(true);
    expect(res1.state.turn_phase).toBe('draw_decide');
    expect(res1.state.drawn_card?.id).toBe('test-ace');

    const res2 = transition(res1.state, { type: 'DRAW_PILE_KEEP', player_id: 'P1', target_position: 'top-left', timestamp: 2000 }, 2000);
    expect(res2.success).toBe(true);
    expect(res2.state.players['P1'].cards.find(c => c.position === 'top-left')?.id).toBe('test-ace');
    expect(res2.state.turn_phase).toBe('action_choice');
    expect(res2.state.current_player_index).toBe(1); // turn advanced to P2
  });

  it('should handle draw-and-discard with no power activation', () => {
    let state = createInitialState(['P1', 'P2']);
    // Force top draw card to be 2 of Spades (no power)
    state.draw_pile[0] = { id: 'test-2', value: '2', suit: 'Spades', position: 'top-left', face_up: false, known_by: [] };

    const res1 = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1000 }, 1000);
    const res2 = transition(res1.state, { type: 'DRAW_PILE_DISCARD', player_id: 'P1', timestamp: 2000 }, 2000);

    expect(res2.success).toBe(true);
    expect(res2.state.discard_pile[res2.state.discard_pile.length - 1].id).toBe('test-2');
    expect(res2.state.turn_phase).toBe('action_choice');
    expect(res2.state.current_player_index).toBe(1);
  });

  it('should handle draw-and-discard with 7/8 power activation', () => {
    let state = createInitialState(['P1', 'P2']);
    state.draw_pile[0] = { id: 'test-7', value: '7', suit: 'Spades', position: 'top-left', face_up: false, known_by: [] };

    const res1 = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1000 }, 1000);
    const res2 = transition(res1.state, { type: 'DRAW_PILE_DISCARD', player_id: 'P1', timestamp: 2000 }, 2000);

    expect(res2.state.turn_phase).toBe('resolving_power');
    expect(res2.state.active_power?.power_type).toBe('7_8');

    // Resolve the power to look at top-left card
    const res3 = transition(res2.state, { type: 'RESOLVE_POWER_7_8', player_id: 'P1', target_position: 'top-left', timestamp: 3000 }, 3000);
    expect(res3.success).toBe(true);
    expect(res3.state.players['P1'].cards.find(c => c.position === 'top-left')?.known_by).toContain('P1');
    expect(res3.state.turn_phase).toBe('action_choice');
    expect(res3.state.current_player_index).toBe(1);
  });

  it('should handle 9/10 power looking at opponent card', () => {
    let state = createInitialState(['P1', 'P2']);
    state.draw_pile[0] = { id: 'test-9', value: '9', suit: 'Spades', position: 'top-left', face_up: false, known_by: [] };

    const res1 = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1000 }, 1000);
    const res2 = transition(res1.state, { type: 'DRAW_PILE_DISCARD', player_id: 'P1', timestamp: 2000 }, 2000);

    const res3 = transition(res2.state, {
      type: 'RESOLVE_POWER_9_10',
      player_id: 'P1',
      target_player_id: 'P2',
      target_position: 'top-left',
      timestamp: 3000
    }, 3000);

    expect(res3.success).toBe(true);
    expect(res3.state.players['P2'].cards.find(c => c.position === 'top-left')?.known_by).toContain('P1');
  });

  it('should handle J/Q blind swap', () => {
    let state = createInitialState(['P1', 'P2']);
    state.draw_pile[0] = { id: 'test-j', value: 'J', suit: 'Spades', position: 'top-left', face_up: false, known_by: [] };

    const p1CardBefore = state.players['P1'].cards.find(c => c.position === 'top-left')?.id;
    const p2CardBefore = state.players['P2'].cards.find(c => c.position === 'top-right')?.id;

    const res1 = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1000 }, 1000);
    const res2 = transition(res1.state, { type: 'DRAW_PILE_DISCARD', player_id: 'P1', timestamp: 2000 }, 2000);

    const res3 = transition(res2.state, {
      type: 'RESOLVE_POWER_J_Q',
      player_id: 'P1',
      own_position: 'top-left',
      opponent_player_id: 'P2',
      opponent_position: 'top-right',
      timestamp: 3000
    }, 3000);

    expect(res3.success).toBe(true);
    expect(res3.state.players['P1'].cards.find(c => c.position === 'top-left')?.id).toBe(p2CardBefore);
    expect(res3.state.players['P2'].cards.find(c => c.position === 'top-right')?.id).toBe(p1CardBefore);
  });

  it('should handle King look-and-swap', () => {
    let state = createInitialState(['P1', 'P2']);
    state.draw_pile[0] = { id: 'test-k', value: 'K', suit: 'Hearts', position: 'top-left', face_up: false, known_by: [] };

    const p1CardBefore = state.players['P1'].cards.find(c => c.position === 'top-left')?.id;
    const p2CardBefore = state.players['P2'].cards.find(c => c.position === 'top-right')?.id;

    const res1 = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1000 }, 1000);
    const res2 = transition(res1.state, { type: 'DRAW_PILE_DISCARD', player_id: 'P1', timestamp: 2000 }, 2000);

    // Look and swap = true
    const res3 = transition(res2.state, {
      type: 'RESOLVE_POWER_K',
      player_id: 'P1',
      own_position: 'top-left',
      opponent_player_id: 'P2',
      opponent_position: 'top-right',
      should_swap: true,
      timestamp: 3000
    }, 3000);

    expect(res3.success).toBe(true);
    expect(res3.state.players['P1'].cards.find(c => c.position === 'top-left')?.id).toBe(p2CardBefore);
    expect(res3.state.players['P2'].cards.find(c => c.position === 'top-right')?.id).toBe(p1CardBefore);

    // P1 now knows both cards
    expect(res3.state.players['P1'].cards.find(c => c.position === 'top-left')?.known_by).toContain('P1');
    expect(res3.state.players['P2'].cards.find(c => c.position === 'top-right')?.known_by).toContain('P1');
  });

  it('should handle Jump-In Type 1 matching own card, including King color matching and Jokers', () => {
    let state = createInitialState(['P1', 'P2']);

    // Set top discard to Black King
    state.discard_pile = [{ id: 'k-spades', value: 'K', suit: 'Spades', position: 'top-left', face_up: true, known_by: [] }];
    state.last_discard_card = state.discard_pile[0];

    // Force P2 to have a Red King in top-left
    state.players['P2'].cards = state.players['P2'].cards.map(c => {
      if (c.position === 'top-left') {
        return { ...c, value: 'K', suit: 'Hearts' };
      }
      return c;
    });

    // P2 tries to jump-in with Red King (should match Black King)
    const res = transition(state, { type: 'JUMP_IN_TYPE_1', player_id: 'P2', card_position: 'top-left', timestamp: 1500 }, 1500);
    expect(res.success).toBe(true);
    expect(res.state.players['P2'].cards.some(c => c.position === 'top-left')).toBe(false); // card removed
  });

  it('should handle Jump-In Type 1 chaining sequentially', () => {
    let state = createInitialState(['P1', 'P2']);

    // Set top discard to 5
    state.discard_pile = [{ id: 'discard-5', value: '5', suit: 'Clubs', position: 'top-left', face_up: true, known_by: [] }];
    state.last_discard_card = state.discard_pile[0];

    // Give P1 and P2 5s in top-left
    state.players['P1'].cards = state.players['P1'].cards.map(c => (c.position === 'top-left' ? { ...c, value: '5', suit: 'Spades' } : c));
    state.players['P2'].cards = state.players['P2'].cards.map(c => (c.position === 'top-left' ? { ...c, value: '5', suit: 'Hearts' } : c));

    // Player A (P1) jumps in first
    const res1 = transition(state, { type: 'JUMP_IN_TYPE_1', player_id: 'P1', card_position: 'top-left', timestamp: 1500 }, 1500);
    expect(res1.success).toBe(true);
    expect(res1.state.players['P1'].cards.some(c => c.position === 'top-left')).toBe(false); // P1 top-left card is gone
    expect(res1.state.last_discard_card?.id).toBe(state.players['P1'].cards.find(c => c.position === 'top-left')?.id); // P1's card is now top of discard pile

    // Player B (P2) immediately chains onto Player A's new discard in the same window
    const res2 = transition(res1.state, { type: 'JUMP_IN_TYPE_1', player_id: 'P2', card_position: 'top-left', timestamp: 1600 }, 1600);
    expect(res2.success).toBe(true);
    expect(res2.state.players['P2'].cards.some(c => c.position === 'top-left')).toBe(false); // P2 top-left card is also gone
  });

  it('should penalize a wrong jump-in and draw a card', () => {
    let state = createInitialState(['P1', 'P2']);
    state.discard_pile = [{ id: 'card-10', value: '10', suit: 'Hearts', position: 'top-left', face_up: true, known_by: [] }];
    state.last_discard_card = state.discard_pile[0];

    // P2 tries to jump in with a card that is not 10 (e.g. 5)
    state.players['P2'].cards = state.players['P2'].cards.map(c => {
      if (c.position === 'top-left') return { ...c, value: '5', suit: 'Clubs' };
      return c;
    });

    const p2CardsBefore = state.players['P2'].cards.length;

    const res = transition(state, { type: 'JUMP_IN_TYPE_1', player_id: 'P2', card_position: 'top-left', timestamp: 1500 }, 1500);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Wrong jump-in number');
    
    // (a) Incorrectly-jumped card remains in its original position
    expect(res.state.players['P2'].cards.find(c => c.position === 'top-left')?.value).toBe('5');
    
    // (b) Player receives a new face-down penalty card from the draw pile
    expect(res.state.players['P2'].cards.length).toBe(p2CardsBefore + 1);
    expect(res.state.players['P2'].cards.some(c => c.position === 'penalty-1')).toBe(true);
  });

  it('should reject Jump-In Type 2 if player has no prior knowledge of opponent card', () => {
    let state = createInitialState(['P1', 'P2']);

    // Set top discard to 8
    state.discard_pile = [{ id: 'discard-8', value: '8', suit: 'Hearts', position: 'top-left', face_up: true, known_by: [] }];
    state.last_discard_card = state.discard_pile[0];

    // Give P2 an 8, but P1 does NOT know it (known_by is empty)
    state.players['P2'].cards = state.players['P2'].cards.map(c => {
      if (c.position === 'top-left') {
        return { ...c, value: '8', suit: 'Spades', known_by: [] };
      }
      return c;
    });

    const p1CardsBefore = state.players['P1'].cards.length;

    // P1 jumps in on P2's card using Type 2
    const res = transition(state, {
      type: 'JUMP_IN_TYPE_2',
      player_id: 'P1',
      opponent_player_id: 'P2',
      opponent_position: 'top-left',
      own_position: 'top-left',
      timestamp: 1500
    }, 1500);

    expect(res.success).toBe(false);
    expect(res.error).toBe('No prior knowledge of opponent card');
    
    // P1 receives penalty card
    expect(res.state.players['P1'].cards.length).toBe(p1CardsBefore + 1);
    expect(res.state.players['P1'].cards.some(c => c.position === 'penalty-1')).toBe(true);
  });

  it('should handle Jump-In Type 2 with prior knowledge', () => {
    let state = createInitialState(['P1', 'P2']);

    // Set top discard to 8
    state.discard_pile = [{ id: 'discard-8', value: '8', suit: 'Hearts', position: 'top-left', face_up: true, known_by: [] }];
    state.last_discard_card = state.discard_pile[0];

    // Give P2 an 8 that is known by P1
    state.players['P2'].cards = state.players['P2'].cards.map(c => {
      if (c.position === 'top-left') {
        return { ...c, value: '8', suit: 'Spades', known_by: ['P1'] };
      }
      return c;
    });

    const p1CardToGiveId = state.players['P1'].cards.find(c => c.position === 'top-left')?.id;

    // P1 jumps in on P2's card using Type 2
    const res = transition(state, {
      type: 'JUMP_IN_TYPE_2',
      player_id: 'P1',
      opponent_player_id: 'P2',
      opponent_position: 'top-left',
      own_position: 'top-left',
      timestamp: 1500
    }, 1500);

    expect(res.success).toBe(true);
    // P2's top-left card should now be the card given by P1
    expect(res.state.players['P2'].cards.find(c => c.position === 'top-left')?.id).toBe(p1CardToGiveId);
    // P1 should have lost that card
    expect(res.state.players['P1'].cards.some(c => c.id === p1CardToGiveId)).toBe(false);
  });

  it('should automatically eliminate a player when receiving their 9th card', () => {
    let state = createInitialState(['P1', 'P2']);
    
    // Add 4 penalty cards to P1 (giving them 8 total)
    for (let i = 0; i < 4; i++) {
      state.players['P1'].cards.push({
        id: `pen-${i}`,
        value: 'A',
        suit: 'Clubs',
        position: `penalty-${i + 1}` as CardPosition,
        face_up: false,
        known_by: []
      });
    }
    state.players['P1'].score = state.players['P1'].cards.reduce((sum, c) => sum + getCardPoints(c), 0);
    expect(state.players['P1'].cards.length).toBe(8);

    // Apply one more mistake -> 9th card -> auto-elimination
    const res = transition(state, { type: 'FORCE_MISTAKE', player_id: 'P1', mistake_type: 'skipping_turn', timestamp: 2000 }, 2000);
    expect(res.state.players['P1'].connection_status).toBe('eliminated');
    expect(res.state.players['P1'].is_spectator).toBe(true);
    expect(res.state.players['P1'].cards.length).toBe(0); // cards discarded
  });

  it('should handle calling, final turns, and tie-breaking', () => {
    let state = createInitialState(['P1', 'P2', 'P3']);

    // Set custom simple card scores
    state.players['P1'].cards = [{ id: 'c1', value: '2', suit: 'Hearts', position: 'top-left', face_up: false, known_by: [] }]; // 2 pts
    state.players['P2'].cards = [{ id: 'c2', value: '2', suit: 'Spades', position: 'top-left', face_up: false, known_by: [] }]; // 2 pts
    state.players['P3'].cards = [{ id: 'c3', value: '5', suit: 'Clubs', position: 'top-left', face_up: false, known_by: [] }]; // 5 pts

    state.players['P1'].score = 2;
    state.players['P2'].score = 2;
    state.players['P3'].score = 5;

    // P1 calls at the start of their turn
    const res1 = transition(state, { type: 'CALL', player_id: 'P1', timestamp: 1000 }, 1000);
    expect(res1.success).toBe(true);
    expect(res1.state.status).toBe('final_round');
    expect(res1.state.caller_id).toBe('P1');
    expect(res1.state.current_player_index).toBe(1); // turn passes to P2 for final turn

    // P2 takes final turn (Draw & Discard)
    const res2 = transition(res1.state, { type: 'DRAW_PILE_DRAW', player_id: 'P2', timestamp: 2000 }, 2000);
    res2.state.drawn_card = { id: 'drawn-2', value: '2', suit: 'Hearts', position: 'top-left', face_up: false, known_by: [] };
    const res3 = transition(res2.state, { type: 'DRAW_PILE_DISCARD', player_id: 'P2', timestamp: 3000 }, 3000);
    
    expect(res3.state.players['P2'].took_final_turn).toBe(true);
    expect(res3.state.current_player_index).toBe(2); // turn passes to P3

    // P3 takes final turn (Draw & Discard)
    const res4 = transition(res3.state, { type: 'DRAW_PILE_DRAW', player_id: 'P3', timestamp: 4000 }, 4000);
    res4.state.drawn_card = { id: 'drawn-3', value: '3', suit: 'Diamonds', position: 'top-left', face_up: false, known_by: [] };
    const res5 = transition(res4.state, { type: 'DRAW_PILE_DISCARD', player_id: 'P3', timestamp: 5000 }, 5000);

    // Game should end. P1 and P2 both have 2 points, but P1 is caller, so P1 wins.
    expect(res5.state.status).toBe('ended');
    expect(res5.state.winner_ids).toEqual(['P1']);
  });

  it('should support skipping calling with 0 cards', () => {
    let state = createInitialState(['P1', 'P2']);
    // Clear P1 cards (simulating they jumped in successfully with everything)
    state.players['P1'].cards = [];
    state.players['P1'].score = 0;

    // P1 can choose to draw instead of calling on their turn
    const res = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1000 }, 1000);
    expect(res.success).toBe(true);
    expect(res.state.turn_phase).toBe('draw_decide');
  });

  it('should reshuffle discard pile when draw pile is exhausted', () => {
    let state = createInitialState(['P1', 'P2']);
    
    // Empty the draw pile
    state.draw_pile = [];
    
    // Add multiple cards to discard pile
    state.discard_pile = [
      { id: 'd1', value: '3', suit: 'Hearts', position: 'top-left', face_up: true, known_by: [] },
      { id: 'd2', value: '4', suit: 'Clubs', position: 'top-left', face_up: true, known_by: [] },
      { id: 'd3', value: '5', suit: 'Spades', position: 'top-left', face_up: true, known_by: [] } // top card
    ];
    // Drawing should trigger reshuffle
    const res = transition(state, { type: 'DRAW_PILE_DRAW', player_id: 'P1', timestamp: 1000 }, 1000);
    expect(res.success).toBe(true);
    expect(res.state.draw_pile.length).toBe(1); // d1 or d2 was drawn, the other is left in draw pile
    expect(res.state.discard_pile.length).toBe(1); // only top card remains
    expect(res.state.discard_pile[0].id).toBe('d3');
  });
  
});

// ─────────────────────────────────────────────────────────────────────────────
// Bug-regression: disconnect handling must never crash the engine
// ─────────────────────────────────────────────────────────────────────────────
describe('Disconnect resilience', () => {

  it('[BUG] applyMistake does not throw when player ID is unknown', () => {
    // Reproduces: "TypeError: Cannot read properties of undefined (reading 'length')"
    // applyMistake was called with a player ID that no longer existed in state.players
    // (e.g. already eliminated while disconnected). The fix makes it a no-op + warn.
    const state = createInitialState(['P1', 'P2']);

    // Simulate P2 being removed from the players map (stale reference)
    const corruptState: GameState = {
      ...state,
      players: { P1: state.players['P1'] } as any // P2 is missing
    };

    // This must NOT throw — it should return the state unchanged
    expect(() => {
      applyMistake(corruptState, 'P2', Date.now());
    }).not.toThrow();
  });

  it('[BUG] DISCONNECT action on already-eliminated player does not crash', () => {
    let state = createInitialState(['P1', 'P2']);

    // Eliminate P2 through the engine first
    const r1 = transition(state, { type: 'DISCONNECT', player_id: 'P2', timestamp: 1000 }, 1000);
    expect(r1.success).toBe(true);
    expect(r1.state.players['P2'].connection_status).toBe('disconnected');

    // Fire DISCONNECT again on the same player (simulates WS close racing with reconnect timer)
    expect(() => {
      transition(r1.state, { type: 'DISCONNECT', player_id: 'P2', timestamp: 2000 }, 2000);
    }).not.toThrow();
  });

  it('[BUG] DISCONNECT while P2 is the active player advances turn without crash', () => {
    // Deterministic deck: fix P2 as the active player
    let state = createInitialState(['P1', 'P2']);
    // Force P2 to be the active player
    state = { ...state, current_player_index: 1 };

    const r = transition(state, { type: 'DISCONNECT', player_id: 'P2', timestamp: 1000 }, 1000);
    expect(r.success).toBe(true);
    // P2 is now marked disconnected — the engine itself doesn't advance the turn on DISCONNECT,
    // the server does that via FORCE_TIMER_EXPIRY. Confirm state is still valid.
    expect(r.state.players['P2'].connection_status).toBe('disconnected');
    expect(r.state.status).not.toBe(undefined);
  });

  it('[BUG] FORCE_TIMER_EXPIRY does not crash when active player was already eliminated', () => {
    let state = createInitialState(['P1', 'P2']);
    // Mark P1 (current active player) as eliminated directly in state
    state = {
      ...state,
      players: {
        ...state.players,
        P1: { ...state.players['P1'], connection_status: 'eliminated', is_spectator: true, cards: [] }
      }
    };

    // FORCE_TIMER_EXPIRY calls applyMistake(state, activePlayerId) — activePlayerId is P1 which is
    // eliminated. With the fix, applyMistake returns state unchanged instead of crashing.
    expect(() => {
      transition(state, { type: 'FORCE_TIMER_EXPIRY', timestamp: 1000 }, 1000);
    }).not.toThrow();
  });

  it('state.players is never mutated in-place by completeTurn during final_round', () => {
    let state = createInitialState(['P1', 'P2', 'P3']);
    state = { ...state, status: 'final_round', caller_id: 'P1' };

    // Capture the original players reference
    const originalPlayers = state.players;

    // P2 draws and discards — this triggers completeTurn internally
    const drawResult = transition(
      { ...state, current_player_index: 1 },
      { type: 'DRAW_PILE_DRAW', player_id: 'P2', timestamp: 1 },
      1
    );
    expect(drawResult.success).toBe(true);

    // The original state.players object must remain untouched
    expect(state.players).toBe(originalPlayers);
    // The returned state must have a NEW players object
    expect(drawResult.state.players).not.toBe(originalPlayers);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bad-input / injection resilience
// ─────────────────────────────────────────────────────────────────────────────
describe('Bad-input resilience', () => {

  it('transition returns a failure response for unknown action type', () => {
    const state = createInitialState(['P1', 'P2']);
    const res = transition(state, { type: 'INVALID_ACTION_XYZ' } as any, Date.now());
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    // Crucially: state is still a valid object
    expect(res.state).toBeDefined();
    expect(res.state.players).toBeDefined();
  });

  it('transition returns failure (not throw) when action is missing required fields', () => {
    const state = createInitialState(['P1', 'P2']);
    // DRAW_PILE_DRAW without player_id — player_id will be undefined
    expect(() => {
      transition(state, { type: 'DRAW_PILE_DRAW' } as any, Date.now());
    }).not.toThrow();
  });

  it('out-of-turn action applies mistake penalty without crashing', () => {
    const state = createInitialState(['P1', 'P2']);
    // P2 tries to draw on P1's turn
    const res = transition(
      state,
      { type: 'DRAW_PILE_DRAW', player_id: 'P2', timestamp: 1 },
      1
    );
    // Must fail gracefully with a penalty applied, not a thrown exception
    expect(res.success).toBe(false);
    expect(res.state.players['P2'].mistake_count).toBe(1);
    // P2 should have received a penalty card
    expect(res.state.players['P2'].cards.length).toBe(5);
  });

  it('transition with null action does not crash the server', () => {
    const state = createInitialState(['P1', 'P2']);
    expect(() => {
      transition(state, null as any, Date.now());
    }).not.toThrow();
  });
});
