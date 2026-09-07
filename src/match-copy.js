// Presentation shared by the local referee and persisted online snapshots.
const ballList = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
export function shotSummary(previous, shot, result) {
  const { state, rerack, respot } = result;
  const pots = shot.pocketed.map(p => p.number).filter(n => n !== 0);
  const list = ballList.format(pots.map(String));
  let summary = pots.length ? `Player ${previous.turn + 1} pocketed ${pots.length === 1 ? 'the ' : ''}${list}.` : `Player ${previous.turn + 1} pocketed no balls.`;
  if (!pots.length && shot.pocketed.some(p => p.number === 0)) summary = `Player ${previous.turn + 1} scratched the cue ball.`;
  if (rerack || state.ballInHand || state.winner !== null) return `${summary} ${state.message}`;
  if (respot.includes(8)) summary += ' The 8-ball was spotted.';
  if (previous.breaking) summary += ' Groups are assigned after the break.';
  else if (!previous.groups[0] && state.groups[0]) summary += ` Player ${previous.turn + 1} claimed ${state.groups[previous.turn]}.`;
  else if (!state.groups[0] && pots.length) summary += ' Both groups were pocketed; groups are still unassigned.';
  return summary;
}

export function playerName(player, mode, seat = null) {
  if (mode === 'computer') return player === 0 ? 'You' : 'Computer';
  if (mode === 'online' && seat !== null) return player === seat ? 'You' : 'Friend';
  return `Player ${player + 1}`;
}

export function playerText(text, mode, seat = null) {
  return text.replace(/Player ([12])(’s| wins| continues| breaks| to break| shooting)?/g, (_, number, suffix = '') => {
    const name = playerName(Number(number) - 1, mode, seat);
    if (name === 'You') {
      if (suffix === '’s') return 'Your';
      if (suffix === ' to break') return 'Your break';
      return name + ({ ' wins': ' win', ' continues': ' continue', ' breaks': ' break', ' shooting': ' are shooting' }[suffix] || suffix);
    }
    if (suffix === ' shooting') return `${name} is shooting`;
    return name + suffix;
  });
}

export function groupLabel(group, down) {
  if (!group) return 'Groups not assigned';
  const start = group === 'solids' ? 1 : 9;
  const remaining = Array.from({ length: 7 }, (_, i) => start + i).filter(n => !down.includes(n)).length;
  return remaining ? `${group} · ${remaining} remaining` : `${group} cleared · 8-ball next`;
}
