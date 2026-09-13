# Your Shot — action trailer (historical notes)

These notes describe an earlier edit. See [the current trailer workflow](../README.md) for the approved final and rebuild instructions.

The finished video is `../astra-pool-action-trailer-v3.mp4`: 49 seconds, 1080p, 30 fps, stereo sound. The earlier launch trailer is preserved.

This cut includes fast macro shots, moving cameras, a slow-motion break, real Tricky computer search paths, computer-selected bank and kick shots, portrait and landscape mobile gameplay, environment cuts, and Black Hole Gravity. The 150 BPM electronic score is original synthesis. Collision sounds are placed at the actual times logged by the renderer, including speed changes.

## Reproduce

From the repository root:

1. `node pipeline/trailer/action/prepare.mjs`
2. Run `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort` and `node pipeline/trailer/action/server.mjs` separately.
3. Open `http://127.0.0.1:5173/pipeline/trailer/action/capture.html`. Click **Render trailer footage** and wait for completion.
4. `python3 pipeline/trailer/action/compose.py`

Requires FFmpeg with libass, NumPy, and the macOS Arial/Arial Black/Baskerville fonts.

`prepare.mjs` generates a capture-only copy of the current pool module with snapshot and cue-windup hooks. The production source is not modified. `search-worker.js` runs the real Tricky algorithm against snapshots of the live table. Search candidates are replayed at an editorial cadence, then the selected shot is applied to the same world. These are staged layouts with actual physics and computer choices, not recorded competitive matches.

The mobile sequence runs the game in actual 390×844 and 844×390 iframe viewports at 2× pixel density. The game's responsive HUD is rasterized from its DOM and computed styles, then composited with the moving gameplay into a phone frame. The phone frame and promotional copy are editorial graphics.

`render/capture.json` keeps search results, chosen plans, live shot receipts, sound events, and the edit timeline for verification. Generated frames, modules, and videos are ignored by Git.

The revised titles introduce the three play modes: “You vs. a friend,” “You vs. show-off AI,” and “You vs… yourself!” The first action cut is preserved as `../astra-pool-action-trailer.mp4`.

The closing card identifies Astra Pool as free and open source and includes `github.com/darrinm/astrapool` below the play URL.
