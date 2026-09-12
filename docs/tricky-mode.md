# Tricky computer style

Tricky plays legal 8-ball for expected arcade points. Select **Game → Vs Computer → Tricky**. It uses the same visible practice paths and ghost cue ball as Hard; previews include intermediate balls and projected points. The arcade-effects toggle changes presentation, not the opponent's objective. Hard remains the default opponent and welcome demo.

Every scoring pot starts at 100. Bonuses are applied before the player's streak multiplier (×1, ×1.5, ×2, ×3):

| Route | Bonus |
| --- | ---: |
| Bank, 1 / 2 / 3+ cushions | 150 / 225 / 300 |
| Kick, 1 / 2 / 3+ cushions before first object contact | 200 / 300 / 400 |
| Combination, 2 / 3+ object balls | 200 / 350 |
| Carom: scoring object ball deflects off another object ball | 200 |
| Double kiss: repeat contact redirects the scoring ball | 300 |
| Thin cut, at least 60° | 100 |
| Long pot, scoring ball travels half the table diagonal | 75 |
| Second / third / later pot of the shot | 200 / 300 / … |
| Legal called 8-ball finish | 500 |

Distinct bonuses stack. Each family pays its highest tier; a double kiss replaces the carom bonus on the same ball. Kicks pay once per shot. Fouls void the shot and reset that player's streak. A long, thin bank is 425 before the multiplier, or 1,275 at ×3.

## Evidence and compatibility

`ArcadeEvents` is shared by live play, simulated shots and the room scorer. It records ordered source/target contacts, qualifying cushions, cut angles, measured deflections and bounded distance totals. Deflections need incoming and outgoing speed above 0.3 and at least a 5° change in direction. Repeat contacts must be separated by eight physics ticks; pocket jaws and cushion chatter do not earn extra cushions. A later deflection discards earlier bank and thin-cut claims. Uncertain ancestry cannot manufacture a combination. Distance sums only movement on the felt, and is encoded once when a ball drops.

Evidence version 2 accepts version 1 traces for existing rooms. New personal bests use a separate versioned storage key. Event overflow suppresses advanced bonuses rather than sending a partial route. Free Play hand manipulation invalidates the touched path. Scoring receipts stay provisional until the normal house rules settle the shot.

## Search

The worker shares Hard's Rapier snapshots, timestep, physics and placement helpers. Each candidate is scored with `scoreArcade`; continuation uses `commitArcade` so the next shot gets its actual streak multiplier. Solo searches use the same solo rule transition as attract play.

Search families include direct pots, one/two/three-cushion banks and kicks, two/three-ball combinations, bank combinations, caroms and draw variants that can produce double kisses. Geometric candidates are proposals: only the simulated contact evidence earns a bonus. Incidental multi-pots also contribute their actual points. Double kisses are opportunistic; a route label alone never awards one.

Round-robin candidate budgets prevent direct pots from taking every search slot. The best candidates get aim/spin refinements, small aim-and-power perturbations, then one-shot continuation where time permits. The objective combines simulated points and discounted continuation, with penalties for fouls, losing the rack and dropping a built streak. It approximates rack score with bounded lookahead rather than exhaustively solving the rack.

The default budget is 180 simulations and 4.5 seconds; a simulation already in progress can finish just after the deadline. It runs off the rendering thread and is terminated when the player changes mode or style. A valid geometric fallback remains available if the worker fails.

## Validation

Run `npm test`, `npm run physics-test`, `npm run build` and `npm run test:online`. The new fixtures cover each bonus, boundaries, scratch cancellation, replay validation, solo rules, legal placement, bounded search, and exact projected receipts for simulated physics.

`npm run benchmark:tricky -- --racks=4 --seed=1234` compares Hard and Tricky on identical seeded solo endgame layouts with equal limits. It reports points, completed/truncated racks, fouls, trick pots, simulations and thinking time. Override `--shots`, `--ms` and `--simulations` to measure a smaller budget. These are endgame layouts, not a claim about full-rack or mobile-device performance.

A development run on September 12, 2026, with seed 2026 and the default budget:

| Style | Finished endgames | Points / rack | Trick pots | Fouls | Mean search |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hard | 4 / 4 | 4,034.5 | 8 | 0 | 2.46 s |
| Tricky | 4 / 4 | 8,969 | 27 | 0 | 3.73 s |

The deadline makes results hardware-dependent; this small sample is a smoke benchmark, not a general strength guarantee. Live browser verification also matched projected and settled receipts on a 1,600-point break and a 975-point kick combination. At a 320-pixel viewport the scoring table and four style buttons fit without horizontal scrolling; a throttled browser kept showing previews and cancelled a search immediately when its style changed.
