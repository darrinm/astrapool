// A broken chain marks a lost streak in the multiplier itself. One transition,
// no looping attention animation, and no celebration for old room snapshots.
export class MultiplierBadge {
  constructor(element) {
    this.element = element; this.scope = null; this.play = null; this.value = null; this.animation = null;
    element.innerHTML = '<svg class="streak-break" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m7 12-2 2a3 3 0 0 0 4 4l3-3m-4-4 3-3m2 0 2-2a3 3 0 0 0-4-4L8 5M2 7h3m10 6h3M6 2v3m8 10v3"/></svg><span></span>';
    this.label = element.querySelector('span');
  }
  update(value, scope, play, { visible = true, reduced = false, silent = false } = {}) {
    if (scope === this.scope && play === this.play && value === this.value) {
      if (!visible || silent) this.clear();
      return;
    }
    const reset = visible && !silent && scope === this.scope && play === this.play + 1 && this.value > value;
    this.clear(); this.value = value; this.scope = scope; this.play = play;
    this.label.textContent = `×${value}`; if (value > 1) this.element.dataset.hot = 'true'; else delete this.element.dataset.hot;
    this.element.setAttribute('aria-label', `Score multiplier ${value}${reset ? '. Streak ended' : ''}`);
    if (!reset) return;
    this.element.dataset.reset = 'true';
    const animation = this.element.animate([
      { color: '#ffac98', backgroundColor: '#673a2c', transform: reduced ? 'none' : 'translateY(-3px)', offset: 0 },
      { color: '#ffac98', backgroundColor: '#673a2c', transform: 'none', offset: 0.65 },
      { transform: 'none', offset: 1 },   // colours settle on the badge's own style (neutral ×1, or a live streak)
    ], { duration: 1800, easing: 'ease-out' });
    this.animation = animation;
    animation.finished.then(() => { if (this.animation === animation) this.clear(); }).catch(() => {});
  }
  clear() {
    this.animation?.cancel(); this.animation = null;
    delete this.element.dataset.reset;
  }
}
