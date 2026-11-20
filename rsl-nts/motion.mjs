// Optional CPU-only path for browsers where the landmark detector cannot use WebGL.
const SIZE=64, CELLS=6, SEGMENTS=3, CHANNELS=6;
export function thumbnail(image){
  const {width,height,data}=image, gray=new Uint8Array(SIZE*SIZE);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
    const ix=Math.min(width-1,Math.floor((x+.5)*width/SIZE));
    const iy=Math.min(height-1,Math.floor((y+.5)*height/SIZE));
    const pos=(iy*width+ix)*4;
    gray[y*SIZE+x]=(77*data[pos]+150*data[pos+1]+29*data[pos+2])>>8;
  }
  return gray;
}
export function motionFeatures(frames){
  const feature=new Array(SEGMENTS*CELLS*CELLS*CHANNELS).fill(0);
  let change=0;
  for(let t=1;t<frames.length;t++){
    const before=frames[t-1],now=frames[t];
    const chunk=Math.min(SEGMENTS-1,Math.floor((t-1)*SEGMENTS/(frames.length-1)));
    for(let y=2;y<SIZE-2;y++)for(let x=2;x<SIZE-2;x++){
      const i=y*SIZE+x, delta=(now[i]-before[i])*.5+(now[i+1]-before[i+1]+now[i-1]-before[i-1]+now[i+SIZE]-before[i+SIZE]+now[i-SIZE]-before[i-SIZE])*.125;
      const energy=Math.min(75,Math.max(0,Math.abs(delta)-5));if(!energy)continue;
      const gx=(now[i+1]-now[i-1]+before[i+1]-before[i-1])*.25;
      const gy=(now[i+SIZE]-now[i-SIZE]+before[i+SIZE]-before[i-SIZE])*.25;
      const unit=Math.max(8,Math.hypot(gx,gy));
      const dx=delta>0?gx/unit:-gx/unit,dy=delta>0?gy/unit:-gy/unit;
      const cellY=Math.min(CELLS-1,Math.floor((y-2)*CELLS/(SIZE-4)));
      const cellX=Math.min(CELLS-1,Math.floor((x-2)*CELLS/(SIZE-4)));
      const base=((chunk*CELLS+cellY)*CELLS+cellX)*CHANNELS;
      feature[base+(delta>=0?0:1)]+=energy;
      feature[base+2]+=energy*Math.max(0,dx);feature[base+3]+=energy*Math.max(0,-dx);
      feature[base+4]+=energy*Math.max(0,dy);feature[base+5]+=energy*Math.max(0,-dy);
      change+=energy;
    }
  }
  const norm=Math.max(1,Math.sqrt(feature.reduce((n,i)=>n+i,0)));
  return {features:feature.map(v=>Math.sqrt(v)/norm),quality:change/((frames.length-1)*(SIZE-4)**2)};
}
export function classifyMotion(images,model){
  const {features,quality}=motionFeatures(images.map(thumbnail));
  const scores=model.weights.map((row,k)=>row.reduce((sum,v,j)=>sum+v*features[j],model.bias[k]));
  const hi=Math.max(...scores),index=scores.indexOf(hi);
  const score=1/scores.reduce((sum,x)=>sum+Math.exp(x-hi),0);
  return {word:model.words[index],score,quality,method:'motion',accepted:quality>=model.minChange && score>=model.threshold};
}
