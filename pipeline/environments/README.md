# Pool room art

The eight optional rooms use production assets rather than runtime canvas illustrations.
Minimal keeps its original textures and lighting, with shared table and foot contact shadows.

- `prompts.json`: exact prompts used with the built-in image generation tool.
- `*.blend`: editable furniture scenes for all eight optional rooms.
- `build.py`: deterministic Blender 5.x builder. It runs in an isolated background process and does not modify an open Blender project.
- `../../public/environments/{corner,desert,tokyo,orbital,alpine,glasshouse,coast,riad}.webp`: 4096 × 2048 full-sphere room panoramas, encoded as WebP at quality 90.
- `../../public/environments/*-preview.webp`: separate 640 × 320 chooser previews at quality 88. Opening the picker does not download the full-size backgrounds.
- `upscale.py`: resumable, offline asset-production step using Topaz High Fidelity V2 through fal. The game never uses the fal key or API.
- `../../public/environments/*-furniture.glb`: furniture exported from Blender, with bevels, weighted normals and physically based materials, joined by material to limit draw calls.

Rebuild the furniture from the repository root (Blender must be installed):

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python pipeline/environments/build.py -- "$PWD"
```

`materials.py` generates tileable 512 × 512 color, tangent-space normal, and packed
roughness/metallic maps. Surfaces include leather pebbling, woven textiles, wood
grain, stone veining, brushed metal, ceramic and foliage. Box-projected UVs use
one repeat per 40 cm, preserving grain scale across individual furniture parts.
The maps are embedded in each GLB and packed into its editable `.blend`; no
texture generation runs in the browser. Only the selected room's maps load, and
all maps are disposed when leaving that room. Glass keeps its smooth finish.

Blender coordinates are meters and Z-up. GLB export converts to Y-up; the game rotates it back to Z-up and scales by 1 / 0.026. The photo capture height is 1.6 m. Furniture remains outside the table footprint and has no physics colliders.

Room direction:

- **The Corner Pocket:** walnut parquet, oxblood tufted leather, aged brass and warm light.
- **Desert Modern:** honed travertine, saddle leather, oak and sculpted agave at sunset.
- **Tokyo Rooftop:** rain beyond a sheltered floor, city light, black leather and dark steel.
- **Orbital Lounge:** the Earth through panoramic glazing, titanium sled chairs and ivory upholstery.
- **Alpine Lodge:** snowy peaks at blue hour, smoked oak and oatmeal wool, a stone hearth and a modeled firewood cradle.
- **The Glasshouse:** a restored botanical conservatory, pale limestone, cane-colored timber seating and a fine-leafed potted palm.
- **Amalfi Terrace:** cream plaster arches, Mediterranean sea, terracotta tile and teak-and-canvas lounge chairs.
- **Atlas Courtyard:** rose tadelakt, emerald zellige and carved cedar, with stitched leather poufs and a glowing brass lattice lantern.

The game uses Three.js GroundedSkybox for nearby floor parallax and a surrounding photographic dome. This is a lightweight hybrid environment, not fully modeled architecture: large camera translations can reveal projection distortion. The normal play and overhead views stay within the intended viewing area. No external image service is contacted during play.

## Upscaling the room art

The original 1774 × 887 image-generation PNGs were upscaled 4× to 7096 × 3548
with `topaz/upscale/image/precision`, model `High Fidelity V2`. Face enhancement
and cropping are disabled; no generative prompt is used. A Lanczos reduction to
4096 × 2048 retains sharper architectural detail while limiting each panorama to
about 43 MiB of RGBA texture memory including mipmaps. Only the chosen room loads;
a room transition temporarily retains the old room until its replacement is ready.
Minimal does not load a panorama.

Use the original lossless source PNG, not a previously upscaled file. Install
`pipeline/requirements.txt` in the local virtual environment first. The existing
`pipeline/falenv.py` helper reads the key from `~/src/iris/.env`; credentials never
enter the published assets. This command makes a billed fal request. Its adjacent
JSON record preserves the request ID so rerunning resumes the existing job.

```sh
.venv/bin/python pipeline/environments/upscale.py /path/to/original.png /path/to/masters/corner.png
magick /path/to/masters/corner.png -filter Lanczos -resize 4096x2048 /tmp/corner-4k.png
cwebp -q 90 /tmp/corner-4k.png -o public/environments/corner.webp
cwebp -q 88 -resize 640 320 /path/to/original.png -o public/environments/corner-preview.webp
```

Keep PNG masters and request records outside `public/`. Repeat for the other room IDs. Check both the normal camera and portrait overhead view.
Upscaling improves sharpness; it does not change the panorama's projection or
turn the photographed architecture into geometry.

Rebuild selected furniture only by appending room IDs after the repository path:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python pipeline/environments/build.py -- "$PWD" alpine glasshouse coast riad
```

The four additional rooms use the same 1.6 m panorama capture height, floor
projection, and asset ownership as the original four. All environments are silent between shots; only pool sound effects remain.

### Orbital Lounge scale correction

`orbital-scale-edit` in `prompts.json` records the edit applied to the original
Orbital panorama. The photographed peripheral seating, cabinets and fixtures
were reduced, the nearby framing was thinned, and the floor divisions made
finer so they read at human scale beside the modeled pool table. This is an
artwork correction; the 1.6 m ground projection, camera and GLB furniture scale
stay unchanged. The edited source was upscaled through the same Topaz pipeline
and replaces both `orbital.webp` and its chooser preview.

### Glasshouse floor correction

`glasshouse-floor-edit` in `prompts.json` records the built-in imagegen edit that
removed photographed interior chairs, planters, and low foliage from the panorama.
These objects were flattening into the GroundedSkybox floor. The revised artwork
keeps a clear limestone floor with botanical planting beyond the glazing; the
existing 3D furniture and palm remain. `glasshouse-floor-seam-edit` records the
follow-up that softens floor joints to reduce the visible panoramic wrap.
The edit uses the same Topaz upscale and
4096 × 2048 / 640 × 320 WebP outputs as the other room assets.

### Floor shadows

`shadows.py` projects the actual shipped furniture triangles onto the floor. Three
height bands keep feet and bases tight while seats, backs, foliage and taller
objects cast softer shadows. Each room has its own fill direction and softness;
photographed scenery retains the shadows already in the panorama. The overlays
are static, so no extra per-frame shadow rendering is needed.

After rebuilding any furniture, regenerate the overlays from the repository root:

```sh
python3 -m pip install -r pipeline/requirements.txt
python3 pipeline/environments/shadows.py
# Or rebuild selected rooms:
python3 pipeline/environments/shadows.py orbital coast
```

This is an entirely local bake; it uses Pillow and NumPy and makes no API calls.
`*-shadows.png` is 2048 × 1024, with a 1024 × 512 `*-shadows-mobile.png` variant.
Only the active room's overlay loads, and its texture is disposed with the room.
Atlas bounds are shared with `src/environments.js`; keep them synchronized if the
furniture moves outside the current bounds. Missing overlays fall back to the
old soft contact patches without blocking the room.

The pool table uses a procedural soft rectangular shadow in every room, plus
four smaller foot shadows for grounded tables. Orbital omits the feet and uses
a broader, softer silhouette to show the hovering gap.
