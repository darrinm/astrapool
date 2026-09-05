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
