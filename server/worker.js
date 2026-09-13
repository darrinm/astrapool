import { DurableObject } from 'cloudflare:workers';
import { PROTOCOL_VERSION, initialSnapshot, validateAim, validateShot, placeCue, finishShot } from './protocol.js';
import { handleAnalytics, writeGame } from './analytics.js';
import { newGameAnalytics, updateGameAnalytics } from '../src/game-analytics.js';
import { RoomAnalytics, roomAlarmTime } from './room-analytics.js';
const DAY = 24 * 60 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class PoolRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
    this.room = ctx.storage.sql.exec('SELECT data FROM room WHERE id = 1').toArray().map(row => JSON.parse(row.data))[0] ?? null;
    this.analytics = new RoomAnalytics(ctx.storage.sql, game => writeGame(this.env, game, 'room'));
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  #save(room) {
    this.ctx.storage.sql.exec('INSERT INTO room (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', JSON.stringify(room));
    this.room = room;
  }
  #scheduleAlarm() {
    return this.ctx.storage.setAlarm(roomAlarmTime(this.room, this.analytics.nextAttempt));
  }
  async #flushAnalytics() {
    await this.analytics.flush();
    if (this.room) await this.#scheduleAlarm();
  }
  async create() {
    if (this.room) return false;
    this.#save({ snapshot: initialSnapshot(), seats: [null, null], seq: 0, pending: null, votes: [], updated: Date.now() });
    await this.ctx.storage.setAlarm(Date.now() + DAY);
    return true;
  }
  #connected(exclude) {
    return [0, 1].map(seat => this.ctx.getWebSockets().some(ws => ws !== exclude && ws.readyState === 1 && ws.deserializeAttachment()?.seat === seat));
  }
  #state(ws) { ws.send(JSON.stringify({ type: 'state', ...this.#public(), seat: ws.deserializeAttachment().seat })); }
  #public() {
    const { snapshot, seq, pending, votes } = this.room;
    return { snapshot, seq, pending, votes, connected: this.#connected() };
  }
  #broadcast(message, exclude) {
    for (const ws of this.ctx.getWebSockets()) if (ws !== exclude && ws.readyState === 1 && Number.isInteger(ws.deserializeAttachment()?.seat)) ws.send(JSON.stringify(message));
  }
  #broadcastState() { for (const ws of this.ctx.getWebSockets()) if (ws.readyState === 1 && Number.isInteger(ws.deserializeAttachment()?.seat)) this.#state(ws); }
  async fetch() {
    const rejection = !this.room || Date.now() - this.room.updated > DAY ? 'This room has expired. Create a new room.' :
      this.ctx.getWebSockets().length >= 6 ? 'Room is full.' : null;
    const [client, server] = Object.values(new WebSocketPair());
    if (rejection) {
      // Complete the upgrade so browsers can read the reason and stop reconnecting.
      server.accept(); server.send(JSON.stringify({ type: 'error', message: rejection })); server.close(4002, rejection);
      return new Response(null, { status: 101, webSocket: client });
    }
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: null, count: 0, since: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    if (!this.room || Date.now() - this.room.updated >= DAY) { ws.close(4002, 'Room expired'); return; }
    if (typeof raw !== 'string' || raw.length > 12000) { ws.close(1009, 'Message too large'); return; }
    const connection = ws.deserializeAttachment();
    if (connection.seat !== null && connection.version !== PROTOCOL_VERSION) {
      ws.close(4002, 'Refresh Pool to continue this room.'); return;
    }
    let message;
    try { message = JSON.parse(raw); } catch { ws.close(1008, 'Invalid message'); return; }
    if (Date.now() - connection.since > 10000) { connection.count = 0; connection.aimCount = 0; connection.since = Date.now(); }
    // Cue previews have their own budget so lining up a shot cannot exhaust game actions.
    const preview = message?.type === 'aim' && Number.isInteger(connection.seat);
    const counter = preview ? 'aimCount' : 'count';
    connection[counter] = (connection[counter] || 0) + 1; ws.serializeAttachment(connection);
    if (connection[counter] > (preview ? 600 : 40)) { ws.close(1008, 'Too many requests'); return; }
    if (preview) {
      const { snapshot, seq, pending } = this.room;
      if (message.seq !== seq || connection.seat !== snapshot.match.turn || pending ||
          snapshot.match.ballInHand || snapshot.match.winner !== null || !this.#connected().every(Boolean)) return;
      // Transient previews never advance or persist the authoritative table. Ignore stale/malformed ones.
      let aim;
      try { aim = validateAim(message.aim); } catch { return; }
      this.#broadcast({ type: 'aim', seq, seat: connection.seat, aim }, ws);
      return;
    }
    try {
      if (connection.seat === null) {
        if (message?.type !== 'hello' || message.version !== PROTOCOL_VERSION || !uuid.test(message.token)) throw new Error('Refresh Pool to join this room.');
        // Hash reconnect credentials; raw tokens never enter URLs, logs, or persistent storage.
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message.token)))].map(b => b.toString(16).padStart(2, '0')).join('');
        const seats = [...this.room.seats];
        let seat = seats.indexOf(hash);
        if (seat === -1) { seat = seats.indexOf(null); if (seat === -1) throw new Error('This room already has two players.'); seats[seat] = hash; }
        for (const old of this.ctx.getWebSockets()) if (old !== ws && old.deserializeAttachment()?.seat === seat) old.close(4001, 'Opened in another tab');
        this.#save({ ...this.room, seats });
        connection.seat = seat; connection.version = PROTOCOL_VERSION; ws.serializeAttachment(connection);
        this.#state(ws); this.#broadcast({ type: 'presence', connected: this.#connected() });
        if (this.analytics.pending) await this.#flushAnalytics();
        return;
      }
      const seat = connection.seat;
      if (!message || !['shoot', 'result', 'place', 'rematch'].includes(message.type)) throw new Error('Unknown action.');
      if (message.seq !== this.room.seq) throw new Error('The table changed. Try again.');
      let room = { ...this.room, updated: Date.now() };
      let analyticsChanged = false;
      if (message.type === 'rematch') {
        if (room.snapshot.match.winner === null || room.pending) throw new Error('Finish this rack before requesting a rematch.');
        room.votes = [...new Set([...room.votes, seat])];
        if (room.votes.length === 2) {
          room.snapshot = initialSnapshot(1 - room.snapshot.match.breaker, room.snapshot.match.wins, (room.snapshot.arcade?.rack || 0) + 1);
          room.votes = []; room.analytics = null;
        }
      } else {
        if (seat !== room.snapshot.match.turn) throw new Error('It is your friend’s turn.');
        if (message.type === 'result') {
          if (!room.pending || room.pending.seat !== seat) throw new Error('No shot is in progress.');
          room.snapshot = finishShot(room.snapshot, room.pending, message.report, message.balls); room.pending = null;
          if (room.analytics && room.snapshot.match.winner !== null) {
            room.analytics = structuredClone(room.analytics);
            updateGameAnalytics(room.analytics, room.analytics.settings);
            room.analytics.finishedAt = Date.now(); room.analytics.outcome = `player${room.snapshot.match.winner + 1}`;
            room.analytics.score = Math.round(room.snapshot.arcade?.totals.reduce((sum, n) => sum + n, 0) || 0);
            analyticsChanged = true;
          }
        } else {
          if (room.pending) throw new Error('Wait for the balls to settle.');
          if (!this.#connected().every(Boolean)) throw new Error('Wait for your friend to reconnect.');
          if (message.type === 'place') room.snapshot = placeCue(room.snapshot, message.position);
          else {
            room.pending = { seat, action: validateShot(room.snapshot, message.action), started: Date.now() };
            room.analytics = room.analytics ? structuredClone(room.analytics) : newGameAnalytics('online', message.settings);
            // Peers can use different presentation settings; alternating seats is not a settings change.
            updateGameAnalytics(room.analytics, message.settings, Date.now(), { countSettingsChanges: false });
            room.analytics.shots++;
            analyticsChanged = true;
          }
        }
      }
      room.seq++; this.#save(room);
      if (analyticsChanged && this.env.GAME_ANALYTICS) this.analytics.enqueue(room.analytics);
      await this.#scheduleAlarm();
      if (message.type === 'shoot') this.#broadcast({ type: 'shot', ...this.#public() });
      else this.#broadcastState();
      // Broadcast first so database latency does not delay the shot animation. Failed writes stay durable.
      if (this.analytics.pending) await this.#flushAnalytics();
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
      if (connection.seat === null) ws.close(4002, error.message);
      else this.#state(ws);
    }
  }
  webSocketClose(ws) {
    const seat = ws.deserializeAttachment()?.seat;
    if (!this.room || !Number.isInteger(seat)) return;
    if (this.room.pending?.seat === seat && !this.#connected(ws)[seat]) {
      this.#save({ ...this.room, pending: null, seq: this.room.seq + 1 });
      this.#broadcastState();
    }
    this.#broadcast({ type: 'presence', connected: this.#connected(ws) }, ws);
  }
  webSocketError(ws) { ws.close(1011, 'Connection lost'); this.webSocketClose(ws); }
  async alarm() {
    if (!this.room) return;
    if (this.room.pending && Date.now() >= this.room.pending.started + 90000) {
      this.#save({ ...this.room, pending: null, seq: this.room.seq + 1 });
      this.#broadcast({ type: 'error', message: 'Shot interrupted. The previous table has been restored.' });
      this.#broadcastState();
    } else if (!this.room.pending && Date.now() - this.room.updated >= DAY) {
      if (this.room.analytics) {
        const game = structuredClone(this.room.analytics);
        if (!game.finishedAt && !game.endedAt) {
          updateGameAnalytics(game, game.settings, this.room.updated);
          game.endedAt = this.room.updated; game.endReason = 'room_expired'; this.#save({ ...this.room, analytics: game });
          if (this.env.GAME_ANALYTICS) this.analytics.enqueue(game);
        }
      }
      await this.analytics.flush();
      if (this.analytics.pending || Date.now() - this.room.updated < DAY) { await this.#scheduleAlarm(); return; }
      for (const ws of this.ctx.getWebSockets()) ws.close(4002, 'Room expired');
      await this.ctx.storage.deleteAll(); this.room = null;
      return;
    }
    await this.#flushAnalytics();
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/analytics/')) return handleAnalytics(request, env);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.headers.get('Origin') !== url.origin) return new Response('Origin not allowed', { status: 403 });
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const id = crypto.randomUUID(); await env.POOL_ROOMS.getByName(id).create();
      return Response.json({ id }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    }
    const route = /^\/api\/rooms\/([^/]+)\/socket$/.exec(url.pathname);
    if (route && uuid.test(route[1]) && request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') return env.POOL_ROOMS.getByName(route[1]).fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
