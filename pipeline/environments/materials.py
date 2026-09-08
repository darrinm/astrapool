"""Tileable PBR surface maps, authored in meters and packed into each furniture GLB.
Runs inside Blender (NumPy is bundled); no network or image-generation service.
"""
import hashlib
from pathlib import Path
import struct
import tempfile
import zlib

import bpy
import numpy as np

SIZE = 512
TILE = .4  # UV distance 1 = 40 cm, shared by all surface maps.
_cache = tempfile.TemporaryDirectory(prefix='pool-materials-')
CACHE = Path(_cache.name)
FIELDS = {}


def noise(cells, seed):
    rng = np.random.default_rng(seed)
    grid = rng.random((cells, cells))
    axis = np.arange(SIZE) * cells / SIZE
    lo = axis.astype(int); t = axis - lo; t = t * t * (3 - 2 * t)
    a = grid[lo[:, None] % cells, lo[None, :] % cells]
    b = grid[(lo[:, None] + 1) % cells, lo[None, :] % cells]
    c = grid[lo[:, None] % cells, (lo[None, :] + 1) % cells]
    d = grid[(lo[:, None] + 1) % cells, (lo[None, :] + 1) % cells]
    return (a * (1-t[:, None]) + b*t[:, None]) * (1-t[None, :]) + (c*(1-t[:, None]) + d*t[:, None])*t[None, :]


def surface_kind(name):
    name = name.lower()
    for kind, words in [
        ('glass', ['glass', 'diffuser']),
        ('fabric', ['wool', 'linen', 'canvas', 'technical upholstery', 'stitch']),
        ('leather', ['leather', 'upholstery']),
        ('wood', ['walnut', 'oak', 'teak', 'rattan', 'stem']),
        ('stone', ['marble', 'travertine', 'basalt', 'gneiss', 'limestone']),
        ('ceramic', ['ceramic', 'terracotta', 'composite']),
        ('leaf', ['sage', 'foliage', 'green']),
        ('soil', ['earth', 'soil', 'gravel']),
    ]:
        if any(word in name for word in words): return kind
    return 'metal'


def fields(kind):
    if kind in FIELDS: return FIELDS[kind]
    y, x = np.mgrid[:SIZE, :SIZE] / SIZE
    broad, medium, fine = noise(4, 7), noise(18, 19), noise(96, 31)
    if kind == 'wood':
        warp = .035 * noise(5, 20) + .018 * np.sin(2*np.pi*y*2)
        grain = .5 + .5*np.sin(2*np.pi*(x+warp)*72)
        pores = (.5+.5*np.sin(2*np.pi*(x+warp)*184)) ** 12
        height = .55*grain + .25*medium + .2*pores
        shade = .67 + .34*broad + .17*grain - .09*pores
        relief = .00028
    elif kind == 'leather':
        # Periodic Voronoi creases form softly raised, irregular leather pebbles.
        count = 100; rng = np.random.default_rng(73); points = rng.random((count,count,2))
        px, py = x*count, y*count; ix, iy = px.astype(int), py.astype(int)
        distances = []
        for dy in [-1,0,1]:
            for dx in [-1,0,1]:
                feature = points[(iy+dy)%count,(ix+dx)%count]
                distances.append((ix+dx+feature[:,:,0]-px)**2+(iy+dy+feature[:,:,1]-py)**2)
        nearest = np.partition(np.stack(distances), 1, axis=0)[:2]
        pebble = np.clip((np.sqrt(nearest[1])-np.sqrt(nearest[0]))*7,0,1)
        height = .8*pebble + .2*fine
        shade = .73 + .24*broad + .13*medium + .045*pebble
        relief = .00022
    elif kind == 'fabric':
        threads = 96
        warp = .5+.5*np.cos(2*np.pi*x*threads)
        weft = .5+.5*np.cos(2*np.pi*y*threads)
        over = ((np.floor(x*threads)+np.floor(y*threads))%2)
        height = .65*np.where(over,warp,weft) + .2*fine + .15*medium
        shade = .70+.18*height+.20*broad+.08*medium
        relief = .00038
    elif kind == 'stone':
        vein = np.exp(-np.abs(np.sin(2*np.pi*(x*3+y*2+noise(6,2)*.7)))*25)
        height = .5*fine + .35*medium + .15*vein
        shade = .69+.32*broad+.12*medium-.18*vein
        relief = .00012
    elif kind == 'metal':
        brushed = np.broadcast_to(np.random.default_rng(4).random((1,SIZE)),(SIZE,SIZE))
        height = .8*brushed+.2*fine
        shade = .82+.10*broad+.08*brushed
        relief = .000045
    elif kind == 'leaf':
        veins = (.5+.5*np.cos(2*np.pi*(x*16+y*8)))**12
        height = .4*veins+.6*medium
        shade = .68+.34*broad+.14*medium-.12*veins
        relief = .0001
    else:
        height = .55*fine+.3*medium+.15*broad
        shade = .72+.27*broad+.10*medium
        relief = .00032 if kind == 'soil' else .00010
    dx = (np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*relief/(2*TILE/SIZE)
    # PNG rows run downward; tangent-space +Y runs upward.
    dy = (np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*relief/(2*TILE/SIZE)
    normals = np.stack([-dx,dy,np.ones_like(dx)],axis=-1)
    normals /= np.linalg.norm(normals,axis=-1,keepdims=True)
    FIELDS[kind] = (shade, .5+.5*normals, height, broad)
    return FIELDS[kind]


def png(path, pixels):
    pixels = np.uint8(np.clip(pixels,0,1)*255+.5)
    def chunk(name, data):
        return struct.pack('>I',len(data))+name+data+struct.pack('>I',zlib.crc32(name+data)&0xffffffff)
    h,w,_ = pixels.shape
    scanlines = b''.join(b'\0'+row.tobytes() for row in pixels)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(scanlines,9))+chunk(b'IEND',b''))


