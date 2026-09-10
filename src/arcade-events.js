// Compact, ordered evidence shared by the browser and the room scorer. Cosmetics
// have a separate budget: dropping a spark must never drop a scoring contact.
export const ARCADE_VERSION = 1;
export const MAX_ARCADE_EVENTS = 240;
export const EVENT = { launch: 0, hit: 1, rail: 2, pot: 3, off: 4, touch: 5, ambiguous: 6 };

export class ArcadeEvents {
  constructor() {
    this.events = [];
    this.overflow = false;
    this.paths = new Map();
    this.pots = new Map();
    this.removed = new Set();
    this.first = null;
    this.cueContact = false;
  }
  add(type, tick, a, b = 0) {
    const event = [type, Math.max(0, Math.round(tick)), a, b];
    if (this.events.length < MAX_ARCADE_EVENTS) this.events.push(event);
    else this.overflow = true;
    this.apply(event);
  }
  apply([type, tick, a, b]) {
    if (type === EVENT.launch) {
      this.paths.set(a, { chain: [a], rails: [], lastRail: -100, kick: false, clean: true });
      return;
    }
    if (type === EVENT.touch) { this.paths.delete(a); return; }
    if (type === EVENT.pot || type === EVENT.off) {
      if (this.removed.has(a)) return;
      const path = this.paths.get(a);
      if (type === EVENT.pot) this.pots.set(a, {
        pocket: b, active: !!path, banks: path?.clean ? path.rails.length : 0,
        combo: !!(path?.clean && path.chain.filter(n => n !== 0).length > 1),
        kick: !!(path?.clean && path.kick),
      });
      this.removed.add(a); this.paths.delete(a); return;
    }
    if (this.removed.has(a) || ((type === EVENT.hit || type === EVENT.ambiguous) && this.removed.has(b))) return;
    if (type === EVENT.rail) {
      const path = this.paths.get(a);
      if (path && path.rails.at(-1) !== b && tick - path.lastRail >= 8) {
        if (path.rails.length < 3) path.rails.push(b);
        path.lastRail = tick;
      }
      return;
    }
    const source = this.paths.get(a), target = this.paths.get(b);
    if ((a === 0 || b === 0) && !this.cueContact) this.first = a === 0 ? b : a;
    if (type === EVENT.ambiguous) {
      // Moving balls arriving together have no unambiguous impulse ancestry.
      for (const n of [a, b]) if (this.paths.has(n)) {
        const p = this.paths.get(n); p.clean = false; p.rails = []; p.kick = false;
      }
    } else if (type === EVENT.hit) {
      if (!source) this.paths.delete(b); // A manually pushed ball cannot seed a route.
      else {
        const clean = source.clean && !source.chain.includes(b) && !target;
        this.paths.set(b, {
          chain: clean ? [...source.chain, b] : [b], rails: [], lastRail: -100,
          clean, kick: clean && (source.kick || (a === 0 && !this.cueContact && source.rails.length > 0)),
        });
      }
      // After a deflection, only later rails belong to the source's finishing route.
      if (source) { source.rails = []; source.kick = false; if (a !== 0) source.clean = false; }
    }
    if (a === 0 || b === 0) this.cueContact = true;
  }
  evidence() {
    // Overflow removes advanced bonuses consistently, including on the server.
    return this.overflow ? new Map([...this.pots].map(([n, p]) => [n, { ...p, banks: 0, combo: false, kick: false }])) : this.pots;
  }
  report() { return { version: ARCADE_VERSION, overflow: this.overflow, events: this.overflow ? [] : this.events }; }
}

// Positive incoming normal velocity identifies which ball drove the contact.
// Velocities must be sampled before the solver, never inferred from outgoing motion.
export function collisionDirection(a, b) {
  if (!a || !b) return 0;
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
  if (length < 0.01) return 0;
  const av = (a.vx * dx + a.vy * dy) / length;
  const bv = -(b.vx * dx + b.vy * dy) / length;
  if (av + bv < 0.15) return 0;
  if (av > 0.15 && Math.hypot(b.vx, b.vy) < 0.3) return 1;
  if (bv > 0.15 && Math.hypot(a.vx, a.vy) < 0.3) return -1;
  return 0;
}

export function readArcadeEvidence(report, shot, present) {
  if (report === undefined) return new Map(); // Older stored racks have no trace.
  const fail = () => { throw new Error('Invalid arcade evidence.'); };
  if (!report || report.version !== ARCADE_VERSION || typeof report.overflow !== 'boolean' ||
      !Array.isArray(report.events) || report.events.length > MAX_ARCADE_EVENTS) fail();
  if (report.overflow) { if (report.events.length) fail(); return new Map(); }
  const tracker = new ArcadeEvents();
  let lastTick = -1, launched = false;
  const pots = [], off = [];
  for (const entry of report.events) {
    if (!Array.isArray(entry) || entry.length !== 4 || !entry.every(Number.isInteger)) fail();
    const [type, tick, a, b] = entry;
    if (tick < lastTick || tick > 480 * 91 || !present.has(a) || tracker.removed.has(a)) fail();
    if (!launched && type !== EVENT.launch) fail();
    if (type === EVENT.launch) {
      if (launched || a !== 0 || b !== 0 || tick !== 0) fail();
      launched = true;
    } else if (type === EVENT.hit || type === EVENT.ambiguous) {
      if (!present.has(b) || a === b || tracker.removed.has(b)) fail();
    } else if (type === EVENT.rail) { if (b < 0 || b > 5) fail(); }
    else if (type === EVENT.pot) {
      if (b < 0 || b > 5) fail();
      pots.push({ number: a, pocket: b });
    } else if (type === EVENT.off) { if (b !== 0) fail(); off.push(a); }
    else fail(); // Hand manipulation is never legal in online 8-ball.
    tracker.apply(entry); lastTick = tick;
  }
  if (!launched || JSON.stringify(pots) !== JSON.stringify(shot.pocketed) ||
      JSON.stringify(off) !== JSON.stringify(shot.offTable) || tracker.first !== shot.first) fail();
  return tracker.evidence();
}
