"""Reproduce the lightweight fallback experiment on the same 200 clips as extract.py."""
import argparse,csv,json,subprocess,tempfile
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import f1_score
from extract import WORDS,OUTSIDE
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--annotations',required=True,type=Path);p.add_argument('--slovo',required=True,type=Path);p.add_argument('--output',required=True,type=Path)
args=p.parse_args()
with args.annotations.open(encoding='utf-8-sig') as f:
    delim='\t' if '\t' in f.readline() else ',';f.seek(0);allrows=list(csv.DictReader(f,delimiter=delim))
rows=[r for r in allrows if r['text'] in WORDS or (r['text'] in OUTSIDE and r['train']=='False')]
with tempfile.TemporaryDirectory() as d:
    binary=Path(d)/'thumbs.dat'
    with binary.open('wb') as f:
        import cv2
        cv2.setNumThreads(1)
        for r in rows:
            name=r['attachment_id']+'.mp4';path=args.slovo/('train' if r['train']=='True' else 'test')/name
            if not path.is_file():path=args.slovo/name
            cap=cv2.VideoCapture(str(path));count=int(cap.get(cv2.CAP_PROP_FRAME_COUNT));idx=[min(count-1,int((k+.5)*count/16)) for k in range(16)]
            for i in range(idx[-1]+1):
                ok,bgr=cap.read()
                if not ok:raise ValueError(str(path))
                if i not in idx:continue
                h,w=bgr.shape[:2];scale=min(1,512/max(h,w));scaled=cv2.resize(bgr,(round(w*scale),round(h*scale)),interpolation=cv2.INTER_LINEAR)
                h,w=scaled.shape[:2];px=((np.arange(64)+.5)*w/64).astype(int);py=((np.arange(64)+.5)*h/64).astype(int)
                sample=scaled[py[:,None],px[None,:]].astype(np.uint16)
                gray=((sample[:,:,0]*29+sample[:,:,1]*150+sample[:,:,2]*77)>>8).astype(np.uint8)
                f.write(gray.tobytes()*idx.count(i))
            cap.release()
    features=json.loads(subprocess.check_output(['node',str(Path(__file__).parent/'motion_features.mjs'),str(binary)]))
x=np.asarray([v['features'] for v in features]);q=np.asarray([v['quality'] for v in features])
y=np.asarray([WORDS.index(r['text']) if r['text'] in WORDS else -1 for r in rows]);groups=np.asarray([r['user_id'] for r in rows]);split=np.asarray([r['train']=='True' for r in rows])
test=np.flatnonzero(~split&(y>=0));other=np.flatnonzero(y<0)
held=set(groups[np.r_[test,other]]);train=np.flatnonzero(split&np.array([g not in held for g in groups]))
folds=list(StratifiedGroupKFold(n_splits=5,shuffle=True,random_state=17).split(x[train],y[train],groups[train]))
def fit(ids,c):return LogisticRegression(C=c,solver='lbfgs',max_iter=1500).fit(x[ids],y[ids])
candidates=[]
for c in [1.,10.,100.,1000.]:
    oof=np.zeros((len(train),len(WORDS)))
    for tr,va in folds:oof[va]=fit(train[tr],c).predict_proba(x[train[va]])
    candidates.append((f1_score(y[train],oof.argmax(1),average='macro'),c,oof))
cv,c,oof=max(candidates,key=lambda t:t[0])
threshold=round(max(.45,float(np.quantile(oof.max(1)[oof.argmax(1)==y[train]],.20))),4)
model=fit(train,c);proba=model.predict_proba(x);pred=proba.argmax(1);acc=(proba.max(1)>=threshold)&(q>=.45)
out=args.output;out.mkdir(parents=True,exist_ok=True)
(out/'motion-model.json').write_text(json.dumps({'words':WORDS,'threshold':threshold,'minChange':.45,'weights':model.coef_.round(6).tolist(),'bias':model.intercept_.round(6).tolist()},separators=(',',':'),ensure_ascii=False),encoding='utf8')
metrics={'C':c,'cvMacroF1':round(cv,4),'threshold':threshold,'trainN':len(train),'testN':len(test),'outsideN':len(other),'top1':int(sum(pred[test]==y[test])),'acceptedKnown':int(sum(acc[test])),'acceptedCorrect':int(sum(acc[test]&(pred[test]==y[test]))),'acceptedOutside':int(sum(acc[other]))}
(out/'motion-metrics.json').write_text(json.dumps(metrics,indent=2),encoding='utf8')
print(metrics)
for i,r in enumerate(rows):
    if r['attachment_id'].startswith(('1cb4590b','8e2bd0b6','34642453')):print(r['text'],WORDS[pred[i]],proba[i].max(),acc[i],q[i])
