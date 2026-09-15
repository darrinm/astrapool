import { gameRequest, nativeBridge } from './platform.js';
// Anonymous rack records: no visitor IDs, room links, reconnect tokens or ball positions.
export const SETTINGS = {
  difficulty: ['easy', 'medium', 'hard', 'tricky', 'none'],
  room: ['minimal', 'corner', 'desert', 'tokyo', 'orbital', 'alpine', 'glasshouse', 'coast', 'riad'],
  balls: ['balls', 'heads', 'planets'],
  arcade: ['on', 'off'], effects: ['full', 'reduced'], sound: ['on', 'off'],
  input: ['cue', 'fling'], device: ['desktop', 'mobile'],
};
export function analyticsSettings(value = {}) {
  return Object.fromEntries(Object.entries(SETTINGS).map(([key, values]) => [key, values.includes(value?.[key]) ? value[key] : 'unknown']));
}
export function newGameAnalytics(mode, settings, now = Date.now(), id = crypto.randomUUID()) {
  return { id, mode, version: 1, startedAt: now, finishedAt: null, endedAt: null, shots: 0,
    durationMs: 0, outcome: null, endReason: null, initialSettings: analyticsSettings(settings),
    settings: analyticsSettings(settings), settingsChanges: 0, score: 0 };
}
export function updateGameAnalytics(record, settings, now = Date.now(), { countSettingsChanges = true } = {}) {
  if (record.finishedAt || record.endedAt) return;
  const next = analyticsSettings(settings);
  if (countSettingsChanges && JSON.stringify(next) !== JSON.stringify(record.settings)) record.settingsChanges++;
  record.settings = next;
  record.durationMs = Math.max(record.durationMs, now - record.startedAt);
  record.version++;
}

export class GameplayAnalytics {
  constructor({ send, settings, now = Date.now, id = () => crypto.randomUUID(), enabled = true }) {
    Object.assign(this, { send, getSettings: settings, now, id, enabled });
    this.mode = null; this.record = null; this.dirty = false; this.lastSent = 0;
    this.pending = new Map();
  }
  select(mode) {
    this.end('switch');
    this.mode = ['local', 'computer', 'free'].includes(mode) ? mode : null;
    this.record = null;
  }
  shot() {
    if (!this.enabled || !this.mode || this.record?.finishedAt || this.record?.endedAt) return;
    const first = !this.record;
    if (first) this.record = newGameAnalytics(this.mode, this.getSettings(), this.now(), this.id());
    updateGameAnalytics(this.record, this.getSettings(), this.now());
    this.record.shots++; this.dirty = true;
    this.flush(first);
  }
  checkpoint() {
    if (!this.record || this.record.finishedAt || this.record.endedAt) return;
    updateGameAnalytics(this.record, this.getSettings(), this.now());
    this.dirty = true; this.flush();
  }
  settingsChanged() {
    if (!this.record || this.record.finishedAt || this.record.endedAt ||
        JSON.stringify(analyticsSettings(this.getSettings())) === JSON.stringify(this.record.settings)) return;
    updateGameAnalytics(this.record, this.getSettings(), this.now());
    this.dirty = true; this.flush();
  }
  finish(outcome, score = 0) {
    if (!this.record || this.record.finishedAt || this.record.endedAt) return;
    updateGameAnalytics(this.record, this.getSettings(), this.now());
    this.record.finishedAt = this.now(); this.record.outcome = outcome; this.record.score = Math.round(score);
    this.dirty = true; this.flush(true);
  }
  end(reason, beacon = false) {
    if (!this.record || this.record.finishedAt || this.record.endedAt) return;
    updateGameAnalytics(this.record, this.getSettings(), this.now());
    this.record.endedAt = this.now(); this.record.endReason = reason;
    this.dirty = true; this.flush(true, beacon);
  }
  flush(force = false, beacon = false) {
    // Mode switches release the active rack, but retain its unacknowledged final update.
    for (const entry of this.pending.values()) if (entry.record.id !== this.record?.id &&
        (beacon || !entry.inFlight && this.now() - entry.sentAt >= 30000)) this.#send(entry.record, beacon);
    if (!this.record || !this.dirty || !force && this.now() - this.lastSent < 30000) return;
    this.lastSent = this.now(); this.dirty = false;
    const record = structuredClone(this.record);
    this.#send(record, beacon);
  }
  #send(record, beacon) {
    const entry = { record, sentAt: this.now(), inFlight: true };
    this.pending.set(record.id, entry);
    // Bound memory during a prolonged outage; the most recent 20 racks can retry while the page lives.
    while (this.pending.size > 20) this.pending.delete(this.pending.keys().next().value);
    const complete = ok => {
      entry.inFlight = false;
      if (this.pending.get(record.id) !== entry) return; // A newer snapshot superseded this request.
      if (ok === true) this.pending.delete(record.id);
      else if (this.record?.id === record.id) this.dirty = true;
    };
    // Failures stay outside gameplay. A later cumulative snapshot repairs a missed update.
    try {
      Promise.resolve(this.send(record, beacon)).then(complete, () => complete(false));
    } catch { complete(false); }
  }
}

export function sendGameAnalytics(record, beacon = false) {
  const body = JSON.stringify(record);
  // Queuing is not a server acknowledgement. A surviving page confirms this snapshot with fetch.
  if (beacon && !nativeBridge() && navigator.sendBeacon?.('/api/analytics/game', new Blob([body], { type: 'application/json' }))) return 'queued';
  return gameRequest('/api/analytics/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    .then(response => response.ok).catch(() => false);
}
