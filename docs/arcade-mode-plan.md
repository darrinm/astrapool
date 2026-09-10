# Arcade mode

Complete product, visual design, and implementation plan · September 9, 2026

**Selected direction: Playful.** Arcade adds expressive, localized effects and a separate score to every existing way of playing Pool. Skillful shots and happy accidents earn celebrations; mistakes get funny, legible reactions. Every new rack gets an opening flourish.

The implementation target is the existing application in `/Users/darrin/src/pool`. This document is the specification; it does not implement the feature. The experience and visual direction below reflect the conversation. Numerical scoring, timing, and resource budgets are proposed starting values to tune during implementation.

## 1. Experience and controls

Add an **Arcade** switch to Game settings, available from both desktop and compact controls. It applies to Local 8-ball, Vs Computer at every difficulty, Play a Friend, Free Play Cue, and Free Play Fling. Numbered balls, heads, and every room support the same effects.

The switch defaults on and remembers its setting on this device, including an explicit choice to turn it off. It controls the arcade presentation: effects, extra sound accents, and the arcade score display. Scoring records the rack from its beginning even while the presentation is off, so enabling it midway reveals a complete score. Switching it never resets points or gives a scoring advantage. Online players choose their own presentation independently.

Changing the switch takes visual effect immediately. Turning it off clears active arcade effects; turning it on celebrates new events without replaying earlier ones. Ball motion, aiming, game rules, turn ownership, computer decisions, and rack wins continue normally.

**Computer thinking:** Playful “chalk thoughts” run concurrently with Hard's search, using bounded samples from the simulations already being evaluated. Show at most two faint candidate paths, a brief ghost cue ball, and localized ball/pocket highlights with a small “Hmm…”. Replace stale candidates immediately; do not queue a sequence or impose a minimum viewing time. When the search finishes, clear the paths and show a quick “Aha!” during the standard 180 ms cue windup, then clear all thinking effects before striking. Start the search as soon as the table settles. Easy and Medium go straight to the chosen-shot highlight. Reduced motion uses static highlights. The effect never adds evaluations or delays a shot; resets, difficulty changes, and leaving the game cancel it.

Arcade points appear alongside the existing score. **Racks won** remains the match result; **Arcade points** recognizes the way someone played. A spectacular losing player can finish with more arcade points.

## 2. Playful visual language

Use warm, saturated colors, chunky graphic bursts, rounded point labels, and brief elastic movement. Effects should look like playful additions to the physical table. Wood, felt, room lighting, and the existing game interface supply the setting.

| Element | Direction |
| --- | --- |
| Shapes | Rounded starbursts, thick rings, short confetti strips, little puffs and droplets. |
| Reward palette | Butter yellow `#FFE08A` and warm gold `#FFC45E`; mint `#A8E8BE` as a supporting accent. |
| Mishap palette | Coral `#F28C78` for scratches; amber `#F4BD67` for ordinary fouls; plum `#BD8BCE` with a coral edge for a losing 8-ball. |
| Typography | Rounded sans serif with substantial weight, tabular score digits, and a dark outline or compact shadow for contrast. Keep the existing interface typography. |
| Motion | Quick pop, a small overshoot, then a short rise or fall. Slight label tilt gives personality. |
| Light | Soft glow around the graphic shape; preserve a crisp center that reads in bright rooms. |
| Scale | Tiny touches for ordinary impacts, medium bursts for pots, a larger local flourish for exceptional shots and rack results. |

These are starting colors. Tune against all room and cloth choices. Coral must remain distinguishable from a red ball, and reward text must remain readable on light scenery. Color always has a matching shape or word.

Player identity uses the same small colored marker on the floating award and that player's arcade total. The main event palette communicates success or mishap; its meaning stays consistent between turns.

Humor belongs in short, occasional captions: **BANK SHOT!**, **DOUBLE POT!**, **TOO SOON!**, **WRONG DOOR!**. The existing Last shot text continues to explain the actual rules outcome. Avoid repeating jokes on every collision.

## 3. Effects belong where the action happened

