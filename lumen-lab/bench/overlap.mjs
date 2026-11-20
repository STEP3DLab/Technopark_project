// Counts intervals with both endpoint pairs strictly above the declared measurement floors.
export function observedOverlap(rows,steps,aFloor,bFloor){
  if(!Number.isFinite(aFloor)||!Number.isFinite(bFloor)||aFloor<0||bFloor<0)throw Error('Введите оба конечных неотрицательных порога в ваттах.');
  let n=0,total=0,longest=0,run=null,last=null,windows=0;
  const above=r=>r.a!==null&&r.b!==null&&r.a>aFloor&&r.b>bFloor;
  for(let i=1;i<rows.length;i++){
    const a=rows[i-1],b=rows[i];
    if(steps[i]&&above(a)&&above(b)){
      if(run===null){run=a.t;windows++}
      last=b.t;n++;
    }else if(run!==null){const dt=last-run;total+=dt;longest=Math.max(longest,dt);run=null}
  }
  if(run!==null){const dt=last-run;total+=dt;longest=Math.max(longest,dt)}
  return {aFloorW:aFloor,bFloorW:bFloor,intervals:n,windows,coveredS:total,longestS:longest};
}
