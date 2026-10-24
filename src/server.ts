import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  GameState,
  Action,
  Card,
  Player,
  CardPosition
} from './types.js';
import {
  createInitialState,
  transition,
  calculatePlayerScore
} from './engine.js';

interface Session {
  playerId: string;
  name: string;
  token: string;
  roomId: string;
  isSpectator: boolean;
  ws: WebSocket | null;
}

interface Room {
  id: string;
  gameState: GameState | null;
  players: Session[];
  spectators: Session[];
  turnTimer: NodeJS.Timeout | null;
  powerTimer: NodeJS.Timeout | null;
  reconnectTimers: Record<string, NodeJS.Timeout>;
}

// Actions a client may send; setup, timer and connection actions are server-only
const CLIENT_ACTION_TYPES = new Set<string>([
  'LOOK_BOTTOM_CARDS',
  'DRAW_PILE_DRAW',
  'DRAW_PILE_KEEP',
  'DRAW_PILE_DISCARD',
  'TAKE_DISCARD_SWAP',
  'RESOLVE_POWER_7_8',
  'RESOLVE_POWER_9_10',
  'RESOLVE_POWER_J_Q',
  'RESOLVE_POWER_K',
  'JUMP_IN_TYPE_1',
  'JUMP_IN_TYPE_2',
  'CALL'
]);

const rooms: Record<string, Room> = {};
const sessions: Record<string, Session> = {}; // token -> Session

const PORT = Number(process.env.PORT) || 8080;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// Serve the built client (client/dist) so `npm start` gives a playable game.
const server = createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let filePath = path.normalize(path.join(CLIENT_DIST, urlPath));

    // Path traversal guard
    if (!filePath.startsWith(CLIENT_DIST)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(CLIENT_DIST, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Client build not found. Run: npm run build:client');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[http] Error serving request:', err);
    res.writeHead(500).end('Internal server error');
  }
});
const wss = new WebSocketServer({ noServer: true });

// Helper to mask state for a specific client session
function maskGameState(state: GameState | null, viewerSession: Session): any {
  if (!state) return null;

  const maskedPlayers: Record<string, any> = {};

  for (const [id, p] of Object.entries(state.players)) {
    const maskedCards = p.cards.map(c => {
      // Spectators see no face-down cards
      if (viewerSession.isSpectator || viewerSession.playerId === 'spectator') {
        return {
          ...c,
          value: c.face_up ? c.value : null,
          suit: c.face_up ? c.suit : null,
          known_by: [] // Hide who knows what
        };
      }

      // Active player views cards:
      // Can see card value/suit if it is face-up OR known by the viewer
      const canSee = c.face_up || c.known_by.includes(viewerSession.playerId);
      return {
        ...c,
        value: canSee ? c.value : null,
        suit: canSee ? c.suit : null,
        known_by: c.known_by.includes(viewerSession.playerId) ? [viewerSession.playerId] : []
      };
    });

    maskedPlayers[id] = {
      ...p,
      cards: maskedCards,
      score: p.connection_status === 'eliminated' ? 0 : calculatePlayerScore(p)
    };
  }

  // Hide the draw pile details except length
  const drawPileLength = state.draw_pile.length;

  return {
    ...state,
    players: maskedPlayers,
    draw_pile: { length: drawPileLength } as any,
    drawn_card: state.drawn_card
      ? viewerSession.playerId === state.player_order[state.current_player_index]
        ? state.drawn_card
        : { id: state.drawn_card.id, value: null, suit: null, position: state.drawn_card.position, face_up: false, known_by: [] }
      : null
  };
}

// Broadcast game state to all clients in a room
function broadcastRoomState(room: Room) {
  const allClients = [...room.players, ...room.spectators];

  for (const client of allClients) {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      const masked = maskGameState(room.gameState, client);
      client.ws.send(
        JSON.stringify({
          type: 'GAME_STATE_UPDATE',
          gameState: masked,
          status: room.gameState?.status || 'setup',
          // Lobby info so everyone sees joins/leaves before the game starts
          players: room.players.map(p => ({ id: p.playerId, name: p.name })),
          hostId: room.players[0]?.playerId ?? null
        })
      );
    }
  }
}

