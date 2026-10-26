import { useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────
// WebSocket endpoint
// - Override anytime with VITE_WS_URL (e.g. ws://192.168.1.10:9000)
// - Dev server: connects to the game server on the same host, port 8080
//   (override port with VITE_WS_PORT)
// - Production build: connects to whatever host serves the page
// ─────────────────────────────────────────────────────────────
const WS_URL: string =
  import.meta.env.VITE_WS_URL ??
  (import.meta.env.DEV
    ? `ws://${window.location.hostname || 'localhost'}:${import.meta.env.VITE_WS_PORT || 8080}`
    : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`);

// ─────────────────────────────────────────────────────────────
// Types (mirror the server-masked GameState shape)
// ─────────────────────────────────────────────────────────────
type ConnectionState = 'connecting' | 'connected' | 'disconnected';

interface Card {
  id: string;
  value: string | null;   // null = masked (not known by viewer)
  suit:  string | null;
  position: string;
  face_up: boolean;
  known_by: string[];
}

interface Player {
  id: string;
  name: string;
  cards: Card[];
  score: number;
  has_called: boolean;
  mistake_count: number;
  connection_status: 'connected' | 'disconnected' | 'eliminated';
  is_spectator: boolean;
  took_final_turn: boolean;
}

interface PowerState {
  card_id: string;
  power_type: '7_8' | '9_10' | 'J_Q' | 'K';
  player_id: string;
  k_selection?: { own_position: string; opponent_player_id: string; opponent_position: string };
}

interface MaskedGameState {
  players: Record<string, Player>;
  player_order: string[];
  current_player_index: number;
  draw_pile: { length: number };
  discard_pile: Card[];
  caller_id: string | null;
  status: 'setup' | 'playing' | 'final_round' | 'ended';
  turn_phase: 'action_choice' | 'draw_decide' | 'resolving_power';
  drawn_card: Card | null;
  last_discard_card: Card | null;
  jump_in_window_open: boolean;
  active_power: PowerState | null;
  turn_timer_start: number | null;
  winner_ids: string[];
  mistake_log?: { player_id: string; reason: string; timestamp: number }[];
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getSuitSymbol(suit: string | null): string {
  switch (suit) {
    case 'Hearts':   return '♥';
    case 'Diamonds': return '♦';
    case 'Clubs':    return '♣';
    case 'Spades':   return '♠';
    default:          return '★';
  }
}

function getCardColorClass(suit: string | null): string {
  if (!suit) return 'joker';
  if (suit === 'Hearts' || suit === 'Diamonds') return 'red';
  return 'black';
}

function powerLabel(pt: PowerState['power_type']): string {
  switch (pt) {
    case '7_8':  return 'LOOK — Your Card';
    case '9_10': return 'PEEK — Opponent Card';
    case 'J_Q':  return 'BLIND SWAP';
    case 'K':    return 'LOOK & SWAP';
  }
}

function powerInstruction(pt: PowerState['power_type']): string {
  switch (pt) {
    case '7_8':  return 'Click one of your own face-down cards to peek at it briefly.';
    case '9_10': return "Click one of an opponent's face-down cards to peek at it.";
    case 'J_Q':  return 'Select one of YOUR cards, then one OPPONENT card — you will swap them blind.';
    case 'K':    return 'Select one of YOUR cards and one OPPONENT card, look at both, then choose whether to swap.';
  }
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

/** Single flip-card with peek animation support */
function GameCard({
  card,
  showValue,
  onClick,
  highlightClass = '',
  locked = false,
  peek = false,
}: {
  card: Card;
  showValue: boolean;
  onClick?: () => void;
  highlightClass?: string;
  locked?: boolean;
  peek?: boolean;
}) {
  const [flipping, setFlipping] = useState(false);
  const prevPeekRef = useRef(false);

  // Trigger flip animation when peek state turns on
  useEffect(() => {
    if (peek && !prevPeekRef.current) {
      setFlipping(true);
      const t = setTimeout(() => setFlipping(false), 1200);
      prevPeekRef.current = true;
      return () => clearTimeout(t);
    }
    if (!peek) prevPeekRef.current = false;
  }, [peek]);

  const revealed = showValue && (card.value !== null);
  const flipped  = revealed || flipping;

  return (
    <div
      className={`card-flip-wrapper ${flipped ? 'flipped' : ''} ${highlightClass} ${locked ? 'locked' : ''}`}
      onClick={locked ? undefined : onClick}
      title={locked ? 'Locked (finished player)' : undefined}
    >
      <div className="card-flip-inner">
        {/* Back */}
        <div className="card-back">
          <div className="card-back-pattern">♠♥♦♣</div>
          {card.known_by.length > 0 && <div className="known-dot" />}
        </div>
        {/* Face */}
        <div className={`card-face ${getCardColorClass(card.suit)}`}>
          <div className="card-value-tl">{card.value}</div>
          <div className="card-suit-br">{getSuitSymbol(card.suit)}</div>
          {card.known_by.length > 0 && <div className="known-dot" />}
        </div>
      </div>
    </div>
  );
}

/** Toast notification */
function Toast({ msg, kind }: { msg: string; kind: 'error'|'info'|'success' }) {
  return <div className={`toast ${kind}`}>{msg}</div>;
}

// ─────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────
export default function App() {
  // ── session / connection state
  const [playerName,   setPlayerName]   = useState('');
  const [roomCode,     setRoomCode]     = useState('');
  const [joinedRoom,   setJoinedRoom]   = useState<string|null>(null);
  const [myId,         setMyId]         = useState<string|null>(null);
  const [token,        setToken]        = useState<string|null>(null);
  const [isSpectator,  setIsSpectator]  = useState(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<{id:string;name:string}[]>([]);
  const [hostId,       setHostId]       = useState<string|null>(null);
  const [connState,    setConnState]    = useState<ConnectionState>('disconnected');

  // ── game state
  const [gs, setGs] = useState<MaskedGameState|null>(null);

  // ── UI interaction state
  const [toast,            setToast]            = useState<{msg:string;kind:'error'|'info'|'success'}|null>(null);
  const [selectedOwn,      setSelectedOwn]      = useState<string|null>(null);   // position
  const [selectedOpp,      setSelectedOpp]      = useState<{pid:string;pos:string}|null>(null);
  const [discardClickMode, setDiscardClickMode] = useState(false); // waiting for own card to swap with discard
  const [jumpMode,         setJumpMode]         = useState<'own'|'opp'|null>(null); // armed jump-in type
  const [peekPositions,    setPeekPositions]    = useState<Set<string>>(new Set()); // "{playerId}:{pos}" currently peeking
  const [reconnCountdown,  setReconnCountdown]  = useState(300);

  // ── refs
  const wsRef              = useRef<WebSocket|null>(null);
  const timerIntervalRef   = useRef<any>(null);
  const reconnTimerRef     = useRef<any>(null);
  const toastTimerRef      = useRef<any>(null);
  const turnKeyRef         = useRef<string>(''); // "{player index}:{phase}" of last state
  const mistakeCountRef    = useRef<number | null>(null); // timestamp of the last announced penalty
  const myIdRef            = useRef<string | null>(null); // myId for the socket handler, which outlives renders

  myIdRef.current = myId;

  // ── derived
  const activePlayerId = gs ? gs.player_order[gs.current_player_index] : null;
  const isMyTurn       = !!myId && activePlayerId === myId;
  const myPlayer       = gs && myId ? gs.players[myId] : null;
  const topDiscard     = gs ? gs.discard_pile[gs.discard_pile.length - 1] : null;
  const isHost         = !!myId && myId === hostId;

  // ─── Timer countdown
  const [secondsLeft, setSecondsLeft] = useState(30);
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (!gs || (gs.status !== 'playing' && gs.status !== 'final_round')) return;
    const start = gs.turn_timer_start ?? Date.now();
    const tick = () => setSecondsLeft(Math.max(0, 30 - Math.floor((Date.now() - start) / 1000)));
    tick();
    timerIntervalRef.current = setInterval(tick, 500);
    return () => clearInterval(timerIntervalRef.current);
  }, [gs]);

  // ─── Reconnect timer
  useEffect(() => {
    if (reconnTimerRef.current) clearInterval(reconnTimerRef.current);
    if (connState !== 'disconnected' || !token || !joinedRoom) return;
    setReconnCountdown(300);
    reconnTimerRef.current = setInterval(() =>
      setReconnCountdown(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(reconnTimerRef.current);
  }, [connState, token, joinedRoom]);

  // ─── Toast helper
  const showToast = useCallback((msg: string, kind: 'error'|'info'|'success' = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, kind });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ─── Peek helper: briefly show a card then hide it
  const triggerPeek = useCallback((playerId: string, position: string) => {
    const key = `${playerId}:${position}`;
    setPeekPositions(prev => new Set([...prev, key]));
    setTimeout(() => setPeekPositions(prev => {
      const n = new Set(prev); n.delete(key); return n;
    }), 1800);
  }, []);

  // ─── WebSocket message handler (shared across all connections)
  const handleWsMessage = useCallback((event: MessageEvent) => {
    let data: any;
    try { data = JSON.parse(event.data); } catch { return; }

    switch (data.type) {
      case 'ROOM_CREATED':
        setToken(data.token);
        setJoinedRoom(data.roomId);
        setMyId(data.playerId);
        setHostId(data.playerId);
        setLobbyPlayers(data.players ?? []);
        localStorage.setItem('cg_token',  data.token);
        localStorage.setItem('cg_room',   data.roomId);
        localStorage.setItem('cg_player', data.playerId);
        break;

      case 'ROOM_JOINED':
        setToken(data.token);
        setJoinedRoom(data.roomId);
        setMyId(data.playerId);
        setIsSpectator(data.isSpectator ?? false);
        setLobbyPlayers(data.players ?? []);
        setHostId(data.players?.[0]?.id ?? null);
        localStorage.setItem('cg_token',  data.token);
        localStorage.setItem('cg_room',   data.roomId);
        localStorage.setItem('cg_player', data.playerId);
        break;

      case 'RECONNECTED':
        setIsSpectator(data.isSpectator ?? false);
        showToast('Reconnected!', 'success');
        break;

      case 'GAME_STARTED':
        showToast('Game started!', 'info');
        break;

      case 'GAME_STATE_UPDATE': {
        const newGs: MaskedGameState | null = data.gameState;
        setGs(newGs);
        if (data.players) setLobbyPlayers(data.players);
        if (data.hostId !== undefined) setHostId(data.hostId);

        // Reset interaction state only when the turn or phase moves on, so other
        // players' jump-ins don't wipe a selection in progress
        const turnKey = newGs ? `${newGs.status}:${newGs.current_player_index}:${newGs.turn_phase}` : '';
        if (turnKey !== turnKeyRef.current) {
          turnKeyRef.current = turnKey;
          setSelectedOwn(null);
          setSelectedOpp(null);
          setDiscardClickMode(false);
        }
        if (!newGs?.jump_in_window_open) setJumpMode(null);

        // Announce new penalties to everyone (skipped on the first state after joining)
        const log = newGs?.mistake_log ?? [];
        const latest = log[log.length - 1];
        const seen = mistakeCountRef.current;
        if (seen !== null && latest && latest.timestamp > seen) {
          const who = latest.player_id === myIdRef.current ? 'You' : newGs!.players[latest.player_id]?.name ?? 'Someone';
          showToast(`Penalty — ${who}: ${latest.reason} (+1 card)`, 'error');
        }
        mistakeCountRef.current = latest?.timestamp ?? 0;
        break;
      }

      case 'RECONNECT_FAILED':
        localStorage.removeItem('cg_token');
        localStorage.removeItem('cg_room');
        localStorage.removeItem('cg_player');
        wsRef.current?.close();
        setJoinedRoom(null); setMyId(null); setToken(null); setGs(null);
        showToast(data.error ?? 'Could not rejoin room', 'error');
        break;

      case 'ACTION_FAILED':
        showToast(data.error ?? 'Action failed', 'error');
        break;

      case 'ERROR':
        showToast(data.error ?? 'Server error', 'error');
        break;
    }
  }, [showToast]);

  // ─── Open WebSocket
  const openWs = useCallback((onOpen?: (ws: WebSocket) => void) => {
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
    setConnState('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen    = () => { setConnState('connected'); onOpen?.(ws); };
    ws.onmessage = handleWsMessage;
    ws.onclose   = () => setConnState('disconnected');
    ws.onerror   = () => setConnState('disconnected');
  }, [handleWsMessage]);

  // ─── Session restore on mount
  useEffect(() => {
    const tok = localStorage.getItem('cg_token');
    const rm  = localStorage.getItem('cg_room');
    const pid = localStorage.getItem('cg_player');
    if (tok && rm && pid) {
      setToken(tok); setJoinedRoom(rm); setMyId(pid);
      openWs(ws => ws.send(JSON.stringify({ type: 'RECONNECT', roomId: rm, playerId: pid, token: tok })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Send action helper
  const send = useCallback((payload: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const sendAction = useCallback((action: any) => {
    send({ type: 'GAME_ACTION', action });
  }, [send]);

  // ─── Lobby actions
  const createRoom = () => {
    if (!playerName.trim()) return;
    openWs(ws => ws.send(JSON.stringify({ type: 'CREATE_ROOM', playerName })));
  };

  const joinRoom = (spectate = false) => {
    if (!playerName.trim() || !roomCode.trim()) return;
    openWs(ws => ws.send(JSON.stringify({
      type: 'JOIN_ROOM', roomId: roomCode.toUpperCase(), playerName, isSpectator: spectate
    })));
  };

  const startGame = () => send({ type: 'START_GAME' });

  const handleLeave = () => {
    localStorage.removeItem('cg_token');
    localStorage.removeItem('cg_room');
    localStorage.removeItem('cg_player');
    wsRef.current?.close();
    setJoinedRoom(null); setMyId(null); setToken(null);
    setGs(null); setConnState('disconnected');
  };

  // ─── Card click dispatcher
  const handleCardClick = useCallback((ownerId: string, card: Card) => {
    if (!gs || isSpectator || !myId || gs.status === 'ended') return;

    const isMine  = ownerId === myId;
    const phase   = gs.turn_phase;
    const power   = gs.active_power?.power_type;

    // ── Jump-in (only when explicitly armed, so normal turn clicks never
    //    turn into accidental jump-ins and mistake penalties) ──────────
    if (jumpMode) {
      if (!gs.jump_in_window_open) {
        setJumpMode(null);
        showToast('Jump-in window is closed', 'error');
        return;
      }
      if (jumpMode === 'own') {
        // Type 1: discard your own matching card
        if (!isMine) { showToast('Click one of YOUR cards that matches the discard', 'info'); return; }
        sendAction({ type: 'JUMP_IN_TYPE_1', card_position: card.position, expected_discard_id: gs.last_discard_card?.id });
        setJumpMode(null);
        return;
      }
      // Type 2: pick the opponent card you know matches, then the card you give them
      if (!isMine) {
        setSelectedOpp({ pid: ownerId, pos: card.position });
        showToast('Now click one of YOUR cards to give them', 'info');
        return;
      }
      if (!selectedOpp) { showToast("First click the opponent's card you know matches", 'info'); return; }
      sendAction({
        type: 'JUMP_IN_TYPE_2',
        opponent_player_id: selectedOpp.pid,
        opponent_position: selectedOpp.pos,
        own_position: card.position,
        expected_discard_id: gs.last_discard_card?.id,
      });
      setSelectedOpp(null);
      setJumpMode(null);
      return;
    }

    if (!isMyTurn) return;

    // ── Discard-click mode: swap top discard with own card ──
    if (discardClickMode && isMine) {
      sendAction({ type: 'TAKE_DISCARD_SWAP', target_position: card.position });
      setDiscardClickMode(false);
      return;
    }

    // ── Draw decide: click own card = keep & swap ────────────
    if (phase === 'draw_decide' && isMine) {
      sendAction({ type: 'DRAW_PILE_KEEP', target_position: card.position });
      return;
    }

    // ── Power resolution ──────────────────────────────────────
    if (phase === 'resolving_power' && power) {
      if (power === '7_8' && isMine) {
        sendAction({ type: 'RESOLVE_POWER_7_8', target_position: card.position });
        triggerPeek(myId, card.position);
        return;
      }
      if (power === '9_10' && !isMine) {
        sendAction({ type: 'RESOLVE_POWER_9_10', target_player_id: ownerId, target_position: card.position });
        triggerPeek(ownerId, card.position);
        return;
      }
      if ((power === 'J_Q' || power === 'K') && !gs.active_power?.k_selection) {
        if (isMine) setSelectedOwn(card.position);
        else setSelectedOpp({ pid: ownerId, pos: card.position });
        return;
      }
    }
  }, [gs, isSpectator, myId, isMyTurn, discardClickMode, jumpMode, selectedOwn, selectedOpp, sendAction, showToast, triggerPeek]);

  const armJump = (mode: 'own'|'opp'|null) => {
    setJumpMode(mode);
    setSelectedOwn(null);
    setSelectedOpp(null);
    setDiscardClickMode(false);
  };

  // ─── Confirm power actions (J/Q and K need two selections)
  const confirmJQ = () => {
    if (!selectedOwn || !selectedOpp) return;
    sendAction({ type: 'RESOLVE_POWER_J_Q', own_position: selectedOwn, opponent_player_id: selectedOpp.pid, opponent_position: selectedOpp.pos });
  };
  const lookK = () => {
    if (!selectedOwn || !selectedOpp) return;
    sendAction({ type: 'RESOLVE_POWER_K_LOOK', own_position: selectedOwn, opponent_player_id: selectedOpp.pid, opponent_position: selectedOpp.pos });
  };
  const confirmK = (doSwap: boolean) => {
    const sel = gs?.active_power?.k_selection;
    if (!sel) return;
    sendAction({ type: 'RESOLVE_POWER_K', ...sel, should_swap: doSwap });
  };

  // ─── Render a player's card grid ─────────────────────────
  const renderGrid = (player: Player) => {
    const mainSlots = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    const penaltyCards = player.cards.filter(c => c.position.startsWith('penalty'));
    const cardMap = new Map(player.cards.map(c => [c.position, c]));
    const isCallerOrFinished =
      gs && (player.id === gs.caller_id || player.took_final_turn);

    const renderSlot = (pos: string) => {
      const card = cardMap.get(pos);
      if (!card) return <div key={pos} className="card-slot-empty">—</div>;

      const isMine     = player.id === myId;
      const showValue  = card.face_up || card.value !== null;
      const isPeek     = peekPositions.has(`${player.id}:${pos}`);
      const locked     = !!isCallerOrFinished && gs?.status === 'final_round' && player.id !== myId;
      const isSelOwn   = isMine && selectedOwn === pos;
      const isSelOpp   = !isMine && selectedOpp?.pid === player.id && selectedOpp?.pos === pos;
      const hl         = isSelOwn ? 'highlight-own' : isSelOpp ? 'highlight-opp' : '';

      return (
        <GameCard
          key={card.id}
          card={card}
          showValue={showValue}
          peek={isPeek}
          onClick={() => handleCardClick(player.id, card)}
          highlightClass={hl}
          locked={locked}
        />
      );
    };

    return (
      <div>
        <div className="card-grid">
          {mainSlots.map(renderSlot)}
        </div>
        {penaltyCards.length > 0 && (
          <div className="card-row-extra" style={{ marginTop: 8 }}>
            {penaltyCards.map(c => renderSlot(c.position))}
          </div>
        )}
      </div>
    );
  };

  // ─── Reconnection overlay ────────────────────────────────
  if (connState === 'disconnected' && joinedRoom) {
    return (
      <div className="modal-overlay">
        <div className="glass modal-box">
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📡</div>
          <div className="text-2xl font-bold mb-2">Connection Lost</div>
          <div className="text-muted mb-6" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
            Your seat is held for{' '}
            <strong style={{ color: reconnCountdown < 60 ? 'var(--red)' : 'var(--accent)' }}>
              {Math.floor(reconnCountdown/60)}m {reconnCountdown % 60}s
            </strong>.
            <br/>After that you will be auto-eliminated.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn btn-primary btn-lg"
              onClick={() => openWs(ws => ws.send(JSON.stringify({ type: 'RECONNECT', roomId: joinedRoom, playerId: myId, token })))}>
              Reconnect Now
            </button>
            <button className="btn btn-ghost" onClick={handleLeave}>Leave Room</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Landing / Lobby screen ──────────────────────────────
  if (!joinedRoom || !gs) {
    return (
      <div className="screen-center">
        {toast && <Toast msg={toast.msg} kind={toast.kind} />}
        <div className="glass lobby-card p-8">
          <div className="text-center mb-6">
            <div className="lobby-title grad-text">ANTIGRAVITY</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '.2em', textTransform: 'uppercase' }}>
              Card Game
            </div>
          </div>

          {!joinedRoom && (<>
          {/* Player name */}
          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6, display: 'block', fontWeight: 700 }}>
            Your Name
          </label>
          <input
            className="input mb-4"
            placeholder="Enter name…"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createRoom()}
          />

          <button className="btn btn-primary btn-lg w-full mb-4" onClick={createRoom} disabled={!playerName.trim()}>
            Create Lobby
          </button>

          <div className="divider">
            <div className="divider-line"/>
            <span className="divider-text">or join existing</span>
            <div className="divider-line"/>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              className="input"
              placeholder="ROOM CODE"
              style={{ textTransform: 'uppercase', fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, letterSpacing: '.15em' }}
              value={roomCode}
              onChange={e => setRoomCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
            />
            <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }} onClick={() => joinRoom()} disabled={!playerName.trim() || !roomCode.trim()}>
              Join
            </button>
          </div>

          <button className="btn btn-purple w-full" onClick={() => joinRoom(true)} disabled={!playerName.trim() || !roomCode.trim()}>
            👁 Spectate
          </button>
          </>)}

          {/* Waiting lobby players */}
          {joinedRoom && (
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, fontWeight: 700 }}>
                Lobby — share code <strong style={{ color: 'var(--accent)', letterSpacing: '.15em' }}>{joinedRoom}</strong>
              </div>
              {lobbyPlayers.map(p => (
                <div key={p.id} className="player-lobby-row">
                  <span style={{ fontWeight: 600 }}>{p.name}{p.id === myId ? ' (you)' : ''}</span>
                  {p.id === hostId && <span className="badge badge-accent">Host</span>}
                </div>
              ))}
              {isSpectator && (
                <div className="action-hint" style={{ marginTop: 12 }}>You are spectating — waiting for the host to start.</div>
              )}
              {isHost ? (
                <button className="btn btn-gold w-full" style={{ marginTop: 12 }} onClick={startGame} disabled={lobbyPlayers.length < 2}>
                  {lobbyPlayers.length < 2 ? 'Waiting for players… (1/4)' : `Start Match (${lobbyPlayers.length}/4)`}
                </button>
              ) : !isSpectator && (
                <div className="action-hint" style={{ marginTop: 12 }}>Waiting for the host to start the match…</div>
              )}
              <button className="btn btn-ghost w-full" style={{ marginTop: 8 }} onClick={handleLeave}>Leave Lobby</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── End-of-game results ─────────────────────────────────
  if (gs.status === 'ended') {
    const sorted = gs.player_order
      .map(id => gs.players[id])
      .sort((a, b) => a.score - b.score);

    return (
      <div className="screen-center">
        {toast && <Toast msg={toast.msg} kind={toast.kind} />}
        <div className="glass p-8" style={{ width: '100%', maxWidth: 540 }}>
          <div className="text-center mb-6">
            <div style={{ fontSize: '2.5rem', marginBottom: 4 }}>🏆</div>
            <div className="text-3xl font-black grad-text font-title mb-1">Match Over</div>
            <div className="text-muted text-sm">Final scores — lowest wins</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {sorted.map((p, i) => {
              const isWinner = gs.winner_ids.includes(p.id);
              return (
                <div key={p.id} className={`results-row ${isWinner ? 'winner' : 'loser'}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: '1.2rem', width: 28, textAlign: 'center' }}>
                      {isWinner ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                        {p.has_called && <span className="badge badge-accent">Caller</span>}
                        {isWinner && <span className="badge badge-gold">WINNER</span>}
                      </div>
                    </div>
                  </div>
                  <div className="score-display" style={{ color: isWinner ? 'var(--accent-gold)' : 'var(--text)' }}>
                    {p.score} pts
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            {isHost
              ? <button className="btn btn-primary btn-lg grow" onClick={startGame}>Play Again</button>
              : <div className="action-hint grow">Waiting for the host to start a new match…</div>}
            <button className="btn btn-ghost" onClick={handleLeave}>Exit</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Active game board ────────────────────────────────────
  const opponents  = gs.player_order.filter(id => id !== myId).map(id => gs.players[id]);
  const timerPct   = (secondsLeft / 30) * 100;
  const timerClass = secondsLeft <= 8 ? 'urgent' : 'ok';
  const power      = gs.active_power?.power_type ?? null;

  return (
    <div style={{ minHeight: '100vh', padding: '10px 12px', maxWidth: 1400, margin: '0 auto' }}>
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}
      {isSpectator && <div className="spectator-tag">👁 Spectating</div>}

      {/* ── Header ── */}
      <div className="glass board-header mb-2">
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '.12em', fontWeight: 700 }}>
            ROOM {joinedRoom}
          </div>
          <div className="turn-banner mt-1">
            {gs.status === 'final_round'
              ? <span className="badge badge-gold">FINAL ROUND</span>
              : <span className="badge badge-green">PLAYING</span>}
            {gs.caller_id && (
              <span className="text-muted text-sm">
                · Called by <strong style={{ color: 'var(--accent-gold)' }}>{gs.players[gs.caller_id]?.name}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Active turn */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Active Turn</div>
          <div className="turn-name" style={{ color: isMyTurn ? 'var(--accent)' : 'var(--text)' }}>
            {isMyTurn ? '⚡ YOU' : gs.players[activePlayerId ?? '']?.name ?? '…'}
          </div>
        </div>

        {/* Timer */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Timer</div>
          <div className="timer-digit" style={{ color: secondsLeft <= 8 ? 'var(--red)' : 'var(--accent)' }}>
            {secondsLeft}s
          </div>
        </div>
      </div>

      {/* Timer bar */}
      <div className="timer-track mb-3">
        <div className={`timer-fill ${timerClass}`} style={{ width: `${timerPct}%` }} />
      </div>

      {/* Final round banner */}
      {gs.status === 'final_round' && (
        <div className="final-round-banner mb-3">
          ⏳ Final Round — each other player gets one last turn. Caller &amp; finished players' cards are locked.
        </div>
      )}

      {/* ── Main area ── */}
      <div className="game-area">
        {/* Left: opponents + my grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Opponents */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {opponents.map(p => {
              const isActive  = p.id === activePlayerId;
              const isCaller  = p.id === gs.caller_id;
              const isFinished = p.took_final_turn;
              return (
                <div key={p.id} className={`glass player-section ${isActive ? 'is-active-turn' : ''} ${isCaller ? 'is-caller' : ''} ${isFinished && gs.status === 'final_round' ? 'is-finished' : ''}`}>
                  <div className="player-header">
                    <div className="player-name">
                      {p.connection_status === 'disconnected' ? '⚠️' : ''}
                      {p.name}
                      {isActive && <span className="badge badge-accent">Turn</span>}
                      {isCaller && <span className="badge badge-gold">Caller</span>}
                      {isFinished && gs.status === 'final_round' && <span className="badge badge-muted">Done</span>}
                    </div>
                    <div className="player-meta">
                      <span>{p.cards.length} cards</span>
                      {p.mistake_count > 0 && <span className="badge badge-red">{p.mistake_count} mistakes</span>}
                      {p.connection_status !== 'connected' && <span className="badge badge-muted">{p.connection_status}</span>}
                    </div>
                  </div>
                  {renderGrid(p)}
                </div>
              );
            })}
          </div>

          {/* My grid */}
          {!isSpectator && myPlayer && (
            <div className={`glass player-section your-section ${isMyTurn ? 'is-active-turn' : ''}`}>
              <div className="player-header">
                <div className="player-name">
                  ⚡ You ({myPlayer.name})
                  {isMyTurn && <span className="badge badge-accent">Your Turn</span>}
                </div>
                <div className="player-meta">
                  <span>{myPlayer.cards.length} cards</span>
                  {myPlayer.mistake_count > 0 && <span className="badge badge-red">{myPlayer.mistake_count} mistakes</span>}
                </div>
              </div>
              {renderGrid(myPlayer)}
            </div>
          )}
        </div>

        {/* Right: center board */}
        <div className="center-board">
          <div className="glass" style={{ padding: 14 }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
              Center Board
            </div>

            {/* Jump-in window indicator */}
            <div className={`jump-window-bar ${gs.jump_in_window_open ? 'open' : 'closed'} mb-3`}
                 style={{ justifyContent: 'center' }}>
              <div className={`jump-dot ${gs.jump_in_window_open ? 'on' : 'off'}`} />
              {gs.jump_in_window_open ? 'Jump-In OPEN' : 'Jump-In Closed'}
            </div>

            {/* Piles */}
            <div className="piles-area">
              {/* Draw pile */}
              <div style={{ textAlign: 'center' }}>
                <div className="pile-label">Draw Pile</div>
                <div
                  className={`draw-pile-card ${!(isMyTurn && gs.turn_phase === 'action_choice') ? 'disabled' : ''}`}
                  onClick={() => { if (isMyTurn && gs.turn_phase === 'action_choice') sendAction({ type: 'DRAW_PILE_DRAW' }); }}
                >
                  <div style={{ fontSize: '1.5rem', color: 'rgba(255,255,255,.15)' }}>♠♥</div>
                  <div className="draw-count">{gs.draw_pile.length} left</div>
                </div>
              </div>

              {/* Discard pile */}
              <div style={{ textAlign: 'center' }}>
                <div className="pile-label">Discard Pile</div>
                {topDiscard ? (
                  <div
                    className={`card-flip-wrapper flipped ${isMyTurn && gs.turn_phase === 'action_choice' ? 'highlight-own' : ''}`}
                    style={{ cursor: isMyTurn && gs.turn_phase === 'action_choice' ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (isMyTurn && gs.turn_phase === 'action_choice') {
                        setDiscardClickMode(true);
                        showToast('Now click one of YOUR cards to swap with the discard', 'info');
                      }
                    }}
                    title={isMyTurn && gs.turn_phase === 'action_choice' ? 'Click to take this card (then click your own card to swap)' : ''}
                  >
                    <div className="card-flip-inner">
                      <div className="card-back"><div className="card-back-pattern">♠♥♦♣</div></div>
                      <div className={`card-face ${getCardColorClass(topDiscard.suit)}`}>
                        <div className="card-value-tl">{topDiscard.value}</div>
                        <div className="card-suit-br">{getSuitSymbol(topDiscard.suit)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card-slot-empty">Empty</div>
                )}
                {discardClickMode && (
                  <div style={{ marginTop: 6, fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 600, textAlign: 'center' }}>
                    ← Click YOUR card to swap
                  </div>
                )}
              </div>
            </div>

            {/* ── Jump-in controls (any player, any time the window is open) ── */}
            {!isSpectator && myPlayer && gs.jump_in_window_open && topDiscard && (
              <div className="controls-panel" style={{ marginBottom: 8 }}>
                {jumpMode ? (
                  <>
                    <div className="action-hint">
                      {jumpMode === 'own'
                        ? <>Click YOUR card that matches <strong>{topDiscard.value}</strong></>
                        : selectedOpp
                          ? <>Now click one of YOUR cards to give them</>
                          : <>Click the opponent card you know is a <strong>{topDiscard.value}</strong></>}
                    </div>
                    <button className="btn btn-danger w-full" onClick={() => armJump(null)}>Cancel Jump-In</button>
                  </>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <button className="btn btn-ghost grow" style={{ fontSize: '0.75rem' }} onClick={() => armJump('own')}
                      title="Discard your own card that matches the top discard">
                      Jump In: My Card
                    </button>
                    <button className="btn btn-ghost grow" style={{ fontSize: '0.75rem' }} onClick={() => armJump('opp')}
                      title="Discard an opponent card you know matches, and give them one of yours">
                      Jump In: Theirs
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Action Controls ── */}
            {isMyTurn && (
              <div className="controls-panel">
                {/* Action choice phase */}
                {gs.turn_phase === 'action_choice' && (
                  <>
                    {!gs.caller_id && (
                      <button className="btn btn-gold w-full" onClick={() => sendAction({ type: 'CALL' })}>
                        📣 CALL (End Round)
                      </button>
                    )}
                    <div className="action-hint">
                      Click <strong>Draw Pile</strong> to draw a card,<br/>
                      or click the <strong>Discard</strong> to take that card and swap.
                    </div>
                  </>
                )}

                {/* Draw-decide phase */}
                {gs.turn_phase === 'draw_decide' && gs.drawn_card && (
                  <div className="drawn-card-panel">
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>You Drew</div>
                    <div className={`card-flip-wrapper flipped`} style={{ pointerEvents: 'none' }}>
                      <div className="card-flip-inner">
                        <div className="card-back"><div className="card-back-pattern">♠♥♦♣</div></div>
                        <div className={`card-face ${getCardColorClass(gs.drawn_card.suit)}`}>
                          <div className="card-value-tl">{gs.drawn_card.value}</div>
                          <div className="card-suit-br">{getSuitSymbol(gs.drawn_card.suit)}</div>
                        </div>
                      </div>
                    </div>
                    <button className="btn btn-primary w-full" onClick={() => sendAction({ type: 'DRAW_PILE_DISCARD' })}>
                      {['7','8','9','10','J','Q','K'].includes(gs.drawn_card.value ?? '') ? 'Discard (activate power)' : 'Discard'}
                    </button>
                    <div className="action-hint">Or click one of YOUR cards to Keep &amp; Swap it in.</div>
                  </div>
                )}

                {/* Power resolution phase */}
                {gs.turn_phase === 'resolving_power' && gs.active_power && (
                  <div className="power-panel">
                    <div className="power-title">✦ Power: {powerLabel(gs.active_power.power_type)}</div>
                    <div className="power-instruction">{powerInstruction(gs.active_power.power_type)}</div>

                    {/* Selection status for J/Q and K */}
                    {(power === 'J_Q' || power === 'K') && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div className="selection-row">
                          {selectedOwn
                            ? <><span className="selection-check">✔</span> Your card: <strong>{selectedOwn}</strong></>
                            : <><span style={{color:'var(--text-muted)'}}>○</span> Select YOUR card…</>}
                        </div>
                        <div className="selection-row">
                          {selectedOpp
                            ? <><span className="selection-check">✔</span> Opp card: <strong>{gs.players[selectedOpp.pid]?.name} — {selectedOpp.pos}</strong></>
                            : <><span style={{color:'var(--text-muted)'}}>○</span> Select OPPONENT card…</>}
                        </div>
                      </div>
                    )}

                    {/* Confirm buttons */}
                    {power === 'J_Q' && selectedOwn && selectedOpp && (
                      <button className="btn btn-primary w-full" onClick={confirmJQ}>Confirm Blind Swap</button>
                    )}
                    {power === 'K' && !gs.active_power.k_selection && selectedOwn && selectedOpp && (
                      <button className="btn btn-primary w-full" onClick={lookK}>Look at Both Cards</button>
                    )}
                    {power === 'K' && gs.active_power.k_selection && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost grow" onClick={() => confirmK(false)}>Keep</button>
                        <button className="btn btn-primary grow" onClick={() => confirmK(true)}>Swap</button>
                      </div>
                    )}
                    <button className="btn btn-ghost w-full" style={{ fontSize: '0.75rem' }}
                      onClick={() => sendAction({ type: 'SKIP_POWER' })}>
                      Skip Power
                    </button>

                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      {(power === 'J_Q' || power === 'K') && !gs.active_power.k_selection && (selectedOwn || selectedOpp) && (
                        <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '6px 12px' }}
                          onClick={() => { setSelectedOwn(null); setSelectedOpp(null); }}>
                          Clear Selection
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Non-active player hint */}
            {!isMyTurn && !isSpectator && (
              <div className="controls-panel">
                <div className="action-hint">
                  Watching {gs.players[activePlayerId ?? '']?.name ?? '…'}'s turn…<br/>
                  {gs.jump_in_window_open && <strong style={{color:'var(--green)'}}>Jump-in window OPEN — use the Jump In buttons above.</strong>}
                </div>
              </div>
            )}

            {isSpectator && (
              <div className="controls-panel">
                <div className="action-hint" style={{ color: 'var(--purple)' }}>
                  You are spectating. Card values are hidden.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
