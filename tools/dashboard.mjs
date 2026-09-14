import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { report } from '../server/analytics.js';
import { wranglerDatabase } from './d1.mjs';

export const DAYS = [1, 7, 30, 90];
export const MODES = ['all', 'local', 'computer', 'free', 'online'];
const RANGE_LABELS = { 1: 'Last 24 hours', 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' };
const page = () => readFileSync(new URL('./dashboard.html', import.meta.url), 'utf8');

// The browser never reaches D1. It calls this local server, which runs the same
// fixed report queries as `npm run analytics` through Wrangler's login.
export async function respond(pathname, params, { database, source = 'remote', html = page } = {}) {
  const json = (status, body) => ({ status, type: 'application/json; charset=utf-8', body: JSON.stringify(body) });
  if (pathname === '/' || pathname === '/index.html') return { status: 200, type: 'text/html; charset=utf-8', body: html() };
  if (pathname !== '/api/report') return { status: 404, type: 'text/plain; charset=utf-8', body: 'Not found' };
  const days = Number(params.get('days') ?? 7), mode = params.get('mode') ?? 'all';
  if (!DAYS.includes(days) || !MODES.includes(mode)) {
    return json(400, { error: `Invalid filter. Days must be ${DAYS.join(', ')} and mode one of ${MODES.join(', ')}.` });
  }
  try {
    return json(200, { ...await report({ GAME_ANALYTICS: database }, days, mode), source, rangeLabel: RANGE_LABELS[days] });
  } catch (error) {
    return json(502, { error: error.message });
  }
}

function open(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  spawn(command, [url], { stdio: 'ignore', shell: process.platform === 'win32', detached: true }).on('error', () => {}).unref();
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help')) {
    console.log('Usage: npm run analytics:dashboard -- [--port 8788] [--local] [--no-open]');
    return null;
  }
  let port = 8788, local = false, launch = true;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port') port = Number(argv[++i]);
    else if (argv[i] === '--local') local = true;
    else if (argv[i] === '--no-open') launch = false;
    else throw new Error(`Unknown option: ${argv[i]}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const database = wranglerDatabase({ local, inheritStderr: false });
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const { status, type, body } = await respond(url.pathname, url.searchParams, { database, source: local ? 'local D1' : 'astrapool-analytics' });
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(body);
  });
  // Localhost only: the report is reachable from this machine, not the network.
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}`;
    console.log(`Astra Pool analytics: ${url}  (${local ? 'local D1' : 'remote astrapool-analytics'}; Ctrl+C to stop)`);
    if (launch) open(url);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
