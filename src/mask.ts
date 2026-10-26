import { Card, GameState } from './types.js';
import { calculatePlayerScore } from './engine.js';

// The per-viewer view of the game the server sends over the wire. Anything a
// viewer may not see is replaced, including card ids: ids of face-up cards are
// public, so a hidden card keeping its id could be recognised later.
export function maskGameState(state: GameState | null, viewerId: string | null, isSpectator: boolean): any {
  if (!state) return null;

  // Players eliminated mid-game become spectators and lose their view too
  const spectating = isSpectator || !viewerId || !!state.players[viewerId]?.is_spectator;
  const activeId = state.player_order[state.current_player_index];

  const maskCard = (c: Card, ownerKey: string) => {
    const known = !spectating && c.known_by.includes(viewerId!);
    if (c.face_up || known) {
      return { ...c, known_by: known ? [viewerId] : [] };
    }
    return { ...c, id: `hidden:${ownerKey}:${c.position}`, value: null, suit: null, known_by: [] };
  };

  const maskedPlayers: Record<string, any> = {};
  for (const [id, p] of Object.entries(state.players)) {
    maskedPlayers[id] = {
      ...p,
      cards: p.cards.map(c => maskCard(c, id)),
      // A live score would reveal the sum of hidden cards
      score: state.status !== 'ended' ? null : p.connection_status === 'eliminated' ? 0 : calculatePlayerScore(p)
    };
  }

  // Only the drawer may see a drawn card
  const drawn = state.drawn_card;
  const drawnVisible = drawn && !spectating && viewerId === activeId;

  return {
    ...state,
    players: maskedPlayers,
    draw_pile: { length: state.draw_pile.length },
    drawn_card: drawn
      ? drawnVisible ? drawn : { id: 'hidden:drawn', value: null, suit: null, position: drawn.position, face_up: false, known_by: [] }
      : null
  };
}
