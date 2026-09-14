import { report } from '../server/analytics.js';
import { wranglerDatabase } from './d1.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run analytics -- [--days 1|7|30|90] [--mode all|local|computer|free|online] [--json] [--local]');
  process.exit(0);
}
let days = 7, mode = 'all', json = false, local = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--days') days = Number(args[++i]);
  else if (args[i] === '--mode') mode = args[++i];
  else if (args[i] === '--json') json = true;
  else if (args[i] === '--local') local = true;
  else throw new Error(`Unknown option: ${args[i]}`);
}
if (![1, 7, 30, 90].includes(days) || !['all', 'local', 'computer', 'free', 'online'].includes(mode)) throw new Error('Invalid filter. Use --help.');
const database = wranglerDatabase({ local });
let data;
try { data = await report({ GAME_ANALYTICS: database }, days, mode); }
catch (error) { console.error(error.message); process.exit(1); }
if (json) console.log(JSON.stringify(data, null, 2));
else {
  const s = data.summary, started = Number(s.started || 0), finished = Number(s.finished || 0);
  console.log(`Astra Pool · last ${days} days · ${mode} · UTC`);
  console.log(`${started} started · ${finished} finished · ${started ? (100 * finished / started).toFixed(1) : '0.0'}% completed`);
  console.log(`${Number(s.ended || 0)} ended early · ${started - finished - Number(s.ended || 0)} unfinished or still playing`);
  console.log(`${Number(s.shots || 0)} shots · ${Number(s.avg_seconds || 0)}s average completed rack · ${Number(s.settings_changes || 0)} settings changes (local/computer/free)`);
  for (const [label, rows] of [['Daily starts (and their outcomes)', data.daily], ['Game modes', data.modes], ['Winners', data.outcomes],
    ...Object.entries(data.settings).map(([key, rows]) => [`Starting ${key}`, rows])]) {
    console.log(`\n${label}`); if (rows.length) console.table(rows); else console.log('No games yet.');
  }
}
