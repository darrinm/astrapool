import { analyticsSettings, SETTINGS } from '../src/game-analytics.js';

const DAY = 86400000, MAX_BODY = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
export function validateGame(value, now = Date.now()) {
  const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
  if (!value || !UUID.test(value.id) || !['local', 'computer', 'free'].includes(value.mode) ||
      !integer(value.version, 1, 1000000) || !integer(value.startedAt, now - 30 * DAY, now + 300000) ||
      !integer(value.shots, 1, 100000) || !integer(value.durationMs, 0, 30 * DAY) ||
      !integer(value.settingsChanges, 0, 100000) || !integer(value.score, 0, 1000000000)) throw new Error('Invalid game');
  for (const key of ['finishedAt', 'endedAt']) if (value[key] !== null && !integer(value[key], value.startedAt, now + 300000)) throw new Error('Invalid time');
  const outcomes = value.mode === 'computer' ? ['player', 'computer'] : value.mode === 'free' ? ['cleared'] : ['player1', 'player2'];
  if (value.finishedAt !== null ? !outcomes.includes(value.outcome) || value.endedAt !== null || value.endReason !== null : value.outcome !== null) throw new Error('Invalid outcome');
  if (value.endedAt !== null ? !['switch', 'restart', 'page_exit'].includes(value.endReason) : value.endReason !== null) throw new Error('Invalid end');
  return { id: value.id, mode: value.mode, version: value.version, startedAt: value.startedAt, finishedAt: value.finishedAt,
    endedAt: value.endedAt, shots: value.shots, durationMs: value.durationMs, outcome: value.outcome, endReason: value.endReason,
    initialSettings: analyticsSettings(value.initialSettings), settings: analyticsSettings(value.settings),
    settingsChanges: value.settingsChanges, score: value.score };
}

export async function writeGame(env, game, source = 'browser') {
  if (!env.GAME_ANALYTICS) return;
  await env.GAME_ANALYTICS.prepare(`INSERT INTO games
    (id, source, mode, version, started_at, finished_at, ended_at, updated_at, shots, duration_ms, outcome, end_reason, initial_settings, settings, settings_changes, score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET version=excluded.version, finished_at=excluded.finished_at, ended_at=excluded.ended_at,
      updated_at=excluded.updated_at, shots=MAX(games.shots, excluded.shots), duration_ms=MAX(games.duration_ms, excluded.duration_ms),
      outcome=excluded.outcome, end_reason=excluded.end_reason, settings=excluded.settings,
      settings_changes=MAX(games.settings_changes, excluded.settings_changes), score=excluded.score
    WHERE excluded.version > games.version AND excluded.source = games.source AND excluded.mode = games.mode
      AND games.finished_at IS NULL AND games.ended_at IS NULL`)
    .bind(game.id, source, game.mode, game.version, game.startedAt, game.finishedAt, game.endedAt, Date.now(), game.shots,
      game.durationMs, game.outcome, game.endReason, JSON.stringify(game.initialSettings), JSON.stringify(game.settings), game.settingsChanges, game.score).run();
}

export async function readBoundedJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Expected JSON');
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new Error('Too large');
  const reader = request.body?.getReader(); if (!reader) throw new Error('Missing body');
  const chunks = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > MAX_BODY) { await reader.cancel(); throw new Error('Too large'); } chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function report(env, days = 7, mode = 'all', now = Date.now()) {
  const since = now - days * DAY;
  const where = 'started_at >= ? AND (? = \'all\' OR mode = ?)';
  const prepare = sql => env.GAME_ANALYTICS.prepare(sql).bind(since, mode, mode);
  const metrics = 'COUNT(*) AS started, COALESCE(SUM(finished_at IS NOT NULL), 0) AS finished, COALESCE(SUM(ended_at IS NOT NULL), 0) AS ended, COALESCE(SUM(shots), 0) AS shots, ROUND(AVG(CASE WHEN finished_at IS NOT NULL THEN duration_ms END)/1000) AS avg_seconds';
  const queries = [
    prepare(`SELECT ${metrics}, COALESCE(SUM(settings_changes), 0) AS settings_changes FROM games WHERE ${where}`),
    prepare(`SELECT strftime('%Y-%m-%d', started_at/1000, 'unixepoch') AS day, ${metrics} FROM games WHERE ${where} GROUP BY day ORDER BY day`),
    prepare(`SELECT mode AS name, ${metrics} FROM games WHERE ${where} GROUP BY mode ORDER BY started DESC`),
    prepare(`SELECT outcome AS name, COUNT(*) AS count FROM games WHERE ${where} AND finished_at IS NOT NULL GROUP BY outcome ORDER BY count DESC`),
    ...Object.keys(SETTINGS).map(key => prepare(`SELECT COALESCE(json_extract(initial_settings, '$.${key}'), 'unknown') AS name, ${metrics} FROM games WHERE ${where} GROUP BY name ORDER BY started DESC`)),
  ];
  const results = await env.GAME_ANALYTICS.batch(queries);
  return { days, mode, generatedAt: now, summary: results[0].results[0], daily: results[1].results, modes: results[2].results,
    outcomes: results[3].results, settings: Object.fromEntries(Object.keys(SETTINGS).map((key, i) => [key, results[i + 4].results])) };
}

export async function handleAnalytics(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/analytics/game' && request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return new Response('Origin not allowed', { status: 403, headers });
    if (!env.GAME_ANALYTICS) return new Response(null, { status: 204, headers });
    if (env.ANALYTICS_RATE_LIMIT && !(await env.ANALYTICS_RATE_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' })).success) {
      return new Response('Too many requests', { status: 429, headers });
    }
    let game;
    try { game = validateGame(await readBoundedJSON(request)); }
    catch { return Response.json({ error: 'Invalid game record' }, { status: 400, headers }); }
    await writeGame(env, game);
    return new Response(null, { status: 204, headers });
  }
  return new Response('Not found', { status: 404, headers });
}
