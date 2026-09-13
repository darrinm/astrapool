# Astra Pool

Eight-ball on a 7-foot table, in a browser tab. Orbit the table, pull back from the cue ball,
release. Rack the planets, a standard set, or faces.

**[Play it at astrapool.darrinm.com](https://astrapool.darrinm.com)** — no install, no account.

![A pool table in an orbital lounge, racked with the planets and broken with a glowing Sun for a cue ball.](public/og.jpg)

- **Four ways to play:** local two-player 8-ball, computer opponents, private online games by link, and Free Play.
- **Four computer styles:** Easy, Medium, Hard, and Tricky, which hunts for high-scoring trick shots with visible thinking previews.
- **Real pool physics:** control power, follow, draw, and sidespin on a full 3D table.
- **Arcade scoring and effects:** earn bonuses for banks, kicks, combinations, and more; replay your last shot.
- **Planets and places:** rack the solar system or classic balls in nine rooms, from a corner bar to an orbital lounge.
- **Desktop and mobile:** orbit and zoom with mouse or touch; no install or account required.
- **Attract mode:** watch Tricky play solo while the camera circles the table.
- **Stack:** [three.js](https://threejs.org), [Rapier](https://rapier.rs), and Vite, hosted on Cloudflare Workers.

## Playing

Four modes: **Local 8-ball** (two people, one device), **Vs Computer**, **Play a Friend** (a
private link), and **Free Play** (no rules). On every refresh the welcome screen plays a solo
demo behind the menu; choosing a mode or pressing Escape starts a fresh rack. Online room links
restore the player and table directly instead of starting the demo.

Drag back from the cue ball and release. The further the pull, the harder the hit, up to 24 mph.
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

Tricky is the default. It plays for arcade points, searching banks, kicks, combinations and caroms, checking the
margin for error and the next scoring chance. Its practice paths show projected points. The
welcome demo uses Tricky to play solo with these same thinking previews. The
in-game Help includes the expanded bonus table; [Tricky mode](docs/tricky-mode.md) describes
the scoring evidence and search limits.

**Free Play** adds **Fling**: grab any ball and throw it across the felt.

## Balls and rooms

Three collections, cycled with `B` or **Game → Ball collection**.

**Planets** racks the solar system. Mercury through Uranus are 1–7, a black hole is the 8, and
Neptune, the Moon, Io, Europa, Ganymede, Titan and Pluto are 9–15; the cue ball is the Sun. The
gas giants carry rings and moons, Earth has a cloud shell, and numbered caps appear on each
world's upper face while you aim. It is an illustrated set, not calibrated imagery: sizes and ring
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

## Development

```sh
npm install && npm run dev   # local, computer and free play
npm run dev:online           # adds the Cloudflare runtime, needed for online rooms
npm test                     # rules, computer, pointer behaviour, server protocol
npm run physics-test         # the 26 physics checks
npm run test:online          # a real local Worker and two WebSocket clients
npm run benchmark:computer   # Easy, Medium and Hard over eight fixed endgames
npm run benchmark:tricky     # Hard and Tricky with equal search limits
```

Node 24, from `.nvmrc`. Scale is 1 unit = 26 mm, g = 377.

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

`npm run deploy` publishes local files, including uncommitted ones. If your shell exports
credentials for another account, prefix it with
`env -u CF_API_TOKEN -u CF_ACCOUNT_ID -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID`.

Three names stay `pool` on purpose. Renaming the Worker in `wrangler.jsonc` creates a second
Worker with its own Durable Object namespace and orphans every live room, and the `POOL_ROOMS`
binding and its migration tag go with it. Renaming the `pool.*` and `playful.*` localStorage keys
resets every player's saved room, collection and preferences. Routes are independent of the
Worker's name, which is how the site changed hostname without disturbing the rooms.

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
