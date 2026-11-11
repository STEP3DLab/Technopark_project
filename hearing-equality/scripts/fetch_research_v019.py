"""Fetch the frozen experimental subset from the official Slovo ZIP.

Downloads selected members, verifies ZIP CRC and saves source SHA-256. Four
independent range readers share no seek position. No full-archive fallback.
python scripts/fetch_research_v019.py /path/to/videos [--workers 4]
"""
from __future__ import annotations
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import threading
import zipfile
from fetch_slovo_subset import RangeFile, ARCHIVE

ROOT = Path(__file__).resolve().parents[1]
LOCAL = threading.local()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--workers', type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.workers <= 8:
        parser.error('workers must be between 1 and 8')
    selection_path = ROOT/'research/v019/selection.json'
    raw = selection_path.read_bytes()
    plan = json.loads(raw)
    args.output.mkdir(parents=True, exist_ok=True)
    def fetch(item):
        try:
            if not hasattr(LOCAL, 'archive'):
                LOCAL.archive = zipfile.ZipFile(RangeFile(ARCHIVE))
            z = LOCAL.archive
            info = z.getinfo(item['archive_path'])
            target = args.output/(item['clip_id'] + '.mp4')
            if target.exists():
                import zlib
                data = target.read_bytes()
                if len(data) != info.file_size or zlib.crc32(data) & 0xffffffff != info.CRC:
                    raise ValueError('Cached file CRC or size differs from official archive')
            else:
                data = z.read(info)
                temp = target.with_suffix('.tmp')
                temp.write_bytes(data)
                temp.replace(target)
            return {**item, 'sha256': hashlib.sha256(data).hexdigest(),
                    'bytes': len(data), 'crc32': f'{info.CRC:08x}', 'download_status': 'verified'}
        except Exception as exc:
            return {**item, 'download_status': 'failed', 'error': str(exc)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = []
        for result in pool.map(fetch, plan['entries']):
            results.append(result)
            print(result['clip_id'], result['download_status'], flush=True)
    report = {'schema_version': 1, 'selection_sha256': hashlib.sha256(raw).hexdigest(),
              'archive': ARCHIVE, 'entries': results}
    (args.output.parent/'downloads.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    failed = [r for r in results if r['download_status'] != 'verified']
    print(json.dumps({'verified': len(results)-len(failed), 'failed': len(failed),
                      'bytes': sum(r.get('bytes', 0) for r in results)}, ensure_ascii=False), flush=True)
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
