import * as T from 'three';
const textureSize = 512;
// Depth-buffered rasterisation for browsers that disable hardware graphics.
export class SoftwareRenderer{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.packets=new WeakMap();this.textures=new WeakMap();this.lightCache=new Map();this.frustum=new T.Frustum()}
 setPixelRatio(){}
 setSize(w,h){const scale=Math.min(1,920/w,640/h);this.w=this.canvas.width=Math.max(1,Math.round(w*scale));this.h=this.canvas.height=Math.max(1,Math.round(h*scale));this.image=this.ctx.createImageData(this.w,this.h);this.depth=new Float32Array(this.w*this.h);this.direct=new Float32Array(this.w*this.h);this.mirrorMask=new Uint8Array(this.w*this.h)}
 setAnimationLoop(fn){function tick(){fn();requestAnimationFrame(tick)}requestAnimationFrame(tick)}
 texture(map){if(!map?.image)return null;if(this.textures.has(map))return this.textures.get(map);const c=document.createElement('canvas');c.width=c.height=textureSize;const ctx=c.getContext('2d');ctx.drawImage(map.image,0,0,textureSize,textureSize);const tex=ctx.getImageData(0,0,textureSize,textureSize).data;this.textures.set(map,tex);return tex}
 packet(o){if(this.packets.has(o))return this.packets.get(o);
 const g=o.geometry,p=g.attributes.position,uv=g.attributes.uv,coords=[],v=new T.Vector3(),tris=[],ind=g.index?.array,col=o.material.color.clone().convertLinearToSRGB(),base=[col.r*255,col.g*255,col.b*255];
 for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);coords.push([v.x,v.y,v.z,uv?.getX(i)||0,uv?.getY(i)||0])}
 const n=ind?.length||p.count;for(let i=0;i<n;i+=3){const a=ind?ind[i]:i,b=ind?ind[i+1]:i+1,c=ind?ind[i+2]:i+2,A=coords[a],B=coords[b],C=coords[c],x=B[0]-A[0],y=B[1]-A[1],z=B[2]-A[2],X=C[0]-A[0],Y=C[1]-A[1],Z=C[2]-A[2],nx=y*Z-z*Y,ny=z*X-x*Z,nz=x*Y-y*X,len=Math.hypot(nx,ny,nz)||1;tris.push([a,b,c,.89+.22*(ny*.83-nx*.32-nz*.45)/len,Math.max(0,(ny*.42-nx*.43-nz*.78)/len)])}
 const luminous=o.material.emissiveMap;
 const pack={coords,tris,base:luminous?[255,255,255]:base,tex:this.texture(luminous||o.material.map)};this.packets.set(o,pack);return pack}
 // A static orthographic shadow atlas retains direct light between camera movements.
 lightAtlas(scene, light) {
   const key = light.position.y;
   if (this.lightCache.has(key)) return this.lightCache.get(key);
   const z = light.position.clone().normalize();
   const x = new T.Vector3(0,1,0).cross(z).normalize();
   const y = z.clone().cross(x);
   const size = 400, scale = size/16, map = new Float32Array(size*size).fill(-100);
   function project(p) {
     return [(p[0]*x.x+p[1]*x.y+p[2]*x.z)*scale+size/2,
       (p[0]*y.x+p[1]*y.y+p[2]*y.z)*scale+size/2,
       p[0]*z.x+p[1]*z.y+p[2]*z.z,p[1]];
   }
   scene.traverseVisible(o => {
     if (!o.isMesh || !o.castShadow) return;
     const packet=this.packet(o), vertices=packet.coords.map(project), clipped=o.material.clippingPlanes?.length>0;
     for (const [ia,ib,ic] of packet.tris) {
       const a=vertices[ia],b=vertices[ib],c=vertices[ic];
       if (clipped && Math.min(a[3],b[3],c[3])>.88) continue;
       const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
       if (Math.abs(den)<.02) continue;
       const left=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),right=Math.min(size-1,Math.ceil(Math.max(a[0],b[0],c[0])));
       const top=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),bottom=Math.min(size-1,Math.ceil(Math.max(a[1],b[1],c[1])));
       const du=(b[1]-c[1])/den,dv=(c[1]-a[1])/den;
       for(let j=top;j<=bottom;j++){
         let u=((b[1]-c[1])*(left+.5-c[0])+(c[0]-b[0])*(j+.5-c[1]))/den;
         let v=((c[1]-a[1])*(left+.5-c[0])+(a[0]-c[0])*(j+.5-c[1]))/den;
         for(let i=left;i<=right;i++,u+=du,v+=dv){
           const t=1-u-v;if(u<0||v<0||t<0)continue;
           if(clipped && u*a[3]+v*b[3]+t*c[3]>.88)continue;
           const depth=u*a[2]+v*b[2]+t*c[2],k=j*size+i;
           if(depth>map[k]) map[k]=depth;
         }
       }
     }
   });
   const atlas={map,size,scale,x,y,z};
   this.lightCache.set(key,atlas);return atlas;
 }
 lightFrame(scene,cam) {
   const light=scene.children.find(o=>o.isDirectionalLight);
   if(!light)return;
   const atlas=this.lightAtlas(scene,light),{map,size,scale}=atlas;
   const w=this.w,h=this.h,pixels=this.image.data,d=this.depth;
   const cols=cam.matrixWorld.elements,px=cam.projectionMatrix.elements[0],py=cam.projectionMatrix.elements[5];
   const ax=atlas.x,ay=atlas.y,az=atlas.z;
   for(let y=0;y<h;y++){
     const ry=(1-2*(y+.5)/h)/py;
     for(let x=0;x<w;x++){
       const i=y*w+x;
       if(d[i]<=0)continue;
       const depth=1/d[i],rx=(2*(x+.5)/w-1)/px;
       const X=cols[12]+depth*(rx*cols[0]+ry*cols[4]-cols[8]);
       const Y=cols[13]+depth*(rx*cols[1]+ry*cols[5]-cols[9]);
       const Z=cols[14]+depth*(rx*cols[2]+ry*cols[6]-cols[10]);
       const u=(X*ax.x+Y*ax.y+Z*ax.z)*scale+size/2-.5;
       const v=(X*ay.x+Y*ay.y+Z*ay.z)*scale+size/2-.5;
       const ix=Math.floor(u),iy=Math.floor(v),sunDepth=X*az.x+Y*az.y+Z*az.z+.065;
       let shade=0;
       if(ix>=0&&iy>=0&&ix<size-1&&iy<size-1){
         const j=iy*size+ix,fx=u-ix,fy=v-iy;
         shade=(1-fy)*((map[j]>sunDepth)*(1-fx)+(map[j+1]>sunDepth)*fx)
            +fy*((map[j+size]>sunDepth)*(1-fx)+(map[j+size+1]>sunDepth)*fx);
       }
       // Estimate contact occlusion from paired depth samples; straight planar slopes cancel.
       const r=Math.min(12,Math.max(2,Math.round(h*.10/depth))),jump=r*w;
       let contact=0;
       if(x>=r&&x+r<w&&y>=r&&y+r<h){
         for(const offset of [r,jump,jump+r,jump-r]){
           const plus=d[i+offset],minus=d[i-offset];if(!plus||!minus)continue;
           const delta=depth-.5*(1/plus+1/minus);
           if(delta>.012&&delta<.35) contact+=Math.min(1,delta/.075)*(1-delta/.35);
         }
       }
       const strength=1-.30*shade*this.direct[i]-.026*contact;
       const j=i*4;
       pixels[j]=pixels[j]*strength*(1.023-.019*shade);
       pixels[j+1]=pixels[j+1]*strength;
       pixels[j+2]=pixels[j+2]*strength*(.973+.032*shade);
     }
   }
 }
 reflect(scene,cam,mirrorZ) {
   if(!this.mirrorRenderer) this.mirrorRenderer=new SoftwareRenderer(document.createElement('canvas'));
   const other=this.mirrorRenderer;
   const w=Math.max(1,Math.round(this.w*.54)),h=Math.max(1,Math.round(this.h*.54));
   if(other.w!==w||other.h!==h)other.setSize(w,h);
   other.packets=this.packets;other.textures=this.textures;other.lightCache=this.lightCache;
   other.reflectionPlane=mirrorZ+.002;
   const camera=cam.clone(),dir=cam.getWorldDirection(new T.Vector3());
   camera.position.z=2*mirrorZ-cam.position.z;dir.z*=-1;
   camera.lookAt(camera.position.clone().add(dir));
   other.render(scene,camera);
   const source=other.image.data,dest=this.image.data,mask=this.mirrorMask;
   for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++){
     const i=y*this.w+x;if(!mask[i])continue;
     const j=4*(Math.floor(y*h/this.h)*w + w-1-Math.floor(x*w/this.w));
     dest[i*4]=source[j]*.91+5;dest[i*4+1]=source[j+1]*.94+4;dest[i*4+2]=source[j+2]*.93+5;
   }
 }
 render(scene,cam){
 const w=this.w,h=this.h,data=this.image.data,depth=this.depth;depth.fill(0);
 new Uint32Array(data.buffer).fill(0xffdae6e8);
 scene.updateMatrixWorld();cam.updateMatrixWorld();
 const viewProjection=new T.Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
 this.frustum.setFromProjectionMatrix(viewProjection);
 const m=viewProjection.elements;
 const reflectionClip=this.reflectionPlane;let mirrorZ=null;this.mirrorMask.fill(0);
 const project=a=>{const [x,y,z,u,v]=a;return [(m[0]*x+m[4]*y+m[8]*z+m[12]),(m[1]*x+m[5]*y+m[9]*z+m[13]),m[3]*x+m[7]*y+m[11]*z+m[15],u,v,y,z]};
 function clip(poly,axis,edge,sign){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-edge)*sign,db=(b[axis]-edge)*sign;if(da>=0)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*t))}}return out}
 const direct=this.direct,mirrorMask=this.mirrorMask;
 function raster(a,b,c,color,k,tex,sunWeight,isMirror){
 const az=1/a[2],bz=1/b[2],cz=1/c[2],ax=(1+a[0]*az)*w/2,ay=(1-a[1]*az)*h/2,bx=(1+b[0]*bz)*w/2,by=(1-b[1]*bz)*h/2,cx=(1+c[0]*cz)*w/2,cy=(1-c[1]*cz)*h/2;
 const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(den>=-.04)return;
 const left=Math.max(0,Math.floor(Math.min(ax,bx,cx))),right=Math.min(w-1,Math.ceil(Math.max(ax,bx,cx))),top=Math.max(0,Math.floor(Math.min(ay,by,cy))),bottom=Math.min(h-1,Math.ceil(Math.max(ay,by,cy)));
 const du=(by-cy)/den,dv=(cy-ay)/den,R=color[0]*k,G=color[1]*k,B=color[2]*k;
 for(let y=top;y<=bottom;y++){let u=((by-cy)*(left+.5-cx)+(cx-bx)*(y+.5-cy))/den,v=((cy-ay)*(left+.5-cx)+(ax-cx)*(y+.5-cy))/den;for(let x=left;x<=right;x++,u+=du,v+=dv){const t=1-u-v;if(u<0||v<0||t<0)continue;const z=u*az+v*bz+t*cz,i=y*w+x;if(z<=depth[i])continue;depth[i]=z;direct[i]=sunWeight;mirrorMask[i]=isMirror;let r=R,g=G,bv=B;if(tex){const tx=Math.floor((u*a[3]*az+v*b[3]*bz+t*c[3]*cz)/z*textureSize)&(textureSize-1),ty=Math.floor((u*a[4]*az+v*b[4]*bz+t*c[4]*cz)/z*textureSize)&(textureSize-1),j=(ty*textureSize+tx)*4;r=tex[j]*R/255;g=tex[j+1]*G/255;bv=tex[j+2]*B/255}data[i*4]=r;data[i*4+1]=g;data[i*4+2]=bv}}
 }
 scene.traverseVisible(o=>{if(!o.isMesh||o.material.transparent||o.name.includes('Glass_screen')||!this.frustum.intersectsObject(o))return;const p=this.packet(o),clipped=o.material.clippingPlanes?.length;
 const isMirror=o.name.toLowerCase()==='mirror'&&!clipped&&!this.reflectionPlane;
 if(isMirror) mirrorZ=new T.Box3().setFromObject(o).max.z;
 if(reflectionClip && o.name.toLowerCase()==='mirror') return;
 const pts=p.coords.map(project);
 for(const [a,b,c,k,sunWeight] of p.tris){let poly=[pts[a],pts[b],pts[c]];if(poly.every(q=>q[2]<.035))continue;if(reflectionClip && poly.some(q=>q[6]<reflectionClip))poly=clip(poly,6,reflectionClip,1);if(clipped&&poly.some(q=>q[5]>.88))poly=clip(poly,5,.88,-1);if(poly.some(q=>q[2]<.035))poly=clip(poly,2,.035,1);for(let j=1;j<poly.length-1;j++)raster(poly[0],poly[j],poly[j+1],p.base,k,p.tex,sunWeight,isMirror)}});
 this.lightFrame(scene,cam);
 if(mirrorZ!==null && cam.position.z>mirrorZ && this.mirrorMask.includes(1))this.reflect(scene,cam,mirrorZ);
 this.ctx.putImageData(this.image,0,0)
 }
}