Pockets, collision points, rail contacts, and the rack are the primary anchors. Points rise from the pocket that received the ball. Scratch text sinks into that pocket. Bank bonuses appear at the finishing pocket after a brief reaction at the rail.

Effects on the felt and rails follow the table's perspective. Text faces the camera at a readable size, stays connected to its world position as the camera moves, and travels only a short distance in screen space. Nearby labels stack or combine without covering the cue ball, aim guide, called-pocket control, or essential HUD.

For several balls entering one pocket, use one growing award with **DOUBLE POT!** or **TRIPLE POT!**. Pots at different pockets retain separate local awards. Attach a shot-wide bonus to its qualifying pot; show the full accounting in Last shot.

Offscreen events use the persistent shot summary as a fallback. Suppress a floating label when its anchor is behind the camera or cannot fit near the pocket; do not let labels drift to unrelated corners of the screen.

Reserve a short central announcement for a rack result. Most of that celebration still originates at the final pocket. The camera remains under the player's control, including during scratches and an early 8.

## 4. Event treatment

| Event | Local treatment | Starting duration |
| --- | --- | --- |
| Cue strike | Small cream starburst at the tip contact and a short trail behind a fast cue ball. | 120–250 ms |
| Fling release | Small release puff at the ball; a short trail scaled to launch speed. | 150–350 ms |
| Ball collision | Two to six chunky flecks and a tiny squash-and-pop graphic at contact. Scale with impact strength. | 100–220 ms |
| Cushion contact | Thick arc or springy ripple traveling a short distance along the struck rail. | 180–320 ms |
| Pocket rattle | A small rim wobble or a couple of chips at the pocket mouth. Celebrate only once the ball is confirmed down. | 120–250 ms |
| Ordinary pot | Warm pocket burst, rounded **+100** lifting from the mouth, a few confetti strips. | 800–1,100 ms |
| Bank, kick, combination | Pulses at the relevant contacts; a named bonus joins the award above the receiving pocket. Briefly emphasize only the qualifying part of the ball's route. | 900–1,300 ms |
| Multiple pots | Escalating bursts at the receiving pockets; combine awards sharing one pocket. | 1,000–1,400 ms |
| Legal winning 8 | Gold burst from the winning pocket, a larger local confetti fan, then the rack result. | 1,200–1,800 ms |
| Cue-ball placement or respot | Small soft landing ring under the ball. | 150–250 ms |
| Fresh rack | Return missing balls, gather all balls into the rack, then add the triangle flourish and cue-ball halo. | About 1 second to gather, then a brief flourish |

Ordinary shapes and trails are visual overlays. Squash, bounce, and ripples never move a physical ball or change its collision shape. Racking is a separate setup transition with ball collisions paused until assembly completes. Sustained resting contacts, balls settling in the triangle, and hidden pocket-well collisions must not generate a storm of effects.

## 5. Unhappy accidents

| Event | Reaction | Arcade result |
| --- | --- | --- |
| Scratch | Coral whirlpool or soft gulp at the receiving pocket. **SCRATCH** dips downward with a deflating sound. | Void the shot's provisional points and reset the streak. |
| Early 8 | Chunky plum puff and a coral-edged ripple from the pocket. **TOO SOON!** pops up, slumps, and falls away. | Normal rack loss; void this shot's points. Previously committed points remain. |
| Wrong-pocket 8 | Brief outline at the called pocket; **WRONG DOOR!** and a coral burst at the actual pocket. | Normal rack loss; void this shot's points. |
| Scratch with the 8 | React locally at both pockets, then give one clear rack-loss explanation. | One failed-shot result; never double-charge or double-reset. |
| Other foul | Small amber reaction at the relevant contact, or above the cue ball when there is no contact location. State the actual foul in Last shot. | Void the shot's points and reset the streak. |
| Ball off the table | Short trailing streak and **OUT OF BOUNDS!** at the rail crossing. | Apply the existing foul or rack-loss rule; no pot credit. |
| Opponent's ball potted | Small neutral pocket puff. On its own, this gets no reward label. | No credit for that ball; normal game rules decide whether the shot is legal. |

An early 8 is determined by the rules result. The existing 8-ball-on-the-break exception respots the 8: use a brief **BACK YOU GO!** at its pocket and a landing ring at the spot. Do not call that an early-8 loss or award repeatable pot points for the respotted ball.

