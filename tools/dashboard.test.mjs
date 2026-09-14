import { test } from 'node:test';
import assert from 'node:assert/strict';
import { respond, DAYS, MODES } from './dashboard.mjs';
import { describeWranglerFailure } from './d1.mjs';
import { SETTINGS } from '../src/game-analytics.js';

// report() issues summary, daily, modes, outcomes and one query per setting.
const QUERIES = 4 + Object.keys(SETTINGS).length;
function stubDatabase(rows = {}) {
  const sent = [];
  return { sent, prepare: sql => ({ bind: (...values) => ({ sql, values }) }),
    async batch(queries) {
      sent.push(...queries);
      assert.equal(queries.length, QUERIES);
      return queries.map((query, i) => ({ results: i === 0 ? [rows.summary ?? { started: 3, finished: 1 }] : rows.list ?? [] }));
    } };
}
const params = search => new URLSearchParams(search);
const body = result => JSON.parse(result.body);

test('serves the dashboard page', async () => {
  const result = await respond('/', params(''), { database: stubDatabase(), html: () => '<!doctype html>page' });
  assert.equal(result.status, 200);
  assert.match(result.type, /text\/html/);
  assert.equal(result.body, '<!doctype html>page');
});

test('bundled page loads and requests the report', async () => {
  const result = await respond('/index.html', params(''), { database: stubDatabase() });
  assert.match(result.body, /<title>Astra Pool analytics<\/title>/);
  assert.match(result.body, /\/api\/report\?days=/);
});

test('reports the requested range and mode', async () => {
  const database = stubDatabase({ summary: { started: 9, finished: 4 } });
  const result = await respond('/api/report', params('days=30&mode=computer'), { database });
  assert.equal(result.status, 200);
  const data = body(result);
  assert.equal(data.days, 30);
  assert.equal(data.mode, 'computer');
  assert.equal(data.rangeLabel, 'Last 30 days');
  assert.equal(data.source, 'remote');
  assert.equal(data.summary.started, 9);
  assert.deepEqual(Object.keys(data.settings), Object.keys(SETTINGS));
  // The filter reaches SQL as a bound value, never as interpolated text.
  assert.ok(database.sent.every(query => query.values.includes('computer')));
});

test('defaults to seven days across all modes', async () => {
  const data = body(await respond('/api/report', params(''), { database: stubDatabase() }));
  assert.equal(data.days, 7);
  assert.equal(data.mode, 'all');
});

test('rejects filters outside the fixed set', async () => {
  for (const search of ['days=5', 'days=0', 'days=abc', 'mode=secret', "mode=all'--", 'days=30&mode=DROP']) {
    const result = await respond('/api/report', params(search), { database: stubDatabase() });
    assert.equal(result.status, 400, search);
    assert.match(body(result).error, /Invalid filter/);
  }
  for (const days of DAYS) for (const mode of MODES) {
    assert.equal((await respond('/api/report', params(`days=${days}&mode=${mode}`), { database: stubDatabase() })).status, 200);
  }
});

test('reports a query failure without crashing the server', async () => {
  const database = { prepare: sql => ({ bind: () => sql }), batch: async () => { throw new Error('Wrangler rejected the API token'); } };
  const result = await respond('/api/report', params('days=7'), { database });
  assert.equal(result.status, 502);
  assert.match(body(result).error, /API token/);
});

test('unknown paths are not found', async () => {
  const result = await respond('/games.json', params(''), { database: stubDatabase() });
  assert.equal(result.status, 404);
});

test('an unprivileged API token explains the fix', () => {
  // `wrangler --json` reports API failures on stdout, not stderr.
  const failure = { stdout: '\n{"error":{"text":"A request to the Cloudflare API failed.","notes":[{"text":"The given account is not valid or is not authorized to access this service [code: 7403]"}],"code":7403}}\n',
    stderr: 'Using "CF_API_TOKEN" environment variable. This is deprecated.\n',
    message: 'Command failed: node wrangler.js d1 execute astrapool-analytics --remote --json --command SELECT ...' };
  const message = describeWranglerFailure(failure, { CF_API_TOKEN: 'x', npm_lifecycle_event: 'analytics:dashboard' });
  assert.match(message, /not authorized to access this service/);
  // The hint names the command that actually failed.
  assert.match(message, /env -u CF_API_TOKEN npm run analytics:dashboard/);
  assert.match(describeWranglerFailure(failure, { CF_API_TOKEN: 'x' }), /npm run analytics$/);
  assert.doesNotMatch(message, /Command failed/);
  // Without a token in the environment there is nothing to unset, so only the API text shows.
  assert.doesNotMatch(describeWranglerFailure(failure, {}), /env -u/);
  assert.match(describeWranglerFailure(failure, {}), /not authorized/);
  // A stderr-only failure and a spawn failure still say something specific and short.
  assert.match(describeWranglerFailure({ stderr: '\x1b[31m✘ [ERROR] Authentication error [code: 10000]\n' }, { CLOUDFLARE_API_TOKEN: 'x' }), /CLOUDFLARE_API_TOKEN/);
  assert.match(describeWranglerFailure({ message: 'spawn ENOENT' }, {}), /^spawn ENOENT$/);
  assert.ok(describeWranglerFailure({ stdout: 'x'.repeat(5000), message: 'y'.repeat(5000) }, {}).length <= 600);
});
