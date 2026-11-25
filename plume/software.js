// Software rasterizer for browsers without hardware WebGL. Uses the same indexed mesh.
function softwareRenderer(canvas, pos, norm, ao, faces) {
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw new Error('Canvas unavailable');
  const count=ao.length;
  const sx=new Float32Array(count),sy=new Float32Array(count),sz=new Float32Array(count),lighting=new Float32Array(count);
  let image,depth;
  return (right,up,eye,mx,my,scale)=>{
    const w=canvas.width,h=canvas.height;
    if(!image||image.width!==w||image.height!==h){image=ctx.createImageData(w,h);depth=new Float32Array(w*h);}
    image.data.fill(0);depth.fill(-Infinity);
    const pixels=image.data;
    const lx=-.51,ly=.70,lz=.50;
    for(let i=0;i<count;i++){
      const p=i*3,x=pos[p],y=pos[p+1],z=pos[p+2];
      sx[i]=w/2+(x*right[0]+y*right[1]-mx)*scale;
      sy[i]=h/2-(x*up[0]+y*up[1]+z*up[2]-my)*scale;
      sz[i]=x*eye[0]+y*eye[1]+z*eye[2];
      const a=norm[p]/127,b=norm[p+1]/127,c=norm[p+2]/127;
      const nx=a*right[0]+b*right[1],ny=a*up[0]+b*up[1]+c*up[2],nz=a*eye[0]+b*eye[1]+c*eye[2];
      const key=Math.max(0,lx*nx+ly*ny+lz*nz),fill=Math.max(0,.74*nx+.04*ny+.67*nz);
      lighting[i]=255*Math.pow((.30+.72*key+.14*fill)*(.48+.52*ao[i]/255),.60);
    }
    for(let t=0;t<faces.length;t+=3){
      const a=faces[t],b=faces[t+1],c=faces[t+2];
      const x0=sx[a],y0=sy[a],dx1=sx[b]-x0,dy1=sy[b]-y0,dx2=sx[c]-x0,dy2=sy[c]-y0;
      const area=dx1*dy2-dy1*dx2;if(area>=-.00001)continue;
      const xMin=Math.max(0,Math.floor(Math.min(x0,sx[b],sx[c]))),xMax=Math.min(w-1,Math.ceil(Math.max(x0,sx[b],sx[c])));
      const yMin=Math.max(0,Math.floor(Math.min(y0,sy[b],sy[c]))),yMax=Math.min(h-1,Math.ceil(Math.max(y0,sy[b],sy[c])));
      const inv=1/area,bu=dy2*inv,bv=-dy1*inv,dz1=sz[b]-sz[a],dz2=sz[c]-sz[a],dl1=lighting[b]-lighting[a],dl2=lighting[c]-lighting[a];
      for(let y=yMin;y<=yMax;y++){
        const dy=y+.5-y0,dx=xMin+.5-x0;
        let u=(dx*dy2-dy*dx2)*inv,v=(dy*dx1-dx*dy1)*inv;
        for(let x=xMin;x<=xMax;x++,u+=bu,v+=bv){
          if(u<0||v<0||u+v>1)continue;
          const idx=y*w+x,z=sz[a]+u*dz1+v*dz2;if(z<=depth[idx])continue;
          depth[idx]=z;
          const shade=lighting[a]+u*dl1+v*dl2,p=idx*4;
          pixels[p]=shade*.848;pixels[p+1]=shade*.81;pixels[p+2]=shade*.754;pixels[p+3]=255;
        }
      }
    }
    ctx.putImageData(image,0,0);
  };
}