In Free Play, the 8 is an ordinary scoring object ball. There is no early-8 or wrong-pocket loss. Scratches and off-table balls still get comic reactions and void the current arcade play's points, with the existing Free Play respot behavior.

## 6. Racking flourish

The fresh rack should feel satisfying every time:

1. Keep every ball already on the table at its current position. Return missing balls to random clear positions on the felt, so all sixteen balls are visible before they move.
2. After a short beat, smoothly gather the balls into their canonical rack over roughly one second, with a small stagger through the rows. The cue ball moves to its starting spot too.
3. Treat this as setup: pause ball collisions and shooting while gathering, then restore the complete, stationary rack without recording shots or arcade points. Reduced motion places the rack immediately.
4. With Arcade enabled, an outlined triangle and small graphic pops finish the assembly. A short clatter resolves into a cheerful final click. A little ring appears under the cue ball; **READY TO BREAK** floats briefly above the rack. Free Play can use **READY!**.

The player can aim and shoot as soon as the balls finish gathering. A new strike fades any remaining flourish. Only the actual creation of a fresh rack triggers it: new games, manual re-racks, rematches, and rules-driven re-racks. Changing rooms, switching ball appearance, reconnecting, and restoring a table snapshot do not retrigger it. Use a rack identity so online clients celebrate a new rack once. An accepted online shot interrupts a device's remaining animation and starts from the canonical rack.

## 7. Scoring model

Reward observable outcomes, including accidents. No system attempts to decide whether a bank or combination was intentional. Ordinary contacts, power alone, and distance traveled by a ball earn no points by themselves.

### Starting awards

| Achievement | Points | Qualification |
| --- | ---: | --- |
| Eligible pot | 100 per ball | A scoring object ball is pocketed in a successful play. |
| Banked pot | +150 per ball | The potted ball contacts a cushion on its qualifying route to the pocket. |
| Additional banks | +75 each, up to two extras per ball | Distinct subsequent cushion contacts on that route. Total bank award caps at +300 per ball. |
| Kick pot | +200 once per shot | The cue ball contacts a cushion before its first object-ball contact, and that contact starts a chain resulting in an eligible pot. |
| Combination pot | +200 per ball | A causal chain through another object ball sends this ball into its pocket. |
| Multiple pots | +200 for the second, +300 for the third, +400 for the fourth, continuing by +100 | Count only distinct eligible balls pocketed in this play. |
| Legal rack finish | +500 once | The shooter wins by legally pocketing the 8. A win awarded because the opponent fouled gives no shot-skill bonus. |

Banks, combinations, kicks, and multiple pots can stack when each qualification is supported by the shot evidence. Repeated contact chatter, unrelated movement elsewhere on the table, and pocket-jaw rattles do not create extra banks or combinations. Each achievement has a stable identity and can be awarded only once.

In assigned-group matches, eligible balls come from the shooter's legal target group at shot start; the winning 8 is eligible only when the rules allow it. On an open table or legal break, either regular group can earn points. A respotted break 8 earns none. A foul or rack-losing shot invalidates all provisional awards, even if it included otherwise eligible pots.

### Streak multiplier

The multiplier depends on consecutive successful plays by that player. The first scoring play is ×1, the second ×1.5, the third ×2, and the fourth and later ×3. The multiplier for a play is established when it starts; its success advances the next play's multiplier. Multiply the sum of base points and bonuses, then round the final shot total to the nearest integer.

A play must earn an eligible pot and have no foul to advance the streak. A miss, a foul, or pocketing only an opponent's balls resets it. Each player has their own streak. A new rack resets both streaks. Input changes in Free Play reset the streak after the active play resolves.

Example: two eligible pots (200), one bank (+150), and the second-pot bonus (+200) produce 550 before the multiplier. At ×2, the shot earns **1,100**. A later scratch makes the final award **0**, leaving earlier committed points intact.

### Immediate delight, final accounting

