"""Extract the approved logo from its charcoal presentation background.

Requires Pillow, NumPy and SciPy. Run from any directory. Preserve the original
RGB artwork; recover antialiased edges against the nearby charcoal background.
The three spherical masks retain dark planetary detail instead of keying it out.
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

root = Path(__file__).resolve().parents[2]
rgb = np.asarray(Image.open(root / 'pipeline/brand/logo-source.png').convert('RGB'), dtype=float)
bright = rgb.max(axis=2) > 60
core = ndimage.binary_erosion(bright, iterations=2)
_, nearest = ndimage.distance_transform_edt(~core, return_indices=True)
foreground = rgb[tuple(nearest)]
background = np.array([14., 20., 22.])
direction = foreground - background
alpha = np.clip(np.sum((rgb - background) * direction, axis=2)
                / np.maximum(np.sum(direction * direction, axis=2), 1), 0, 1)
alpha[~ndimage.binary_dilation(bright, iterations=2)] = 0
alpha[core] = 1

y, x = np.indices(alpha.shape)
for cx, cy, radius in [(394.5, 349., 71.8), (318., 474., 71.5), (470.5, 474., 71.5)]:
    distance = np.hypot(x - cx, y - cy)
    sphere = np.clip(radius + .5 - distance, 0, 1)
    alpha = np.maximum(alpha, sphere)

# Unmix edge pixels so charcoal does not leave a halo on light backgrounds.
safe_alpha = np.maximum(alpha[..., None], 1 / 255)
color = np.clip((rgb - background * (1 - alpha[..., None])) / safe_alpha, 0, 255)
rgba = np.dstack((color, alpha * 255)).round().astype('uint8')
rgba[rgba[..., 3] == 0, :3] = 0
image = Image.fromarray(rgba, 'RGBA')
left, top, right, bottom = image.getbbox()
padding = 24
image = image.crop((left - padding, top - padding, right + padding, bottom + padding))
image.save(root / 'public/brand/astra-pool-logo.png', optimize=True)
print(f'Saved {image.width}×{image.height} RGBA logo')
