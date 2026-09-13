"""Bake floor-shadow overlays from the shipped furniture GLBs (Python + Pillow + NumPy).
Run from any directory: python3 pipeline/environments/shadows.py [room ...]
The GLBs are static, opaque, indexed triangle meshes exported by build.py.
"""
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2] / 'public' / 'environments'
# Meters, in the game's Z-up coordinates. Keep in sync with environments.js.
BOUNDS = (-1.8, .8, 4.0, 3.7)
SIZE = (2048, 1024)
# Broad fill direction and softness, tuned to each room's illumination.
LIGHT = {
    'corner': (.12, .08, 1.0), 'desert': (.30, .18, .8),
    'tokyo': (.10, .07, 1.2), 'orbital': (.12, .08, 1.1),
    'alpine': (.16, .10, 1.1), 'glasshouse': (.22, .14, .85),
    'coast': (.28, .16, .8), 'riad': (.10, .07, 1.0),
}


def triangles(path):
    data = path.read_bytes()
    magic, version, _ = struct.unpack_from('<III', data)
    assert magic == 0x46546c67 and version == 2
    length = struct.unpack_from('<I', data, 12)[0]
    doc = json.loads(data[20:20 + length])
    binary = memoryview(data)[28 + length:]

    def accessor(index):
        a = doc['accessors'][index]
        assert 'sparse' not in a
        v = doc['bufferViews'][a['bufferView']]
        dtype = {5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
        count = {'SCALAR': 1, 'VEC3': 3}[a['type']]
        return np.ndarray((a['count'], count), dtype=dtype, buffer=binary,
                          offset=v.get('byteOffset', 0) + a.get('byteOffset', 0),
                          strides=(v.get('byteStride', np.dtype(dtype).itemsize * count), np.dtype(dtype).itemsize))

    def visit(index, parent):
        n = doc['nodes'][index]
        if 'matrix' in n:
            local = np.array(n['matrix']).reshape(4, 4).T
        else:
            x, y, z, w = n.get('rotation', [0, 0, 0, 1])
            local = np.eye(4)
            local[:3, :3] = np.array([
                [1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]) @ np.diag(n.get('scale', [1, 1, 1]))
            local[:3, 3] = n.get('translation', [0, 0, 0])
        matrix = parent @ local
        if 'mesh' in n:
            for p in doc['meshes'][n['mesh']]['primitives']:
                assert p.get('mode', 4) == 4
                positions = accessor(p['attributes']['POSITION'])
                world = np.c_[positions, np.ones(len(positions))] @ matrix.T
                # glTF Y-up -> game Z-up, exactly as the runtime's +90° X rotation.
                world = world[:, [0, 2, 1]] * [1, -1, 1]
                yield world[accessor(p['indices']).reshape(-1, 3)]
        for child in n.get('children', []):
            yield from visit(child, matrix)

    for root in doc['scenes'][doc.get('scene', 0)]['nodes']:
        yield from visit(root, np.eye(4))


def bake(room):
    layers = [Image.new('L', SIZE) for _ in range(3)]
    draws = [ImageDraw.Draw(layer) for layer in layers]
    dx, dy, softness = LIGHT[room]
    x0, y0, x1, y1 = BOUNDS
    scale = np.array([SIZE[0] / (x1-x0), SIZE[1] / (y1-y0)])
    for mesh in triangles(ROOT / f'{room}-furniture.glb'):
        for triangle in mesh:
            height = max(0, triangle[:, 2].mean())
            band = 0 if height < .09 else 1 if height < .5 else 2
            projected = triangle[:, :2] + np.maximum(triangle[:, 2:3], 0) * [dx, dy]
            pixels = (projected - [x0, y0]) * scale
            # PNG top row is the far (+Y) side of the floor plane.
            pixels[:, 1] = SIZE[1] - pixels[:, 1]
            assert (pixels >= 10).all() and (pixels < np.array(SIZE) - 10).all(), f'{room}: shadow exceeds atlas bounds'
            draws[band].polygon([tuple(p) for p in pixels], fill=255)
    transmission = np.ones((SIZE[1], SIZE[0]))
    for layer, radius, opacity in zip(layers, [.012, .055, .11], [.55, .32, .27]):
        blurred = layer.filter(ImageFilter.GaussianBlur(radius * scale[0] * softness))
        transmission *= 1 - np.asarray(blurred) / 255 * opacity
    image = Image.new('RGBA', SIZE)
    image.putalpha(Image.fromarray(np.round(255 * (1-transmission)).astype('uint8')))
    for suffix, size in [('', SIZE), ('-mobile', (1024, 512))]:
        output = ROOT / f'{room}-shadows{suffix}.png'
        image.resize(size, Image.Resampling.LANCZOS).save(output, optimize=True)
        print(output.name, output.stat().st_size)


if __name__ == '__main__':
    for room in sys.argv[1:] or LIGHT:
        bake(room)
