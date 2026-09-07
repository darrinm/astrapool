"""Upscale one source panorama via fal; retain the request ID for safe resumption."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from falenv import fal_client
import httpx

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path, help='Full-resolution PNG master (keep outside public/)')
args = parser.parse_args()
endpoint = 'topaz/upscale/image/precision'
settings = dict(model='High Fidelity V2', upscale_factor=4, output_format='png',
                face_enhancement=False, crop_to_fill=False, subject_detection='All')
record = args.output.with_suffix('.json')
args.output.parent.mkdir(parents=True, exist_ok=True)
if record.exists():
    job = json.loads(record.read_text())
    if job['source'] != str(args.source.resolve()) or job['endpoint'] != endpoint or job['settings'] != settings:
        raise SystemExit('Existing request belongs to different inputs; choose another output path.')
else:
    handle = fal_client.submit(endpoint, arguments={**settings, 'image_url': fal_client.upload_file(str(args.source))})
    job = dict(source=str(args.source.resolve()), endpoint=endpoint, settings=settings, request_id=handle.request_id)
    record.write_text(json.dumps(job, indent=2) + '\n')
print('Request:', job['request_id'], flush=True)
if not args.output.exists():
    result = fal_client.result(endpoint, job['request_id'])
    with httpx.Client(timeout=120, follow_redirects=True) as client:
        response = client.get(result['image']['url'])
        response.raise_for_status()
    temporary = args.output.with_suffix('.part')
    temporary.write_bytes(response.content)
    temporary.replace(args.output)
print('Saved:', args.output, flush=True)
