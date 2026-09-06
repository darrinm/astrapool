const VERSION = 1;
export class OnlineRoom {
  constructor(onMessage, onStatus) {
    this.onMessage = onMessage; this.onStatus = onStatus;
    this.id = null; this.socket = null; this.seq = 0; this.seat = null;
    this.connected = [false, false]; this.pending = false; this.waiting = false;
    this.generation = 0; this.retry = 0;
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
    this.token = sessionStorage.getItem(key) || crypto.randomUUID(); sessionStorage.setItem(key, this.token);
    this.connect();
  }
  connect() {
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
      if (data.type === 'error') { this.onStatus(data.message); return; }
      if (data.type === 'state' || data.type === 'shot') {
        this.seq = data.seq; this.pending = !!data.pending; this.waiting = false; this.retry = 0;
        if (data.seat !== undefined) this.seat = data.seat;
      }
      if (data.connected) this.connected = data.connected;
      this.onMessage(data);
      this.onStatus(this.connected.every(Boolean) ? `You are Player ${this.seat + 1} · Friend connected` : `You are Player ${this.seat + 1} · Waiting for your friend`);
    });
    socket.addEventListener('close', e => {
      if (generation !== this.generation) return;
      clearInterval(this.heartbeat); this.waiting = false; this.connected = [false, false];
      this.onMessage({ type: 'presence', connected: this.connected });
      if (e.code === 4001 || e.code === 4002) { this.onStatus(e.reason || 'This room is no longer available.'); return; }
      this.onStatus('Connection lost. Reconnecting…');
      this.retry++; this.reconnect = setTimeout(() => this.connect(), Math.min(10000, 1000 * this.retry));
    });
    socket.addEventListener('error', () => this.onStatus('Unable to reach the room. Reconnecting…'));
  }
  send(type, payload = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN || this.seat === null) return false;
    this.waiting = true; this.socket.send(JSON.stringify({ type, seq: this.seq, ...payload })); return true;
  }
  leave() {
    this.generation++; clearTimeout(this.reconnect); clearInterval(this.heartbeat);
    this.socket?.close(); this.socket = null; this.id = null; this.seat = null;
    this.connected = [false, false]; this.pending = false; this.waiting = false;
  }
}