Pocket effects happen as soon as the game confirms a ball is pocketed. Their numbers are provisional while other balls are moving. Show a quiet **This shot +…** subtotal beside the arcade total, and a small pending mark on floating numeric awards. The main total includes committed points only.

Once the table settles and rules resolve, commit the shot once. Locally this is immediate; online it waits for the accepted room result. Do not replay every pocket animation when committing. If a late scratch invalidates the shot, its local reaction resolves the provisional subtotal to zero and the summary can read **Double pot … and a scratch. No points this shot.**

Compute the multiplied shot total once, then distribute its displayed components so rounding cannot make the floating awards and final receipt disagree. Last shot retains the point breakdown and reason for any void after the effects fade.

### Later skill extensions

Add long pots (+100) and thin cuts (+100) after reliable contact and route detection is proven. Starting definitions: a direct object-ball path of at least half the playable table diagonal for a long pot, and a cut angle of at least 60 degrees at the decisive cue/object contact for a thin cut. Limit these to direct cue pots initially; reject later deflections that invalidate the classification. These are follow-on awards, not requirements for the first release.

## 8. Game types, sessions, and personal bests

| Game type | Arcade behavior |
| --- | --- |
| Local 8-ball | Separate arcade totals and streaks for both players, alongside racks won. |
| Vs Computer | Same scoring for human and computer at every difficulty. The computer's objective remains winning pool. |
| Play a Friend | Shared accepted scores for both players; each device independently chooses Arcade effects and visibility. |
| Free Play Cue | Personal score run. All object balls, including the 8, qualify; cue-shot bank, kick, and combination rules apply. |
| Free Play Fling | Personal sandbox score run with the same localized reactions, pots, banks, combinations, and multiple-pot rewards. Cue-specific kick awards do not apply. |

Fling needs its own play boundary: an actual launch starts a scoring play, and the play resolves after motion and pending pocket detections settle. Additional flings during motion belong to the same play. Holding, dragging, cancelling, or placing a ball awards nothing. Contacts caused by manual dragging cannot establish a scoring route; grabbing a ball clears its previous route provenance. A ball must have evidence of a released launch or a collision chain from one to earn a pot award. Count a ball once per play.

Arcade totals are per rack. A rematch or re-rack starts at zero; existing match rack-win counters retain their established behavior. Preserve the completed rack's arcade result in the result view and update local personal bests from committed scores only. Abandoning or resetting a rack never commits an unresolved shot or creates a finish bonus.

Store personal bests on the device, with separate categories for Local, Computer difficulty, Online, Free Play Cue, and Free Play Fling, plus a scoring-version key. Track the local human's score for computer and online play. Local two-player bests can use the higher individual rack score without inventing persistent player accounts.

Switching between Cue and Fling during a Free Play rack preserves the table and total but classifies that run as **Mixed**. It cannot set a pure Cue or Fling personal best. Active play keeps its original scoring policy until settlement; subsequent activity uses the selected interaction mode. Starting a new rack establishes a fresh pure category.

## 9. Sound, readability, and comfort

Keep the current pool sounds, adding short arcade accents: little pops on strong contacts, rising plucks for successive pots, a soft descending gulp for a scratch, a comic unresolved chord for a losing 8, and the rack's brief clatter. Pan accents from the event's position using the existing spatial audio helper. Limit simultaneous voices so a break is one satisfying burst rather than sixteen competing sounds.

The existing Sound setting and hidden-page muting control all audio. Turning Arcade off stops arcade accents. No background music or spoken announcer is needed for the first release.

Provide an adjacent **Effects: Full / Reduced** preference. Honor the operating system's reduced-motion preference by default. Reduced effects keep readable local awards and one compact shape response while suppressing trails, confetti travel, elastic bounce, and large ripples. Both settings award identical points.

Use approximately 20–28 px for point totals and at least 12–14 px for supporting labels, adjusted for viewport and overlap. Keep text opaque enough to read on every room. Effects ignore pointer input. A single accessible shot summary announces confirmed outcomes; particles and individual contact labels are decorative. Keep the persistent point receipt available after short-lived animations disappear.

## 10. Implementation structure

The current integration points are `src/pool.js`, `src/eight-ball.js`, `src/main.js`, `src/hud.js`, `src/hud.css`, `src/sounds.js`, `src/online.js`, `server/protocol.js`, and `server/worker.js`.

