// Unsupervised k-means over local colour differences. Coordinates refer to the later image.
const percentile=(items,p)=>items.slice().sort((a,b)=>a-b)[Math.min(items.length-1,Math.floor(items.length*p))]??0;
function globalOffsets(a,b){
  const channels=[[],[],[]];for(let i=0;i<a.length;i+=32)for(let k=0;k<3;k++)channels[k].push(b[i+k]-a[i+k]);
  return channels.map(values=>percentile(values,.5))
}
function alignment(a,b,w,h,offset){
  let best=Infinity,shift=[0,0];const radius=Math.min(5,Math.floor(Math.min(w,h)/12));
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    let loss=0;for(let y=radius;y<h-radius;y+=4)for(let x=radius;x<w-radius;x+=4){
      const i=4*((y+dy)*w+x+dx),j=4*(y*w+x);
      loss+=Math.min(45,Math.abs(b[j+1]-a[i+1]-offset[1]))}
    loss+=.0001*(Math.abs(dx)+Math.abs(dy));if(loss<best){best=loss;shift=[dx,dy]}}
  return shift
}
function fitClusters(scores){
  let centers=[percentile(scores,.20),percentile(scores,.68),Math.max(percentile(scores,.97),Math.max(...scores)*.70)];
  for(let it=0;it<15;it++){
    const sums=[0,0,0],counts=[0,0,0];for(const s of scores){let c=0;for(let k=1;k<3;k++)if(Math.abs(s-centers[k])<Math.abs(s-centers[c]))c=k;sums[c]+=s;counts[c]++}
    const next=centers.map((old,i)=>counts[i]?sums[i]/counts[i]:old).sort((a,b)=>a-b);
    const moved=next.some((n,i)=>Math.abs(centers[i]-n)>.015);centers=next;if(!moved)break}
  return centers
}
export function analyze(a,b,w,h){
  if(w<32||h<32||a.length!==w*h*4||b.length!==a.length)throw new Error("Некорректная пара кадров");
  const offset=globalOffsets(a,b),[dx,dy]=alignment(a,b,w,h,offset),cell=6,cols=Math.ceil(w/cell),rows=Math.ceil(h/cell),scores=[];
  for(let cy=0;cy<rows;cy++)for(let cx=0;cx<cols;cx++){
    let sum=0,n=0;for(let y=cy*cell;y<Math.min(h,(cy+1)*cell);y++)for(let x=cx*cell;x<Math.min(w,(cx+1)*cell);x++){
      if(x+dx<0||y+dy<0||x+dx>=w||y+dy>=h)continue;
      const i=4*((y+dy)*w+x+dx),j=4*(y*w+x);let d=0;for(let k=0;k<3;k++)d+=Math.abs(b[j+k]-a[i+k]-offset[k]);sum+=d/3;n++
    }scores.push(n?sum/n:0)}
  const centers=fitClusters(scores),median=percentile(scores,.5),mad=percentile(scores.map(s=>Math.abs(s-median)),.5);
  const threshold=Math.max(10,median+Math.max(5,3*mad),.5*(centers[1]+centers[2]));
  const seen=new Set(),boxes=[];let count=0;
  for(let i=0;i<scores.length;i++){if(scores[i]<threshold||seen.has(i))continue;
    const queue=[i];seen.add(i);let x0=cols,y0=rows,x1=0,y1=0,size=0,peak=0;
    while(queue.length){const id=queue.pop(),x=id%cols,y=Math.floor(id/cols);size++;peak=Math.max(peak,scores[id]);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){if(xx<0||yy<0||xx>=cols||yy>=rows)continue;const k=yy*cols+xx;if(scores[k]>=threshold&&!seen.has(k)){seen.add(k);queue.push(k)}}}
    if(size<3)continue;count+=size;boxes.push({x:x0*cell/w,y:y0*cell/h,w:(Math.min(w,(x1+1)*cell)-x0*cell)/w,h:(Math.min(h,(y1+1)*cell)-y0*cell)/h,size,peak:Math.round(peak)})
  }
  const poor=median>22||count>scores.length*.38;return {boxes:boxes.sort((a,b)=>b.size-a.size),poor,shift:[dx,dy],median:Math.round(median),method:"k-means / RGB"}
}
