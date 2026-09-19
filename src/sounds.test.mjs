import test from 'node:test';
import assert from 'node:assert/strict';
import { PoolAudio } from './sounds.js';

function mockAudio(t, manifest, failed = null) {
  const saved = { window: globalThis.window, fetch: globalThis.fetch, requestIdleCallback: globalThis.requestIdleCallback };
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  const stats = { decodes: [], requests: [], resumes: 0, starts: 0, active: 0, peak: 0, contexts: 0 };
  const node = () => ({ gain: {}, pan: {}, frequency: {}, Q: {}, playbackRate: {}, connect() { return this; }, start() { stats.starts++; } });
  globalThis.window = { AudioContext: class {
    constructor() { stats.contexts++; this.state = 'suspended'; this.sampleRate = 100; this.destination = {}; }
    createGain = node;
    createConvolver = node;
    createStereoPanner = node;
    createBufferSource = node;
    createBiquadFilter = node;
    createBuffer(ch, length) { return { getChannelData: () => new Float32Array(length) }; }
    async decodeAudioData(data) {
      stats.active++; stats.peak = Math.max(stats.peak, stats.active);
      await new Promise(resolve => setTimeout(resolve, 1));
      stats.active--; stats.decodes.push(data); return { decoded: data };
    }
    async resume() { stats.resumes++; this.state = 'running'; }
  } };
  globalThis.fetch = async url => {
    stats.requests.push(url);
    return { ok: !url.endsWith(failed ?? '!'), status: 404, json: async () => manifest, arrayBuffer: async () => url };
  };
  globalThis.requestIdleCallback = callback => { stats.idle = callback; };
  return stats;
}

test('background preparation decodes all categories without unlocking or playing audio', async t => {
  const stats = mockAudio(t, { cueTip: ['tip.wav', 'tip2.wav'], cushion: ['rail.wav'] });
  const audio = new PoolAudio();
  const ready = audio.preload();
  assert.equal(audio.preload(), ready);
  assert.equal(stats.contexts, 0, 'graph construction waits until idle');
  stats.idle();
  await ready;
  assert.deepEqual(stats.decodes, ['/sfx/tip.wav', '/sfx/rail.wav', '/sfx/tip2.wav']);
  assert.equal(stats.peak, 1, 'decodes are spread out rather than launched together');
  assert.equal(stats.resumes, 0);
  assert.equal(stats.starts, 0);
  const requestCount = stats.requests.length;
  audio.cueTip(0.5, 0, 0);
  audio.cushion(0.5, 0, 0);
  await audio.load();
  assert.equal(stats.resumes, 1);
  assert.equal(stats.starts, 2);
  assert.equal(stats.requests.length, requestCount, 'first playback uses prepared samples');
  assert.equal(stats.decodes.length, 3);
});

test('an early gesture and pending preload share a single load', async t => {
  const stats = mockAudio(t, { cueTip: ['tip.wav'] });
  const audio = new PoolAudio();
  const ready = audio.preload();
  audio.ensure();
  stats.idle();
  await ready;
  assert.equal(stats.contexts, 1);
  assert.deepEqual(stats.requests, ['/sfx/manifest.json', '/sfx/tip.wav']);
  assert.equal(stats.resumes, 1);
});

test('one failed sample does not prevent other takes and categories loading', async t => {
  const stats = mockAudio(t, { cueTip: ['bad.wav', 'tip.wav'], cushion: ['rail.wav'] }, 'bad.wav');
  const warn = console.warn;
  console.warn = () => {};
  t.after(() => { console.warn = warn; });
  const audio = new PoolAudio();
  await audio.load();
  assert.equal(audio.buffers.cueTip.length, 1);
  assert.equal(audio.buffers.cushion.length, 1);
  assert.deepEqual(stats.decodes, ['/sfx/rail.wav', '/sfx/tip.wav']);
});