// Start timers for active player
function startTurnTimer(room: Room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  if (room.powerTimer) clearTimeout(room.powerTimer);

  room.turnTimer = setTimeout(() => {
    try {
      if (!room.gameState) return;
      console.log(`[Timer] Turn timer expired for player in room ${room.id}`);

      // Auto-forfeit action: trigger FORCE_TIMER_EXPIRY
      const result = transition(room.gameState, { type: 'FORCE_TIMER_EXPIRY', timestamp: Date.now() }, Date.now());
      room.gameState = result.state;
      broadcastRoomState(room);

      if (room.gameState.status !== 'ended') {
        startTurnTimer(room);
      }
    } catch (err) {
      console.error(`[Timer] Unhandled error in turn timer for room ${room.id}:`, err);
    }
  }, 30000); // 30 seconds
}

function startPowerTimer(room: Room) {
  if (room.turnTimer) clearTimeout(room.turnTimer);
  if (room.powerTimer) clearTimeout(room.powerTimer);

  room.powerTimer = setTimeout(() => {
    try {
      if (!room.gameState) return;
      console.log(`[Timer] Power timer expired for player in room ${room.id}`);

      // Auto-forfeit power: trigger FORCE_TIMER_EXPIRY
      const result = transition(room.gameState, { type: 'FORCE_TIMER_EXPIRY', timestamp: Date.now() }, Date.now());
      room.gameState = result.state;
      broadcastRoomState(room);

      if (room.gameState.status !== 'ended') {
        startTurnTimer(room);
      }
    } catch (err) {
      console.error(`[Timer] Unhandled error in power timer for room ${room.id}:`, err);
    }
  }, 30000); // 30 seconds
}

// Handle client messages
function handleMessage(ws: WebSocket, data: string, clientSession: { session: Session | null }) {
  // ── Top-level guard: an exception from ANY message must never crash the server.
  // It is caught here, logged, and only the originating client receives an error.
  try {
    _handleMessage(ws, data, clientSession);
  } catch (err) {
    console.error('[handleMessage] Unhandled exception — isolating to client:', err);
    try {
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Internal server error — your action could not be processed' }));
    } catch (_) { /* socket may already be closed */ }
  }
}

