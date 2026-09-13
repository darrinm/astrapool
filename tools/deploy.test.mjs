import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const local = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.deploy;
const workflow = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const ci = workflow.slice(workflow.indexOf('          npm run heads:guard')).trim().replace(/^          /gm, '');
for (const [name, command] of [['local', local], ['CI', ci]]) {
  test(`${name} deploy continues after migration failure but stops for a failed guard`, t => {
    const dir = mkdtempSync(join(tmpdir(), 'pool-deploy-test-')); t.after(() => rmSync(dir, { recursive: true }));
    const log = join(dir, 'commands');
    const stub = '#!/bin/sh\nprintf "%s\\n" "$(basename "$0") $*" >> "$DEPLOY_TEST_LOG"\n[ "$*" != "$DEPLOY_TEST_FAIL" ]\n';
    for (const tool of ['npm', 'wrangler', 'npx']) writeFileSync(join(dir, tool), stub, { mode: 0o755 });
    const run = failure => {
      writeFileSync(log, '');
      const result = spawnSync('/bin/sh', ['-ec', command], { encoding: 'utf8',
        env: { ...process.env, PATH: dir + ':' + process.env.PATH, DEPLOY_TEST_LOG: log, DEPLOY_TEST_FAIL: failure } });
      return { ...result, commands: readFileSync(log, 'utf8') };
    };
    const migration = run('run analytics:migrate');
    assert.equal(migration.status, 0, migration.stderr);
    assert.match(migration.stdout, /[Ww]arning/); assert.match(migration.commands, /(?:wrangler deploy|npx --no-install wrangler deploy)/);
    const guard = run('run heads:guard');
    assert.notEqual(guard.status, 0); assert.doesNotMatch(guard.commands, /wrangler deploy/);
  });
}
