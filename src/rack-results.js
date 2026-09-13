import { ARCADE_VERSION } from './arcade-events.js';
import { AWARD_NAMES } from './arcade-score.js';

// Receipts are authoritative; clips only supply playback. Retain one highlight,
// sharing its bounded pose recording rather than copying a rack of replay data.
export class RackResults {
  constructor() { this.reset(); }
  reset(rack = null) {
    this.rack = rack; this.play = 0; this.complete = true;
    this.runs = [0, 0]; this.longest = [0, 0]; this.bestShots = [0, 0]; this.best = null; this.clip = null;
    this.category = undefined; this.records = null;
  }
  observe(state, clip = null) {
    if (!state) return;
    if (state.rack !== this.rack) this.reset(state.rack);
    const receipt = state.last;
    if (receipt && receipt.play > this.play) {
      if (receipt.play !== this.play + 1) { this.complete = false; this.runs = [0, 0]; }
      this.play = receipt.play;
      const p = receipt.player;
      this.runs[p] = !receipt.fault && receipt.total > 0 ? this.runs[p] + 1 : 0;
      this.longest[p] = Math.max(this.longest[p], this.runs[p]);
      this.bestShots[p] = Math.max(this.bestShots[p], receipt.fault ? 0 : receipt.total);
      if (!receipt.fault && receipt.total > (this.best?.total ?? 0)) {
        this.best = structuredClone(receipt); this.clip = null;
      }
    }
    if (this.best && clip?.metadata.rack === this.rack && clip.metadata.play === this.best.play) this.clip = clip;
  }
  begin(category) {
    if (this.category === undefined) this.category = category;
    else if (this.category !== category) this.category = null;
  }
  finish(state, players, storage) {
    if (this.records !== null) return this.records;
    this.records = [];
    if (!this.complete || !this.category || !state) return this.records;
    const key = `pool.rack-records.${ARCADE_VERSION}.${this.category}`;
    let previous = {};
    try { previous = JSON.parse(storage?.getItem(key) || '{}') || {}; } catch {}
    const fields = ['score', 'shot', 'streak'];
    const value = (p, field) => field === 'score' ? state.totals[p] : field === 'shot' ?
      this.bestShots[p] : this.longest[p];
    for (const p of players) for (const field of fields) {
      const best = Number.isFinite(previous[field]) && previous[field] >= 0 ? previous[field] : 0;
      if (value(p, field) > best) this.records.push({ player: p, field });
    }
    const next = Object.fromEntries(fields.map(field => [field, Math.max(
      Number.isFinite(previous[field]) && previous[field] >= 0 ? previous[field] : 0,
      ...players.map(p => value(p, field)),
    )]));
    // A shared-device record belongs to the higher score, not both players.
    this.records = this.records.filter(record => value(record.player, record.field) === next[record.field]);
    try { storage?.setItem(key, JSON.stringify(next)); } catch { /* Private browsing can disable storage. */ }
    return this.records;
  }
}

export function highlightName(receipt) {
  if (!receipt) return 'No scoring shots';
  const kinds = [...new Set(receipt.awards.map(a => a.kind))].filter(kind => kind !== 'pot');
  return kinds.length ? kinds.map(kind => AWARD_NAMES[kind]).join(' + ') : 'Clean pot';
}