function _handleMessage(ws: WebSocket, data: string, clientSession: { session: Session | null }) {
  let message;
  try {
    message = JSON.parse(data);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid JSON format' }));
    return;
  }

  const timestamp = Date.now();

  switch (message.type) {
    case 'CREATE_ROOM': {
      const roomId = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 character room code
      const playerId = crypto.randomUUID();
      const token = crypto.randomUUID();

      const session: Session = {
        playerId,
        name: message.playerName || 'Player 1',
        token,
        roomId,
        isSpectator: false,
        ws
      };

      sessions[token] = session;
      clientSession.session = session;

      rooms[roomId] = {
        id: roomId,
        gameState: null,
        players: [session],
        spectators: [],
        turnTimer: null,
        powerTimer: null,
        reconnectTimers: {}
      };

      ws.send(
        JSON.stringify({
          type: 'ROOM_CREATED',
          roomId,
          token,
          playerId,
          players: [{ id: playerId, name: session.name }]
        })
      );
      break;
    }

    case 'JOIN_ROOM': {
      const { roomId, playerName, isSpectator } = message;
      const room = rooms[roomId];
      if (!room) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Room not found' }));
        return;
      }

      const playerId = crypto.randomUUID();
      const token = crypto.randomUUID();
      const joinAsSpectator = !!isSpectator || room.players.length >= 4 || room.gameState !== null;

      const session: Session = {
        playerId,
        name: playerName || `Player ${room.players.length + 1}`,
        token,
        roomId,
        isSpectator: joinAsSpectator,
        ws
      };

      sessions[token] = session;
      clientSession.session = session;

      if (joinAsSpectator) {
        room.spectators.push(session);
      } else {
        room.players.push(session);
      }

      ws.send(
        JSON.stringify({
          type: 'ROOM_JOINED',
          roomId,
          token,
          playerId,
          isSpectator: joinAsSpectator,
          players: room.players.map(p => ({ id: p.playerId, name: p.name }))
        })
      );

      // Broadcast updated lobby
      broadcastRoomState(room);
      break;
    }

    case 'START_GAME': {
      const session = clientSession.session;
      if (!session) return;
      const room = rooms[session.roomId];
      if (!room || room.players[0].playerId !== session.playerId) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Only room creator can start the game' }));
        return;
      }

      if (room.gameState && room.gameState.status !== 'ended') {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Game already in progress' }));
        return;
      }

      if (room.players.length < 2) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Need at least 2 players to start' }));
        return;
      }

      const playerIds = room.players.map(p => p.playerId);
      // Winner of the previous game goes first
      const previousWinner = room.gameState?.winner_ids[0];
      room.gameState = createInitialState(playerIds, previousWinner);
      room.gameState.turn_timer_start = timestamp;
      for (const p of room.players) {
        room.gameState.players[p.playerId].name = p.name;
      }

      ws.send(JSON.stringify({ type: 'GAME_STARTED', roomId: room.id }));
      broadcastRoomState(room);
      startTurnTimer(room);
      break;
    }

    case 'GAME_ACTION': {
      const session = clientSession.session;
      if (!session || session.isSpectator) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Spectators cannot execute game actions' }));
        return;
      }

      const room = rooms[session.roomId];
      if (!room || !room.gameState) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Game not in progress' }));
        return;
      }

      const raw = message.action;
      if (!raw || typeof raw !== 'object' || !CLIENT_ACTION_TYPES.has(raw.type)) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid game action' }));
        return;
      }
      // Server-side validation: the acting player is always the session's player
      const action = { ...raw, player_id: session.playerId, timestamp } as Action;

      const prevState = room.gameState;
      const result = transition(prevState, action, timestamp);
      // Persist even on failure: a mistake penalty may have been applied
      room.gameState = result.state;

      if (!result.success) {
        ws.send(JSON.stringify({ type: 'ACTION_FAILED', error: result.error }));
      }

      // Timers only restart when the turn or phase actually moves on, so
      // out-of-turn jump-ins don't reset the active player's clock.
      const turnMoved =
        room.gameState.current_player_index !== prevState.current_player_index ||
        room.gameState.turn_phase !== prevState.turn_phase;
      if (room.gameState.status === 'ended') {
        if (room.turnTimer) clearTimeout(room.turnTimer);
        if (room.powerTimer) clearTimeout(room.powerTimer);
      } else if (turnMoved) {
        room.gameState = { ...room.gameState, turn_timer_start: timestamp };
        if (room.gameState.turn_phase === 'resolving_power') {
          startPowerTimer(room);
        } else {
          startTurnTimer(room);
        }
      }

      broadcastRoomState(room);
      break;
    }

    case 'RECONNECT': {
      const { roomId, playerId, token } = message;
      const room = rooms[roomId];
      const session = sessions[token];

      if (!room || !session || session.playerId !== playerId) {
        ws.send(JSON.stringify({ type: 'RECONNECT_FAILED', error: 'Session expired — please join again' }));
        return;
      }

      // A lobby player who dropped (e.g. page refresh) gets their seat back
      if (!room.gameState && !session.isSpectator && !room.players.includes(session)) {
        if (room.players.length >= 4) {
          ws.send(JSON.stringify({ type: 'RECONNECT_FAILED', error: 'Lobby is full' }));
          return;
        }
        room.players.push(session);
      }

      // Clear reconnect timer
      if (room.reconnectTimers[playerId]) {
        clearTimeout(room.reconnectTimers[playerId]);
        delete room.reconnectTimers[playerId];
      }

      // Re-assign socket
      session.ws = ws;
      clientSession.session = session;

      if (room.gameState) {
        // Trigger engine RECONNECT action
        const result = transition(room.gameState, { type: 'RECONNECT', player_id: playerId, timestamp }, timestamp);
        room.gameState = result.state;
      }

      ws.send(
        JSON.stringify({
          type: 'RECONNECTED',
          roomId,
          playerId,
          isSpectator: session.isSpectator
        })
      );

      broadcastRoomState(room);
      break;
    }

    default:
      ws.send(JSON.stringify({ type: 'ERROR', error: 'Unknown message type' }));
  }
}

