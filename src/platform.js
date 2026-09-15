// Optional Apple bridge. Browser builds keep the standard fetch/WebSocket paths.
export const PUBLIC_ORIGIN = 'https://astrapool.darrinm.com';
export const nativeBridge = () => globalThis.webkit?.messageHandlers?.astra;
export const inviteURL = id => `${nativeBridge() ? PUBLIC_ORIGIN : location.origin}/#room=${id}`;
export async function gameRequest(path, options = {}) {
  const bridge = nativeBridge();
  if (!bridge) return fetch(path, options);
  const result = await bridge.postMessage({ action: 'request', path, body: options.body || '' });
  return new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json' } });
}
export async function shareInvite(url) {
  if (nativeBridge()) return nativeBridge().postMessage({ action: 'share', url });
  return navigator.clipboard.writeText(url);
}

// Only the room transport changes; protocol, reconnects and shot simulation stay shared.
export class NativeRoomSocket extends EventTarget {
  constructor(url, bridge = nativeBridge(), events = globalThis) {
    super(); this.readyState = 0; this.id = crypto.randomUUID();
    this.bridge = bridge; this.events = events;
    this.receive = ({ detail }) => {
      if (detail.id !== this.id || this.readyState === 3) return;
      if (detail.type === 'open') { if (this.readyState !== 0) return; this.readyState = 1; }
      if (detail.type === 'close') { this.readyState = 3; events.removeEventListener('astra-socket', this.receive); }
      const event = new Event(detail.type);
      Object.assign(event, { data: detail.data, code: detail.code || 1006, reason: detail.reason || '' });
      this.dispatchEvent(event);
    };
    events.addEventListener('astra-socket', this.receive);
    this.command({ action: 'socketOpen', url });
  }
  command(message) {
    Promise.resolve().then(() => this.bridge.postMessage({ ...message, id: this.id })).catch(() => {
      this.receive({ detail: { id: this.id, type: 'error' } });
      this.receive({ detail: { id: this.id, type: 'close', code: 1006 } });
    });
  }
  send(data) {
    if (this.readyState !== 1) throw new Error('Room is not connected');
    this.command({ action: 'socketSend', data });
  }
  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2; this.command({ action: 'socketClose' });
  }
}
export const roomSocket = url => nativeBridge() ? new NativeRoomSocket(url) : new WebSocket(url);
export const roomSocketURL = id => `${nativeBridge() ? 'wss://astrapool.darrinm.com' : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`}/api/rooms/${id}/socket`;
