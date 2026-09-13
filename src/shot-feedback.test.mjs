import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShotFeedback } from './shot-feedback.js';

function fixture(reduced = false) {
  const animations = [];
  const lines = [{ textContent: 'You pocketed the 3.', hidden: false }, { textContent: '+100 points', hidden: false }];
  const element = {
    hidden: true, children: [], ownerDocument: { createElement: () => ({}) },
    replaceChildren(...children) { this.children = children; },
    animate(frames, options) {
      let finish;
      const animation = { frames, options, finished: new Promise(resolve => { finish = resolve; }), finish: () => finish(), cancel() { this.cancelled = true; } };
      animations.push(animation); return animation;
    },
  };
  const feedback = new ShotFeedback(element, { querySelectorAll: () => lines }, { matches: reduced });
  feedback.update('local:rack1', 0);
  return { feedback, element, lines, animations };
}

test('new results appear once, hold, then fade upward and disappear', async () => {
  const { feedback, element, animations } = fixture();
  feedback.update('local:rack1', 1);
  assert.equal(element.hidden, false);
  assert.deepEqual(element.children.map(p => p.textContent), ['You pocketed the 3.', '+100 points']);
  const animation = animations[0];
  assert.equal(animation.frames[1].opacity, 1);
  assert.equal(animation.frames[1].offset, 0.8);
  assert.equal(animation.frames[2].transform, 'translateY(-16px)');
  feedback.update('local:rack1', 1);
  assert.equal(animations.length, 1);
  animation.finish(); await animation.finished;
  assert.equal(element.hidden, true);
  feedback.update('local:rack1', 1);
  assert.equal(element.hidden, true);
});

test('a repeated result on another play is new, but an old completion cannot hide it', async () => {
  const { feedback, element, animations } = fixture();
  feedback.update('local:rack1', 1);
  feedback.update('local:rack1', 2);
  assert.equal(animations.length, 2);
  assert.equal(animations[0].cancelled, true);
  animations[0].finish(); await animations[0].finished;
  assert.equal(element.hidden, false);
  animations[1].finish(); await animations[1].finished;
  assert.equal(element.hidden, true);
});

test('joining a rack or reconnecting does not replay historical details', () => {
  const { feedback, element, animations } = fixture();
  feedback.update('online:room:rack2', 9);
  feedback.update('online:room:rack2', 9);
  assert.equal(animations.length, 0);
  feedback.update('online:room:rack2', 10);
  assert.equal(element.hidden, false);
  feedback.update('online:room:rack3', 0);
  assert.equal(element.hidden, true);
});

test('hidden, replay, and dialog results are consumed without appearing afterward', () => {
  const { feedback, element, animations } = fixture();
  feedback.update('local:rack1', 1, true);
  feedback.update('local:rack1', 1, false);
  assert.equal(element.hidden, true);
  assert.equal(animations.length, 0);
});

test('reduced motion fades in place and disabled arcade text is omitted', () => {
  const { feedback, element, lines, animations } = fixture(true);
  lines[1].hidden = true;
  feedback.update('local:rack1', 1);
  assert.deepEqual(element.children.map(p => p.textContent), ['You pocketed the 3.']);
  assert.equal(animations[0].frames[2].transform, 'translateY(0)');
});