`pool.js` currently drains collision events in `drainSounds()`, also recording first contact and distinct post-contact rail hits for the rules. `shotRecord()` contains no chronological contact history. Free Play does not currently create the same active shot record, and Fling uses its own drag/release path. These are the main integration gaps.

Introduce a small set of focused modules:

| Module | Responsibility |
| --- | --- |
| `src/arcade-events.js` | Observe launches, ordered meaningful contacts, pot confirmations, off-table events, placement, settlement, and rack identity; maintain bounded evidence per play. |
| `src/arcade-score.js` | Pure deterministic qualification, award calculation, per-player streaks, and shot resolution. Share with the online server. |
| `src/arcade-effects.js` | Reusable particles, local rings, trails, camera-facing labels, animation timing, and cleanup. |
| `src/arcade-hud.js` | Toggle and preferences, totals, provisional subtotal, persistent receipt, and device bests. |

Keep event observation, scoring, and presentation separate. Drain Rapier's collision queue once and distribute the result to rules, arcade observation, and audio. Rules and score evidence run before cosmetic rate limits and independently of mute. Rendering and DOM updates run at frame rate rather than inside each 480 Hz physics step.

A play captures its ID, rack ID, shooter, input type, starting rules state, launch data, and ordered contact evidence. Record stable ball and cushion IDs, simulation ordering, positions, and sufficient motion information to identify the influencing contact. A score result contains award IDs, relevant ball/pocket IDs, points, multiplier, and committed/void status. Effects consume semantic events; they never decide points or rules.

Contact order matters: a cue rail before first object contact is a kick candidate; an object rail on the scoring route is a bank candidate. Preserve this independently of the rules engine's existing `rails` list. Conservatively skip advanced bonuses when near-simultaneous contacts or later interactions make the causal route ambiguous. Base pot credit can still be valid.

Use lightweight geometry and a small procedural sprite/glyph set for the approved Playful shapes. Pool effects and labels for reuse, share materials, and load optional visual resources when Arcade is enabled. No new art-generation pipeline or large texture pack is required.

## 11. Online scoring and recovery

The shooter continues to simulate and submit the shot, as in the existing room protocol. Both clients can react to their local simulation immediately. The server validates the report, resolves pool rules, runs the shared arcade scorer, and broadcasts the accepted points and receipt. Never accept a client-supplied score total as authoritative.

Send compact bounded evidence for the bonuses, with ball IDs, pocket IDs, relevant contact order, capped rail counts, and causal relationships. Do not stream visual particles or per-step trajectories. The current server has a 12,000-character message limit: design and test the complete result payload, including final ball positions, within that bound. Use capped per-ball summaries rather than silently truncating evidence that could change an award.

The server can validate structure, ordering, ranges, membership, and consistency with the accepted pot report. It still relies on the shooter's reported physics, matching the existing casual friend-room model; this does not establish independent physics verification.

Persist accepted arcade state with the accepted rack snapshot. Use rack/play/award identities to make duplicate reports and reconnects idempotent. A rolled-back, rejected, disconnected, or timed-out shot clears provisional points and effects and restores the previous accepted total. Reconnecting restores scores without replaying old pot or rack celebrations. Room and appearance changes preserve the accepted ledger.

Version the scoring schema and update protocol compatibility deliberately. Stored rooms lacking arcade history finish their current rack with the existing rules; start complete arcade tracking on their next fresh rack. Give incompatible clients the existing refresh guidance, and never fabricate points for shots that were not recorded.

## 12. Performance and lifecycle

Begin with shared budgets of roughly 128 visible particle pieces, 12 simultaneous ring/trail effects, eight floating award groups, and a small limited set of arcade audio voices. On busy breaks, combine nearby cosmetic impacts and drop the smallest decorations first. Always retain scoring evidence, pocket/foul feedback, and readable results.

Effects use elapsed presentation time and must not change the fixed physics step, simulation speed, or computer search. Keep materials cheap, avoid per-particle lights and shadow casters, and bound trail length and contact-history storage. Retain only evidence needed for capped bonuses and the current receipt.

