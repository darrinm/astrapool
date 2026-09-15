"""Crop the approved rack emblem and export app icons. Requires Pillow."""
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[2]
public = root / 'public'
logo = Image.open(public / 'brand/astra-pool-logo.png').convert('RGBA')
# The gap before the wordmark starts beyond x450. Trim transparent margins
# inside this emblem-only region; never redraw or regenerate the planets.
emblem = logo.crop((0, 0, 450, logo.height))
emblem = emblem.crop(emblem.getbbox())


def icon(size, inset, background=(0, 0, 0, 0)):
    canvas = Image.new('RGBA', (size, size), background)
    mark = emblem.copy()
    mark.thumbnail((size - 2 * inset, size - 2 * inset), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas


icon(512, 32).save(public / 'brand/app-icon.png', optimize=True)
icon(192, 12).save(public / 'favicon.png', optimize=True)
# Store native-size frames so the tiny browser-tab versions use tighter spacing.
frames = [icon(size, max(1, size // 32)) for size in (16, 32, 48)]
frames[-1].save(public / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)],
                append_images=frames[:-1])
# iOS supplies its own corner mask. Give its home-screen icon an opaque backdrop.
icon(180, 18, '#101719').convert('RGB').save(public / 'apple-touch-icon.png', optimize=True)

# Optional native app catalog export; no extra dependency beyond this pipeline.
if __name__ == '__main__':
    import sys
    if '--ios' in sys.argv:
        target = root / 'ios/AstraPool/Assets.xcassets/AppIcon.appiconset/AppIcon.png'
        target.parent.mkdir(parents=True, exist_ok=True)
        mark = icon(512, 32).resize((1024, 1024), Image.Resampling.LANCZOS)
        canvas = Image.new('RGBA', (1024, 1024), '#101719')
        canvas.alpha_composite(mark)
        canvas.convert('RGB').save(target, optimize=True)
