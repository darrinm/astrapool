# Pool

A 7-foot pool table you can walk around, built with three.js and Rapier, racked with the Playful Heads: the
Hatch 2025 team as 3D head textures on the balls. Extracted from `playful-photos` (which keeps the head-map pipeline).

`npm install && npm run dev`, then open the printed URL. `npm run physics-test` runs the physics harness.

## Deployment
Live at [pool.darrinm.com](https://pool.darrinm.com). The repository lives at `~/src/pool`.

GitHub Actions checks pull requests targeting `main`. Every push to `main` (including a merged PR)
runs the 18 input tests, physics harness, and production build, then deploys to Cloudflare.
Failed checks prevent that workflow run from deploying. PRs never deploy. The workflow also supports
manual runs from the Actions tab on `main`; production deployments run one at a time.

The repository Actions secret `CLOUDFLARE_API_TOKEN` must contain a Cloudflare Workers deployment
token scoped to the account in `wrangler.jsonc` and the `darrinm.com` zone. Use Cloudflare's
“Edit Cloudflare Workers” token template. The account ID and custom domain are configured in
`wrangler.jsonc`, following `~/src/darrinm.com/README.md`.

For a manual local deployment, `nvm use` selects Node 24 (see `.nvmrc`), then `npm run deploy`
builds and publishes the local files, including uncommitted changes. Use your Wrangler login;
if the shell exports credentials for another account, run
`env -u CF_API_TOKEN -u CF_ACCOUNT_ID -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npm run deploy`.

## Playing
Press `Esc` while lining up a cue shot to cancel without shooting.
Drag back from the cue ball to shoot; the further the pull, the harder the hit (up to 24 mph / 10.7 m/s). The ball
widget (bottom right) sets follow / draw / english; Reset centers the contact point. Left-drag the table to orbit, right-drag to pan, wheel to zoom,
`C` resets the view. Heads / Balls buttons (or `B`) swap the heads for authentic numbered balls. `M` mutes,
`R` re-racks. The bottom dock groups play mode, ball appearance, reset view, and re-rack.
The header shows pocketed balls and shots, with sound and a Help menu for controls and shortcuts.

Choose **Fling** (or press `F`) to grab any ball and slide it across the felt. Release while moving to
fling it in the direction of your mouse; move faster for a harder throw. Hold still before releasing to place
the ball. Balls still collide with each other and the cushions. Drag empty table space to orbit as usual,
and choose **Cue** or press `F` again to return to cue shots.

## Layout
- `src/main.js` – fixed-step loop (480 Hz physics, interpolated rendering), key routing, `window.playful` debug handle.
- `src/pointer-input.js` – browser pointer routing, including release before or after capture loss. `src/fling.js`
  estimates throw velocity from recent mouse samples. `node --test physics/*.test.mjs` checks both modules.
- `src/core.js` – renderer, camera, physics world, the 14 heads, and the prop registry and pointer helpers the scene uses.
- `src/pool.js` – the game. Physics: gravity into the felt, a triangle-mesh felt with six real holes and pocket wells
  underneath so balls physically drop in (rail-side castings lean over the hole and catch a fast ball), cushions with a
  real nose profile, ball/cushion/felt friction and restitution via combine rules, rolling resistance and spin friction
  per step, off-centre strikes, and an aim guide (shape cast to the first impact, ghost ball, object-ball line) with a
  cue stick that pulls back and elevates over the rail. Presentation: procedural felt / wood / carpet textures
  (`src/textures.js`), clearcoat heads, an overhead panel light plus a shadow-casting spotlight (the fixture fades out
  as the camera climbs to it), room environment reflections, ACES tone mapping, fog, contact shadows.
  The cue ball is always plain white and the 8 is a plain black ball at the centre of the rack; the 14 heads take the
  other numbers, with a standard numbered cap baked into the bottom of each texture (`src/ballcaps.js`). Heads rack
  face-up and upright as seen from the cue ball; balls rack number-up. Scale: 1 unit = 26 mm, g = 377.
- `src/sounds.js` – sampled impact sounds: ball-on-ball (soft and hard takes), cushion, cue tip, pocket drop and rattle;
  each hit picks a random take with strength-driven level, pitch and brightness; stereo panning and distance attenuation
  from the camera; a short synthetic room reverb. No rolling bed (a ball on cloth is near silent). The earlier modal
  synthesis is kept behind `mode = 'synth'`; `audition.html` (served by the dev server) plays the two side by side per
  event with a blind A/B and score.
- `physics/poolphysics.js` – the table physics as a plain module (constants, felt / cushion / pocket-well / backstop
  colliders, strike, rolling resistance, spin friction) shared by the scene and the harness.
- `physics/validate.mjs` – 26 headless checks: closed-form sliding / rolling results, collision laws, the 90° and 30°
  rules, cushion rebound, engine hygiene (timestep sensitivity, tunnelling, determinism), and a pocket sweep including 24 mph shots.
  `RATE=120 npm run physics-test` shows the coarse-step losses that led to stepping at 480 Hz. Known deviation: heavy
  topspin into a rail rebounds livelier than on a real table.
- `public/heads/` – the 14 equirectangular head maps (generated in `playful-photos/pipeline`).
- `public/sfx/` – the sound samples plus `manifest.json`.
- `pipeline/` – sound-effect generation (Python; `python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt`):
  `sfx.py` generates takes per event with ElevenLabs Sound Effects v2 on fal (`FAL_API_KEY` read from `~/src/iris/.env`);
  `sfx_analyze.py` measures onset, attack, ring time and spectral centroid, strips the generator's edge clicks, rejects
  quiet and double-hit takes, trims, normalises and writes `public/sfx/` with the manifest (`--write`).
- `tasks/` – plan and lessons.
