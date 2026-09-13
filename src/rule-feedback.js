const diagrams = {
  'no-contact': '<circle cx="8" cy="16" r="4"/><circle cx="34" cy="16" r="5"/><path d="M15 16h8" stroke-dasharray="2 3"/><path d="m23 11 6 10m0-10-6 10"/>',
  'wrong-ball': '<circle cx="11" cy="16" r="4"/><path d="M16 16h7"/><circle cx="31" cy="16" r="7"/><path d="m26 21 10-10"/>',
  'no-rail': '<path d="M37 5v22M32 5v22M7 23l17-8m-4-3 5 3-2 5"/><circle cx="7" cy="23" r="3"/><path d="m26 7 4 4m0-4-4 4"/>',
  scratch: '<ellipse cx="22" cy="24" rx="12" ry="4"/><circle cx="22" cy="8" r="5"/><path d="M22 15v9m-4-4 4 4 4-4"/>',
  'off-table': '<path d="M5 26h31V14M23 20l11-13m-7 0h7v7"/><circle cx="13" cy="19" r="4"/>',
  break: '<path d="m22 5 12 20H10Zm-6 16 6-10 6 10Z"/><path d="M7 9a17 17 0 0 1 30 0M7 3v6h6"/>',
  'early-eight': '<circle cx="22" cy="16" r="11"/><path d="m14 24 16-16"/><circle cx="22" cy="13" r="3"/><circle cx="22" cy="19" r="3"/>',
  'wrong-pocket': '<ellipse cx="22" cy="20" rx="13" ry="7"/><path d="m17 15 10 10m0-10-10 10"/>',
};
export const foulLabels = {
  'no-contact': 'No object ball hit', 'wrong-ball': 'Wrong ball hit first', 'no-rail': 'No ball reached a cushion',
  scratch: 'Cue ball scratched', 'off-table': 'Ball left the table', break: 'Illegal break',
  'early-eight': '8-ball pocketed early', 'wrong-pocket': '8-ball in the wrong pocket',
};
const svg = body => `<svg viewBox="0 0 44 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const moveIcon = svg('<circle cx="22" cy="16" r="4"/><path d="M22 2v8m-3-5 3-3 3 3M22 22v8m-3-3 3 3 3-3M8 16h8m-5-3-3 3 3 3M28 16h8m-3-3 3 3-3 3"/>');

export class RuleFeedback {
  constructor() {
    this.badges = [0, 1].map(player => {
      const row = document.createElement('span'); row.className = 'rule-indicators';
      const foul = document.createElement('button'); foul.type = 'button'; foul.className = 'foul-indicator'; foul.hidden = true;
      foul.addEventListener('click', () => document.getElementById('open-match').click());
      const placement = document.createElement('span'); placement.className = 'placement-indicator'; placement.innerHTML = moveIcon;
      placement.setAttribute('role', 'img'); placement.setAttribute('aria-label', 'Ball in hand: move the cue ball to a clear spot');
      placement.title = 'Ball in hand'; placement.hidden = true;
      row.append(foul, placement); document.getElementById(`player-${player}`).append(row);
      return { row, foul, placement };
    });
  }
  update(match, { hidden = false } = {}) {
    for (let player = 0; player < 2; player++) {
      const { row, foul, placement } = this.badges[player];
      const info = match.lastFoul;
      foul.hidden = hidden || !info || info.player !== player;
      if (!foul.hidden && foul.dataset.kind !== info.kind) {
        foul.dataset.kind = info.kind;
        // The warning shape communicates a foul even before the diagram is learned.
        foul.innerHTML = '<svg class="foul-warning" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2 19 18H1Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 7v5m0 2v1" stroke="currentColor" stroke-width="2"/></svg>' + svg(diagrams[info.kind] || diagrams['no-contact']);
        foul.title = foulLabels[info.kind] || 'Foul';
        foul.setAttribute('aria-label', `${foul.title}. Show shot details`);
      }
      placement.hidden = hidden || !match.ballInHand || match.turn !== player || match.winner !== null;
      row.hidden = foul.hidden && placement.hidden;
    }
  }
}
