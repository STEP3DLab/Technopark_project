"""Prepare the static portfolio photographs from the studio's public catalogue."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
import json
from pathlib import Path
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = Path(__file__).with_name('sources.json')


def prepare(item):
    relative_path, url = item
    if urlsplit(url).hostname != 'static.tildacdn.com':
        raise ValueError(url)
    path = ROOT / 'assets' / relative_path
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if relative_path.startswith('examples/'):
        bounds, quality = (1850, 1850), 85
    elif relative_path.startswith('covers/'):
        bounds, quality = (1680, 1500), 85
    elif relative_path.startswith('studio/'):
        bounds, quality = (1280, 1200), 84
    else:
        bounds, quality = (1460, 1380), 79
    for attempt in range(4):
        try:
            request = Request(url, headers={'User-Agent': 'KostenkoPortfolio/1.0'})
            with urlopen(request, timeout=40) as response:
                data = response.read()
            with Image.open(BytesIO(data)) as original:
                image = ImageOps.exif_transpose(original).convert('RGB')
                image.thumbnail(bounds, Image.Resampling.LANCZOS)
                image.save(path, 'WEBP', quality=quality, method=4)
            return
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)


if __name__ == '__main__':
    items = json.loads(MANIFEST.read_text()).items()
    with ThreadPoolExecutor(max_workers=8) as pool:
        jobs = {pool.submit(prepare, item): item[0] for item in items}
        failures = []
        for job in as_completed(jobs):
            try:
                job.result()
            except Exception as exc:
                failures.append((jobs[job], str(exc)))
    if failures:
        raise SystemExit(f'Failed to prepare {len(failures)} images: {failures}')
    print(f'Prepared {len(items)} images')
