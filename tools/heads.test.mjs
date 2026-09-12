// The private head textures must stay out of the repository.
//
// public/heads/ holds photographs of identifiable people. They are kept in a
// store outside the repository (tools/heads.mjs) and restored into the working
// tree for private builds. Because a restored working tree looks exactly like
// the old tracked one, nothing but a check like this stops a stray `git add -A`
// from committing them back — and a commit is enough, since anyone can read a
// public repository's history.
//
// These assertions ask git, rather than reading .gitignore as text, so they
// test the behaviour that actually decides what gets committed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });

test('no head texture is tracked', () => {
  const tracked = git('ls-files', 'public/heads').trim();
  assert.equal(tracked, '', `these are tracked and would be published:\n${tracked}`);
});

test('git ignores the head textures, so `git add -A` cannot stage them', () => {
  // check-ignore exits 1 when the path is NOT ignored, so a throw is the failure.
  const ignored = (path) => {
    try {
      git('check-ignore', '-q', path);
      return true;
    } catch {
      return false;
    }
  };
  assert.ok(ignored('public/heads/p01.jpg'), 'public/heads/p01.jpg is not ignored');
  assert.ok(ignored('public/heads/anything.jpg'), 'a new file in public/heads is not ignored');
});
