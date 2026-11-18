#!/usr/bin/env python3
"""Snapshot original public site and first-party assets for GitHub Pages."""
from __future__ import annotations
import hashlib
import html
import json
import re
import time
from pathlib import Path
from urllib.parse import unquote, quote, urljoin, urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ORIGIN = "https://dub-oliva-interior-3d.step3d.chatgpt.site/"
TARGET_PREFIX = "/Technopark_project/dub-oliva-interior-3d/"
TARGET_PUBLIC = "https://step3dlab.github.io" + TARGET_PREFIX
ROOT = Path(__file__).resolve().parent
HOST = urlparse(ORIGIN).netloc
MAX_SIZE = 90 * 1024 * 1024
MAX_ASSETS = 70
EXT = r"(?:html?|css|m?js|json|glb|gltf|bin|webp|avif|jpe?g|png|svg|gif|ico|woff2?|ttf|otf|mp4|webm|hdr|ktx2|basis|wasm|obj|mtl)"
ASSET_RE = re.compile(
    r"(?:(?:https?:)?//[^\s\"'`<>(),;]+|(?:\.\.?/|/)?[\w@%+./-]+)\." + EXT + r"(?:\?[^\s\"'`<>(),;]*)?",
    re.I,
)
ROOT_REF_RE = re.compile(r"(?P<op>['\"`(=])/(?P<tail>(?:assets|media|models|images|textures|static|fonts)/[\w.%+@/-]+|[\w.%+@-]+\." + EXT + r")", re.I)
TEXT_EXT = {".html", ".htm", ".js", ".mjs", ".css", ".json"}
FILES = {}
FAILURES = {}

def local_path(reference: str, base: str = ORIGIN):
    ref = html.unescape(reference).strip().strip("'\"` ")
    if ref.startswith(("data:", "blob:", "javascript:", "#")):
        return None
    if ref.startswith("//"):
        ref = "https:" + ref
    remote = urljoin(base, ref)
    parsed = urlparse(remote)
    if parsed.netloc.lower() != HOST.lower() or parsed.scheme != "https":
        return None
    raw_path = unquote(parsed.path).lstrip("/")
    segments = Path(raw_path).parts
    if not raw_path or any(p in ("..", ".") for p in segments):
        return None
    if re.search(r"[<>\\]", raw_path):
        return None
    return raw_path, remote

def download(path: str, remote: str):
    remote_parts = urlparse(remote)
    remote = remote_parts._replace(path=quote(remote_parts.path, safe='/%')).geturl()
    request = Request(remote, headers={"User-Agent": "Mozilla/5.0 (compatible; site-backup/1.0)", "Accept": "*/*"})
    for attempt in range(2):
        try:
            with urlopen(request, timeout=14) as resp:
                payload = resp.read(MAX_SIZE + 1)
                if len(payload) > MAX_SIZE:
                    raise ValueError("asset exceeds 90 MiB")
                if "text/html" in resp.headers.get("Content-Type", "") and Path(path).suffix.lower() not in {".html", ".htm"}:
                    raise ValueError("unexpected HTML for asset")
                out = ROOT / path
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(payload)
                FILES[path] = {"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest()}
                print("OK", path, len(payload), flush=True)
                return payload
        except HTTPError as err:
            FAILURES[path] = f'HTTP {err.code}'
            print('SKIP', path, err.code, flush=True)
            return None
        except Exception as err:
            if attempt == 1:
                FAILURES[path] = str(err)
                print("ERROR", path, str(err), flush=True)
                return None
            time.sleep(attempt + 1)

def assets_in(content: str, base: str = ORIGIN):
    found = set()
    for match in ASSET_RE.finditer(content):
        result = local_path(match.group(0), base)
        if result and Path(result[0]).suffix.lower() in TEXT_EXT | {".glb", ".gltf", ".bin", ".webp", ".avif", ".jpg", ".jpeg", ".png", ".svg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".webm", ".hdr", ".ktx2", ".basis", ".wasm", ".obj", ".mtl"}:
            found.add(result)
    return found

def rewrite(content: str):
    content = content.replace(ORIGIN, TARGET_PUBLIC)
    content = content.replace("https://" + HOST + "/", TARGET_PUBLIC)
    return ROOT_REF_RE.sub(lambda m: m.group("op") + TARGET_PREFIX + m.group("tail"), content)

def main():
    downloaded = download("index.html", ORIGIN)
    if not downloaded or len(downloaded) < 100:
        raise SystemExit("Could not download source HTML; fallback remains in repository")
    first_html = downloaded.decode("utf-8-sig", "replace")
    if "<html" not in first_html.lower() and "<!doctype" not in first_html.lower():
        raise SystemExit("Unexpected source: not an HTML document")
    pending = set(assets_in(first_html))
    for required in ["apartment.glb", "media/photo-living.webp", "vendor/three.core.js"]:
        pending.add((required, urljoin(ORIGIN, required)))
    visited = {"index.html"}
    while pending and len(visited) < MAX_ASSETS:
        path, remote = pending.pop()
        if path in visited:
            continue
        visited.add(path)
        payload = download(path, remote)
        if payload and Path(path).suffix.lower() in TEXT_EXT and not path.startswith(("vendor/", "cdn-cgi/")):
            pending.update(assets_in(payload.decode("utf-8-sig", "replace"), remote))
    for filename in list(FILES):
        if Path(filename).suffix.lower() in TEXT_EXT:
            path = ROOT / filename
            updated = rewrite(path.read_text(encoding="utf-8-sig"))
            if filename == "index.html":
                if re.search(r"<base\s+href=", updated, re.I):
                    updated = re.sub(r"<base\s+href\s*=\s*['\"][^'\"]*['\"]\s*/?>", '<base href="' + TARGET_PREFIX + '">', updated, flags=re.I)
                else:
                    updated = re.sub(r"<head\b[^>]*>", lambda m: m.group(0) + '\n<base href="' + TARGET_PREFIX + '">', updated, count=1, flags=re.I)
            path.write_text(updated, encoding="utf-8")
    if "apartment.glb" not in FILES:
        raise SystemExit("Critical 3D asset /apartment.glb could not be mirrored")
    if not (ROOT / "apartment.glb").read_bytes()[:4] == b"glTF":
        raise SystemExit("Invalid GLB header")
    report = {"source": ORIGIN, "pages_url": TARGET_PUBLIC, "downloaded_files": len(FILES), "files": FILES, "unavailable_candidates": FAILURES}
    (ROOT / "MIRROR_REPORT.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("SUCCESS", len(FILES), "files; GLB size", FILES["apartment.glb"]["bytes"], flush=True)

if __name__ == "__main__":
    main()
