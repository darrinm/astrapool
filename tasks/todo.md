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


## Pool: drag & fling momentum (2026-09-05)
- [x] Reproduced in Chrome with synthetic pointer events: a constant-speed release flings at the 225 u/s cap every time, but the same sweep with a human-like slowing, jittery tail before the button comes up flung at ~9 u/s (the ball barely rolled)
- [x] `src/fling.js`: the throw is the fastest recent 80 ms window of movement (decayed by the pause since it), not the motion in the last 80 ms before release; a full 300 ms hold still places the ball
- [x] `physics/fling.test.mjs`: 10 cases incl. slowing release, sub-pixel rest jitter, faded long tail (`node --test physics/fling.test.mjs`)
- [x] Real cause (from the user's own event stream, captured by a temporary reporter): their Chrome fires `lostpointercapture` (buttons=0) before pointerup, and main.js treated it as a cancel → ball zeroed. `src/main.js` now treats a lost capture with no button held as the release (fling / shoot); only a capture lost mid-press cancels
- [x] Simplified after the fix: cursor reset lives in endDrag/endAim only, pointermove uses early returns, pointer samples use `e.timeStamp` directly, and endDrag no longer releases capture by hand (the browser releases it on pointerup). Verified flings and cue shots in both lostpointercapture orders. Speed caps left as they are (user: "it's fun")
- [x] /simplify pass (4 reviewers): adapter owns cursor + pointer identity and delivers one completion per gesture (scene drops pointerId bookkeeping); `endGesture()` replaces five `endDrag(); endAim();` pairs; `onTable`/`cueReady` predicates; `pushSample` and the release time move into fling.js; leftover zero-movement guard deleted; `MAX_SPEED` shared with the cue strike; `wireOnce` for the two button groups; `#mode` styled by aria-pressed only. Skipped: full gesture-object refactor, Vector2.clampLength, per-step scratch objects (micro)

## Complete gameplay stages (2026-09-06)
- [x] Stage 1: local two-player house 8-ball, turn and group HUD, fouls, ball-in-hand, called 8, wins, rematch, Free Play.
- [x] Stage 1 validation: 40 unit tests, 26 physics checks, production build; Chrome break → scratch → placement → early 8 loss → rematch, all 16 balls restored.
- [x] Stage 2: computer opponent with difficulty selection and the same match rules.
- [x] Stage 3: private invite-link online matches, reconnects, interrupted-shot rollback, mutual rematches, and CI deployment checks.

- [x] Stage 2 validation: 47 tests; Chrome computer break and four following shots pocketed seven balls, assigned groups, and returned a legal turn to the human.

- [x] Stage 3 validation: 53 unit tests, 26 physics checks, real Worker/WebSocket lifecycle test, production build and Wrangler dry run. Two isolated Chrome sessions synchronized a real break and retained seats after refresh. Mobile HUD verified at 390 × 844; Balls is the default.

## HUD review: desktop, mobile and dialogs (2026-09-07)
Driven in Chrome at 1440×900, 390×844 and 844×390; offsets and contrast measured from the live DOM
and the WebGL framebuffer rather than judged from screenshots.

### Critical
- [x] Pocket call was a 3×2 word grid while the six pockets project 2×3 on a phone — a 90° transpose,
      and "break end on the left" was false in portrait. Now a schematic table; `layoutPocketMap()`
      orients it from the projected pocket centres, so no copy explains the orientation.
- [x] Status line sat on the canvas with only a text-shadow: 1.57:1 over The Glasshouse floor. It now
      has the same panel every other cluster has — 9.33:1 worst case.
- [x] `resize()` called `overheadView()` → `endGesture()`, so a URL-bar collapse (a resize with no size
      change) cancelled the shot being aimed and reset the camera. It now ignores unchanged viewports
      and never runs during a gesture.
- [x] Portrait and short landscape were forced overhead, so phones never saw the room. Both now open on
      an angled view framed for their aspect; Overhead stays one tap away.

### High
- [x] `text-transform: capitalize` title-cased whole sentences ("Groups Not Assigned"); `groupLabel()`
      capitalises the group name instead
- [x] Top bar is a three-column grid, so the match score is centred like the free-play score (was −52px)
- [x] Guidance ordered last in `.bottom-hud`: hiding the setup dock no longer moves it (was a 158px jump)
- [x] Compact bar, guidance and spin panel now share one bottom line
- [x] Borrowed panels hide their own heading inside the sheet (no more doubled titles)
- [x] `.quiet-button` has a resting surface — :hover never fires on touch
- [x] Sheet actions are a grid; the destructive "New rack" gets its own row
- [x] Help leads with the controls; rules collapsed; keyboard rows hidden under `(hover: none)`
- [x] Sheet is bottom-anchored on compact viewports
- [x] Spin names the contact point ("Top right") and the ball shows the clamp ring

### Medium
- [x] Minimal is a card like the other rooms; scroll fade above the sticky footer; "Cancel" replaces ✕;
      footer status silent at rest; invite field has a placeholder; dock group tops align; landscape rail
      hugs the bottom instead of claiming the column; duplicate Overhead removed from the sheet;
      dead CSS deleted; empty ball-chip row no longer reserves space

### Not done
- [ ] Room previews are still raw equirectangular panoramas (bowed horizons). They want rendered
      perspective stills from the game camera — an asset-pipeline job, not a CSS one.
