const VERSION = 2;
const AIM_SEND_INTERVAL = 25, AIM_BLEND_TIME = 40;
export function roomToken() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export class OnlineRoom {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage; this.onStatus = onStatus;
    this.id = null; this.socket = null; this.seq = 0; this.seat = null;
    this.connected = [false, false]; this.pending = false; this.waiting = false;
    this.generation = 0; this.retry = 0; this.synced = false; this.result = null; this.error = null; this.errorResync = false;
    this.aim = null; this.aimFrom = null; this.aimReceivedAt = 0; this.lastAim = null;
  }
  get canAct() { return this.socket?.readyState === WebSocket.OPEN && this.seat !== null && this.connected.every(Boolean) && !this.pending && !this.waiting; }
  async create() {
    this.leave(); const generation = this.generation;
    this.onStatus('Creating a private room…');
    try {
      const response = await fetch('/api/rooms', { method: 'POST' });
      if (!response.ok) throw new Error('Could not create a room. Try again.');
      const { id } = await response.json();
      if (generation === this.generation) this.join(id);
    } catch { if (generation === this.generation) this.onStatus('Online rooms are unavailable. Retry, or choose another game.'); }
  }
  join(id) {
    this.leave(); this.id = id; this.retry = 0;
    history.replaceState(null, '', `#room=${id}`);
    const key = `pool.room.${id}`;
    this.token = sessionStorage.getItem(key) || roomToken(); sessionStorage.setItem(key, this.token);
    this.connect();
  }
  connect() {
    this.synced = false;
    const generation = this.generation;
    this.onStatus(this.retry ? 'Connection lost. Reconnecting…' : 'Joining room…');
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/rooms/${this.id}/socket`);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (generation !== this.generation) { socket.close(); return; }
      socket.send(JSON.stringify({ type: 'hello', version: VERSION, token: this.token }));
      this.heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('ping'); }, 15000);
    });
    socket.addEventListener('message', e => {
      if (generation !== this.generation || e.data === 'pong') return;
      const data = JSON.parse(e.data);
      if (data.type === 'aim') {
        if (!this.synced || this.pending || !this.connected.every(Boolean) || data.seq !== this.seq || data.seat !== 1 - this.seat) return;
        // Start at the currently displayed pose, even if a new packet interrupts a blend.
        this.aimFrom = data.aim ? this.remoteAim || data.aim : null;
        this.aim = data.aim; this.aimReceivedAt = performance.now();
        return;
      }
      if (data.type === 'error') { this.error = data.message; this.errorResync = true; this.result = null; this.onStatus(data.message); return; }
      if (data.type === 'state' || data.type === 'shot') {
        this.aim = null; this.lastAim = null;
        this.synced = true;
        if (!this.errorResync && data.seq !== this.seq) this.error = null;
        this.errorResync = false;
        this.seq = data.seq; this.pending = !!data.pending; this.waiting = false; this.retry = 0;
        if (data.seat !== undefined) this.seat = data.seat;
      }
      if (data.connected) this.connected = data.connected;
      if (!this.connected.every(Boolean)) { this.aim = null; this.lastAim = null; }
      this.onMessage(data);
      if (data.type === 'state' || data.type === 'shot') this.flushResult();
      this.showStatus();
    });
    socket.addEventListener('close', e => {
      if (generation !== this.generation) return;
      clearInterval(this.heartbeat); this.synced = false; this.waiting = false; this.connected = [false, false];
      this.aim = null; this.lastAim = null;
      this.onMessage({ type: 'presence', connected: this.connected });
      if (e.code === 4001 || e.code === 4002) { this.onStatus(e.reason || 'This room is no longer available.'); return; }
      this.onStatus('Connection lost. Reconnecting…');
      this.retry++; this.reconnect = setTimeout(() => this.connect(), Math.min(10000, 1000 * this.retry));
    });
    socket.addEventListener('error', () => this.onStatus('Unable to reach the room. Reconnecting…'));
  }
  showStatus() {
    this.onStatus(this.error || (this.connected.every(Boolean) ? `You are Player ${this.seat + 1} · Friend connected` : `You are Player ${this.seat + 1} · Waiting for your friend`));
  }
  submitResult(payload) {
    this.result = { seq: this.seq, payload: structuredClone(payload), socket: null };
    this.flushResult();
  }
  flushResult() {
    const result = this.result;
    if (!result || !this.synced) return;
    if (result.seq !== this.seq || !this.pending) { this.result = null; return; }
    // Retry only on a new connection, after its state confirms the same pending shot.
    if (result.socket !== this.socket && this.send('result', result.payload)) result.socket = this.socket;
  }
  send(type, payload = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN || this.seat === null) return false;
    this.error = null; this.errorResync = false; this.showStatus();
    this.waiting = true; this.socket.send(JSON.stringify({ type, seq: this.seq, ...payload,
      ...(type === 'shoot' && this.analyticsSettings ? { settings: this.analyticsSettings() } : {}) })); return true;
  }
  sendAim(aim, now = performance.now()) {
    if (!this.synced || this.socket?.readyState !== WebSocket.OPEN || this.seat === null) return false;
    if (aim !== null && !this.canAct) return false;
    if (aim === null && !this.lastAim) return false;
    const encoded = JSON.stringify(aim);
    if (aim !== null && this.lastAim && (now - this.lastAim.at < AIM_SEND_INTERVAL ||
        (encoded === this.lastAim.encoded && now - this.lastAim.at < 1000))) return false;
    // Do not set waiting: previews are unacknowledged and must never block the shot.
    this.socket.send(JSON.stringify({ type: 'aim', seq: this.seq, aim }));
    this.lastAim = aim === null ? null : { encoded, at: now };
    return true;
  }
  get remoteAim() {
    const elapsed = performance.now() - this.aimReceivedAt;
    if (!this.aim || elapsed >= 2500) return null;
    const t = Math.min(elapsed / AIM_BLEND_TIME, 1), from = this.aimFrom, to = this.aim;
    if (t >= 1 || from === to) return to;
    if (t <= 0) return from;
    const mix = (a, b) => a + (b - a) * t;
    const start = Math.atan2(from.dir.y, from.dir.x), end = Math.atan2(to.dir.y, to.dir.x);
    // Follow the shortest arc across ±π and keep direction normalized, including opposite aims.
    const angle = start + Math.atan2(Math.sin(end - start), Math.cos(end - start)) * t;
    return { dir: { x: Math.cos(angle), y: Math.sin(angle) }, pull: mix(from.pull, to.pull),
      spin: { x: mix(from.spin.x, to.spin.x), y: mix(from.spin.y, to.spin.y) } };
  }
  leave() {
    this.generation++; clearTimeout(this.reconnect); clearInterval(this.heartbeat);
    this.socket?.close(); this.synced = false; this.socket = null; this.id = null; this.seat = null;
    this.connected = [false, false]; this.pending = false; this.waiting = false; this.result = null; this.error = null; this.errorResync = false;
    this.aim = null; this.aimFrom = null; this.lastAim = null;
  }
}
