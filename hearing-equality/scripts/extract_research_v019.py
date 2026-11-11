"""Extract the frozen experiment without dropping failed or hard videos.

Run in Python 3.12 with mediapipe==0.10.21, opencv-contrib-python==4.11.0.86,
numpy==1.26.4. Uses exactly the existing extract_motion.py settings.
python scripts/extract_research_v019.py /path/to/experiment --workers 4
"""
from __future__ import annotations
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def extract_one(args):
    item, base = args
    output = base/'motion'
    video = base/'videos'/(item['clip_id']+'.mp4')
    target = output/(item['clip_id']+'.json')
    log = base/'logs'/(item['clip_id']+'.log')
    try:
        if item.get('download_status') != 'verified' or not video.exists():
            raise ValueError('Source download failed or file missing')
        if hashlib.sha256(video.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Source video hash changed')
        valid = False
        if target.exists():
            previous = json.loads(target.read_text())
            valid = previous.get('source_sha256') == item['sha256'] and previous.get('extractor') == 'MediaPipe Holistic 0.10.21, model_complexity=1'
        if not valid:
            with log.open('w') as stream:
                proc = subprocess.run([sys.executable, str(ROOT/'scripts/extract_motion.py'), str(video), '--output', str(output)],
                                      stdout=stream, stderr=subprocess.STDOUT, timeout=180)
            if proc.returncode:
                raise RuntimeError('Landmark extraction failed; see private extraction log')
        motion = json.loads(target.read_text())
        if motion['source_sha256'] != item['sha256'] or not motion['frames']:
            raise ValueError('Motion provenance mismatch or empty result')
        return {**item, 'extraction_status': 'ok', 'frame_count': motion['frame_count'],
                'tracking_counts': motion['tracking_counts']}
    except Exception as exc:
        return {**item, 'extraction_status': 'failed', 'frame_count': 0,
                'tracking_counts': {}, 'error': str(exc)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('experiment', type=Path)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.workers <= 8:
        parser.error('workers must be between 1 and 8')
    base = args.experiment.resolve()
    (base/'motion').mkdir(exist_ok=True)
    (base/'logs').mkdir(exist_ok=True)
    downloads = json.loads((base/'downloads.json').read_text())
    frozen_hash = hashlib.sha256((ROOT/'research/v019/selection.json').read_bytes()).hexdigest()
    if downloads['selection_sha256'] != frozen_hash:
        raise ValueError('Downloads belong to another selection')
    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for result in pool.map(extract_one, [(r, base) for r in downloads['entries']]):
            results.append(result)
            print(result['clip_id'], result['extraction_status'], result.get('frame_count', 0), flush=True)
    (base/'extraction.json').write_text(json.dumps({
        'schema_version': 1, 'selection_sha256': frozen_hash,
        'extractor': 'MediaPipe Holistic 0.10.21, model_complexity=1',
        'entries': results}, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'ok': sum(r['extraction_status'] == 'ok' for r in results),
                      'failed': sum(r['extraction_status'] != 'ok' for r in results)}), flush=True)


if __name__ == '__main__':
    main()
