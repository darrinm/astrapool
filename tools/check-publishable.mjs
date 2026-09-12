#!/usr/bin/env node
// Pre-publication gate: run this before making the repository public.
//
// Untracking the head textures is not enough. They were added in the first
// commit, and every earlier commit still holds the blobs — a public repository
// publishes its whole history, so `git rm` leaves all fourteen readable.
//
// To remove them, mirror from the REMOTE (a mirror of a local clone can carry
// extra local refs, see below), rewrite, and force-push. Every commit SHA
// changes, so everyone with a clone must re-clone:
//
//   git clone --mirror https://github.com/darrinm/pool.git pool-mirror
//   cd pool-mirror
//   git filter-repo --path public/heads --invert-paths
//   git push --force --mirror
//
// Reachability is measured with `rev-list --objects --all`, which walks every
// ref under refs/. `git log --all` is not equivalent: on a repository whose
// blobs survived only under a non-standard ref (refs/codex/… checkpoints
// written by another tool) `git log --all` reported nothing and this gate
// passed while all fourteen textures were still readable. Ask for objects.

import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const PREFIX = 'public/heads/';
const failures = [];

const tracked = git('ls-files', PREFIX).trim();
if (tracked) failures.push(`Tracked in the working tree:\n  ${tracked.split('\n').join('\n  ')}`);

// Every object reachable from any ref whose path is under public/heads/.
const reachable = (ref) =>
  git('rev-list', '--objects', ref)
    .split('\n')
    .map((l) => l.slice(41))
    .filter((p) => p.startsWith(PREFIX));

const all = new Set(reachable('--all'));
if (all.size) {
  // Name the refs that keep them alive, so the fix is obvious.
  const refs = git('for-each-ref', '--format=%(refname)').trim().split('\n').filter(Boolean);
  const holding = refs.filter((r) => {
    try {
      return reachable(r).length > 0;
    } catch {
      return false;
    }
  });
  failures.push(
    `${all.size} head textures are reachable in history.\n` +
      `  Kept alive by:\n    ${holding.join('\n    ')}\n` +
      `  Making the repository public would publish all of them.`,
  );
}

if (failures.length) {
  console.error('NOT PUBLISHABLE\n');
  for (const f of failures) console.error(f + '\n');
  console.error('See the comment at the top of tools/check-publishable.mjs for the fix.');
  process.exit(1);
}
console.log(`publishable: no file under ${PREFIX} is tracked or reachable from any ref`);
