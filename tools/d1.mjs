import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Reporting runs through Wrangler's existing login, so no analytics credential is
// shipped to the game, written to disk, or exposed on a public URL. Only fixed
// SELECT queries and validated filters reach the database.
export function wranglerDatabase({ local = false, inheritStderr = true } = {}) {
  return {
    prepare(sql) {
      return { bind(...values) { let i = 0; return sql.replace(/\?/g, () => {
        const value = values[i++]; return typeof value === 'number' ? String(value) : `'${value.replaceAll("'", "''")}'`;
      }); } };
    },
    async batch(queries) {
      let stdout;
      try {
        stdout = execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'astrapool-analytics',
          local ? '--local' : '--remote', '--json', '--command', queries.join(';\n')], {
          cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
          env: { ...process.env, CLOUDFLARE_SEND_METRICS: 'false' },
          stdio: ['ignore', 'pipe', inheritStderr ? 'inherit' : 'pipe'],
        });
      } catch (error) {
        throw new Error(describeWranglerFailure(error), { cause: error });
      }
      return JSON.parse(stdout);
    },
  };
}

const AUTH = /not authoriz|unauthoriz|authenticat|permission|code: (7403|10000|10001)/i;
const strip = text => (typeof text === 'string' ? text : '').replace(/\x1b\[[0-9;]*m/g, '');

// `wrangler --json` reports API failures as a JSON object on stdout, so the useful
// text is neither in stderr nor in the "Command failed: ..." message Node builds.
export function describeWranglerFailure(error, env = process.env) {
  const stdout = strip(error.stdout), stderr = strip(error.stderr);
  const start = stdout.indexOf('{');
  let message = '';
  if (start !== -1) {
    try {
      const reported = JSON.parse(stdout.slice(start)).error;
      message = [reported?.text, ...(reported?.notes ?? []).map(note => note?.text)].filter(Boolean).join(' ');
    } catch { /* not the JSON error envelope; fall through to the text below */ }
  }
  message ||= stderr.split('\n').map(line => line.trim()).filter(line => /ERROR|Error:/.test(line)).join(' ');
  message ||= strip(error.message).split('\n')[0] || 'Wrangler failed';
  const tokens = ['CF_API_TOKEN', 'CLOUDFLARE_API_TOKEN'].filter(name => env[name]);
  // Wrangler prefers these over an OAuth login, so a token without D1 access fails
  // even where `wrangler login` would have worked.
  if (tokens.length && AUTH.test(message + stderr)) {
    const script = env.npm_lifecycle_event || 'analytics';
    message += ` Wrangler is using the API token in ${tokens.join(' and ')}. Give that token Account / D1 / Read, or run without it: ` +
      `env ${tokens.map(name => `-u ${name}`).join(' ')} npm run ${script}`;
  }
  return message.slice(0, 600);
}
