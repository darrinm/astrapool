import { highlightName } from './rack-results.js';

const number = n => n.toLocaleString();
const recordNames = { score: 'rack score', shot: 'best shot', streak: 'scoring streak' };

export class RackResultsView {
  constructor() {
    this.panel = document.getElementById('rack-results');
    this.signature = '';
  }
  update({ finished, free, winner, names, state, results, arcade, replaying, outcome }) {
    this.panel.hidden = !finished;
    document.body.classList.toggle('rack-finished', finished);
    if (!finished) { this.signature = ''; return; }
    const data = { free, winner, names, totals: state?.totals, best: results.best, longest: results.longest,
      complete: results.complete, records: results.records, arcade, outcome };
    const signature = JSON.stringify(data);
    document.getElementById('replay-best').hidden = !results.clip;
    if (signature === this.signature) return;
    const first = !this.signature;
    this.signature = signature;
    document.getElementById('results-title').textContent = free ? 'Table cleared!' : names[winner] === 'You' ? 'You won the rack!' : `${names[winner]} wins the rack!`;
    document.getElementById('results-context').textContent = !state ? 'Rack complete · highlights unavailable' : results.complete ? 'Rack complete' : 'Highlights since joining · earlier shots unavailable';
    document.getElementById('results-outcome').textContent = outcome;
    const scores = document.getElementById('results-scores');
    scores.hidden = !arcade || !state;
    scores.replaceChildren(...names.slice(0, free ? 1 : 2).map((name, p) => {
      const cell = document.createElement('div'); cell.className = 'results-player';
      if (!free && p === winner) cell.classList.add('results-winner');
      const label = document.createElement('span'); label.textContent = name;
      const score = document.createElement('strong'); score.textContent = number(state?.totals[p] ?? 0);
      const streak = document.createElement('span'); streak.className = 'results-streak';
      streak.textContent = `${results.longest[p]}-shot ${results.complete ? 'best' : 'observed'} streak`;
      cell.append(label, score, streak); return cell;
    }));
    document.getElementById('results-highlight').textContent = results.best ?
      `${free ? '' : names[results.best.player] + ' · '}${highlightName(results.best)}${arcade ? ' · +' + number(results.best.total) : ''}` : 'No scoring shots this rack.';
    const records = new Map();
    for (const record of results.records || []) records.set(record.player, [...(records.get(record.player) || []), recordNames[record.field]]);
    document.getElementById('results-records').textContent = arcade ? [...records].map(([p, fields]) =>
      `${free || names[p] === 'You' ? 'New personal best' : names[p] + ' personal best'} · ${fields.join(', ')}`).join(' / ') : '';
    document.getElementById('results-records').hidden = !document.getElementById('results-records').textContent;
    document.getElementById('results-score-label').hidden = scores.hidden;
    if (first && !replaying && !document.querySelector('dialog[open]')) document.getElementById('results-title').focus({ preventScroll: true });
  }
}
