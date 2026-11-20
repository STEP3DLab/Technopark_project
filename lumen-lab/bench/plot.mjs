export function plot(canvas,session){
  const d=Math.min(devicePixelRatio||1,2),w=Math.round(canvas.clientWidth),h=Math.round(canvas.clientHeight);
  if(!w||!h)return;
  if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d)}
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,w,h);
  const left=50,right=w-11,top=12,bottom=h-24;
  const rows=session?.rows??[],thermal=session?.kind!=='power',t=row=>thermal?row.ms/1000:row.t;
  const get=(r,j)=>thermal?(j===0?r.t1.c:r.t2.c):(j===0?r.a:r.b);
  const start=rows.length?t(rows[0]):0,span=rows.length>1?t(rows.at(-1))-start:1;
  let lo=Infinity,hi=-Infinity;
  for(const r of rows)for(let j=0;j<2;j++){const n=get(r,j);if(n!==null){lo=Math.min(lo,n);hi=Math.max(hi,n)}}
  if(!Number.isFinite(lo)){lo=0;hi=1}
  const pad=hi===lo?(thermal?1:Math.max(.1,Math.abs(hi)*.05)):(hi-lo)*.12;
  lo-=pad;hi+=pad;if(!thermal)lo=Math.max(0,lo);
  const xx=r=>left+(t(r)-start)/span*(right-left),yy=n=>bottom-(n-lo)/(hi-lo)*(bottom-top);
  const fmt=n=>Math.abs(n)>=10000||(n!==0&&Math.abs(n)<.001)?n.toExponential(1):Number(n.toFixed(3)).toLocaleString('ru',{useGrouping:false});
  ctx.font='10px monospace';ctx.fillStyle='#b4c4b9';ctx.strokeStyle='#385045';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=top+(bottom-top)*i/4;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    if(rows.length){ctx.textAlign='right';ctx.fillText(fmt(hi-(hi-lo)*i/4),left-6,y+3)}
    const x=left+(right-left)*i/4;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();
    if(rows.length){ctx.textAlign=i===4?'right':i===0?'left':'center';ctx.fillText(fmt(span*i/4),x,bottom+15)}
  }
  if(!rows.length)return;
  for(let j=0;j<2;j++){
    const key=j===0?'t1':'t2';ctx.strokeStyle=ctx.fillStyle=j===0?'#b9f5b6':'#ffa987';ctx.lineWidth=2;ctx.lineJoin='round';
    let bucket=null,inPath=false,segmentStart=null,nSegment=0;
    const flush=()=>{if(!bucket)return;const samples=[bucket.first,bucket.min,bucket.max,bucket.last].sort((a,b)=>a[0]-b[0]);let prev=-1;
      for(const [i,x,y] of samples){if(i===prev)continue;prev=i;if(inPath)ctx.lineTo(x,y);else{ctx.moveTo(x,y);inPath=true}}
      bucket=null;
    };
    const finish=()=>{flush();if(inPath)ctx.stroke();if(nSegment===1&&segmentStart){ctx.beginPath();ctx.arc(segmentStart[0],segmentStart[1],2.3,0,Math.PI*2);ctx.fill()}
      ctx.beginPath();inPath=false;nSegment=0;segmentStart=null;
    };
    ctx.beginPath();
    for(let i=0;i<rows.length;i++){
      const r=rows[i],n=get(r,j);if(n===null){if(nSegment)finish();continue}
      let connected=false;
      if(i&&get(rows[i-1],j)!==null){
        const prev=rows[i-1];
        if(thermal)connected=r.seq===prev.seq+1&&r.ms-prev.ms<=2500&&r[key].id===prev[key].id;
        else connected=Boolean(session.steps[i]);
      }
      if(!connected&&nSegment)finish();
      const x=xx(r),y=yy(n),s=[i,x,y],ix=Math.floor(x);if(!nSegment)segmentStart=[x,y];nSegment++;
      if(!bucket||bucket.ix!==ix){flush();bucket={ix,first:s,last:s,min:s,max:s}}
      else{bucket.last=s;if(y<bucket.min[2])bucket.min=s;if(y>bucket.max[2])bucket.max=s}
    }
    finish();
  }
}
