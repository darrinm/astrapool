import { arcadeSummary, multiplierFor } from './arcade-score.js';
import { ARCADE_VERSION } from './arcade-events.js';

function read(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, value); } catch { /* Play works without storage. */ } }
const setText = (el, value) => { if (el.textContent !== value) el.textContent = value; };

export class ArcadeHud {
  constructor(onChange) {
    this.onChange = onChange;
    this.enabled = read('pool.arcade', 'on') === 'on';
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = read('pool.arcade.effects', this.motion.matches ? 'reduced' : 'full') === 'reduced';
    this.toggle = document.getElementById('arcade-toggle');
    this.settings = document.getElementById('arcade-intensity');
    this.receipt = document.getElementById('arcade-receipt');
    this.pending = document.getElementById('arcade-pending');
    this.best = document.getElementById('arcade-best');
    this.values = [];
    for (let i = 0; i < 2; i++) {
      const row = document.createElement('span'); row.className = 'arcade-player'; row.dataset.player = String(i);
      const label = document.createElement('span'); label.textContent = 'Arcade';
      const total = document.createElement('strong'), streak = document.createElement('span'); streak.className = 'arcade-multiplier';
      row.append(label, total, streak); document.getElementById(`player-${i}`).append(row);
      this.values.push({ row, total, streak });
    }
    this.free = document.getElementById('arcade-free');
    this.toggle.addEventListener('click', () => this.setEnabled(!this.enabled));
    this.settings.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      this.reduced = button.dataset.effects === 'reduced'; write('pool.arcade.effects', this.reduced ? 'reduced' : 'full'); this.changed();
    }));
    this.motion.addEventListener('change', () => {
      if (read('pool.arcade.effects', '') === '') { this.reduced = this.motion.matches; this.changed(); }
    });
    this.sync();
  }
  setEnabled(enabled) { this.enabled = !!enabled; write('pool.arcade', this.enabled ? 'on' : 'off'); this.changed(); }
  changed() { this.sync(); this.onChange(); }
  sync() {
    this.toggle.setAttribute('aria-pressed', String(this.enabled));
    this.settings.hidden = !this.enabled;
    this.settings.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.effects === 'reduced') === this.reduced)));
    document.body.classList.toggle('arcade-on', this.enabled);
  }
  record(state, category, players) {
    if (!category || !state) return;
    const key = `pool.arcade.best.${ARCADE_VERSION}.${category}`;
    const before = Number(read(key, '0')) || 0, best = Math.max(before, ...players.map(i => state.totals[i]));
    if (best > before) write(key, String(best));
  }
  update({ state, preview, free, category, waiting = false, mixed = false }) {
    const enabled = this.enabled;
    for (let i = 0; i < 2; i++) {
      const { row, total, streak } = this.values[i]; row.hidden = !enabled || free;
      setText(total, state ? state.totals[i].toLocaleString() : '—');
      setText(streak, `×${multiplierFor(state?.streaks[i] || 0)}`);
    }
    this.free.hidden = !enabled || !free;
    setText(this.free.querySelector('strong'), state?.totals[0].toLocaleString() || '0');
    setText(this.free.querySelector('.arcade-multiplier'), `×${multiplierFor(state?.streaks[0] || 0)}`);
    this.receipt.hidden = !enabled || !state?.last;
    setText(this.receipt, arcadeSummary(state?.last));
    this.pending.hidden = !enabled || !preview;
    setText(this.pending, preview ? `This shot +${preview.total.toLocaleString()}${preview.fault ? ' · ' + (preview.fault === 'scratch' ? 'Scratch' : 'No points') : waiting ? ' · confirming…' : ' · pending'}` : '');
    const best = category ? Number(read(`pool.arcade.best.${ARCADE_VERSION}.${category}`, '0')) || 0 : 0;
    this.best.hidden = !enabled;
    setText(this.best, !state ? 'Arcade scoring begins next rack.' : mixed ? 'Mixed practice · personal bests use one mode per rack.' : `Personal best · ${best.toLocaleString()}`);
    return enabled && (!!state?.last || !!preview);
  }
}
