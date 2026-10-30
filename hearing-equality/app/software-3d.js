import * as T from './vendor/three.module.min.js';
// CPU rasterization of the SAME skinned 3D meshes and perspective camera.
// Used only when WebGL is unavailable. This is not the old 2D character.
export class Software3DRenderer {
  constructor(canvas){this.domElement=canvas;this.ctx=canvas.getContext('2d',{alpha:false});if(!this.ctx)throw new Error('3D renderer unavailable');this.shadowMap={};this.w=1;this.h=1;this.cache=new WeakMap();}
  setPixelRatio(){}
  setSize(width,height){const scale=Math.min(1,720/Math.max(width,height));this.w=Math.max(1,Math.round(width*scale));this.h=Math.max(1,Math.round(height*scale));this.domElement.width=this.w;this.domElement.height=this.h;this.pixels=this.ctx.createImageData(this.w,this.h);this.depth=new Float32Array(this.w*this.h);}
  render(scene,camera){
    const {w,h}=this;if(!this.pixels)return;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
    const pixels=this.pixels.data,depth=this.depth;depth.fill(Infinity);
    const bg=scene.background?.clone().convertLinearToSRGB()||new T.Color(.1,.17,.27);
    for(let y=0;y<h;y++){const fade=1.15-.3*y/h;for(let x=0;x<w;x++){const i=(y*w+x)*4;pixels[i]=Math.min(255,bg.r*255*fade);pixels[i+1]=Math.min(255,bg.g*255*fade);pixels[i+2]=Math.min(255,bg.b*255*fade);pixels[i+3]=255;}}
    const matrix=new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),position=new T.Vector3();
    const lamp=new T.Vector3(-.5,.8,1).normalize(),fill=new T.Vector3(.8,.25,.5).normalize();
    scene.traverse(mesh=>{
      if(!mesh.isSkinnedMesh||!mesh.visible)return;mesh.skeleton.update();
      const geometry=mesh.geometry,vertexColor=geometry.attributes.color,pos=geometry.attributes.position,norm=geometry.attributes.normal,skinIndex=geometry.attributes.skinIndex,skinWeight=geometry.attributes.skinWeight,index=geometry.index.array,count=pos.count,bones=mesh.skeleton.boneMatrices;
      let arrays=this.cache.get(geometry);if(!arrays){arrays={x:new Float32Array(count),y:new Float32Array(count),z:new Float32Array(count),light:new Float32Array(count),red:new Float32Array(count),green:new Float32Array(count),blue:new Float32Array(count)};this.cache.set(geometry,arrays);}const {x:xs,y:ys,z:zs,light,red:reds,green:greens,blue:blues}=arrays;
      const matColor=mesh.material.color; const srgb=x=>255*(x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055);
      for(let i=0;i<count;i++){
        reds[i]=srgb(matColor.r*(vertexColor?vertexColor.getX(i):1));greens[i]=srgb(matColor.g*(vertexColor?vertexColor.getY(i):1));blues[i]=srgb(matColor.b*(vertexColor?vertexColor.getZ(i):1));
        mesh.getVertexPosition(i,position);position.applyMatrix4(mesh.matrixWorld).applyMatrix4(matrix);xs[i]=(position.x*.5+.5)*w;ys[i]=(-position.y*.5+.5)*h;zs[i]=position.z;
        const nx=norm.getX(i),ny=norm.getY(i),nz=norm.getZ(i);let a=0,b=0,c=0;
        for(let j=0;j<4;j++){const weight=skinWeight.array[i*4+j];if(!weight)continue;const k=skinIndex.array[i*4+j]*16;a+=weight*(bones[k]*nx+bones[k+4]*ny+bones[k+8]*nz);b+=weight*(bones[k+1]*nx+bones[k+5]*ny+bones[k+9]*nz);c+=weight*(bones[k+2]*nx+bones[k+6]*ny+bones[k+10]*nz);}
        const len=Math.hypot(a,b,c)||1;light[i]=.44+.48*Math.max(0,(a*lamp.x+b*lamp.y+c*lamp.z)/len)+.22*Math.max(0,(a*fill.x+b*fill.y+c*fill.z)/len);
      }
      const color=mesh.material.color.clone().convertLinearToSRGB(),red=color.r*255,green=color.g*255,blue=color.b*255;
      for(let k=0;k<index.length;k+=3){
        const a=index[k],b=index[k+1],c=index[k+2],x0=xs[a],y0=ys[a],x1=xs[b],y1=ys[b],x2=xs[c],y2=ys[c];
        if(zs[a]<-1||zs[a]>1||zs[b]<-1||zs[b]>1||zs[c]<-1||zs[c]>1)continue;
        const area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0);if(area>=-.001)continue;
        const left=Math.max(0,Math.floor(Math.min(x0,x1,x2))),right=Math.min(w-1,Math.ceil(Math.max(x0,x1,x2))),top=Math.max(0,Math.floor(Math.min(y0,y1,y2))),bottom=Math.min(h-1,Math.ceil(Math.max(y0,y1,y2)));
        const inv=1/area;
        for(let py=top;py<=bottom;py++)for(let px=left;px<=right;px++){
          const dx=px+.5-x0,dy=py+.5-y0,wb=(dx*(y2-y0)-dy*(x2-x0))*inv,wc=((x1-x0)*dy-(y1-y0)*dx)*inv,wa=1-wb-wc;
          if(wa<0||wb<0||wc<0)continue;const z=wa*zs[a]+wb*zs[b]+wc*zs[c],i=py*w+px;if(z>=depth[i])continue;depth[i]=z;const shade=wa*light[a]+wb*light[b]+wc*light[c],o=i*4;pixels[o]=Math.min(255,(wa*reds[a]+wb*reds[b]+wc*reds[c])*shade);pixels[o+1]=Math.min(255,(wa*greens[a]+wb*greens[b]+wc*greens[c])*shade);pixels[o+2]=Math.min(255,(wa*blues[a]+wb*blues[b]+wc*blues[c])*shade);
        }
      }
    });
    this.ctx.putImageData(this.pixels,0,0);
    scene.traverse(object=>{if(!object.isSkeletonHelper||!object.visible)return;const ctx=this.ctx;ctx.strokeStyle='#69d9ff';ctx.lineWidth=1.2;ctx.fillStyle='#e6f9ff';for(const bone of object.bones){if(!bone.parent?.isBone)continue;const a=bone.getWorldPosition(new T.Vector3()).applyMatrix4(matrix),b=bone.parent.getWorldPosition(new T.Vector3()).applyMatrix4(matrix);ctx.beginPath();ctx.moveTo((a.x*.5+.5)*w,(-a.y*.5+.5)*h);ctx.lineTo((b.x*.5+.5)*w,(-b.y*.5+.5)*h);ctx.stroke();ctx.beginPath();ctx.arc((a.x*.5+.5)*w,(-a.y*.5+.5)*h,1.4,0,Math.PI*2);ctx.fill();}});
  }
  dispose(){this.cache=new WeakMap();this.pixels=null;this.depth=null;}
}
