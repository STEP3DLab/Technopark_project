import {Matrix4} from './vendor/three.module.min.js';

// Depth-buffered software rendering for browsers where hardware acceleration is disabled.
// Rasterise the same indexed STL triangles, using interpolated vertex lighting.
export class CanvasRenderer {
  constructor(){
    this.domElement=document.createElement('canvas');
    this.ctx=this.domElement.getContext('2d',{alpha:true});
    if(!this.ctx)throw new Error('Canvas unavailable');
    this.models=new WeakMap();this.projection=new Matrix4();
  }
  setPixelRatio(){}
  setSize(w,h){
    if(!w||!h)return;
    const ratio=Math.min(1.2,760/Math.max(w,h));this.domElement.width=Math.round(w*ratio);this.domElement.height=Math.round(h*ratio);
    this.buffer=this.ctx.createImageData(this.domElement.width,this.domElement.height);
    this.pixels=new Uint32Array(this.buffer.data.buffer);
    this.depth=new Float32Array(this.pixels.length);
  }
  render(scene,camera){
    if(!this.buffer)return;
    const mesh=scene.children.find(x=>x.isMesh&&x.visible);
    const W=this.domElement.width,H=this.domElement.height;
    this.pixels.fill(0);this.depth.fill(-Infinity);
    if(!mesh){this.ctx.clearRect(0,0,W,H);return;}
    const g=mesh.geometry,pos=g.attributes.position.array,idx=g.index?.array,n=pos.length/3;
    let p=this.models.get(g);
    if(!p){p={x:new Float32Array(n),y:new Float32Array(n),q:new Float32Array(n),shade:new Float32Array(n)};
      const norm=g.attributes.normal.array;
      for(let i=0;i<n;i++){
        const x=norm[3*i],y=norm[3*i+1],z=norm[3*i+2];
        const main=Math.max(0,-.57*x+.66*y+.49*z);
        const fill=Math.max(0,.74*x+.17*y+.62*z);
        const rim=Math.max(0,.24*x+.54*y-.80*z);
        p.shade[i]=84+94*main+20*fill+14*rim+9*y;
      }
      this.models.set(g,p);
    }
    camera.updateMatrixWorld();this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    const m=this.projection.elements;
    for(let i=0,j=0;i<n;i++,j+=3){
      const x=pos[j],y=pos[j+1],z=pos[j+2],w=m[3]*x+m[7]*y+m[11]*z+m[15],q=1/w;
      p.x[i]=(.5+.5*(m[0]*x+m[4]*y+m[8]*z+m[12])*q)*W;
      p.y[i]=(.5-.5*(m[1]*x+m[5]*y+m[9]*z+m[13])*q)*H;p.q[i]=q;
    }
    const end=idx?idx.length:n;
    for(let t=0;t<end;t+=3){
      const a=idx?idx[t]:t,b=idx?idx[t+1]:t+1,c=idx?idx[t+2]:t+2;
      const x0=p.x[a],y0=p.y[a],x1=p.x[b],y1=p.y[b],x2=p.x[c],y2=p.y[c];
      const area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0);
      if(area>=-.00001||p.q[a]<=0||p.q[b]<=0||p.q[c]<=0)continue;
      const left=Math.max(0,Math.ceil(Math.min(x0,x1,x2)-.5)),right=Math.min(W-1,Math.floor(Math.max(x0,x1,x2)-.5));
      const top=Math.max(0,Math.ceil(Math.min(y0,y1,y2)-.5)),bottom=Math.min(H-1,Math.floor(Math.max(y0,y1,y2)-.5));
      if(left>right||top>bottom)continue;
      const ux=(y2-y0)/area,uy=-(x2-x0)/area,vx=-(y1-y0)/area,vy=(x1-x0)/area;
      let rowU=(left+.5-x0)*ux+(top+.5-y0)*uy,rowV=(left+.5-x0)*vx+(top+.5-y0)*vy;
      const q0=p.q[a],dq1=p.q[b]-q0,dq2=p.q[c]-q0;
      const l0=p.shade[a],dl1=p.shade[b]-l0,dl2=p.shade[c]-l0;
      for(let py=top;py<=bottom;py++,rowU+=uy,rowV+=vy){
        let u=rowU,v=rowV,k=py*W+left;
        for(let px=left;px<=right;px++,k++,u+=ux,v+=vx){
          if(u<-.00001||v<-.00001||u+v>1.00001)continue;
          const q=q0+u*dq1+v*dq2;if(q<=this.depth[k])continue;
          this.depth[k]=q;const light=(l0+u*dl1+v*dl2+.5)|0;
          this.pixels[k]=(0xff000000|((light-1)<<16)|(light<<8)|light)>>>0;
        }
      }
    }
    this.ctx.putImageData(this.buffer,0,0);
  }
}