def image_node(nodes, path, data, color=False):
    if not path.exists(): png(path,data)
    image = bpy.data.images.load(str(path),check_existing=True)
    image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
    image.pack()  # Editable .blend sources never depend on the temporary cache.
    node = nodes.new('ShaderNodeTexImage'); node.image = image
    return node


def add_surface(mat, name, color, roughness, metal):
    kind = surface_kind(name)
    if kind == 'glass': return
    shade, normal, height, broad = fields(kind)
    tag = hashlib.sha256(f'{name}-{color}-{roughness}-{metal}'.encode()).hexdigest()[:12]
    linear = np.clip(np.asarray(color)[None,None,:]*shade[:,:,None],0,1)
    srgb = np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055)
    rough = np.clip(roughness + (height-.5)*.18 + (broad-.5)*.15,.09,1)
    orm = np.stack([np.ones_like(rough),rough,np.full_like(rough,metal)],axis=-1)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    base = image_node(nodes,CACHE/f'{tag}-color.png',srgb,True)
    micro = image_node(nodes,CACHE/f'{kind}-normal.png',normal)
    surface = image_node(nodes,CACHE/f'{tag}-orm.png',orm)
    separate = nodes.new('ShaderNodeSeparateColor'); separate.mode='RGB'
    normal_map = nodes.new('ShaderNodeNormalMap')
    links.new(base.outputs['Color'],bsdf.inputs['Base Color'])
    links.new(micro.outputs['Color'],normal_map.inputs['Color'])
    links.new(normal_map.outputs['Normal'],bsdf.inputs['Normal'])
    links.new(surface.outputs['Color'],separate.inputs['Color'])
    links.new(separate.outputs['Green'],bsdf.inputs['Roughness'])
    links.new(separate.outputs['Blue'],bsdf.inputs['Metallic'])
    mat['surface'] = kind
    if kind == 'fabric': bsdf.inputs['Sheen Weight'].default_value=.25


def project_uv(obj):
    """Box projection in physical units; wood grain follows each part's long axis."""
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name='Surface meters')
    coords = [v.co * obj.scale for v in mesh.vertices]
    extent = [max(v[a] for v in coords)-min(v[a] for v in coords) for a in range(3)]
    for face in mesh.polygons:
        normal = face.normal
        drop = max(range(3),key=lambda a:abs(normal[a]))
        axes = sorted((a for a in range(3) if a!=drop),key=lambda a:extent[a])
        for index in face.loop_indices:
            co = coords[mesh.loops[index].vertex_index]
            uv.data[index].uv = (co[axes[0]]/TILE,co[axes[1]]/TILE)
