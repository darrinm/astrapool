# Lessons

Carried over from playful-photos when the pool game was extracted (2026-09-05).

## 2026-09-05 — Physics validation harness
- Two of the first three failures were test-design bugs (a threshold, a missing "speed at impact"); one was a
  real physics bug (rolling resistance at 5/7). Rule: when a check fails, first prove the measurement is right
  with a minimal probe before touching the physics. The probe scripts took minutes and settled each case.
- Rule: sweep the parameter that could plausibly matter (step rate, speed) and read the trend; the direction of
  the trend (worse at *low* speed) identified the mechanism when the magnitude alone didn't.

## 2026-09-05 — Orientation from screenshots
- I judged face orientation on spheres from oblique screenshots twice and got it backwards both times; the user
  caught it. Rule: for orientation questions, derive the answer (which local axis is the crown / digit top, where
  the rotation sends it) and verify numerically; use the screenshot only as a final sanity check.

## 2026-09-05 — Ball "stuck in the pocket" was a ball under the rail
- The felt collider spans the whole slab, including under the rail wood; the pocket well walls stopped 1.2 below
  the felt. A fast ball skipped across the hole, landed on the felt under the rail and stopped at the backstop;
  only its top poked above the rail as a small white disc. The user's read ("stuck in the hole") was reasonable
  and wrong, and I nearly chased it. Rule: when a report and a screenshot disagree on scale or place, trust the
  screenshot's geometry (the disc was far too small for a ball at table height) and work out where the object
  must be before touching code.
- Rule: every collider a ball can meet gets the shared combine rules (restitution Min, friction Max); a collider
  without them silently averages with the ball's 0.95 and bounces twice as hard as its own number says.
- Rule: geometry that only the scene builds is geometry the harness never tests. Table furniture lives in
  physics/poolphysics.js so validate.mjs runs the real table.

## 2026-09-05 — Fling "stops cold": lostpointercapture before pointerup
- The user's Chrome fired `lostpointercapture` (buttons=0) before the canvas's pointerup handler ran; the code treated
  it as a cancel and zeroed the ball. My Playwright Chromium and CDP input fired it after pointerup, so nothing I
  drove myself reproduced it, and I spent two rounds tuning the velocity estimator (also improved, but not the bug).
- Rule: when a bug "works for me", get the user's real event stream before theorising. A 20-line reporter posting
  each release to a local collector settled it in one round; the same tab was served from this repo, so it was free.
- Rule: browsers disagree on pointer-capture event order (w3c/pointerevents#357). Never treat lostpointercapture as
  a cancel when no button is held: it is the release.
- Rule: a hidden tab has no rAF; the extension tab is hidden while tools run. Use headed Playwright for loop-dependent checks.

## 2026-09-07 — Measuring a paused render loop
- Verifying the pocket map, I read `camera.project()` from a tool call and got positions far off screen.
  The tab is backgrounded while tools run, so there is no rAF: `camera.matrixWorldInverse` was whatever the
  last visible frame left. The map itself was fine.
- Rule: before projecting anything from a tool call, `camera.updateMatrixWorld(true)` and
  `updateProjectionMatrix()` first. A stale matrix reads as a wrong answer, not as an error.
- Rule: `element.hidden = false` does nothing if the element's `hidden` *attribute* is still set and you
  have shadowed the property with `Object.defineProperty`. Remove the attribute too, or CSS keeps hiding it.

## 2026-09-07 — An iframe resize that fires no resize event
- Verifying the deferred-refit fix, the camera never re-framed and the fix looked broken. It wasn't:
  setting an iframe's `width`/`height` attributes changes `innerWidth`/`innerHeight` but fires **no**
  `resize` event, so the handler under test never ran. A listener counting events proved it: 0 fired.
- Rule: before concluding a resize-driven fix is broken, assert the event actually fired. Change the
  size *and* dispatch `new Event('resize')` — that pair is what a real rotation does.
- Rule (again, the 2026-09-05 one): prove the measurement before touching the code. Two of the three
  "failures" this session were the harness, not the product.

## 2026-09-07 — Check a review's fix, not just its finding
- A review reported the Minimal room preview overflowing the top of its clipped art panel and lowered
  the table to compensate. Measured: at 18px it had 8px of headroom (no clip), and the "fix" pushed it
  5px past the *bottom* edge at every breakpoint — a regression fixing a defect that did not exist.
- Rule: for a visual finding, measure both edges before and after. A fix that only moves a box can
  trade one overflow for another, and the claim reads just as plausibly either way.
