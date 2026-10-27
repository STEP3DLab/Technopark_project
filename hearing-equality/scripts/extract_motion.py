"""Extract measured landmarks from licensed source clips; no synthetic signing.

Python 3.12; pip install mediapipe==0.10.21
Usage: python scripts/extract_motion.py app/assets/sources/*.mp4
The resulting motion data inherit the source dataset's terms. See THIRD_PARTY.md.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import cv2
import mediapipe as mp

FACE_INDICES = sorted(set([
    10, 152, 234, 454, 1, 4, 6, 168,
    33, 160, 158, 133, 153, 144, 362, 385, 387, 263, 373, 380,
    61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91,
    78, 81, 13, 311, 308, 402, 14, 178,
    70, 63, 105, 66, 107, 336, 296, 334, 293, 300,
]))

def points(landmarks, indices=None, visibility=False):
    if landmarks is None:
        return None
    data = landmarks.landmark
    selected = [data[i] for i in indices] if indices is not None else data
    return [[round(p.x, 6), round(p.y, 6), round(p.z, 6)] +
            ([round(p.visibility, 4)] if visibility else []) for p in selected]

def extract(path: Path, output_dir: Path):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open {path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    width, height = int(cap.get(3)), int(cap.get(4))
    if fps <= 0:
        raise RuntimeError(f"Unknown FPS: {path}")
    frames = []
    counts = dict(pose=0, left=0, right=0, face=0)
    with mp.solutions.holistic.Holistic(
        static_image_mode=False, model_complexity=1, smooth_landmarks=True,
        enable_segmentation=False, refine_face_landmarks=False,
        min_detection_confidence=0.5, min_tracking_confidence=0.5,
    ) as tracker:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            result = tracker.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            item = dict(
                pose=points(result.pose_landmarks, visibility=True),
                world=points(result.pose_world_landmarks),
                left=points(result.left_hand_landmarks),
                right=points(result.right_hand_landmarks),
                face=points(result.face_landmarks, FACE_INDICES),
            )
            for key in counts:
                counts[key] += item[key] is not None
            frames.append(item)
    cap.release()
    if not frames or not counts['pose']:
        raise RuntimeError(f"No usable tracked body: {path}")
    result = dict(
        schema_version=1, clip_id=path.stem, fps=fps, width=width, height=height,
        duration=len(frames)/fps, frame_count=len(frames),
        source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        extractor="MediaPipe Holistic 0.10.21, model_complexity=1",
        source_dataset="Slovo", license="../sources/SLOVO-LICENSE-en.pdf",
        license_id="LicenseRef-Slovo-Public-License",
        changes="Measured landmarks extracted from source video. Not linguistically validated; monocular depth is estimated.",
        face_indices=FACE_INDICES, tracking_counts=counts, frames=frames,
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    out=output_dir/(path.stem+'.json')
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(json.dumps(dict(file=out.name, frames=len(frames), fps=fps, tracking=counts), ensure_ascii=False), flush=True)

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('videos', nargs='+', type=Path)
    parser.add_argument('--output', type=Path, default=Path('app/assets/motion'))
    args=parser.parse_args()
    for path in args.videos:
        extract(path, args.output)
