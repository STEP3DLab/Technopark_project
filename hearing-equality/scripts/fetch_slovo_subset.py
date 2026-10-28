"""Download only benchmark MP4 entries with HTTP ranges and verify SHA-256.

python scripts/fetch_slovo_subset.py /path/to/videos [--clip-id UUID]
Standard library only. Does not download the whole 15.9 GB archive.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ARCHIVE = 'https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/slovo/slovo.zip'
ROOT = Path(__file__).resolve().parents[1]

class RangeFile(io.RawIOBase):
    def __init__(self, url):
        self.url, self.pos, self.cache, self.cache_at = url, 0, b'', 0
        request = urllib.request.Request(url, method='HEAD')
        with urllib.request.urlopen(request, timeout=30) as response:
            self.size = int(response.headers['Content-Length'])
            self.etag = response.headers.get('ETag')

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, offset, whence=0):
        if whence not in (0, 1, 2):
            raise ValueError('Invalid whence')
        self.pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.size + offset
        if self.pos < 0:
            raise ValueError('Negative offset')
        return self.pos

    def read(self, size=-1):
        size = min(self.size-self.pos, size if size >= 0 else self.size-self.pos)
        if size <= 0:
            return b''
        if size > 32*1024*1024:
            raise ValueError('Unexpected large ZIP member; refusing a full archive download')
        if not (self.cache_at <= self.pos and self.pos+size <= self.cache_at+len(self.cache)):
            end = min(self.size-1, self.pos+max(size, 1024*1024)-1)
            headers = {'Range': f'bytes={self.pos}-{end}'}
            if self.etag:
                headers['If-Match'] = self.etag
            request = urllib.request.Request(self.url, headers=headers)
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status != 206:
                    raise RuntimeError('Server must honor byte ranges')
                self.cache = response.read(end-self.pos+2)
                self.cache_at = self.pos
                if len(self.cache) != end-self.pos+1:
                    raise RuntimeError('Unexpected range length')
        start = self.pos-self.cache_at
        result = self.cache[start:start+size]
        self.pos += len(result)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--clip-id')
    args = parser.parse_args()
    entries = {}
    for file in ('tests/fixtures/baseline-v06.json', 'app/assets/recognition-library.json', 'tests/fixtures/heldout-v07.json'):
        for item in json.loads((ROOT/file).read_text())['entries']:
            if item['clip_id'] in entries and entries[item['clip_id']]['sha256'] != item['sha256']:
                raise ValueError('Conflicting source hashes')
            entries[item['clip_id']] = item
    if args.clip_id:
        if args.clip_id not in entries:
            parser.error('Unknown clip ID')
        entries = {args.clip_id: entries[args.clip_id]}
    args.output.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(RangeFile(ARCHIVE)) as archive:
        for item in entries.values():
            destination = args.output/(item['clip_id']+'.mp4')
            data = destination.read_bytes() if destination.exists() else archive.read(item['archive_path'])
            if hashlib.sha256(data).hexdigest() != item['sha256']:
                raise ValueError('SHA-256 mismatch: '+item['clip_id'])
            if not destination.exists():
                destination.write_bytes(data)
            print(item['clip_id'], len(data), 'verified', flush=True)

if __name__ == '__main__':
    main()
