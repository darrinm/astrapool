// Durable outbox: retain the latest snapshot of each rack until D1 acknowledges it.
// Separate rows survive a rematch, eviction, and loss of all WebSocket clients.
export class RoomAnalytics {
  constructor(sql, write) {
    this.sql = sql; this.write = write; this.flushing = null;
    sql.exec('CREATE TABLE IF NOT EXISTS analytics_pending (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)');
  }
  enqueue(game) {
    this.sql.exec(`INSERT INTO analytics_pending (id, version, data) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET version=excluded.version, data=excluded.data
      WHERE excluded.version > analytics_pending.version`, game.id, game.version, JSON.stringify(game));
  }
  get pending() { return this.sql.exec('SELECT id FROM analytics_pending LIMIT 1').toArray().length > 0; }
  flush() {
    if (!this.flushing) this.flushing = this.#drain().finally(() => { this.flushing = null; });
    return this.flushing;
  }
  async #drain() {
    while (true) {
      const row = this.sql.exec('SELECT id, version, data FROM analytics_pending LIMIT 1').toArray()[0];
      if (!row) return;
      try { await this.write(JSON.parse(row.data)); }
      catch { console.warn('Gameplay analytics write failed; retained for retry'); return; }
      // A newer shot/result may have arrived during the write. Acknowledge only this version.
      this.sql.exec('DELETE FROM analytics_pending WHERE id = ? AND version = ?', row.id, row.version);
    }
  }
}

export function roomAlarmTime(room, pendingAnalytics, now = Date.now()) {
  const gameplay = room.pending ? Math.max(now, room.pending.started + 90000) : room.updated + 86400000;
  // An expired room with undelivered analytics retries after one minute, without a busy alarm loop.
  return Math.min(room.pending || gameplay > now ? gameplay : now + 60000, pendingAnalytics ? now + 60000 : Infinity);
}
