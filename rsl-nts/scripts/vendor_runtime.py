#!/usr/bin/env python3
"""Verify, or restore, the pinned browser runtime without third-party Python packages.

Usage (from any directory):
    python rsl-nts/scripts/vendor_runtime.py
    python rsl-nts/scripts/vendor_runtime.py --download

Checksums belong to the reviewed manifest committed with this release. Updating
dependencies is an explicit source change; this script never updates the manifest.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1] / "vendor"
CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/"
ALLOWED_URLS = {
    "LICENSE": "https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.21/LICENSE",
    "mediapipe/package.json": CDN + "package.json",
    "mediapipe/vision_bundle.mjs": CDN + "vision_bundle.mjs",
    "mediapipe/wasm/vision_wasm_internal.js": CDN + "wasm/vision_wasm_internal.js",
    "mediapipe/wasm/vision_wasm_internal.wasm": CDN + "wasm/vision_wasm_internal.wasm",
    "mediapipe/wasm/vision_wasm_nosimd_internal.js": CDN + "wasm/vision_wasm_nosimd_internal.js",
    "mediapipe/wasm/vision_wasm_nosimd_internal.wasm": CDN + "wasm/vision_wasm_nosimd_internal.wasm",
    "models/hand_landmarker.task": (
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
        "hand_landmarker/float16/1/hand_landmarker.task"
    ),
}


def matches(data: bytes, entry: dict) -> bool:
    return (
        len(data) == entry["bytes"]
        and hashlib.sha256(data).hexdigest() == entry["sha256"]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--download", action="store_true", help="Restore missing or changed files from pinned URLs."
    )
    args = parser.parse_args()
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    entries = manifest["files"]
    names = [entry["path"] for entry in entries]
    if len(set(names)) != len(names) or set(names) != set(ALLOWED_URLS):
        raise SystemExit("Manifest must contain each explicitly allowed file exactly once.")

    # Validate the complete manifest before any request or filesystem write.
    for entry in entries:
        if entry["url"] != ALLOWED_URLS[entry["path"]]:
            raise SystemExit(f"Unexpected source URL: {entry['path']}")
        digest = entry["sha256"]
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise SystemExit(f"Invalid SHA-256: {entry['path']}")
        if not isinstance(entry["bytes"], int) or not 0 < entry["bytes"] < 20_000_000:
            raise SystemExit(f"Invalid pinned size: {entry['path']}")

    failures = []
    for entry in entries:
        path = ROOT / entry["path"]
        data = path.read_bytes() if path.is_file() else b""
        if not matches(data, entry) and args.download:
            with urllib.request.urlopen(entry["url"], timeout=45) as response:
                data = response.read(entry["bytes"] + 1)
            if not matches(data, entry):
                raise SystemExit(f"Downloaded file does not match pinned checksum: {entry['path']}")
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_name(path.name + ".download")
            temp.write_bytes(data)
            temp.replace(path)
        if matches(data, entry):
            print(f"OK {entry['path']} ({entry['bytes']} bytes)")
        else:
            failures.append(entry["path"])
            print(f"MISSING OR CHANGED {entry['path']}")
    if failures:
        raise SystemExit("Verification failed. Use --download to restore the pinned files.")
    print(f"Verified {len(entries)} files; {sum(entry['bytes'] for entry in entries):,} bytes.")


if __name__ == "__main__":
    main()
