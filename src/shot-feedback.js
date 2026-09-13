// Completed shot details are a brief overlay, not part of the camera's layout.
// Track the play number so settings, pocket calls and reconnects cannot replay it.
export class ShotFeedback {
  constructor(element, source, motion = matchMedia('(prefers-reduced-motion: reduce)')) {
    this.element = element;
    this.source = source;
    this.motion = motion;
    this.scope = null;
    this.play = 0;
    this.animation = null;
  }
  update(scope, play, silent = false) {
    if (scope !== this.scope || play < this.play) {
      this.clear(); this.scope = scope; this.play = play; return;
    }
    if (play === this.play) return;
    this.play = play;
    this.clear();
    if (silent) return;
    const lines = [...this.source.querySelectorAll('#shot-result-text, #arcade-receipt')]
      .filter(el => !el.hidden && el.textContent).map(el => el.textContent);
    if (!lines.length) return;
    this.element.replaceChildren(...lines.map(text => {
      const p = this.element.ownerDocument.createElement('p'); p.textContent = text; return p;
    }));
    this.element.hidden = false;
    const animation = this.element.animate([
      { opacity: 1, transform: 'translateY(0)', offset: 0 },
      { opacity: 1, transform: 'translateY(0)', offset: 0.8 },
      { opacity: 0, transform: this.motion.matches ? 'translateY(0)' : 'translateY(-16px)', offset: 1 },
    ], { duration: 5000, easing: 'ease-in', fill: 'forwards' });
    this.animation = animation;
    animation.finished.then(() => {
      if (this.animation === animation) this.clear();
    }).catch(() => {}); // A new result or rack cancels the previous animation.
  }
  clear() {
    this.animation?.cancel(); this.animation = null;
    this.element.hidden = true;
  }
}
