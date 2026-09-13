import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWelcome } from './welcome.js';

class Element extends EventTarget {
  constructor() { super(); this.open = false; this.hidden = false; this.dataset = {}; }
  append(child) { child.parentElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  closest(selector) { return selector === '[data-game]' && this.dataset.game ? this : null; }
}
function setup(t, mode = 'computer') {
  const previous = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  t.after(() => Object.assign(globalThis, previous));
  const welcome = new Element(), sheet = new Element(), settings = new Element(), home = new Element(), modes = new Element();
  home.append(settings);
  const local = new Element(); local.dataset.game = 'local';
  welcome.querySelector = () => new Element();
  welcome.querySelectorAll = () => [local];
  globalThis.document = { getElementById: id => ({ welcome, 'hud-sheet': sheet, 'open-settings': settings, 'game-mode': modes })[id] };
  globalThis.matchMedia = () => ({ matches: true });
  const starts = [], state = { mode, attract: false }, keys = [];
  const game = { matchState: () => state, controls: () => null,
    startAttract: () => { state.attract = true; },
    setGame: selected => { starts.push(selected); state.mode = selected; state.attract = false; },
    key: key => keys.push(key) };
  settings.addEventListener('click', () => sheet.showModal());
  connectWelcome(game);
  return { welcome, sheet, settings, home, modes, local, starts, state, keys };
}

test('opening and closing settings preserves the attract visit and never starts a game', t => {
  const { welcome, sheet, settings, starts, state } = setup(t);
  for (let i = 0; i < 2; i++) {
    settings.dispatchEvent(new Event('click'));
    assert.equal(sheet.open, true); assert.equal(welcome.open, true);
    assert.equal(state.attract, true); assert.deepEqual(starts, []);
    sheet.close();
    assert.equal(welcome.open, true); assert.equal(settings.parentElement, welcome);
    assert.equal(state.attract, true); assert.deepEqual(starts, []);
  }
});
test('an explicit settings game choice ends attract once and closes both dialogs', t => {
  const { welcome, sheet, settings, home, modes, starts, state } = setup(t);
  settings.dispatchEvent(new Event('click'));
  const button = new Element(); button.dataset.game = 'online';
  const event = new Event('click'); Object.defineProperty(event, 'target', { value: button });
  let propagated = false;
  modes.addEventListener('click', () => { propagated = true; });
  modes.dispatchEvent(event);
  assert.deepEqual(starts, ['online']); assert.equal(propagated, false);
  assert.equal(state.attract, false); assert.equal(welcome.open, false); assert.equal(sheet.open, false);
  assert.equal(settings.parentElement, home);
  // The temporary capture handler must not swallow later in-game choices.
  modes.dispatchEvent(new Event('click'));
  assert.equal(propagated, true); assert.deepEqual(starts, ['online']);
});
test('welcome game choices finish the visit exactly once despite the close event', t => {
  const { welcome, local, starts, settings, home } = setup(t);
  local.dispatchEvent(new Event('click'));
  welcome.dispatchEvent(new Event('close'));
  assert.deepEqual(starts, ['local']); assert.equal(settings.parentElement, home);
});
test('Escape keeps the default game behavior', t => {
  const { welcome, starts } = setup(t);
  welcome.dispatchEvent(new Event('cancel', { cancelable: true }));
  assert.deepEqual(starts, ['computer']); assert.equal(welcome.open, false);
});
test('restored online games skip attract and leave settings in the HUD', t => {
  const { welcome, settings, home, starts, state } = setup(t, 'online');
  assert.equal(welcome.open, false); assert.equal(state.attract, false);
  assert.equal(settings.parentElement, home); assert.deepEqual(starts, []);
});