A rack reset, game switch, or cancelled online play clears its transient effects and provisional state. A room swap releases obsolete visual resources while retaining valid scoring state. Pausing in a background tab does not replay a backlog of effects on return. Resting contacts during table setup and hidden well contacts remain quiet; the explicit fresh-rack event owns the opening flourish.

Measure against Arcade off in the same scene and camera on representative desktop and mobile devices. Start with a target of no more than about 2 ms additional frame work on the reference desktop and no sustained frame-budget regression on mobile. If a scene exceeds the budget, reduce cosmetic density while preserving all scoring and primary feedback.

## 13. Build order

1. **Prove the Playful treatment in the actual game.** Add a development preview for a pot, bank, scratch, early 8, and rack. Tune label scale, color, anchor positions, bounce, and density in several rooms and camera angles. Use the selected Playful comparison as the visual reference.
2. **Build event observation and the pure scorer.** Cover Cue and Fling play boundaries, ordered contacts, conservative route qualification, pot eligibility, foul resolution, streaks, and exact-once accounting. Keep existing pool-rule decisions intact.
3. **Connect every local mode and the HUD.** Add the persistent toggle, Full/Reduced setting, score totals, provisional subtotal, Last shot receipt, reset behavior, and personal best categories. Wire the computer's actual shots through the same pipeline.
4. **Add the full event and audio set.** Integrate contact, rail, pocket, mistake, placement, and rack treatments; tune simultaneous events and mobile layout.
5. **Complete online support.** Extend result evidence, server-side score calculation, snapshot persistence, deduplication, protocol migration, rematches, and rollback handling. Verify with two clients using different presentation settings.
6. **Tune and finish.** Run the acceptance matrix, compare performance, balance score values using representative shots, update the game help and README, and remove temporary preview controls from the player interface.

The first release includes every existing mode, the five core trick/streak systems, all mistake reactions, and racking. Long/thin-cut awards follow after trajectory classification is reliable. Broader additions such as powers, altered physics, new game rules, public leaderboards, or AI that optimizes arcade points require separate design work.

## 14. Validation and completion criteria

Use deterministic event fixtures to verify base pots, open-table and assigned-group eligibility, multi-bank caps, kicks before contact, combinations with supported ancestry, multiple pots, exact totals and rounding, streak progression, scratches after provisional awards, losing 8s, the break-8 exception, foul wins, duplicate events, and ambiguous contact fallback. Verify that muted or reduced presentation cannot change scoring.

Exercise Free Play launches, holds, placements, cancellations, multiple flings during motion, manual dragging, input switches, and mixed-category bests. Verify a confirmed pot scores once despite repeated well contacts. Verify fresh racks, restored snapshots, re-racks, and rematches each have the intended ledger and animation behavior.

Extend online tests for identical accepted totals on both clients, different effect preferences, maximum valid payloads, invalid evidence, duplicate submission, reconnect, interrupted-shot rollback, timeouts, rack IDs, and old stored-room migration. Preserve existing turn, placement, and rematch checks.

Use the repository's existing checks as appropriate: `npm test`, `npm run physics-test`, `npm run build`, and the built-app `npm run test:online`. Physics regression results must remain consistent because the feature changes presentation and scoring only. Manually inspect all rooms, both ball styles, orbit and overhead views, portrait and short landscape layouts, mute, reduced motion, and a busy break. Profile repeated racks and room changes for accumulating resources.

Completion means:

- Arcade is available and functional across Local, all Computer difficulties, Online, Free Play Cue, and Free Play Fling.
- The approved Playful treatment is recognizable in rewards, mistakes, and the rack flourish.
- Points originate at the correct pocket; other effects originate at their actual contact or table location.
- The user can read what scored and why, and a late foul resolves provisional points clearly.
- Scores, physics, rules, and controls behave consistently regardless of effect visibility or density.
- Online results agree, survive recovery, and never duplicate points or replay historical celebrations.
- Effects stay readable and responsive across rooms, camera positions, and compact screens.
- The feature ships with tested scoring definitions, updated help, and no unresolved gaps in existing game-mode coverage.
