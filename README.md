# Astra Pool

Eight-ball on a 7-foot table, in a browser tab. Orbit the table, aim from the cue ball,
release. Rack the planets, a standard set, or faces.

**[Play it at astrapool.darrinm.com](https://astrapool.darrinm.com)** — no install, no account.

![Astra Pool — Rack the planets. A glowing Sun cue ball and planetary billiard balls on teal felt in an orbital lounge.](public/og.jpg)

- **Four ways to play:** local two-player 8-ball, computer opponents, private online games by link, and Free Play.
- **Four computer styles:** Easy, Medium, Hard, and Tricky, which hunts for high-scoring trick shots with visible thinking previews.
- **Real pool physics:** control power, follow, draw, and sidespin on a full 3D table.
- **Black Hole Gravity:** an optional 8-ball gravity field bends nearby moving balls; all four computer styles account for the pull.
- **Arcade scoring and effects:** earn bonuses for banks, kicks, combinations, and more; replay your last shot.
- **Planets and places:** rack the solar system or classic balls in nine rooms, from a corner bar to an orbital lounge.
- **Desktop and mobile:** orbit and zoom with mouse or touch; no install or account required.
- **Attract mode:** watch Tricky play solo while the camera circles the table.
- **Stack:** [three.js](https://threejs.org), [Rapier](https://rapier.rs), and Vite, hosted on Cloudflare Workers.

**[Watch the 49-second action trailer](pipeline/trailer/astra-pool-trailer.mp4?raw=true)** · [Edit or reproduce it](pipeline/trailer/README.md)

## Playing

Four modes: **Local 8-ball** (two people, one device), **Vs Computer**, **Play a Friend** (a
private link), and **Free Play** (no rules). On every refresh the welcome screen plays a solo
demo behind the menu; choosing a mode or pressing Escape starts a fresh rack. Online room links
restore the player and table directly instead of starting the demo.

Pull back from the cue ball to aim directly and set power, up to 24 mph. Hold within about
6 screen pixels for 400 ms to enter **Fine aim**: power locks, the cue highlights, and movement
across the cue rotates the shot at 0.1° per pixel. Move along the cue by 20 pixels to resume normal
aiming without a jump. Release to shoot in either mode. This works on mouse and touch.
Aim lines preview the shot with the same physics as the live game, including rolling spin,
collisions throughout the rack, cushions, and Black Hole Gravity. White follows the cue ball;
gold follows the first object hit. Stop rings mark their simulated final positions when they
remain on the table. A faint, horizontal line from the cue ball to first impact updates immediately and remains visible
while predictions update. Obsolete simulations are cancelled; incomplete previews do not
claim a stopping position. Width and brightness reflect power. Enable **Clairvoyant** in settings
to see paths for every moving ball, including combination shots and the break. Lines match the
active ball set’s colors (planet colors for Planets); the black ball’s line has a light outline.
Clairvoyant is off by default and remembered on this device. The **Look ahead** slider in settings limits the cue-ball
preview to 0–5 bounces or **All**; contacts with balls and cushions both count. Shorter settings
stop the simulation at that horizon too, truncating any object-ball path still in motion without
a stopping circle. A shot that settles sooner still shows its predicted resting position.
The ball widget sets follow, draw and english. Left-drag to orbit, right-drag to pan, wheel to
zoom. On touch: drag to orbit, two fingers to pan, pinch to zoom, and tap **Cancel** with a second
finger to abandon a shot in progress.

Keys: `C` reset the view, `B` cycle ball collections, `F` fling, `M` mute, `R` re-rack, `V` replay
the last shot, `Esc` cancel a shot. The in-game **Help** menu has the rest.

House rules, not tournament rules. The table stays open after the break; the first legal shot
pocketing only one group assigns it. Hit your own group first, then pocket a ball or drive one to
a cushion. All fouls give ball-in-hand anywhere. The 8 is called into a pocket and played on its
own shot; regular shots need no call.

**Vs Computer** has four styles. Easy favours simple pots with forgiving aim and loose power.
Medium aims and controls power more precisely and selects shots geometrically, but does not plan
ahead; both lose accuracy on long or thin cuts. Hard tests pots, banks, legal
escapes, power and spin in a copy of the live world, rejects scratches and early 8s, weighs the
next shot against a defensive leave, searches ball-in-hand placements, and calls the 8. It adds no
random aiming error, and searches in a background worker so the table stays responsive.

Tricky is the default. It prefers reliable trick shots, then maximizes arcade points among them.
It searches banks, kicks, combinations and caroms, checks the margin for error, and looks ahead
for its next trick. Simple pots remain a fallback when the tricks are too risky. Its practice paths show projected points. The
welcome demo uses Tricky to play solo with these same thinking previews. The
in-game Help includes the expanded bonus table; [Tricky mode](docs/tricky-mode.md) describes
the scoring evidence and search limits.

**Free Play** adds **Fling**: grab any ball and throw it across the felt.

**Game → Black Hole Gravity** is off by default. Toggle it when the balls are at rest to let
the 8-ball curve all other moving balls toward it, in any ball collection.
The range is 36 game units from the 8-ball’s center (about 94 cm / 37 inches,
or 16 ball diameters). The pull fades with distance and as the
balls settle, and stops when the 8 drops below the felt.
All four computer styles rehearse with the same gravity; Easy and Medium retain
their usual aim and power errors. Available in Local 8-ball, Vs Computer, and Free Play; online
rooms and the welcome-screen attract demo use standard physics.

## Balls and rooms

Three collections, cycled with `B` or **Game → Ball collection**.

**Planets** racks the solar system. Mercury through Uranus are 1–7, a black hole is the 8, and
Neptune, the Moon, Io, Europa, Ganymede, Titan and Pluto are 9–15; the cue ball is the Sun. The
gas giants carry rings and moons, and Earth has a cloud shell. It is an illustrated set,
not calibrated imagery: sizes and ring
spacing are exaggerated, and six bodies use reconstructed terrain where the source maps are blank
or blurred. About 11.5 MB of maps load the first time it is selected.

**Classic** is a standard numbered set. **Heads** needs textures that are not in this repository —
see [Head textures](#head-textures).

Nine rooms. **Minimal** is green cloth in a dark room. The eight others — The Corner Pocket,
Desert Modern, Tokyo Rooftop, Orbital Lounge, Alpine Lodge, The Glasshouse, Amalfi Terrace and
Atlas Courtyard — have their own cloth, architecture, scenery and lighting, and download only when
chosen. Orbital Lounge is the default and opens on Planets; every other room opens on Classic.
Changing rooms or collections preserves the rack, the turn and the physics, and each online player
picks their own.

## Online rooms

Choose **Play a Friend**, then **Copy invite**, and send the link to one person. Both players must
be connected to shoot. A refresh or a reconnect keeps your seat. A shot interrupted by the
shooter's disconnect rolls back to its starting table, and rooms expire after 24 hours.

Each room is a SQLite-backed Durable Object. The server assigns seats, validates turn ownership
and resolves the house rules; browsers simulate the shots and report the results, which the server
checks structurally. These are friendly matches: there is no accounts system, no matchmaking, and
no competitive anti-cheat.

## Arcade

On by default, and separate from the rack score. Pots score, banks and combinations score more,
and consecutive scoring plays multiply. Points stay pending until the shot settles, and a foul
voids them. **Reduced effects** keeps the scores readable with calmer motion. Turning Arcade off
never changes the rules or the outcome. `V` replays the last shot from recorded ball positions,
with scrubbing and quarter speed.

Finished racks show a results card with the winner, arcade totals, each player's longest
scoring streak, and the highest-scoring legal shot. **Replay best shot** preserves that shot
even when it happened earlier in the rack; return to the results and **Rematch** to switch
the break. Clearing Free Play shows the same card with **Play again**.

Completed-rack personal bests for score, shot points, and streak stay on this device, separated
by mode, computer style, Free Play input, and gravity setting. Changing those during play
excludes the rack from personal records. Attract mode never records results. Online highlights
use confirmed shots observed on this device; after joining late or missing shots, the card
labels the incomplete history and skips personal records. Replay recordings stay in memory.

## Development

```sh
npm install && npm run dev   # local, computer and free play
npm run dev:online           # adds the Cloudflare runtime, needed for online rooms
npm test                     # rules, computer, pointer behaviour, server protocol
npm run physics-test         # the 26 physics checks
npm run test:online          # a real local Worker and two WebSocket clients
npm run test:load            # 1,000 rooms / 2,000 protocol clients; start dev:online first
npm run benchmark:computer   # Easy, Medium and Hard over eight fixed endgames
npm run benchmark:tricky     # Hard and Tricky with equal search limits
```

Node 24, from `.nvmrc`. Scale is 1 unit = 26 mm, g = 377.

The load test covers room creation, seats, aiming, synthetic shot results, and
reconnects. It defaults to the local Worker on port 8787. Use `-- --rooms 10
--rounds 1 --aim-seconds 1 --peak-seconds 1` for a smoke test, or pass `--base`
explicitly to test a deployed service. It always creates fresh rooms, closes its
connections afterward, and lets the server expire its rooms after 24 hours.
JSON results include latency percentiles and actual throughput; `passed` means
protocol correctness, not a latency guarantee. Browser rendering, client physics,
global client locations, and Cloudflare billing are outside the test's scope.
See the [2,000-player live test report](docs/load-tests/2026-09-13-2000-players.md)
for measured latency, reconnect behavior, and peak-traffic limitations.

- `src/main.js` — the fixed-step loop, key routing, and the `window.playful` debug handle.
- `src/pool.js` — the game: table, colliders, aim guide, cue stick, presentation.
- `src/eight-ball.js` — the rules engine, shared with the server.
- `src/hard-computer.js`, `src/shot-simulation.js`, `src/computer-worker.js` — the Hard search.
- `src/tricky-computer.js`, `src/trick-shots.js` — arcade score search and trick-shot candidates.
- `physics/poolphysics.js` — table physics as a plain module, shared by the game and the harness.
- `physics/validate.mjs` — the 26 checks.
- `server/worker.js`, `server/protocol.js` — Durable Object rooms and validated actions.
- `src/ball-sets.js`, `src/planet-balls.js`, `src/black-hole.js`, `src/sun.js` — ball collections.
- `src/sounds.js` — sampled impacts, chosen and pitched by strength, panned from the camera.
- `pipeline/` — generation of the sound takes and the planet maps.

## Deployment

Pushing to `main` runs the tests and the build, then deploys. Pull requests never deploy. The
repository needs the Actions secret `CLOUDFLARE_API_TOKEN`, from Cloudflare's "Edit Cloudflare
Workers" template, scoped to the account in `wrangler.jsonc` and the `darrinm.com` zone.
The token also needs **Account → D1 → Edit** to apply analytics migrations. A migration failure
emits a warning and allows gameplay deployment to continue; analytics may be unavailable until repaired.

`npm run deploy` publishes local files, including uncommitted ones. If your shell exports
credentials for another account, prefix it with
`env -u CF_API_TOKEN -u CF_ACCOUNT_ID -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID`.

Three names stay `pool` on purpose. Renaming the Worker in `wrangler.jsonc` creates a second
Worker with its own Durable Object namespace and orphans every live room, and the `POOL_ROOMS`
binding and its migration tag go with it. Renaming the `pool.*` and `playful.*` localStorage keys
resets every player's saved room, collection and preferences. Routes are independent of the
Worker's name, which is how the site changed hostname without disturbing the rooms.

## Gameplay analytics

Anonymous rack statistics live in Cloudflare D1: games started and finished, completion rate,
game modes, outcomes, shots, duration, arcade score, and starting/current settings. Attract mode
is excluded; a game starts on its first shot. Online rooms count once across both players.

Run `npm run analytics:dashboard` for charts in a browser, served from localhost through your own
Wrangler login. Run `npm run analytics` for the same report as text, with `--days 30`,
`--mode computer` and `--json` filters. The raw rows are in the Cloudflare dashboard under
**Storage & databases → D1 → astrapool-analytics → Console**.
See [analytics definitions, queries, and setup](docs/analytics.md).

## Head textures

The **Heads** collection textures the balls with photographs of real people. They are not in this
repository and are not redistributable, so a checkout has no `public/heads/` and Heads falls back
to plain colours.

A copy lives outside the repository, in `~/.pool-heads` or `$POOL_HEADS_DIR`. `npm run
heads:restore` puts it in the working tree; `heads:status`, `heads:stash` and `heads:clear` manage
it. `npm run deploy:private` deploys them to the separate Worker in `wrangler.private.jsonc`. The
public `npm run deploy` and CI both run `heads:guard`, which refuses to build while any texture is
in the working tree.

Run `npm run check:publishable` before making a repository public. Untracking the textures leaves
the blobs in earlier commits, and a public repository publishes its whole history.

## License

Code is [MIT](LICENSE). The art and audio are not; each set has its own terms.

- `public/planets/` — eleven maps from [Solar System Scope](https://www.solarsystemscope.com/textures/)
  under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), which requires that attribution
  travel with them; seven from [NASA / VTAD](https://science.nasa.gov/3d-resources/) and USGS under
  public-domain and NASA media terms; seven generated, including the Sun and the reconstructed terrain
  on Pluto, Charon, Titania, Oberon, Triton and Deimos. Per-file sources, checksums and modifications are in
  `public/planets/credits.json`.
- `public/environments/` — generated panoramas and Blender-modelled furniture.
- `public/sfx/` — takes generated with ElevenLabs Sound Effects; reuse follows their terms.
- `public/heads/` — photographs of real, identifiable people. All rights reserved.

[three.js](https://github.com/mrdoob/three.js) is MIT, [Rapier](https://github.com/dimforge/rapier)
is Apache-2.0, and the [Fraunces](https://github.com/undercasetype/Fraunces) typeface is SIL OFL 1.1.
