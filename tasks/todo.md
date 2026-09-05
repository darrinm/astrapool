# Playful Pool — plan

Extracted from playful-photos on 2026-09-05: the Pool scene, its physics module and harness, textures, ball caps,
sampled audio, the 14 head maps, and the sound-effect pipeline. The head-map pipeline stays in playful-photos.

## Extraction
- [x] Single-scene app: `src/main.js` runs the pool scene only (no scene bar, no V key, no hash routing)
- [x] `src/core.js` trimmed to what pool uses (no thin-box walls, grid cells, head picking, pointer velocity)
- [x] `pipeline/` keeps `sfx.py`, `sfx_analyze.py`, `falenv.py`, raw takes; output path is `public/sfx/`
- [x] `npm run physics-test` and `npm run build` pass in the new tree

## Pool: pocket backs (2026-09-05)
- [x] Reproduce headlessly: fast ball skips the side pocket hole and lands on the felt under the rail
- [x] Pocket wells and backstop moved to `physics/poolphysics.js`; rail-side casting colliders rise to rail height and lean 15° over the hole
- [x] Well colliders use the shared combine rules (restitution was averaging to 0.6 instead of 0.2)
- [x] Off-table rule: a ball resting beyond the cushion line is pocketed/respotted like a scratch
- [x] Harness: pocket sweep (312 shots into all six pockets, none end under the rail) and a 5.7 m/s straight side-pocket shot drops in

## Pool: sampled sound effects (2026-09-05)
- [x] `pipeline/sfx.py`: 7 categories × 1–4 takes from fal `fal-ai/elevenlabs/sound-effects/v2` (pcm_44100 comes back as interleaved stereo with a 1 ms click at each end)
- [x] `pipeline/sfx_analyze.py`: onset, attack, T40, spectral centroid, ASCII envelope; rejects quiet takes and double hits; trims, fades, normalises; writes `app/public/sfx/manifest.json`
- [x] `src/sounds.js`: sample player (random take, pitch/brightness/level by strength), synth kept behind `mode`
- [x] Rolling bed removed (user: sounded like marbles; a ball on cloth is near silent)
- [x] `audition.html`: per-event samples vs synth, individual takes, blind A/B with score (dev: http://localhost:5180/audition.html)
- [ ] User's verdict: which takes to keep, whether the clicks are too dark / too roomy (measured centroid 2.2–2.9 kHz, T40 66–375 ms vs 4–8 kHz, 20–60 ms for a real close-miked click); if too roomy, tighten tails with a decay window in sfx_analyze.py

## Pool: lamp fixture (2026-09-05)
- [x] Fixture (shade, panel, cords) fades out as the camera rises from 7 to 2 units below the lamp, so a top-down view is never blocked; the lights stay

