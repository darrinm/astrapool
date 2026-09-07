# Pool room art

The four optional rooms use production assets rather than runtime canvas illustrations.
Minimal keeps its original code, textures, lighting, and silence.

- `prompts.json`: exact prompts used with the built-in image generation tool.
- `corner.blend`, `desert.blend`, `tokyo.blend`, `orbital.blend`: editable furniture scenes.
- `build.py`: deterministic Blender 5.x builder. It runs in an isolated background process and does not modify an open Blender project.
- `../../public/environments/*.webp`: generated 1774 × 887 full-sphere room panoramas, encoded as WebP at quality 88. These also serve as chooser previews.
- `../../public/environments/*-furniture.glb`: furniture exported from Blender, with bevels, weighted normals and physically based materials, joined by material to limit draw calls.

Rebuild the furniture from the repository root (Blender must be installed):

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python pipeline/environments/build.py -- "$PWD"
```

Blender coordinates are meters and Z-up. GLB export converts to Y-up; the game rotates it back to Z-up and scales by 1 / 0.026. The photo capture height is 1.6 m. Furniture remains outside the table footprint and has no physics colliders.

Room direction:

- **The Corner Pocket:** walnut parquet, oxblood tufted leather, aged brass and warm light.
- **Desert Modern:** honed travertine, saddle leather, oak and sculpted agave at sunset.
- **Tokyo Rooftop:** rain beyond a sheltered floor, city light, black leather and dark steel.
- **Orbital Lounge:** the Earth through panoramic glazing, titanium sled chairs and ivory upholstery.

The game uses Three.js GroundedSkybox for nearby floor parallax and a surrounding photographic dome. This is a lightweight hybrid environment, not fully modeled architecture: large camera translations can reveal projection distortion. The normal play and overhead views stay within the intended viewing area. No external image service is contacted during play.
