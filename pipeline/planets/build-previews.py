#!/usr/bin/env python3
"""Build small startup maps; original credited maps remain the detail tier."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
MAPS = ROOT / 'public' / 'planets'
OUT = MAPS / 'preview'
OUT.mkdir(exist_ok=True)

for source in sorted(MAPS.iterdir()):
    if source.suffix not in {'.jpg', '.png'}:
        continue
    with Image.open(source) as image:
        # The thin ring strip is already tiny; retain its full width and alpha.
        if source.stem != 'saturn-ring':
            image.thumbnail((512, 512), Image.Resampling.LANCZOS)
        image.save(OUT / f'{source.stem}.webp', quality=82, method=4)
print(f'{len(list(OUT.glob("*.webp")))} previews: {sum(p.stat().st_size for p in OUT.glob("*.webp")):,} bytes')
