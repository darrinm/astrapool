"""Replace the painted Earth in the Orbital Lounge panorama with a render of NASA's Blue Marble and Black Marble.

The window frame, the two mullions and the stars stay from the original artwork. Steps:
1. Mask the glass: per column, from the first row that opens onto space down to the sill, which is traced per pane
   as the continuous path of strongest brightening. The mullions are traced row by row the same way, as the
   (centre, width) path with the strongest edges on both sides.
2. Fit the painted Earth's outline: limb samples along the lit side, converted to view directions, lie on a
   circle of the view sphere, i.e. a plane a . d = cos(rho). The fit keeps the top of the painted limb; the render
   uses a smaller angular radius (a higher orbit) so the map is downsampled rather than magnified.
3. Render the sphere lit from the west, with city lights past the terminator, clouds and a thin atmosphere rim,
   composite it through the glass mask, and replace any painted Earth outside the new disc with star field copied
   from higher in the same column.

usage: orbital_earth.py <panorama in> <maps dir> <panorama out> [overlay out] [lat= lon= sun_up= gain=]
Run on the 4096 x 2048 Lanczos reduction of the master; see README.md for the maps and the encode step.
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
src, maps, out = sys.argv[1:4]
overlay_path = sys.argv[4] if len(sys.argv) > 4 and '=' not in sys.argv[4] else None
ARGS = dict(a.split('=', 1) for a in sys.argv[4:] if '=' in a)   # optional overrides of the view and exposure
pano = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
H, W, _ = pano.shape
lum = pano @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def directions(us, vs):
    lon = (us + 0.5) / W * 2 * np.pi - np.pi
    lat = np.pi / 2 - (vs + 0.5) / H * np.pi
    return np.stack([np.cos(lat) * np.sin(lon), np.sin(lat), np.cos(lat) * np.cos(lon)], -1)


# ---- window region (fractions of the panorama, from inspection of the 4096 x 2048 artwork) ----
X0, X1, Y0, Y1 = int(0.18 * W), int(0.825 * W), int(0.264 * H), int(0.61 * H)
win = lum[Y0:Y1, X0:X1]
cols = X1 - X0
dark = ndimage.uniform_filter(win, 3) < 0.06

# Upper edge of the glass: the first row that starts a stretch of space (12 of the next 15 rows dark). A thin dark
# gasket line along the frame is 1-3 px and does not qualify.
runs15 = ndimage.uniform_filter1d(dark.astype(np.float32), 15, axis=0, origin=-7) * 15
starts = runs15 >= 12
top = np.array([np.argmax(starts[:, c]) if starts[:, c].any() else -1 for c in range(cols)])

# ---- mullions: in each row above the Earth, a bright gap between two stretches of black space ----
def mullion_edges():
    """Per row, the (left, right) columns of each non-dark run of 25-160 px bounded by space on both sides."""
    found = {}
    for r in range(dark.shape[0]):
        row = dark[r]
        labels, n = ndimage.label(~row)
        for k in range(1, n + 1):
            xs = np.nonzero(labels == k)[0]
            if 25 <= len(xs) <= 160 and xs[0] > 0 and xs[-1] < cols - 1 and row[xs[0] - 1] and row[xs[-1] + 1]:
                found.setdefault(r, []).append((xs[0], xs[-1]))
    return found

runs = mullion_edges()
# Each mullion is traced row by row with a dynamic program over (centre, width): the score of a row is the edge
# strength at both sides, and the path may move its centre 2 px and its width 1 px per row. The runs found in
# the rows of black space seed the search window.
gx = np.abs(ndimage.sobel(ndimage.gaussian_filter(win, 1.0), axis=1))
WIDTHS = np.arange(22, 70)
def trace(seed_centre):
    pts = np.array([(r, a, b) for r, rr in runs.items() for a, b in rr if abs((a + b) / 2 - seed_centre) < 220], float)
    lo, hi = int((pts[:, 1].min()) - 40), int(pts[:, 2].max() + 40)
    centres = np.arange(max(lo, 40), min(hi, cols - 40))
    r0 = int(pts[:, 0].min())
    nr = win.shape[0] - r0
    score = np.zeros((nr, len(centres), len(WIDTHS)), np.float32)
    for i, w in enumerate(WIDTHS):
        score[:, :, i] = gx[r0:, centres - w // 2] + gx[r0:, centres + (w - w // 2)]
    acc = score[0].copy(); back = np.zeros((nr, len(centres), len(WIDTHS), 2), np.int16)
    for r in range(1, nr):
        # best predecessor within +-2 centre, +-1 width
        best = np.full_like(acc, -np.inf); arg = np.zeros(acc.shape + (2,), np.int16)
        for dc in range(-2, 3):
            for dw in (-1, 0, 1):
                shifted = np.full_like(acc, -np.inf)
                sc = slice(max(0, dc), len(centres) + min(0, dc)); tc = slice(max(0, -dc), len(centres) + min(0, -dc))
                sw = slice(max(0, dw), len(WIDTHS) + min(0, dw)); tw = slice(max(0, -dw), len(WIDTHS) + min(0, -dw))
                shifted[tc, tw] = acc[sc, sw]
                better = shifted > best
                best[better] = shifted[better]; arg[better] = (dc, dw)
        acc = best + score[r]; back[r] = arg
    ci, wi = np.unravel_index(np.argmax(acc), acc.shape)
    path = np.zeros((win.shape[0], 2))
    for r in range(nr - 1, -1, -1):
        path[r0 + r] = (centres[ci], WIDTHS[wi])
        if r: dc, dw = back[r, ci, wi]; ci, wi = ci + dc, wi + dw
    path[:r0] = np.nan
    return path

mullions = [trace(0.37 * W - X0), trace(0.62 * W - X0)]

# ---- lower edge of the glass: per pane, the continuous path of strongest downward brightening (glass to the
# frame's lit lip). A cloud edge is short and breaks continuity; the sill runs the width of the pane. The path may
# climb 3 rows per column, enough to follow the rounded corners into the mullions and the pane ends.
gy = ndimage.sobel(ndimage.gaussian_filter(win, 1.2), axis=0)
band0, band1 = int(0.475 * H) - Y0, int(0.607 * H) - Y0
def trace_bottom(c0, c1):
    score = gy[band0:band1, c0:c1].T          # (columns, rows)
    acc = score[0].copy(); back = np.zeros(score.shape, np.int16)
    for c in range(1, score.shape[0]):
        best = ndimage.maximum_filter1d(acc, 7, mode='constant', cval=-np.inf)
        idx = np.arange(len(acc))
        # argmax within the window, recovered by comparing shifted copies
        arg = np.zeros(len(acc), np.int16)
        for dv in range(-3, 4):
            src = np.clip(idx + dv, 0, len(acc) - 1)
            arg = np.where(acc[src] == best, dv, arg)
        back[c] = arg; acc = best + score[c]
    v = int(np.argmax(acc)); path = np.zeros(score.shape[0], int)
    for c in range(score.shape[0] - 1, -1, -1):
        path[c] = band0 + v; v = int(np.clip(v + back[c, v], 0, score.shape[1] - 1))
    return path
foot = win.shape[0] - 30    # the mullions' columns just above the sill split the panes
edges = [0]
for path in mullions:
    mid, half = path[foot, 0], path[foot, 1] / 2
    edges += [int(mid - half), int(mid + half)]
edges.append(cols)
bottom = np.full(cols, float(band1))
for c0, c1 in zip(edges[0::2], edges[1::2]):
    bottom[c0:c1] = trace_bottom(c0, c1)

# ---- glass mask ----
rows = np.arange(win.shape[0])[:, None]
glass = (top[None, :] >= 0) & (rows >= top[None, :] + 2) & (rows <= bottom[None, :] - 2)
for path in mullions:
    mid, half = path[:, 0], path[:, 1] / 2 + 1
    valid = ~np.isnan(mid)
    glass[valid] &= ~(np.abs(np.arange(cols)[None, :] - mid[valid, None]) <= half[valid, None])
glass = ndimage.binary_erosion(glass, iterations=1)   # stay off the frame by one pixel
# Night-side pane: the glass is what connects to open space without crossing the frame's bright metal rim. The
# shadowed strip between the rim and the pillar at the pane's outer end is dark enough to pass for space above.
rim_metal = ndimage.uniform_filter(win, 3) > 0.18   # the rim highlight is blue-white, so no saturation test; stars and lights become holes that fill back
right0 = int(mullions[1][foot, 0] + mullions[1][foot, 1] / 2) + 2
labels, _ = ndimage.label(glass & ~rim_metal)
seed_col = (right0 + cols) // 2
seed_row = top[seed_col] + 40
reach = ndimage.binary_fill_holes(labels == labels[seed_row, seed_col])
glass[:, right0:] &= reach[:, right0:]

# ---- limb fit on the lit side ----
E = ndimage.uniform_filter(win, 9) > 0.07
samples = []
for c in range(cols):
    if top[c] < 0: continue
    col = E[top[c]:, c]
    run = np.convolve(col.astype(int), np.ones(20, int), 'valid') == 20
    hits = np.nonzero(run)[0]
    r = top[c] + hits[0] if len(hits) else -1
    if len(hits) and hits[0] > 8 and glass[r, c] and Y0 + r < 0.52 * H: samples.append((X0 + c, Y0 + r))
samples = np.array(samples, float)
d = directions(samples[:, 0], samples[:, 1])
keep = np.ones(len(d), bool)
for _ in range(8):   # trimmed least squares: refit on the 80% of samples nearest the current circle
    centre = d[keep].mean(0)
    axis = np.linalg.svd(d[keep] - centre)[2][2]
    if axis @ centre < 0: axis = -axis
    c = centre @ axis
    err = np.abs(d @ axis - c); keep = err <= np.percentile(err, 80)
fit_rho = np.arccos(c)
fit_rms = np.sqrt(np.mean((d[keep] @ axis - c) ** 2))
# The painted outline fits a circle of ~84 deg: Earth from ~30 km, whose visible patch would be magnified ~3x from
# the best available map. Keep the top of the limb where the painting has it (same azimuth and elevation) and render
# from a higher orbit instead, so the texture is downsampled into the panorama.
RHO = np.radians(62)
top_elev = np.arcsin(axis[1]) + fit_rho
azimuth, elev = np.arctan2(axis[0], axis[2]), top_elev - RHO
axis = np.array([np.cos(elev) * np.sin(azimuth), np.sin(elev), np.cos(elev) * np.cos(azimuth)])
rho = RHO
print(f'painted limb: top at {np.degrees(top_elev):.1f} deg elevation, fitted radius {np.degrees(fit_rho):.2f} deg from {keep.sum()} of {len(d)} samples, '
      f'rms {fit_rms:.5f}; mullion widths {[int(np.nanmedian(q[:, 1])) for q in mullions]} px')

# ---- Earth render ----
def load(name, grey=False):   # kept as uint8: the 21600 x 10800 day map is 2.8 GB as floats
    return np.asarray(Image.open(f'{maps}/{name}').convert('L' if grey else 'RGB'))
day = load('bluemarble-21600.jpg')           # NASA Blue Marble Next Generation, August 2004 (public domain)
night = load('blackmarble-2016-3km.jpg')     # NASA Black Marble 2016 (public domain)
clouds = load('8k_earth_clouds.jpg', True)   # Solar System Scope, CC BY 4.0

def sample(tex, lat, lon):
    th, tw = tex.shape[:2]
    x = ((lon + np.pi) / (2 * np.pi) * tw - 0.5) % tw
    y = np.clip((np.pi / 2 - lat) / np.pi * th - 0.5, 0, th - 1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    x1, y1 = (x0 + 1) % tw, np.minimum(y0 + 1, th - 1)
    if tex.ndim == 3: fx, fy = fx[..., None], fy[..., None]
    t = lambda yy, xx: tex[yy, xx].astype(np.float32) / 255
    return (t(y0, x0) * (1 - fx) + t(y0, x1) * fx) * (1 - fy) + (t(y1, x0) * (1 - fx) + t(y1, x1) * fx) * fy

vv, uu = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
dirs = directions(uu, vv)
# Sphere of radius 1 at distance D along the axis, so its outline subtends rho.
D = 1 / np.sin(rho)
C = axis * D
b = dirs @ C
disc = b * b - (D * D - 1)                    # ray-sphere discriminant
hit = disc > 0
t = b - np.sqrt(np.maximum(disc, 0))
P = dirs * t[..., None] - C                   # surface normal (unit sphere)
# Earth frame: north up (world y projected off the axis), the sub-observer point faces the camera.
o = -axis
up = np.array([0, 1, 0.]) - o * o[1]; up /= np.linalg.norm(up)
east = np.cross(up, axis)   # screen right: the image basis is x right, y up, z forward
nx, ny, nz = P @ east, P @ up, P @ o
# Sub-observer point off West Africa. The window shows the northern half of the disc: the Atlantic under cloud on
# the left, the Canaries and the Saharan coast in the middle, and dusk over the desert towards the right.
LAT0, LON0 = np.radians(float(ARGS.get('lat', 18))), np.radians(float(ARGS.get('lon', -18)))
s = np.array([np.cos(LAT0) * np.cos(LON0), np.cos(LAT0) * np.sin(LON0), np.sin(LAT0)])
e = np.array([-np.sin(LON0), np.cos(LON0), 0])
n_ = np.array([-np.sin(LAT0) * np.cos(LON0), -np.sin(LAT0) * np.sin(LON0), np.cos(LAT0)])
G = nz[..., None] * s + nx[..., None] * e + ny[..., None] * n_
lat, lon = np.arcsin(np.clip(G[..., 2], -1, 1)), np.arctan2(G[..., 1], G[..., 0])
# Sun from the west (viewer's left), a little north, as in the painting: day on the left, dusk and city lights right.
sun = -e + float(ARGS.get('sun_up', 0.15)) * s + 0.15 * n_
sun /= np.linalg.norm(sun)
mu_sun = G @ sun
lit = np.clip(mu_sun * 2.2 + 0.05, 0, 1) ** 0.75
dusk = np.exp(-((mu_sun - 0.02) / 0.06) ** 2)                 # warm band along the terminator
cl = sample(clouds, lat, lon)
surface = sample(day, lat, lon)
surface = surface * (1 - cl[..., None]) + cl[..., None] * np.array([0.95, 0.96, 0.98])
lights = sample(night, lat, lon) * (1 - cl[..., None] * 0.85)
darkness = np.clip(-mu_sun * 12 + 0.15, 0, 1)
colour = surface * lit[..., None] * float(ARGS.get('gain', 1.2)) + (lights ** 1.4) * darkness[..., None] * 0.9
colour = colour * (1 - dusk[..., None] * 0.35) + dusk[..., None] * lit[..., None] * np.array([0.30, 0.13, 0.03])
# Atmosphere: a thin blue rim at the limb, strongest on the day side.
mu_view = np.clip(-(dirs * P).sum(-1), 0, 1)
rim = np.exp(-mu_view / 0.06)
sky = np.array([0.36, 0.6, 1.0])
day_side = np.clip(mu_sun * 3 + 0.35, 0, 1)
colour = colour * (1 - rim[..., None] * 0.6) + sky * (rim * day_side)[..., None] * 0.7
# Halo just outside the disc: height of closest approach above the surface, in radii.
closest = np.sqrt(np.maximum(D * D - b * b, 0))
tangent = (dirs * b[..., None] - C) / np.maximum(closest, 1e-6)[..., None]
halo = np.exp(-np.maximum(closest - 1, 0) / 0.006) * (~hit) * np.clip(tangent @ sun * 3 + 0.35, 0, 1) * 0.8

# ---- composite ----
region = pano[Y0:Y1, X0:X1].copy()
mask = ndimage.gaussian_filter(glass.astype(np.float32), 0.8)
pixel = 2 * np.pi / W                                   # angular size of a panorama pixel
coverage = np.clip((rho - np.arccos(np.clip(dirs @ axis, -1, 1))) / pixel + 0.5, 0, 1)
earth_alpha = coverage * mask
# The painted Earth outside the new disc becomes space: copy the star field from higher in the same column,
# stepping up until the source is glass that was already space.
painted = ndimage.binary_dilation(ndimage.uniform_filter(win, 9) > 0.05, iterations=4) & glass
space_src = glass & ~painted
fill = painted & ~hit
filled = region.copy()
rows_idx, cols_idx = np.nonzero(fill)
src_rows = rows_idx.copy(); pending = np.ones(len(rows_idx), bool)
for step in range(1, 60):
    cand = rows_idx - step * 53
    ok = pending & (cand >= 0)
    ok[ok] = space_src[cand[ok], cols_idx[ok]]
    src_rows[ok] = cand[ok]; pending &= ~ok
filled[rows_idx, cols_idx] = np.where(pending[:, None], 0.0, region[src_rows, cols_idx])
region = np.where(fill[..., None], filled, region)
new = region * (1 - earth_alpha[..., None]) + np.clip(colour, 0, 1) * earth_alpha[..., None]
new = new + sky * (halo * mask)[..., None]
result = pano.copy(); result[Y0:Y1, X0:X1] = np.clip(new, 0, 1)
Image.fromarray((result * 255 + 0.5).astype(np.uint8)).save(out)

if overlay_path:
    ov = (region * 255).astype(np.uint8).copy()
    ov[~glass] = (ov[~glass] * 0.35 + np.array([255, 60, 60]) * 0.65).astype(np.uint8)
    edge = hit ^ ndimage.binary_erosion(hit, iterations=2)
    ov[edge] = [60, 255, 60]
    Image.fromarray(ov).save(overlay_path)