// Handle client disconnections
function handleDisconnect(clientSession: { session: Session | null }) {
  const session = clientSession.session;
  if (!session) return;

  const room = rooms[session.roomId];
  if (!room) return;

  session.ws = null;

  if (session.isSpectator) {
    room.spectators = room.spectators.filter(s => s.playerId !== session.playerId);
    return;
  }

  if (room.gameState) {
    // Fire DISCONNECT action to engine
    const result = transition(room.gameState, { type: 'DISCONNECT', player_id: session.playerId, timestamp: Date.now() }, Date.now());
    room.gameState = result.state;
    broadcastRoomState(room);

    // Start 5-minute reconnect timer
    console.log(`[Reconnect] Player ${session.playerId} disconnected. 5-min window started.`);
    room.reconnectTimers[session.playerId] = setTimeout(() => {
      try {
        console.log(`[Reconnect] Window expired for ${session.playerId}. Eliminating.`);

        // IMPORTANT: always read room.gameState at execution time, not from the closure.
        // The game state may have changed significantly since this timer was created.
        const gameState = room.gameState;
        if (!gameState) return;

        const player = gameState.players[session.playerId];
        // Guard: skip if already eliminated (e.g., lost via 9th-card rule while disconnected)
        if (!player || player.connection_status === 'eliminated') {
          delete room.reconnectTimers[session.playerId];
          return;
        }

        // Build updated player (immutable) — do NOT mutate the object in-place.
        const eliminatedPlayer: Player = {
          ...player,
          connection_status: 'eliminated',
          is_spectator: true,
          cards: [],
          score: 0
        };

        let nextGameState: GameState = {
          ...gameState,
          players: { ...gameState.players, [session.playerId]: eliminatedPlayer },
          // Move their cards face-up to the bottom of the discard pile (top card stays in play)
          discard_pile: [
            ...player.cards.map(c => ({ ...c, face_up: true })),
            ...gameState.discard_pile
          ]
        };

        // Pass turn if they were the active player (engine skips the penalty for eliminated players)
        if (nextGameState.player_order[nextGameState.current_player_index] === session.playerId) {
          const expiry = transition(
            { ...nextGameState, active_power: null },
            { type: 'FORCE_TIMER_EXPIRY', timestamp: Date.now() },
            Date.now()
          );
          nextGameState = expiry.state;
          startTurnTimer(room);
        }

        // Check if the game should end (only one active player remaining)
        const activePlayers = nextGameState.player_order.filter(id => {
          const p = nextGameState.players[id];
          return p && p.connection_status !== 'eliminated' && !p.is_spectator;
        });

        if (activePlayers.length <= 1) {
          nextGameState = { ...nextGameState, status: 'ended' };
          let minScore = Infinity;
          let winners: string[] = [];
          for (const id of nextGameState.player_order) {
            const p = nextGameState.players[id];
            if (p && p.connection_status !== 'eliminated' && !p.is_spectator) {
              const s = calculatePlayerScore(p);
              if (s < minScore) { minScore = s; winners = [id]; }
              else if (s === minScore) { winners.push(id); }
            }
          }
          nextGameState = { ...nextGameState, winner_ids: winners };
        }

        room.gameState = nextGameState;
        delete room.reconnectTimers[session.playerId];
        broadcastRoomState(room);
      } catch (err) {
        console.error(`[Reconnect] Error eliminating player ${session.playerId}:`, err);
        delete room.reconnectTimers[session.playerId];
      }
    }, 300000); // 5 minutes
  } else {
    // If game has not started yet, simply remove player from lobby
    room.players = room.players.filter(p => p.playerId !== session.playerId);
    broadcastRoomState(room);
  }
}

// Websocket setup
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => {
    wss.emit('connection', ws, request);
  });
});

wss.on('connection', ws => {
  const clientSession: { session: Session | null } = { session: null };

  ws.on('message', data => {
    handleMessage(ws, data.toString(), clientSession);
  });

  ws.on('close', () => {
    handleDisconnect(clientSession);
  });

  ws.on('error', err => {
    console.error(`Socket error:`, err);
    handleDisconnect(clientSession);
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — is another game server running? Stop it, or start with a different port: $env:PORT=8081; npm start`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Multiplayer card game server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
  if (!fs.existsSync(CLIENT_DIST)) {
    console.warn(`[warn] Client build not found at ${CLIENT_DIST} — run "npm run build:client" first.`);
  }
});
