# Planet balls

The runtime uses Three.js spheres and lightweight ring/moon geometry. Blender is unnecessary
for this collection: the important assets are equirectangular surface maps, and generating the
accessories in the renderer preserves detail at every zoom without shipping duplicate GLBs.

## Reproduce the maps

Run `python3 pipeline/planets/fetch.py` from any directory (Python with Pillow 12.1.1).
It downloads the original assets (or reads checked-in artistic sources) and verifies the source and output SHA-256 checksums in
`public/planets/credits.json`. If an upstream file changes, inspect it and deliberately update
its checksum before accepting it. The Solar System Scope JPG and PNG files are unchanged upstream assets. NASA VTAD maps
are extracted from GLB base-color images, resized to at most 2048 × 1024 (1024 × 512 for the new
small companions) and encoded as JPEG (quality 91). Per-asset dimensions are in the manifest.

Maps: **Solar System Scope / INOVE**, https://www.solarsystemscope.com/textures/,
**CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/. The pack is based on NASA imagery
and elevation data; its own notes acknowledge enhanced color and invented infill where maps
are incomplete. Attribution is also accessible in the collection's in-game details.

Additional maps: **NASA Visualization Technology Applications and Development (VTAD)**,
https://science.nasa.gov/3d-resources/, under NASA media usage guidelines. Each model's resource
page, direct download, source checksum and extraction recipe are recorded per asset in the manifest.
No NASA logos or implied endorsement. Apart from the six artistic reconstructions described
below, their source colors and neutral unmapped regions are retained. Phobos uses the JPL Solar
System Simulator’s grayscale Viking map unchanged. Deimos uses an artistic reconstruction of
its Viking map from the same source; the original source and checksum remain in the manifest.
Both maps fit the sphere projection. Charon’s reconstruction reference is the USGS-distributed
New Horizons mosaic, cropped to
restore 2:1 projection with its black no-data pixels initially replaced by neutral gray.
That reference and preparation recipe remain in the manifest.

## Art direction

- Sun cue: generated golden photosphere with granulation and small sunspots, animated UV
  distortion, limb darkening, compact additive corona and three subtle prominence loops.
  This is artistic solar imagery, not a calibrated observation. Original PNG and exact
  image_gen prompt are in `sources/`; the manifest rebuilds the runtime JPEG. The ball
  keeps the normal cue geometry, collision shape and input behavior. Its decorations have
  no raycast or collider, and its shared animation time supports replay pause/seek.
  It has no number cap and casts no shadow of its own, including the contact-shadow decal.
  Classic/Heads restore the cue’s normal shadow. A warm, short-range point light illuminates nearby balls
  and felt, with a 512-pixel cube shadow map. Its near plane excludes the emitting
  sphere. One scene-owned light follows the active live/replay cue, turns off below
  the felt or outside Planets, and releases its shadow map on scene teardown.

- Mercury: cratered gray rock. Venus: opaque golden cloud deck, not a visible radar surface.
- Earth: geographic day map plus a slightly raised transparent cloud shell.
- Mars: actual surface albedo features, warm ochre/red, no added ring.
- Jupiter: actual cloud bands and Great Red Spot map; faint dust ring, four Galilean companions.
- Saturn: banded atmosphere and the supplied radial ring map, including gaps; Titan and Enceladus.
- Uranus: pale cyan, narrow brightened rings, Titania and Oberon.
- Neptune: the old source map is enhanced blue. Mix toward pale blue-green before the optional
  saturation boost; narrow rings with a short brighter arc and Triton.
- The 8 uses one camera-facing shader that integrates curved light paths through an animated
  gold disk, joining its front band and lensed upper/lower arcs. Disk axes follow the ball.
  The Schwarzschild-inspired integration uses bounded steps, a finite emitting thickness,
  and a compact stylized inner flow. It does not refract the table/background or implement
  a full relativistic renderer. Replay time controls the flow.
  Visual reference: https://ebruneton.github.io/black_hole_shader/.
- Object balls 9–15: Neptune, Moon, Io, Europa, Ganymede, Titan, Pluto, each with its own map.
  Callisto remains a small Jupiter companion.
  Io has mottled sulfur/volcanic terrain, Europa has fractured ice, Ganymede and Callisto have
  cratered surfaces, Titan has an opaque golden haze, and Pluto has an artistic reconstruction based on the NASA global map.
  The cue is the Sun in this collection; Classic and Heads retain the plain white cue. Pluto has a compressed Charon companion.
  Pluto, Charon, Titania, Oberon, Triton and Deimos use 1774 × 887 artistic reconstructions
  generated with built-in image_gen from each moon/world’s own map.
  Blurry and missing terrain is artistically filled; some observed details are also reinterpreted.
  This is not recovered scientific imagery. The original source URLs, preparation recipes and checksums remain
  in the manifest. Each generated PNG and exact prompt are in `sources/`; fetching rebuilds its
  JPEG from that PNG, without needing to regenerate it. A half-turn longitude offset retains
  map alignment; all worlds rack north-pole-up.
- Charon retains dark polar terrain and smoother fractured plains; Titania has cratered
  terrain and long fractures; Oberon emphasizes old impact terrain and brighter ejecta;
  Triton has pale icy plains, subtle cellular terrain and a bright southern frost region.
- Deimos retains the Viking map’s broad crater placement and muted gray dusty-rock palette,
  with the blank margins and blurry coverage filled into continuous, softly cratered terrain.
- Every companion uses its own image map; namesake full-size balls share the same source textures. Phobos and Deimos are elongated; the larger companions are round.

NASA references: https://science.nasa.gov/solar-system/moons/,
https://science.nasa.gov/uranus/facts/,
https://www.nasa.gov/image-article/jupiters-rings-revealed/.
Neptune color reference: https://academic.oup.com/mnras/article/527/4/11521/7511973
(Irwin et al., 2024; the Voyager presentations exaggerate the difference between the ice giants).

The material's shared `planetSaturation` uniform makes adjustment immediate without rebaking
maps. Default 1 (100%); range 1–1.7. The heads' shared `capCanvas` supplies the same number
and stripe artwork, projected onto curved patches just above the surface/clouds. Caps are visible only
during local human aiming and counter-rotate to stay on world +Z, without rotating the planet or its
companions. Planet saturation leaves the separate caps unchanged. Neptune's rebalance lives in `createPlanetSet`. Rings and moons
use compressed dimensions. Rings align with the surface map's equator; all companions inherit
the parent planet's rotation, including during rack animations and replay. Moons orbit in that local
plane on 11–21 second periods (Triton runs retrograde); replay uses its timeline, so pausing and seeking also control the moons.
Saturn’s source strip gets fine density modulation and a clearer main division, plus a thin outer
ring. Other rings have finer bands and tapered density. Dense Saturn bands use alpha-tested
shadow materials, shared with replay clones, so ring gaps stay open in their shadows.

Moons cast and receive shadows; their motion invalidates cached shadows even on stationary balls.
They are decorative children, excluded from raycasting, with no extra colliders or gameplay data.
They share resources across companions/replays and release those resources on table teardown.

A future collection starts with an entry in `src/ball-sets.js` (the picker and B shortcut use
that catalog), an owned renderer like `createPlanetSet`, and a loading/attachment branch in
`setBallStyle`. Keep loading atomic, preserve the original ball materials and physics bodies,
and ensure decorations can be cloned by `ReplayView` without owning their shared resources.

Visual references: https://www.nasa.gov/universe/nasa-visualization-shows-a-black-holes-warped-world/
and https://science.nasa.gov/photojournal/rings-and-shadows/.
