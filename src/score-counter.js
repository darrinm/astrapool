// Animate confirmed gains only. Joining a game, resetting a rack, and missed
// snapshots establish a baseline rather than celebrating old points.
export class ScoreCounter {
  constructor(element) {
    this.element = element;
    this.scope = null;
    this.value = null;
    this.play = null;
    this.frame = null;
    this.highlight = null;
  }
  update(value, scope, play, animate = true) {
    if (scope === this.scope && value === this.value && play === this.play) {
      if (!animate) this.finish();
      return;
    }
    const gain = animate && this.value !== null && value !== null && scope === this.scope && play === this.play + 1 && value > this.value;
    const from = this.value;
    this.finish();
    this.scope = scope; this.value = value; this.play = play;
    this.element.setAttribute('aria-label', value === null ? 'Arcade score unavailable' : `${value.toLocaleString()} Arcade points`);
    if (!gain) { this.render(value); return; }
    const start = performance.now();
    this.render(from);
    this.highlight = this.element.animate([
      { textShadow: '0 0 12px currentColor', offset: 0 },
      { textShadow: '0 0 12px currentColor', offset: 0.35 },
      { textShadow: '0 0 0 transparent', offset: 1 },
    ], { duration: 1000, easing: 'ease-out' });
    const tick = now => {
      const t = Math.min(1, (now - start) / 800);
      this.render(Math.round(from + (value - from) * (1 - (1 - t) ** 3)));
      this.frame = t < 1 ? requestAnimationFrame(tick) : null;
    };
    this.frame = requestAnimationFrame(tick);
  }
  render(value) {
    const text = value === null ? '—' : value.toLocaleString();
    if (this.element.textContent !== text) this.element.textContent = text;
  }
  finish() {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.highlight?.cancel(); this.highlight = null;
    this.render(this.value);
  }
}
