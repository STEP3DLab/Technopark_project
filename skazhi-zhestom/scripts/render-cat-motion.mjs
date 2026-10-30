import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import{spawnSync}from'node:child_process';
import{rig,FPS,FRAMES,pose,weights,smooth}from'../renderer/cat/rig.mjs';
const require=createRequire(import.meta.url);
const sharp=require('sharp');
const project=new URL('../',import.meta.url).pathname;
const root=fs.existsSync(path.join(project,'dist/index.html'))?path.join(project,'dist'):project;
const ids=process.argv.slice(2).length?process.argv.slice(2):Object.keys(rig);
const SIZE=512,SRC=1024,scale=.93,offset=(SIZE-SIZE*scale)/2;
for(const id of ids){
 const config=rig[id];if(!config)throw new Error(`Unknown sticker ${id}`);
 const dir=path.join(project,'.render/cat-v3',id);fs.mkdirSync(dir,{recursive:true});
 const input=await sharp(path.join(root,`cat/${id}.png`)).resize(SRC,SRC).ensureAlpha().raw().toBuffer();
 const tex=new Float32Array(input.length);for(let j=0;j<input.length;j+=4){const a=input[j+3]/255;tex[j]=input[j]*a;tex[j+1]=input[j+1]*a;tex[j+2]=input[j+2]*a;tex[j+3]=input[j+3];}
 const X=new Float32Array(SIZE*SIZE),Y=new Float32Array(SIZE*SIZE),H=new Float32Array(SIZE*SIZE),F=new Float32Array(SIZE*SIZE),A=config.arms.map(()=>new Float32Array(SIZE*SIZE));
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const i=y*SIZE+x;X[i]=(x-offset)/scale;Y[i]=(y-offset)/scale;const w=weights(config,X[i],Y[i]);H[i]=w.head;F[i]=w.frozen;w.arms.forEach((a,k)=>A[k][i]=a);}
 for(let frame=0;frame<FRAMES;frame++){
  const p=frame/(FRAMES-1),state=pose(config,p),output=Buffer.alloc(SIZE*SIZE*4),ct=Math.cos(-state.tilt),st=Math.sin(-state.tilt);
  for(let i=0;i<X.length;i++){
   let x=X[i],y=Y[i];if(x<0||y<0||x>=512||y>=512)continue;
   const h=H[i],f=F[i];
   const dx=x-config.neck[0],dy=y-config.neck[1];
   let sx=x+(dx*ct-dy*st-dx)*h,sy=y+(dx*st+dy*ct-dy-state.nod)*h;
   sx-=(x-256)*state.breath*f+state.sway*f;sy-=(y-360)*state.breath*f;
   for(let k=0;k<config.arms.length;k++){const a=config.arms[k],s=state.arms[k],w=A[k][i];if(w<.001)continue;const ax=x-a.pivot[0],ay=y-a.pivot[1];sx+=(ax*s.cos-ay*s.sin-ax-s.dx)*w;sy+=(ax*s.sin+ay*s.cos-ay-s.dy)*w;}
   if(state.blink>.002){
    for(const eye of config.eyes){const [ex,ey,rx,ry,angle]=eye;const ec=Math.cos(angle),es=Math.sin(angle);const ax=sx-ex,ay=sy-ey;const u=ax*ec+ay*es,v=-ax*es+ay*ec;if(Math.abs(u)>rx*1.45||Math.abs(v)>ry*1.8)continue;
     const amount=state.blink*.84*(1-smooth(.65,1.45,Math.abs(u)/rx));const compression=1-amount*.91,inside=ry*compression,extent=ry*1.8;
     const av=Math.abs(v);const mapped=av<inside?av/compression:ry+(av-inside)*(extent-ry)/(extent-inside);const shift=(mapped-av)*Math.sign(v);sx-=shift*es;sy+=shift*ec;
    }
   }
   const xx=sx*2,yy=sy*2;if(xx<0||yy<0||xx>=SRC-1||yy>=SRC-1)continue;
   const ix=xx|0,iy=yy|0,fx=xx-ix,fy=yy-iy;
   const b=(iy*SRC+ix)*4,b1=b+4,b2=b+SRC*4,b3=b2+4;
   const w0=(1-fx)*(1-fy),w1=fx*(1-fy),w2=(1-fx)*fy,w3=fx*fy;
   const alpha=tex[b+3]*w0+tex[b1+3]*w1+tex[b2+3]*w2+tex[b3+3]*w3,oi=i*4;output[oi+3]=Math.round(alpha);
   if(alpha>.5)for(let c=0;c<3;c++)output[oi+c]=Math.round((tex[b+c]*w0+tex[b1+c]*w1+tex[b2+c]*w2+tex[b3+c]*w3)*255/alpha);
  }
  await sharp(output,{raw:{width:SIZE,height:SIZE,channels:4}}).png({compressionLevel:2}).toFile(path.join(dir,`${String(frame).padStart(3,'0')}.png`));
 }
 console.log(`${id}: ${FRAMES} locally rendered frames`);
 const destination=path.join(root,`cat-motion/${id}.webm`);
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 let crf=28;
 for(;crf<=44;crf+=4){const args=['-hide_banner','-loglevel','error','-y','-framerate',String(FPS),'-i',`${dir}/%03d.png`,'-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf',String(crf),'-deadline','good','-cpu-used','3','-row-mt','1','-an','-t','3',destination];const r=spawnSync('ffmpeg',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);if(fs.statSync(destination).size<250*1024)break;}
 if(fs.statSync(destination).size>256*1024)throw new Error(`Too large: ${id}`);
 await sharp(path.join(dir,'000.png')).webp({quality:96,alphaQuality:100}).toFile(path.join(root,`cat-motion/${id}-poster.webp`));
 const hq=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(FPS),'-i',`${dir}/%03d.png`,'-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf','24','-deadline','good','-cpu-used','3','-row-mt','1','-an','-t','3',path.join(root,`cat-motion/${id}-preview.webm`)],{encoding:'utf8'});if(hq.status!==0)throw new Error(hq.stderr);
 console.log(`${id}: VP9 alpha / ${fs.statSync(destination).size} bytes / CRF ${crf}`);
}
