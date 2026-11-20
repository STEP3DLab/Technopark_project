"""Extract the fixed 16-frame input used by the browser from the trimmed Slovo release."""
import argparse
import csv
import json
import os
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor

WORDS = ["вопрос", "помочь", "имя", "время", "сегодня", "завтра", "школа", "вода"]
OUTSIDE = ["семья", "дом", "лето", "работать", "читать", "день", "ночь", "хорошо"]
COUNT = 16

def setup(model):
    global detector, cv2, mp
    import cv2
    import mediapipe as mp
    cv2.setNumThreads(1)
    vision = mp.tasks.vision
    detector = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=model),
        running_mode=vision.RunningMode.IMAGE, num_hands=2,
        min_hand_detection_confidence=0.45, min_hand_presence_confidence=0.45))

def process(item):
    row, path = item
    cap = cv2.VideoCapture(str(path))
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if count < 1:
        raise ValueError(f"Unreadable clip: {path}")
    targets = [min(count-1, int(count*(i+0.5)/COUNT)) for i in range(COUNT)]
    frames = []
    for i in range(targets[-1]+1):
        ok, frame = cap.read()
        if not ok:
            raise ValueError(f"Failed to read frame {i}: {path}")
        if i not in targets:
            continue
        height,width = frame.shape[:2]
        scale = min(1, 512/max(width,height))
        frame = cv2.resize(frame, (round(width*scale),round(height*scale)), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)
        detection = detector.detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=rgb))
        hands = []
        for label, points in zip(detection.handedness,detection.hand_landmarks):
            hands.append({"side": label[0].category_name, "landmarks": [
                [round(p.x,5),round(p.y,5),round(p.z,5)] for p in points]})
        frames.extend([hands]*targets.count(i))
    cap.release()
    return {"id":row["attachment_id"],"word":row["text"],"signer":row["user_id"],
            "split":"train" if row["train"]=="True" else "test",
            "aspect":round(width/height,5),"frames":frames}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--annotations",required=True,type=Path)
    p.add_argument("--slovo",required=True,type=Path)
    p.add_argument("--model",required=True)
    p.add_argument("--workers",type=int,default=2)
    p.add_argument("--output",required=True,type=Path)
    args=p.parse_args()
    with args.annotations.open(encoding="utf-8-sig") as f:
        sample=f.readline()
        f.seek(0)
        rows=list(csv.DictReader(f, delimiter="\t" if "\t" in sample else ","))
    items=[]
    for row in rows:
        if row['text'] not in WORDS and not (row['text'] in OUTSIDE and row['train']=="False"):
            continue
        filename=row['attachment_id']+'.mp4'
        split='train' if row['train']=='True' else 'test'
        path=args.slovo/split/filename
        if not path.exists():
            path=args.slovo/filename
        items.append((row,path))
    args.output.parent.mkdir(parents=True,exist_ok=True)
    done=[]
    with ProcessPoolExecutor(args.workers,initializer=setup,initargs=(args.model,)) as pool:
        for i,item in enumerate(pool.map(process,items,chunksize=2),1):
            done.append(item)
            if i%25==0: print(i,flush=True)
    args.output.write_text(json.dumps(done,ensure_ascii=False,separators=(',',':')),encoding='utf8')
if __name__=="__main__": main()
