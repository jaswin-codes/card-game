import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { WebSocket } from 'ws';

// Runs the compiled server (npm test compiles first via "pretest") as a real
// process on a random port and drives it with real socket clients.
const PORT = 20000 + Math.floor(Math.random() * 20000);
const URL = `ws://127.0.0.1:${PORT}`;
let server: ChildProcess;
let serverLog = '';

beforeAll(async () => {
  server = spawn(process.execPath, ['dist/src/server.js'], {
    env: { ...process.env, PORT: String(PORT), TURN_TIMER_MS: '60000', RECONNECT_MS: '60000' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout!.on('data', d => (serverLog += d));
  server.stderr!.on('data', d => (serverLog += d));
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server did not start:\n${serverLog}`)), 10000);
    server.stdout!.on('data', d => {
      if (String(d).includes('running')) {
        clearTimeout(t);
        resolve();
      }
    });
  });
});

afterAll(() => {
  server?.kill();
});

class Client {
  ws!: WebSocket;
  messages: any[] = [];
  private waiters: { match: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  playerId = '';
  token = '';
  roomId = '';
  state: any = null;
  states: any[] = []; // every game state received, for leak checks

  static async connect(): Promise<Client> {
    const c = new Client();
    c.ws = new WebSocket(URL);
    c.ws.on('message', raw => {
      const m = JSON.parse(String(raw));
      if (m.type === 'GAME_STATE_UPDATE' && m.gameState) {
        c.state = m.gameState;
        c.states.push(m.gameState);
      }
      c.messages.push(m);
      c.waiters = c.waiters.filter(w => (w.match(m) ? (w.resolve(m), false) : true));
    });
    await new Promise(r => c.ws.once('open', r));
    return c;
  }

  send(msg: unknown) {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  // Resolves with the first message (already received or future) matching type and predicate
  next(type: string, pred: (m: any) => boolean = () => true, timeoutMs = 4000): Promise<any> {
    // Lobby updates carry gameState: null; game-state waits only look at real states
    const match = (m: any) => m.type === type && (type !== 'GAME_STATE_UPDATE' || !!m.gameState) && pred(m);
    const seen = this.messages.find(match);
    if (seen) {
      this.messages.splice(this.messages.indexOf(seen), 1);
      return Promise.resolve(seen);
    }
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs);
      this.waiters.push({
        match,
        resolve: m => {
          clearTimeout(t);
          this.messages.splice(this.messages.indexOf(m), 1);
          resolve(m);
        }
      });
    });
  }

  // Waits until the latest game state satisfies pred (doesn't consume messages)
  async until(pred: (gs: any) => boolean, timeoutMs = 4000) {
    const end = Date.now() + timeoutMs;
    while (!(this.state && pred(this.state))) {
      if (Date.now() > end) throw new Error('timed out waiting for game state');
      await new Promise(r => setTimeout(r, 10));
    }
  }

  clear() {
    this.messages = [];
  }

  action(action: Record<string, unknown>) {
    this.send({ type: 'GAME_ACTION', action });
  }

  close() {
    this.ws.close();
  }
}

async function makeGame(n: number) {
  const host = await Client.connect();
  host.send({ type: 'CREATE_ROOM', playerName: 'Host' });
  const created = await host.next('ROOM_CREATED');
  Object.assign(host, { playerId: created.playerId, token: created.token, roomId: created.roomId });
  const clients = [host];
  for (let i = 1; i < n; i++) {
    const c = await Client.connect();
    c.send({ type: 'JOIN_ROOM', roomId: created.roomId, playerName: `P${i + 1}` });
    const joined = await c.next('ROOM_JOINED');
    Object.assign(c, { playerId: joined.playerId, token: joined.token, roomId: created.roomId });
    clients.push(c);
  }
  host.send({ type: 'START_GAME' });
  await Promise.all(clients.map(c => c.next('GAME_STATE_UPDATE', m => m.gameState?.status === 'playing')));
  return clients;
}

const byId = (clients: Client[], id: string) => clients.find(c => c.playerId === id)!;
const activeOf = (clients: Client[]) => byId(clients, clients[0].state.player_order[clients[0].state.current_player_index]);

// Every state a client receives must hide what that client may not see
function assertNoLeaks(c: Client) {
  expect(c.states.length).toBeGreaterThan(5);
  for (const gs of c.states) {
    if (gs.status === 'ended') continue;
    for (const p of Object.values<any>(gs.players)) {
      expect(p.score).toBeNull();
      for (const card of p.cards) {
        if (!card.face_up && !card.known_by.includes(c.playerId)) {
          expect(card.value).toBeNull();
          expect(card.id.startsWith('hidden:')).toBe(true);
        }
      }
    }
  }
}

// Plays one plain turn for whoever is active: draw, discard, skip any power.
// Waits on game state (keyed by turn index), never on queued messages, so
// late broadcasts from the previous turn can't be mistaken for this one.
async function playTurn(clients: Client[]) {
  const me = activeOf(clients);
  const turn = clients[0].state.current_player_index;
  me.action({ type: 'DRAW_PILE_DRAW' });
  await me.until(gs => gs.current_player_index === turn && gs.turn_phase === 'draw_decide');
  me.action({ type: 'DRAW_PILE_DISCARD' });
  await me.until(gs => gs.turn_phase !== 'draw_decide' || gs.status === 'ended');
  if (me.state.status !== 'ended' && me.state.turn_phase === 'resolving_power') me.action({ type: 'SKIP_POWER' });
  await clients[0].until(gs => gs.current_player_index !== turn || gs.status === 'ended');
  for (const c of clients) await c.until(gs => gs.current_player_index !== turn || gs.status === 'ended');
}

describe('Socket server', () => {
  it('plays a full 3-player game to the end without leaking hidden cards', async () => {
    const clients = await makeGame(3);
    for (let i = 0; i < 6; i++) await playTurn(clients);
    activeOf(clients).action({ type: 'CALL' });
    await clients[0].next('GAME_STATE_UPDATE', m => m.gameState.status === 'final_round');
    while (clients[0].state.status !== 'ended') await playTurn(clients);

    for (const c of clients) {
      await c.next('GAME_STATE_UPDATE', m => m.gameState.status === 'ended');
      expect(c.state.winner_ids.length).toBeGreaterThan(0);
      expect(Object.values<any>(c.state.players).every(p => typeof p.score === 'number')).toBe(true);
      assertNoLeaks(c);
    }
    clients.forEach(c => c.close());
  });

  it('a player can reconnect mid-game and keep their seat', async () => {
    const [a, b] = await makeGame(2);
    b.close();
    await a.next('GAME_STATE_UPDATE', m => m.gameState.players[b.playerId].connection_status === 'disconnected');

    const back = await Client.connect();
    back.send({ type: 'RECONNECT', roomId: b.roomId, playerId: b.playerId, token: b.token });
    await back.next('RECONNECTED');
    const st = await back.next('GAME_STATE_UPDATE', m => m.gameState.players[b.playerId].connection_status === 'connected');
    expect(st.gameState.players[b.playerId].cards.length).toBe(4);
    a.close();
    back.close();
  });

  it('an old socket closing after a reconnect does not mark the player disconnected', async () => {
    const [a, b] = await makeGame(2);
    const second = await Client.connect();
    second.send({ type: 'RECONNECT', roomId: b.roomId, playerId: b.playerId, token: b.token });
    await second.next('RECONNECTED');
    a.clear();
    b.close(); // the stale socket
    await new Promise(r => setTimeout(r, 300));
    expect(a.state.players[b.playerId].connection_status).toBe('connected');
    a.close();
    second.close();
  });

  it('a disconnect during an open jump-in window does not break the game', async () => {
    const clients = await makeGame(3);
    const [, b, c] = clients;
    expect(clients[0].state.jump_in_window_open).toBe(true);
    b.close();
    // c jumps in with a wrong card: rejected and penalised, server keeps running
    c.action({ type: 'JUMP_IN_TYPE_1', card_position: 'top-left', expected_discard_id: c.state.last_discard_card.id });
    await c.next('GAME_STATE_UPDATE', m => m.gameState.players[c.playerId].cards.length !== 4 || m.gameState.last_discard_card.id !== c.state.last_discard_card?.id);
    const back = await Client.connect();
    back.playerId = b.playerId;
    back.send({ type: 'RECONNECT', roomId: b.roomId, playerId: b.playerId, token: b.token });
    await back.next('RECONNECTED');
    await back.next('GAME_STATE_UPDATE', m => m.gameState.status === 'playing');

    // The game carries on normally afterwards
    const table = [clients[0], back, c];
    await playTurn(table);
    await playTurn(table);
    table.forEach(x => x.close());
  });

  it('rejects malformed and out-of-turn input without crashing', async () => {
    const [a, b] = await makeGame(2);
    const notActive = a.playerId === activeOf([a, b]).playerId ? b : a;

    for (const bad of ['not json', '42', 'null', '[]', '{"type":5}', '{"type":"NOPE"}']) {
      a.send(bad);
      await a.next('ERROR');
    }
    a.send({ type: 'GAME_ACTION', action: { type: 'START_GAME', player_ids: [] } });
    expect((await a.next('ERROR')).error).toMatch(/Invalid game action/);
    a.send({ type: 'GAME_ACTION', action: 'DRAW_PILE_DRAW' });
    await a.next('ERROR');

    const probe = await Client.connect();
    probe.send({ type: 'JOIN_ROOM', roomId: '__proto__', playerName: 'x' });
    expect((await probe.next('ERROR')).error).toBe('Room not found');

    notActive.action({ type: 'DRAW_PILE_DRAW' });
    await notActive.next('ACTION_FAILED');

    // Oversized messages are refused by closing the socket
    const big = await Client.connect();
    const closed = new Promise(r => big.ws.once('close', r));
    big.send({ type: 'CHAT', text: 'x'.repeat(20000) });
    await closed;

    // Server is still alive and serving
    const after = await Client.connect();
    after.send({ type: 'CREATE_ROOM', playerName: 'Still alive' });
    await after.next('ROOM_CREATED');
    [a, b, probe, after].forEach(c => c.close());
  });

  it('chat is relayed, length-limited and rate-limited; names are trimmed', async () => {
    const host = await Client.connect();
    host.send({ type: 'CREATE_ROOM', playerName: '   ' + 'N'.repeat(50) });
    const created = await host.next('ROOM_CREATED');
    expect(created.players[0].name).toBe('N'.repeat(20));

    host.send({ type: 'CHAT', text: '<b>hi</b>' });
    expect((await host.next('CHAT')).text).toBe('<b>hi</b>'); // relayed verbatim; the client escapes it
    host.send({ type: 'CHAT', text: 'y'.repeat(201) });
    await host.next('ERROR', m => /characters/.test(m.error));
    host.send({ type: 'REACTION', emoji: '<script>' });
    await host.next('ERROR', m => /reaction/.test(m.error));

    for (let i = 0; i < 4; i++) host.send({ type: 'REACTION', emoji: '👍' });
    host.send({ type: 'CHAT', text: 'one too many' });
    await host.next('ERROR', m => /Slow down/.test(m.error));
    host.close();
  });

  it('call mistake reports the accused player\'s last move to the room', async () => {
    const clients = await makeGame(2);
    await playTurn(clients);
    const mover = byId(clients, clients[0].state.player_order[(clients[0].state.current_player_index + 1) % 2]);
    const caller = clients.find(c => c !== mover)!;
    caller.send({ type: 'REPORT_MISTAKE', accused_id: mover.playerId });
    const msg = await mover.next('CHAT', m => m.kind === 'system');
    expect(msg.text).toMatch(/was legal/);
    clients.forEach(c => c.close());
  });

  it('an empty lobby is removed', async () => {
    const host = await Client.connect();
    host.send({ type: 'CREATE_ROOM', playerName: 'Lonely' });
    const { roomId } = await host.next('ROOM_CREATED');
    host.close();
    await new Promise(r => setTimeout(r, 300));
    const probe = await Client.connect();
    probe.send({ type: 'JOIN_ROOM', roomId, playerName: 'Late' });
    expect((await probe.next('ERROR')).error).toBe('Room not found');
    probe.close();
  });
});
