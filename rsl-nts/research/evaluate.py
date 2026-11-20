"""Fit on official train, pick regularization on grouped train folds, then score official test."""
import argparse,csv,json,subprocess
from collections import Counter
from pathlib import Path
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold
from extract import WORDS, OUTSIDE

HERE=Path(__file__).resolve().parent
p=argparse.ArgumentParser(description=__doc__);p.add_argument('tracks',type=Path);p.add_argument('output',type=Path)
a=p.parse_args();out=a.output;out.mkdir(exist_ok=True,parents=True)
rows=json.loads(subprocess.check_output(['node',str(HERE/'features.mjs'),str(a.tracks)],encoding='utf8'))
x=np.asarray([r['features'] for r in rows])
y=np.asarray([WORDS.index(r['word']) if r['word'] in WORDS else -1 for r in rows])
groups=np.asarray([r['signer'] for r in rows]);valid=np.asarray([r['valid'] for r in rows]);split=np.asarray([r['split'] for r in rows])
train=np.flatnonzero(split=='train');test=np.flatnonzero((split=='test')&(y>=0));external=np.flatnonzero(y<0)
assert len(train)==120 and len(test)==40 and len(external)==40
held_people=set(groups[np.r_[test,external]])
original_train=len(train)
train=np.asarray([i for i in train if groups[i] not in held_people])
assert not set(groups[train]) & held_people
folds=list(StratifiedGroupKFold(n_splits=5,shuffle=True,random_state=17).split(x[train],y[train],groups[train]))

def fit(idx,c):
    scale=np.maximum(x[idx].std(axis=0),.20);mean=x[idx].mean(axis=0)
    model=LogisticRegression(C=c,solver='lbfgs',max_iter=2000).fit((x[idx]-mean)/scale,y[idx])
    w=model.coef_/scale[None,:]
    return w,model.intercept_-w@mean

def predict(idx,w,b):
    scores=x[idx]@w.T+b[None,:];scores-=scores.max(axis=1,keepdims=True)
    e=np.exp(scores);return e/e.sum(axis=1,keepdims=True)
choices=[]
for c in [0.003,0.01,0.03,0.1,0.3,1.0]:
    proba=np.zeros((len(train),len(WORDS)))
    for tr,va in folds:
        proba[va]=predict(train[va],*fit(train[tr],c))
    pred=proba.argmax(axis=1)
    choices.append((float(f1_score(y[train],pred,average='macro')),c,proba))
cv,c,oof=max(choices,key=lambda r:r[0])
correct_train=(oof.argmax(axis=1)==y[train])&(valid[train]>=5)
# Predetermine the rejection rule without any test labels: floor .50 and the
# lower quintile of OOF scores among correctly recognized train recordings.
threshold=round(max(.50,float(np.quantile(oof.max(axis=1)[correct_train],.20))),4)
w,b=fit(train,c);w=w.round(8);b=b.round(8)
aps={'words':WORDS,'threshold':threshold,'minFrames':5,'weights':w.tolist(),'bias':b.tolist()}
(out/'model.json').write_text(json.dumps(aps,ensure_ascii=False,separators=(',',':')),encoding='utf8')
pr=predict(np.arange(len(rows)),w,b);winner=pr.argmax(axis=1);score=pr.max(axis=1);accepted=(score>=threshold)&(valid>=5)
conf=confusion_matrix(y[test],winner[test],labels=np.arange(len(WORDS))).tolist()
result={'words':WORDS,'outsideWords':OUTSIDE,'trainN':len(train),'testN':len(test),'outsideN':len(external),
        'excludedTrainN':original_train-len(train),'uniqueTestSigners':len(held_people),'trainSigners':len(set(groups[train])),'testSigners':len(set(groups[test])),
        'outsideSigners':len(set(groups[external])),'overlap':0,'top1':int((winner[test]==y[test]).sum()),
        'acceptedCorrect':int((accepted[test] & (winner[test]==y[test])).sum()),'acceptedKnown':int(accepted[test].sum()),
        'acceptedOutside':int(accepted[external].sum()),'macroF1':round(f1_score(y[test],winner[test],average='macro'),4),
        'threshold':threshold,'cvMacroF1':round(cv,4),'C':c,'confusion':conf,
        'counts':dict(Counter(r['word'] for r in rows if r['split']=='test'))}
(out/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
with (out/'predictions.csv').open('w',newline='',encoding='utf8') as f:
    writer=csv.writer(f);writer.writerow(['clip_id','split','actual','best_candidate','score','frames_with_hands','accepted'])
    for i in list(test)+list(external):
        writer.writerow([rows[i]['id'],'known' if y[i]>=0 else 'outside',rows[i]['word'],WORDS[int(winner[i])],round(float(score[i]),6),valid[i],int(accepted[i])])
print(json.dumps(result,ensure_ascii=False,indent=2))
