#!/usr/bin/env node
// Move the private head textures in and out of the working tree.
//
// public/heads/ is gitignored: the textures are photographs of identifiable
// people and are not part of the public repository. The game does not need
// them — the head balls fall back to plain colours when the files are absent,
// and numbered balls are the default appearance either way — so a public
// checkout builds and plays without ever running this.
//
// The canonical copy lives outside the repository so that no git operation
// inside it can put the files back into history. $POOL_HEADS_DIR overrides the
// default location.
//
//   node tools/heads.mjs status    what is in the store and the working tree
//   node tools/heads.mjs stash     working tree -> store (first-time setup)
//   node tools/heads.mjs restore   store -> working tree (before a private build)
//   node tools/heads.mjs clear     remove them from the working tree
//   node tools/heads.mjs guard     exit non-zero if any are present (public deploy)

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const tree = join(repo, 'public', 'heads');
const store = process.env.POOL_HEADS_DIR || join(homedir(), '.pool-heads');

const isTexture = (f) => /^p\d+\.jpg$/.test(f);
const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter(isTexture).sort() : []);
const bytes = (dir, files) => files.reduce((n, f) => n + statSync(join(dir, f)).size, 0);

function describe(label, dir) {
  const files = list(dir);
  if (!files.length) return `${label}: empty (${dir})`;
  return `${label}: ${files.length} textures, ${(bytes(dir, files) / 1e6).toFixed(1)} MB (${dir})`;
}

function copy(from, to, label) {
  const files = list(from);
  if (!files.length) {
    console.error(`Nothing to ${label}: no p*.jpg in ${from}`);
    if (from === store) {
      console.error(`\nThe store is empty. If the textures are still in the working tree, run:\n  npm run heads:stash`);
    }
    process.exit(1);
  }
  mkdirSync(to, { recursive: true });
  for (const f of files) cpSync(join(from, f), join(to, f));
  console.log(`${label}: copied ${files.length} textures to ${to}`);
}

const command = process.argv[2] || 'status';

if (command === 'status') {
  console.log(describe('store      ', store));
  console.log(describe('working set', tree));
} else if (command === 'stash') {
  copy(tree, store, 'stash');
  console.log('The working tree copy is untouched; `npm run heads:clear` removes it.');
} else if (command === 'restore') {
  copy(store, tree, 'restore');
  console.log('A build from this checkout will now include them. They stay out of git.');
} else if (command === 'clear') {
  if (!list(store).length) {
    console.error(`Refusing to clear: the store at ${store} is empty, so this would lose the only copy.`);
    console.error('Run `npm run heads:stash` first, or set POOL_HEADS_DIR to the store.');
    process.exit(1);
  }
  if (!existsSync(tree)) {
    console.log('Already clear.');
  } else {
    rmSync(tree, { recursive: true, force: true });
    console.log(`clear: removed ${tree}`);
  }
} else if (command === 'guard') {
  // The public deploy must never ship them. A restored working tree looks
  // exactly like the old tracked one, so `npm run deploy` right after
  // `npm run deploy:private` would otherwise publish them to the public site.
  const present = list(tree);
  if (present.length) {
    console.error(`Refusing to build for a public deploy: ${present.length} head textures are in ${tree}.`);
    console.error('Run `npm run heads:clear` first, or use `npm run deploy:private` if you meant to include them.');
    process.exit(1);
  }
  console.log('guard: no head textures in the working tree');
} else {
  console.error(`Unknown command "${command}". Use: status | stash | restore | clear | guard`);
  process.exit(1);
}
