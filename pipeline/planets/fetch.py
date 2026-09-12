#!/usr/bin/env python3
"""Rebuild planet maps from credited downloads and checked-in artistic sources."""
import hashlib
import json
import io
import struct
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
manifest = json.loads((ROOT / 'public/planets/credits.json').read_text())


def fetch(asset):
    destination = ROOT / 'public/planets' / asset['file']
    if asset.get('sourceFile'):
        data = (ROOT / asset['sourceFile']).read_bytes()
    else:
        with urlopen(asset['source'], timeout=60) as response:
            data = response.read()
    expected = asset.get('sourceSha256', asset['sha256'])
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError(f"Source changed: {asset['file']}; review it before updating the manifest")
    if asset.get('extract') == 'glb-base-color':
        length = struct.unpack_from('<I', data, 12)[0]
        gltf = json.loads(data[20:20 + length])
        binary = data[28 + length:]
        texture_index = gltf['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']
        image_index = gltf['textures'][texture_index]['source']
        view = gltf['bufferViews'][gltf['images'][image_index]['bufferView']]
        start = view.get('byteOffset', 0)
        image = Image.open(io.BytesIO(binary[start:start + view['byteLength']]))
    elif asset.get('extract') == 'image':
        image = Image.open(io.BytesIO(data))
    if asset.get('extract'):
        if asset.get('crop'):
            image = image.crop(tuple(asset['crop']))
        if asset.get('fillNoData') is not None:
            image = image.convert('RGB')
            mask = image.convert('L').point(lambda value: 255 if value <= 6 else 0)
            image.paste(tuple(asset['fillNoData']), mask=mask)
        image.thumbnail(tuple(asset.get('maxSize', [2048, 1024])))
        output = io.BytesIO()
        image.convert('RGB').save(output, format='JPEG', quality=91, optimize=True)
        data = output.getvalue()
        if hashlib.sha256(data).hexdigest() != asset['sha256']:
            raise ValueError(f"Output changed: {asset['file']}; use Pillow 12.1.1 to reproduce")
    destination.write_bytes(data)
    print(f"{asset['file']}: {len(data):,} bytes")


if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(fetch, manifest['assets']))
