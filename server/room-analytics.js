// Durable outbox: retain the latest snapshot of each rack until D1 acknowledges it.
// Separate rows survive a rematch, eviction, and loss of all WebSocket clients.
const MAX_AGE = 48 * 60 * 60 * 1000;
const delivery = data => { const value = JSON.parse(data); return value.record ? value : { record: value, attempts: 0, retryAt: 0 }; };
export class RoomAnalytics {
  constructor(sql, write, now = Date.now) {
    this.sql = sql; this.write = write; this.now = now; this.flushing = null;
    sql.exec('CREATE TABLE IF NOT EXISTS analytics_pending (id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL)');
  }
  enqueue(game) {
    if (this.now() - game.startedAt >= MAX_AGE) return;
    const existing = this.sql.exec('SELECT data FROM analytics_pending WHERE id = ?', game.id).toArray()[0];
    const entry = existing ? delivery(existing.data) : { attempts: 0, retryAt: 0 };
    entry.record = game; // Preserve backoff across newer snapshots of the same rack.
    this.sql.exec(`INSERT INTO analytics_pending (id, version, data) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET version=excluded.version, data=excluded.data
      WHERE excluded.version > analytics_pending.version`, game.id, game.version, JSON.stringify(entry));
  }
  get pending() { return this.sql.exec('SELECT id FROM analytics_pending LIMIT 1').toArray().length > 0; }
  get nextAttempt() {
    const row = this.sql.exec(`SELECT MIN(MIN(COALESCE(json_extract(data, '$.retryAt'), 0),
      COALESCE(json_extract(data, '$.record.startedAt'), json_extract(data, '$.startedAt')) + ?)) AS at
      FROM analytics_pending`, MAX_AGE).toArray()[0];
    return row.at === null ? null : Math.max(this.now(), row.at);
  }
  flush() {
    if (!this.flushing) this.flushing = this.#drain().finally(() => { this.flushing = null; });
    return this.flushing;
  }
  async #drain() {
    while (true) {
      const row = this.sql.exec(`SELECT id, version, data FROM analytics_pending
        WHERE COALESCE(json_extract(data, '$.retryAt'), 0) <= ?
          OR COALESCE(json_extract(data, '$.record.startedAt'), json_extract(data, '$.startedAt')) <= ?
        LIMIT 1`, this.now(), this.now() - MAX_AGE).toArray()[0];
      if (!row) return;
      const entry = delivery(row.data);
      if (this.now() - entry.record.startedAt >= MAX_AGE) {
        this.sql.exec('DELETE FROM analytics_pending WHERE id = ?', row.id);
        console.warn('Gameplay analytics dropped after the 48-hour delivery deadline');
        continue;
      }
      // Upgrade older outbox entries without resetting their rack's delivery deadline.
      this.sql.exec('UPDATE analytics_pending SET data = ? WHERE id = ? AND version = ?', JSON.stringify(entry), row.id, row.version);
      try { await this.write(entry.record); }
      catch {
        const attempts = entry.attempts + 1;
        const delay = Math.min(60, 2 ** Math.min(attempts - 1, 6)) * 60000;
        const retryAt = Math.min(this.now() + delay, entry.record.startedAt + MAX_AGE);
        // Preserve any newer snapshot queued during the failed request.
        this.sql.exec("UPDATE analytics_pending SET data = json_set(data, '$.attempts', ?, '$.retryAt', ?) WHERE id = ?", attempts, retryAt, row.id);
        console.warn('Gameplay analytics write failed; retry scheduled', { attempts, retryAt });
        continue;
      }
      // A newer shot/result may have arrived during the write. Acknowledge only this version.
      this.sql.exec('DELETE FROM analytics_pending WHERE id = ? AND version = ?', row.id, row.version);
    }
  }
}

export function roomAlarmTime(room, analyticsRetryAt, now = Date.now()) {
  const gameplay = room.pending ? Math.max(now, room.pending.started + 90000) : room.updated + 86400000;
  // Immediate sends already run in the handler; reserve an alarm rather than duplicating that flush.
  const retry = analyticsRetryAt === null ? Infinity : Math.max(now + 60000, analyticsRetryAt);
  // Expired rooms follow the delivery backoff instead of waking every minute.
  if (!room.pending && gameplay <= now) return retry === Infinity ? now + 60000 : retry;
  return Math.min(gameplay, retry);
}
