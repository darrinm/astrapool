// Pool table audio. Impacts are recorded-style samples (generated with ElevenLabs Sound Effects, measured and
// trimmed by pipeline/sfx_analyze.py, listed in public/sfx/manifest.json); each hit picks a random take and
// varies pitch, level and brightness with impact strength so repeats never sound identical. There is no rolling
// bed: a phenolic ball on worsted cloth is near silent, 30-40 dB under the clicks, so the space between hits is
// left quiet. Sources are panned by position and attenuated by distance, and a short synthetic room impulse adds
// space. The old modal-synthesis voices are kept behind `mode = 'synth'` so the two can be compared on audition.html.
const SFX_BASE = `${import.meta.env.BASE_URL}sfx/`;
export class PoolAudio {
  constructor() { this.ctx = null; this.enabled = true; this.buffers = {}; this.mode = 'samples'; this.loaded = null; }
  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; return null; }
    const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(ctx.destination);
    // room: small carpeted room, short decay, rolled-off highs
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(0.45, 3.5);
    this.wet = ctx.createGain(); this.wet.gain.value = 0.18; this.reverb.connect(this.wet).connect(this.master);
    this.dry = ctx.createGain(); this.dry.gain.value = 1; this.dry.connect(this.master);
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.load();
    return ctx;
  }
  // Fetch and decode every take in the manifest; the game is silent-but-working until they arrive.
  load() {
    if (this.loaded) return this.loaded;
    this.loaded = fetch(`${SFX_BASE}manifest.json`).then((r) => r.json()).then((manifest) => Promise.all(Object.entries(manifest).map(async ([cat, files]) => {
      this.buffers[cat] = await Promise.all(files.map((f) => fetch(SFX_BASE + f).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b))));
    }))).then(() => this.buffers).catch((e) => { console.warn('sfx load failed', e); return this.buffers; });
    return this.loaded;
  }
  noise(seconds) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  impulse(seconds, decay) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const w = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); lp += (w - lp) * 0.25; d[i] = lp; } }
    return buf;
  }
  // Output chain for one event: gain -> pan -> dry + reverb. `pan` in [-1, 1], `dist` in table units.
  out(level, pan, dist) {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = level / (1 + dist / 70);
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p); p.connect(this.dry); p.connect(this.reverb);
    return g;
  }
  // Play one take of a category: random take, pitch spread `spread`, brightness by `s` through a low-pass.
  sample(cat, dest, s, { rate = 1, spread = 0.06, lowpass = [3000, 9000], take = -1 } = {}) {
    const takes = this.buffers[cat]; if (!takes || !takes.length) return false;
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = takes[take >= 0 ? take % takes.length : Math.floor(Math.random() * takes.length)];
    src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 2 * spread);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lowpass[0] + (lowpass[1] - lowpass[0]) * s; lp.Q.value = 0.5;
    src.connect(lp).connect(dest); src.start(); return true;
  }
  // A damped resonator bank excited by a short burst: the synthesized "struck solid" voice (mode = 'synth').
  strike(dest, modes, exciteMs, exciteColor, t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise(exciteMs / 1000 + 0.01);
    const env = ctx.createGain(); env.gain.setValueAtTime(1, t); env.gain.exponentialRampToValueAtTime(0.001, t + exciteMs / 1000);
    const color = ctx.createBiquadFilter(); color.type = 'bandpass'; color.frequency.value = exciteColor; color.Q.value = 0.7;
    src.connect(env).connect(color);
    for (const [freq, q, amp, decayMs] of modes) {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.02); f.Q.value = q;
      const g = ctx.createGain(); g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.0005, t + decayMs / 1000);
      color.connect(f).connect(g).connect(dest);
    }
    src.start(t); src.stop(t + exciteMs / 1000 + 0.02);
  }
  begin(strength, base, span, pan, dist) {
    const ctx = this.ensure(); if (!ctx || !this.enabled) return null;
    const s = Math.min(1, Math.max(0, strength)); return { ctx, s, t: ctx.currentTime, dest: this.out(base + span * s, pan, dist) };
  }
  // Phenolic ball on ball: faster hits are louder, brighter and a shade higher; soft touches use the quiet takes.
  ballBall(strength, pan, dist, take) {
    const e = this.begin(Math.pow(Math.min(1, strength), 1.3), 0.12, 0.88, pan, dist); if (!e) return;
    if (this.mode === 'synth') { const bright = 1 + 0.35 * e.s; return this.strike(e.dest, [[3900 * bright, 28, 0.9, 22], [5600 * bright, 30, 0.6, 16], [7800 * bright, 26, 0.35, 12], [1500, 12, 0.35, 18]], 2.5 + 2 * e.s, 5000, e.t); }
    this.sample(e.s > 0.4 ? 'ballBall_hard' : 'ballBall_soft', e.dest, e.s, { rate: 0.97 + 0.1 * e.s, lowpass: [2500, 12000], take });
  }
  // Rubber cushion: dull and round.
  cushion(strength, pan, dist, take) {
    const e = this.begin(strength, 0.1, 0.6, pan, dist); if (!e) return;
    if (this.mode === 'synth') return this.strike(e.dest, [[210, 5, 1.0, 90], [420, 6, 0.5, 60], [900, 5, 0.25, 35], [2600, 8, 0.12, 15]], 8, 700, e.t);
    this.sample('cushion', e.dest, e.s, { rate: 0.95 + 0.08 * e.s, lowpass: [1500, 6000], take });
  }
  // Leather tip on the cue ball.
  cueTip(strength, pan, dist, take) {
    const e = this.begin(strength, 0.25, 0.6, pan, dist); if (!e) return;
    if (this.mode === 'synth') return this.strike(e.dest, [[1700, 14, 0.8, 30], [3200, 18, 0.5, 20], [650, 6, 0.5, 40], [5200, 20, 0.2, 12]], 4, 2200, e.t);
    this.sample('cueTip', e.dest, e.s, { rate: 0.96 + 0.08 * e.s, lowpass: [2500, 9000], take });
  }
  // Ball dropping into a leather pocket.
  pocket(strength, pan, dist, take) {
    const e = this.begin(strength, 0.3, 0.5, pan, dist); if (!e) return;
    if (this.mode === 'synth') {
      this.strike(e.dest, [[160, 6, 1.0, 140], [330, 7, 0.6, 90], [620, 6, 0.3, 60]], 12, 400, e.t);
      const flump = e.ctx.createBufferSource(); flump.buffer = this.noise(0.18);
      const lp = e.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350;
      const g = e.ctx.createGain(); g.gain.setValueAtTime(0.5, e.t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, e.t + 0.16);
      flump.connect(lp).connect(g).connect(e.dest); flump.start(e.t); flump.stop(e.t + 0.2); return;
    }
    this.sample('pocket', e.dest, e.s, { spread: 0.04, lowpass: [2000, 5000], take });
  }
  // Ball rattling in the pocket well.
  rattle(strength, pan, dist, take) {
    const e = this.begin(strength, 0.08, 0.3, pan, dist); if (!e) return;
    if (this.mode === 'synth') return this.strike(e.dest, [[480, 8, 0.8, 40], [1100, 9, 0.4, 25]], 4, 900, e.t);
    this.sample('rattle', e.dest, e.s, { lowpass: [2000, 6000], take });
  }
  setMuted(m) {
    if (this.enabled === !m) return;
    this.enabled = !m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }
}
