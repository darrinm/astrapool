import { ArcadeEvents, EVENT } from './arcade-events.js';
import { newArcade, scoreArcade, commitArcade, arcadeFault, FAULT_NAMES } from './arcade-score.js';
import { ArcadeEffects, ARCADE_COLORS as C } from './arcade-effects.js';
import { ArcadeHud } from './arcade-hud.js';
import { shotRecord } from './eight-ball.js';

const FAULT_COPY = { scratch: 'SCRATCH', off: 'OUT OF BOUNDS!', early: 'TOO SOON!', wrong: 'WRONG DOOR!', foul: 'FOUL' };

export class PoolArcade {
  constructor({ scene, camera, feltZ, audio, spatial, context, refresh }) {
    this.context = context; this.refresh = refresh; this.time = 0; this.state = newArcade(0);
    this.effects = new ArcadeEffects({ scene, camera, feltZ, sound: (kind, at) => {
      const p = spatial(at); audio.arcade(kind, p.pan, p.dist);
    } });
    this.hud = new ArcadeHud(() => { this.effects.configure(this.hud.enabled, this.hud.reduced); if (!this.hud.enabled) audio.stopArcade(); refresh(); });
    this.effects.configure(this.hud.enabled, this.hud.reduced);
    this.active = null; this.pending = null; this.preview = null; this.settled = 0; this.category = null; this.onlineRack = null;
  }
  categoryNow() {
    const c = this.context();
    return c.mode === 'computer' ? `computer-${c.difficulty}` : c.mode === 'free' ? `free-${c.input}` : c.mode;
  }
  modeChanged() {
    const next = this.categoryNow();
    if (!this.state?.lastPlay && !this.active) this.category = next;
    else if (this.category !== next) { this.category = null; if (this.active || this.pending) this.resetStreak = true; else if (this.state) this.state.streaks = [0, 0]; }
    this.update();
  }
  reset() {
    this.state = newArcade((this.state?.rack || 0) + 1); this.active = null; this.pending = null; this.preview = null;
    this.settled = 0; this.resetStreak = false; this.category = this.categoryNow(); this.onlineRack = null; this.lastReport = null;
    this.effects.clear();
  }
  get tick() { return Math.max(0, Math.round((this.time - this.active.start) * 480)); }
  begin(input, ball, at) {
    const c = this.context();
    if (!this.active) {
      this.modeChanged();
      this.active = { start: this.time, tracker: new ArcadeEvents(), report: shotRecord(c.calledPocket), before: structuredClone(c.match), input,
        free: c.mode === 'free', shown: new Set(), origin: { ...at }, player: c.mode === 'free' ? 0 : c.match.turn };
      this.settled = 0;
    }
    this.active.tracker.add(EVENT.launch, this.tick, ball);
    this.active.tracker.sample(ball, at);
    this.effects.launch(at); this.updatePreview();
  }
  touch(number) { if (this.active) this.active.tracker.add(EVENT.touch, this.tick, number); }
  hit(a, b, beforeA, beforeB, manual = false, afterA, afterB) {
    if (!this.active) return;
    const play = this.active;
    if (play.report.first === null && (a === 0 || b === 0)) play.report.first = a === 0 ? b : a;
    if (manual) { this.touch(a); this.touch(b); return; }
    play.tracker.hit(this.tick, a, b, beforeA, beforeB, afterA, afterB);
  }
  rail(number, index, qualifies = true) {
    if (!this.active) return;
    const play = this.active;
    if (play.report.first !== null && !play.report.rails.includes(number)) play.report.rails.push(number);
    if (qualifies) play.tracker.add(EVENT.rail, this.tick, number, index);
  }
  pocket(number, pocket, at, off = false) {
    const play = this.active;
    if (!play) { this.effects.ring(at, C.cream, 2); return; }
    play.tracker.pot(this.tick, number, pocket, off);
    if (off) play.report.offTable.push(number); else play.report.pocketed.push({ number, pocket });
    this.updatePreview();
    const fault = this.preview?.fault;
    if (off || number === 0) { this.showFault(off ? 'off' : 'scratch', at, play); return; }
    if (number === 8 && !play.free) {
      if (play.before.breaking) { this.effects.pocket(at, 'BACK YOU GO!', '8 ON THE BREAK', { key: 'break-eight', color: C.mint }); return; }
      // A prior scratch must not swallow the separate reaction at the 8's pocket.
      const eightFault = arcadeFault(play.before, { ...play.report, pocketed: [{ number, pocket }], offTable: [] }, null);
      if (eightFault) { this.showFault(eightFault, at, play); return; }
      if (fault) {
        this.effects.pocket(at, 'RACK LOST', '8 WITH A FOUL', { key: 'eight-foul', down: true, color: C.coral }); return;
      }
    }
    const awards = this.preview?.awards.filter(a => a.pocket === pocket) || [];
    if (!awards.length || fault) { this.effects.ring(at, C.cream, 2); return; }
    const points = awards.reduce((sum, a) => sum + a.points, 0);
    const kinds = new Set(awards.map(a => a.kind)), n = this.preview.count;
    const sub = kinds.has('finish') ? 'RACK FINISH!' : kinds.has('multi') ? (n === 2 ? 'DOUBLE POT!' : n === 3 ? 'TRIPLE POT!' : `${n} POTS!`) :
      kinds.has('double') ? 'DOUBLE KISS!' : kinds.has('carom') ? 'CAROM!' : kinds.has('combo') ? 'COMBINATION!' : kinds.has('kick') ? 'KICK SHOT!' : kinds.has('bank') ? 'BANK SHOT!' : kinds.has('thin') ? 'THIN CUT!' : kinds.has('long') ? 'LONG POT!' : 'NICE POT!';
    this.effects.pocket(at, `+${points.toLocaleString()}`, sub, { key: `pot-${this.state?.rack}-${this.state?.lastPlay}-${pocket}`, player: play.player, pending: true });
  }
  showFault(kind, at, play) {
    if (play.shown.has(kind)) return;
    play.shown.add(kind);
    this.effects.voidPending(FAULT_NAMES[kind]);
    this.effects.pocket(at, FAULT_COPY[kind], kind === 'early' || kind === 'wrong' ? 'RACK LOST' : 'NO POINTS THIS SHOT',
      { key: `fault-${kind}`, down: true, swirl: kind === 'scratch', color: kind === 'early' ? C.plum : kind === 'foul' ? C.amber : C.coral });
    if (kind === 'early') this.effects.ring(at, C.coral, 5, 0.7);
    if (kind === 'wrong' && play.report.calledPocket !== null) this.effects.ring(this.context().pockets[play.report.calledPocket], C.gold, 4, 0.8);
  }
  updatePreview() {
    if (this.state && this.active) this.preview = scoreArcade({ state: this.state, before: this.active.before, shot: this.active.report,
      evidence: this.active.tracker.evidence(), free: this.active.free, input: this.active.input });
    this.update();
  }
  resultEffects(receipt, play) {
    if (receipt.fault) {
      const pot = play.report.pocketed.find(p => p.number === (receipt.fault === 'scratch' ? 0 : 8));
      const at = pot ? this.context().pockets[pot.pocket] : play.origin;
      this.showFault(receipt.fault, at, play);
    } else if (receipt.awards.some(a => a.kind === 'finish')) {
      const at = this.context().pockets[receipt.awards.find(a => a.kind === 'finish').pocket];
      this.effects.burst(at, C.gold, 30, 1.5); this.effects.ring(at, C.gold, 7, 0.9);
      if (this.effects.enabled) this.effects.sound('win', at);
    }
    this.effects.confirmPending();
  }
  finish(report = this.active?.report, result = null) {
    const play = this.active; if (!play) return;
    play.report = report;
    const evidenceReport = play.tracker.report();
    this.lastReport = { ...report, arcade: evidenceReport };
    if (!this.state) { this.active = null; this.preview = null; return evidenceReport; }
    const receipt = scoreArcade({ state: this.state, before: play.before, shot: report, evidence: play.tracker.evidence(), result, free: play.free, input: play.input });
    this.active = null; this.settled = 0;
    if (this.context().mode === 'online') { this.pending = { play }; this.preview = receipt; }
    else {
      this.state = commitArcade(this.state, receipt); this.resultEffects(receipt, play); this.preview = null;
      if (this.resetStreak) { this.state.streaks = [0, 0]; this.resetStreak = false; }
      this.recordBest();
    }
    this.update(); return evidenceReport;
  }
  settleFree(still, pendingPocket, dragging, dt) {
    if (!this.active?.free) return;
    this.settled = still && !pendingPocket && !dragging ? this.settled + dt : 0;
    if (this.settled >= 0.25) { this.finish(); this.refresh(); }
  }
  syncOnline(snapshot) {
    const next = snapshot.arcade || null, play = this.active || this.pending?.play;
    const previous = this.context().match;
    if (previous.ballInHand && !snapshot.match.ballInHand && snapshot.match.shots === previous.shots) {
      const cue = snapshot.balls.find(b => b.number === 0); if (cue) this.effects.ring(cue, C.cream, 2.2, 0.3);
    }
    if (play) {
      if (next?.last && this.state && next.rack === this.state.rack && next.last.play === this.state.lastPlay + 1) this.resultEffects(next.last, play);
      else this.effects.clear();
    }
    const legacyReset = this.state === null && snapshot.match.breaking && snapshot.match.shots === 0 &&
      (previous.shots > 0 || previous.breaker !== snapshot.match.breaker);
    const newRack = next && (this.onlineRack !== null && this.onlineRack !== next.rack || legacyReset ||
      this.onlineCreating && this.onlineRack === null && next.lastPlay === 0);
    this.state = next; this.onlineRack = next?.rack ?? null; this.onlineCreating = false;
    this.active = null; this.pending = null; this.preview = null; this.settled = 0;
    if (newRack) this.effects.clear();
    this.recordBest();
    return !!newRack;
  }
  recordBest() {
    const c = this.context();
    if (c.attract) return;
    this.hud.record(this.state, this.category, c.mode === 'online' ? c.seat === null ? [] : [c.seat] : c.mode === 'computer' || c.mode === 'free' ? [0] : [0, 1]);
  }
  update() {
    const visible = this.hud.update({ state: this.state, preview: this.preview, free: this.context().mode === 'free', category: this.category, waiting: !!this.pending, mixed: this.category === null });
    if (visible) document.getElementById('shot-result').hidden = false;
    return visible;
  }
  debug() {
    return { enabled: this.hud.enabled, reduced: this.hud.reduced, state: structuredClone(this.state), preview: this.preview && structuredClone(this.preview),
      events: this.active?.tracker.report(), report: this.lastReport && structuredClone(this.lastReport), active: !!this.active, pending: !!this.pending, category: this.category };
  }
}
