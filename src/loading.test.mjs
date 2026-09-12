import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoadingScreen } from './loading.js';

function screen() {
  const elements = {
    '#loading-status': { textContent: 'Loading game…' },
    '#loading-progress': { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } },
    '#loading-retry': { hidden: true },
  };
  const root = { hidden: false, querySelector: id => elements[id] };
  return { root, elements, loading: createLoadingScreen(root) };
}

test('startup reports completed milestones without going backwards', () => {
  const { elements, loading } = screen();
  assert.equal(elements['#loading-progress'].value, undefined, 'download starts indeterminate');
  loading.stage(1, 'Starting physics…');
  loading.stage(3, 'Loading balls…');
  loading.stage(2, 'Loading room…');
  assert.equal(elements['#loading-progress'].value, 3);
  assert.equal(elements['#loading-status'].textContent, 'Loading balls…');
  assert.equal(elements['#loading-progress'].attributes['aria-valuetext'], '3 of 4 startup steps complete');
});

test('finished startup stays dismissed when later room loads report progress', () => {
  const { root, elements, loading } = screen();
  loading.finish();
  loading.stage(3, 'Loading balls…');
  loading.fail();
  assert.equal(root.hidden, true);
  assert.equal(elements['#loading-progress'].value, 4);
  assert.equal(elements['#loading-retry'].hidden, true);
});

test('startup failure offers retry and cannot be hidden by late completion', () => {
  const { root, elements, loading } = screen();
  loading.fail();
  loading.stage(3, 'Loading balls…');
  loading.finish();
  assert.equal(root.hidden, false);
  assert.equal(elements['#loading-progress'].hidden, true);
  assert.equal(elements['#loading-retry'].hidden, false);
  assert.match(elements['#loading-status'].textContent, /couldn’t load/);
});
