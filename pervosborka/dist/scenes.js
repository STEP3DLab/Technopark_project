/*
 * TechScenes — native WebGL 1 with a software 3D Canvas2D compatibility renderer.
 * Both renderers use the same actual 3D vertices, normals and perspective camera.
 * No network requests or third-party dependencies.
 * mount(element, {kind:'campus'|'engineering'|'robot'|'xr', camera?, ...params})
 * Engineering: thickness (or t) 1..5, ribs (or r) 0..4, exploded 0..1.
 * exploded is an illustrative separation of unchanged parts, never a simulation.
 * highlightPart:'base'|'wall'|'ribs'|null changes only the actual part colors.
 * Robot: path:[[x,y],...], position:[x,y], start, goal, obstacles. Coordinates 0..4.
 * XR: entry:'goal'|'autoride'|'finish', action:'voice'|'select'|'headset',
 *     feedback:'close'|'praise'|'explain'; empty choices remain neutral.
 *     visitorChoice:'satellite'|'rover'|'' highlights the chosen exhibit;
 *     visitorStage:'entry'|'action'|'feedback'|'' marks the player stage (0..2 also accepted).
 * Campus: campusItems:[{id,label,short,completed?,skipped?}], selectedLab:id,
 *     onSelectLab(id). Buttons follow projected roofs; selection never navigates.
 *     data-campus-id identifies each marker; getDebug().campusMarkers contains
 *     world coordinates, projected roofs and button positions in CSS pixels.
 * Camera: yaw/pitch in radians, distance in scene units. Positive zoom moves away.
 * setView('iso'|'top'|'front'|'side') sets a fixed direction, retaining distance/target.
 * front looks from +Z; side looks from +X. These are perspective views, not CAD drawings.
 * capture() synchronously redraws the visible geometry and returns a PNG data URL,
 * or null when unavailable/hidden. No animation advance, scoring, storage or download.
 * play(path?) returns Promise<{completed,position,reason}>. It never changes scores.
 * Events bubble from the canvas: techscene:playend, techscene:unavailable.
 * optional onUnavailable(detail), reducedMotion:boolean.
 * destroy() is required before removing a mounted scene. No automatic rotation.
 */
(function (global) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const finite = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const C = { navy:'#14233f', blue:'#2355ed', pale:'#b8cbff', sky:'#7094ff', lime:'#c7ed52', white:'#f8faff', floor:'#e9effa', line:'#c7d3e8', dark:'#0d1830', grey:'#899ab8', shadow:'#cbd6e9' };
  const colorCache = new Map();
  function rgb(hex) { if (!colorCache.has(hex)) colorCache.set(hex, [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)); return colorCache.get(hex); }
  function norm(v) { const l = Math.hypot(...v) || 1; return v.map(x=>x/l); }
  function sub(a,b) { return a.map((x,i)=>x-b[i]); }
  function cross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
  function dot(a,b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
  function multiply(a,b) { const out=new Float32Array(16); for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k]; return out; }
  function perspective(fov, aspect, near, far) { const f=1/Math.tan(fov/2), nf=1/(near-far); return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]); }
  function lookAt(eye,target) { const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x); return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]); }
  function turn(v,yaw,rx=0,rz=0) {
    let [x,y,z]=v;
    if(rx){const c=Math.cos(rx),s=Math.sin(rx);[y,z]=[y*c-z*s,y*s+z*c];}
    if(rz){const c=Math.cos(rz),s=Math.sin(rz);[x,y]=[x*c-y*s,x*s+y*c];}
    const c=Math.cos(yaw),s=Math.sin(yaw);return [x*c+z*s,y,-x*s+z*c];
  }
  class Mesh {
    constructor(){this.data=[];this.origin=[0,0,0];this.yaw=0;}
    vertex(p,n,col){const q=turn(p,this.yaw),r=turn(n,this.yaw);this.data.push(q[0]+this.origin[0],q[1]+this.origin[1],q[2]+this.origin[2],...r,...rgb(col));}
    face(points,n,col){n=norm(n);let p=points;if(dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),n)<0)p=[...p].reverse();for(let i=1;i<p.length-1;i++){this.vertex(p[0],n,col);this.vertex(p[i],n,col);this.vertex(p[i+1],n,col);}}
    smooth(points,normals,col){let order=[0,1,2];if(dot(cross(sub(points[1],points[0]),sub(points[2],points[0])),normals[0])<0)order=[2,1,0];for(const i of order)this.vertex(points[i],normals[i],col);}
    group(x,y,z,yaw,fn){const old=this.origin,angle=this.yaw,p=turn([x,y,z],angle);this.origin=old.map((n,i)=>n+p[i]);this.yaw+=yaw;fn();this.origin=old;this.yaw=angle;}
    box(x,y,z,w,h,d,col=C.white,yaw=0,bevel=.045){
      const half=[w/2,h/2,d/2],b=Math.max(0,Math.min(bevel,...half.map(v=>v*.75))),inner=half.map(v=>v-b);
      const emit=(p,n)=>this.face(p.map(v=>{const q=turn(v,yaw);return[q[0]+x,q[1]+y,q[2]+z];}),turn(n,yaw),col);
      for(let a=0;a<3;a++)for(const s of[-1,1]){const others=[0,1,2].filter(k=>k!==a),p=[];for(const [u,v]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const q=[0,0,0];q[a]=s*half[a];q[others[0]]=u*inner[others[0]];q[others[1]]=v*inner[others[1]];p.push(q);}const n=[0,0,0];n[a]=s;emit(p,n);}
      if(!b)return;
      for(let free=0;free<3;free++){const[a,c]=[0,1,2].filter(k=>k!==free);for(const sa of[-1,1])for(const sc of[-1,1]){const p=[];for(const [f,edge]of[[-1,0],[1,0],[1,1],[-1,1]]){const q=[0,0,0];q[free]=f*inner[free];q[a]=sa*(edge?inner[a]:half[a]);q[c]=sc*(edge?half[c]:inner[c]);p.push(q);}const n=[0,0,0];n[a]=sa;n[c]=sc;emit(p,n);}}
      for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1]){const signs=[sx,sy,sz],p=[0,1,2].map(a=>half.map((v,i)=>signs[i]*(i===a?v:inner[i])));emit(p,signs);}
    }
    cylinder(x,y,z,r,h,col=C.blue,segments=24,rx=0,rz=0){
      const point=(a,v)=>{const q=turn([r*Math.cos(a),v,r*Math.sin(a)],0,rx,rz);return[q[0]+x,q[1]+y,q[2]+z];};
      for(let i=0;i<segments;i++){const a=i*TAU/segments,b=(i+1)*TAU/segments;const p=[point(a,-h/2),point(b,-h/2),point(b,h/2),point(a,h/2)],na=turn([Math.cos(a),0,Math.sin(a)],0,rx,rz),nb=turn([Math.cos(b),0,Math.sin(b)],0,rx,rz);this.smooth([p[0],p[1],p[2]],[na,nb,nb],col);this.smooth([p[0],p[2],p[3]],[na,nb,na],col);for(const s of[-1,1]){const mid=turn([0,s*h/2,0],0,rx,rz).map((v,k)=>v+[x,y,z][k]);this.face([mid,point(a,s*h/2),point(b,s*h/2)],turn([0,s,0],0,rx,rz),col);}}
    }
    sphere(x,y,z,r,col=C.blue,sx=1,sy=1,sz=1){
      const sample=(a,b)=>{const v=[Math.sin(b)*Math.cos(a),Math.cos(b),Math.sin(b)*Math.sin(a)];return {p:[x+r*v[0]*sx,y+r*v[1]*sy,z+r*v[2]*sz],n:norm([v[0]/sx,v[1]/sy,v[2]/sz])};};
      for(let j=0;j<8;j++)for(let i=0;i<16;i++){const a=i*TAU/16,b=(i+1)*TAU/16,c=j*Math.PI/8,d=(j+1)*Math.PI/8,p=[sample(a,c),sample(b,c),sample(b,d),sample(a,d)];this.smooth([p[0].p,p[1].p,p[2].p],[p[0].n,p[1].n,p[2].n],col);this.smooth([p[0].p,p[2].p,p[3].p],[p[0].n,p[2].n,p[3].n],col);}
    }
    ring(x,y,z,r,tube,col=C.blue,rx=0){
      const sample=(a,b)=>{const n=turn([Math.cos(a)*Math.cos(b),Math.sin(b),Math.sin(a)*Math.cos(b)],0,rx),v=turn([(r+tube*Math.cos(b))*Math.cos(a),tube*Math.sin(b),(r+tube*Math.cos(b))*Math.sin(a)],0,rx);return{p:[x+v[0],y+v[1],z+v[2]],n};};
      for(let i=0;i<32;i++)for(let j=0;j<6;j++){const a=i*TAU/32,b=(i+1)*TAU/32,c=j*TAU/6,d=(j+1)*TAU/6,p=[sample(a,c),sample(b,c),sample(b,d),sample(a,d)];this.smooth([p[0].p,p[1].p,p[2].p],[p[0].n,p[1].n,p[2].n],col);this.smooth([p[0].p,p[2].p,p[3].p],[p[0].n,p[2].n,p[3].n],col);}
    }
    gusset(x,y,z,width,height,depth,col=C.blue){
      const p=[[y,z],[y+height,z],[y,z+depth]],left=p.map(q=>[x-width/2,q[0],q[1]]),right=p.map(q=>[x+width/2,q[0],q[1]]);this.face(left,[-1,0,0],col);this.face(right,[1,0,0],col);for(let i=0;i<3;i++){const j=(i+1)%3,dy=p[j][0]-p[i][0],dz=p[j][1]-p[i][1];this.face([left[i],left[j],right[j],right[i]],[0,dz,-dy],col);}
    }
    line(a,b,width,col,y=.02){const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);if(l<.001)return;this.box((a[0]+b[0])/2,y,(a[1]+b[1])/2,width,.025,l,col,Math.atan2(dx,dz),.005);}
    array(){return new Float32Array(this.data);}
  }
  function contact(m,x,z,w,d,y=.02){
    // Small opaque layers give both renderers the same soft contact cue.
    // These are deliberate illustration geometry, not a physical shadow map.
    for(const [i,col] of ['#e3eaf6','#d8e2f1','#ccd8eb'].entries())m.box(x+.045,y+i*.003,z-.035,w+.16-i*.07,.006,d+.16-i*.07,col,0,.10);
  }
  function stage(m,w=7,d=7){
    m.box(0,-.55,0,26,.1,26,C.floor,0,.04);
    for(const [i,col] of ['#e2e9f5','#d7e1f0','#cbd7e9'].entries())m.box(.09,-.47+i*.024,-.075,w+.90-i*.28,.016,d+.90-i*.28,col,0,.20);
    m.box(0,-.22,0,w,.33,d,C.navy,0,.13);
    m.box(0,-.09,0,w+.015,.035,d+.015,C.blue,0,.11);
    m.box(0,-.035,0,w-.05,.10,d-.05,C.white,0,.13);
    // Quiet physical registration marks frame the working surface.
    for(const x of[-1,1])for(const z of[-1,1]){
      m.box(x*(w/2-.28),.022,z*(d/2-.16),.28,.014,.026,C.line,0,.006);
      m.box(x*(w/2-.16),.022,z*(d/2-.28),.026,.014,.28,C.line,0,.006);
    }
  }
  function guideSegment(m,from,to){
    if(Math.hypot(...sub(to,from))<.035)return;
    for(let i=1;i<=5;i++){const t=i/6,q=from.map((v,k)=>v+(to[k]-v)*t);m.box(q[0],q[1],q[2],.022,.022,.022,C.grey,0,0);}
  }
  function satellite(m,x,y,z,scale=1){m.group(x,y,z,0,()=>{const s=scale;m.box(0,0,0,.58*s,.6*s,.55*s,C.white,0,.08*s);m.box(0,0,.29*s,.36*s,.34*s,.03*s,C.lime,0,.015);for(const side of[-1,1]){m.box(side*.79*s,0,0,.95*s,.07*s,.65*s,C.blue,0,.02);for(let k=0;k<4;k++)m.box(side*.79*s+(-.34+k*.23)*s,.041*s,0,.012*s,.01*s,.59*s,C.pale,0,0);}m.cylinder(0,.43*s,0,.028*s,.28*s,C.grey,10);m.sphere(0,.61*s,0,.09*s,C.lime);});}
  function rover(m,x,y,z,scale=.92){
    m.group(x,y,z,-.12,()=>{
      const s=scale;
      // Six separate wheels and a low chassis distinguish it from the winged satellite.
      for(const dz of[-.42,0,.42]){
        m.cylinder(0,.22*s,dz*s,.035*s,1.05*s,C.grey,10,0,Math.PI/2);
        for(const side of[-1,1]){
          m.cylinder(side*.51*s,.22*s,dz*s,.20*s,.15*s,C.navy,20,0,Math.PI/2);
          m.cylinder(side*.595*s,.22*s,dz*s,.10*s,.025*s,C.grey,16,0,Math.PI/2);
          m.cylinder(side*.611*s,.22*s,dz*s,.038*s,.012*s,C.lime,10,0,Math.PI/2);
        }
      }
      for(const side of[-1,1])m.box(side*.40*s,.32*s,0,.08*s,.10*s,1.10*s,C.grey,0,.015*s);
      m.box(0,.47*s,0,.78*s,.28*s,1.08*s,C.white,0,.055*s);
      m.box(0,.63*s,-.08*s,.70*s,.045*s,.76*s,C.blue,0,.02*s);
      for(let i=0;i<4;i++)m.box((-.24+i*.16)*s,.658*s,-.08*s,.012*s,.012*s,.68*s,C.pale,0,0);
      m.box(0,.46*s,.56*s,.50*s,.16*s,.08*s,C.blue,0,.025*s);
      m.cylinder(0,.79*s,.27*s,.032*s,.30*s,C.grey,12);
      m.box(0,.98*s,.29*s,.36*s,.17*s,.20*s,C.navy,0,.035*s);
      for(const side of[-1,1])m.sphere(side*.09*s,.99*s,.395*s,.043*s,C.lime,1,1,.5);
      m.cylinder(-.25*s,.82*s,-.38*s,.018*s,.34*s,C.grey,10);
      m.sphere(-.25*s,1.01*s,-.38*s,.045*s,C.white);
    });
  }
  const CAMPUS_IDS=['engineering','robotics','code','ai','design','xr','research','social'];
  const CAMPUS_LABELS=['Инженерия и 3D','Робототехника','Код и данные','Искусственный интеллект','Дизайн и медиа','XR и игры','Исследования и метрология','Социальные технологии'];
  function campusAnchor(index){
    const angle=index*TAU/8,height=.48+(index%3)*.18;
    return [Math.sin(angle)*2.58,height+.25,Math.cos(angle)*2.58];
  }
  function campusItems(params){
    const source=Array.isArray(params.campusItems)?params.campusItems:[];
    return CAMPUS_IDS.map((id,index)=>{
      const item=source.find(value=>value&&value.id===id)||{};
      const label=typeof item.label==='string'&&item.label.trim()?item.label.slice(0,160):CAMPUS_LABELS[index];
      return {id,index,label,short:typeof item.short==='string'&&item.short.trim()?item.short.slice(0,52):label.slice(0,52),completed:item.completed===true,skipped:item.skipped===true};
    });
  }
  function projectPoint(point,matrix,width,height){
    const [x,y,z]=point;
    const clip=[matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14],matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15]];
    if(!clip.every(Number.isFinite)||clip[3]<=0||clip.slice(0,3).some(v=>v < -clip[3]||v > clip[3]))return null;
    return {x:(clip[0]/clip[3]*.5+.5)*width,y:(.5-clip[1]/clip[3]*.5)*height,depth:clip[2]/clip[3]};
  }
  function campus(m,p){
    stage(m,7.2,7.2);contact(m,0,0,2.15,2.05);m.ring(0,.034,0,2.45,.028,C.line);m.box(0,.12,0,2.0,.23,1.9,C.blue,0,.12);m.box(0,.85,0,1.4,1.3,1.25,C.white,0,.09);m.box(0,1.56,0,1.52,.18,1.38,C.blue,0,.07);m.box(0,1.75,0,.4,.2,.45,C.lime,0,.05);
    for(let j=0;j<3;j++)for(let i=0;i<3;i++){m.box(-.43+i*.43,.45+j*.34,.635,.27,.18,.027,C.blue,0,.015);m.box(.713,.45+j*.34,-.36+i*.36,.025,.18,.23,C.pale,0,.012);}
    for(let i=0;i<8;i++){const a=i*TAU/8,h=.48+(i%3)*.18,selected=p.selectedLab===CAMPUS_IDS[i];m.group(0,0,0,a,()=>{m.box(0,.033,1.65,.38,.025,1.1,selected?C.blue:C.line,0,.01);contact(m,0,2.58,1.25,1.12);m.box(0,.065,2.58,1.19,.12,1.05,selected?C.lime:C.pale,0,.09);m.box(0,h/2+.14,2.58,.91,h,.82,i%2?C.white:C.blue,0,.075);m.box(0,h+.19,2.58,1.01,.10,.92,selected?C.lime:C.navy,0,.035);if(selected)m.ring(0,.145,2.58,.77,.035,C.blue);m.box(0,.40,2.155,.37,.31,.025,i%2?C.blue:C.pale,0,.025);m.box(-.33,.28,2.15,.12,.08,.03,C.lime,0,.012);m.cylinder(.50,.10,2.05,.09,.18,C.navy,12);m.sphere(.50,.22,2.05,.08,C.white);});}
    // A visible collection of real 3D maker objects at the edge of the campus.
    m.cylinder(-2.75,.12,1.07,.26,.18,C.blue,24);m.cylinder(-2.75,.30,1.07,.18,.20,C.pale,20);m.cylinder(-2.75,.41,1.07,.26,.06,C.blue,24);
    m.box(2.8,.18,1.05,.55,.32,.6,C.lime,.2,.07);m.box(2.8,.38,1.05,.3,.09,.35,C.navy,.2,.03);
    for(let i=0;i<3;i++){m.cylinder(-1+i*.33,.06,3.21,.10,.10,C.line,14);m.sphere(-1+i*.33,.20,3.21,.12,i===1?C.lime:C.blue);}
    satellite(m,2.5,.56,-1.0,.32);
  }
  function engineeringLayout(p){
    const thickness=clamp(finite(p.thickness??p.t,2),1,5),ribs=Math.round(clamp(finite(p.ribs??p.r,2),0,4)),wall=.09+thickness*.055,exploded=clamp(finite(p.exploded,0),0,1);
    const parts=[
      {id:'base',kind:'box',position:[0,.23+wall/2,.13],size:[3.45,wall,2.3],origin:[0,.23+wall/2,.13]},
      {id:'wall',kind:'box',position:[0,1.25+.48*exploded,-.86-.58*exploded],size:[3.45,1.85,wall],origin:[0,1.25,-.86]}
    ];
    for(let i=0;i<ribs;i++){
      const x=(i-(ribs-1)/2)*.65;
      parts.push({id:'rib-'+(i+1),kind:'gusset',position:[x+(i-(ribs-1)/2)*.16*exploded,.23+wall+.46*exploded,-.86+wall/2+.42*exploded],size:[.10+thickness*.012,1.45,1.25],origin:[x,.23+wall,-.86+wall/2]});
    }
    for(const x of[-1.38,1.38])for(const z of[-.52,.90])parts.push({id:'fastener-'+parts.filter(part=>part.kind==='fastener').length,kind:'fastener',position:[x,.25+wall+.65*exploded,z],size:[.12,.045,.12],origin:[x,.25+wall,z]});
    const highlightPart=['base','wall','ribs'].includes(p.highlightPart)&&(p.highlightPart!=='ribs'||ribs>0)?p.highlightPart:null;
    return {thickness,ribs,wall,exploded,parts,highlightPart};
  }
  function engineering(m,p){
    stage(m,5.4,4.3);const layout=engineeringLayout(p),t=layout.thickness;
    contact(m,0,0,4.45,3.25);m.box(0,.11,0,4.45,.16,3.25,C.line,0,.13);
    for(const part of layout.parts){
      const [x,y,z]=part.position,[w,h,d]=part.size;
      if(layout.exploded>.02&&part.id!=='base')guideSegment(m,part.origin,part.position);
      if(part.kind==='box')m.box(x,y,z,w,h,d,layout.highlightPart===part.id?C.lime:C.blue,0,.04);
      else if(part.kind==='gusset')m.gusset(x,y,z,w,h,d,layout.highlightPart==='ribs'?C.lime:C.sky);
      else {m.cylinder(x,y,z,.12,.045,C.navy,20);m.cylinder(x,y+.027,z,.055,.014,C.line,12);}
    }
    for(let i=0;i<11;i++)m.box(-1.65+i*.33,.205,1.50,.018,.012,i%5===0?.18:.10,C.grey,0,0);
    m.box(-2.08,.33,-1.2,.18,.35,.18,C.lime,0,.035);m.cylinder(2.12,.27,1.25,.14,.22,C.lime,20);
    // Thickness gauge: five three-dimensional steps, active step in lime.
    for(let i=0;i<5;i++)m.box(-.8+i*.4,.1+(i+1)*.04,-1.64,.27,(i+1)*.08,.28,i+1===Math.round(t)?C.lime:C.pale,0,.025);
  }
  const DEFAULT_OBSTACLES=[[1,4],[1,3],[3,2],[3,1]];
  const cell=v=>Array.isArray(v)&&v.length===2&&v.every(n=>Number.isInteger(n)&&n>=0&&n<5);
  const same=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
  function robotConfig(p){return{start:cell(p.start)?p.start.slice():[0,4],goal:cell(p.goal)?p.goal.slice():[4,0],obstacles:Array.isArray(p.obstacles)?p.obstacles.filter(cell).map(v=>v.slice()):DEFAULT_OBSTACLES.map(v=>v.slice())};}
  function validatePath(path,p){const c=robotConfig(p),out=[],input=Array.isArray(path)?path:[];let reason='complete';for(const q of input){if(!cell(q)||c.obstacles.some(o=>same(o,q))){reason='blocked';break;}if(out.length&&Math.abs(q[0]-out.at(-1)[0])+Math.abs(q[1]-out.at(-1)[1])!==1){if(same(q,out.at(-1)))continue;reason='disconnected';break;}out.push(q.slice());}if(!out.length)out.push(c.start);return{path:out,reason};}
  function robotModel(m,x,z,yaw){m.group(x,.16,z,yaw,()=>{m.cylinder(0,.018,0,.44,.025,C.shadow,24);for(const s of[-1,1]){m.cylinder(s*.31,.19,0,.20,.13,C.navy,20,0,Math.PI/2);m.cylinder(s*.385,.19,0,.085,.014,C.grey,16,0,Math.PI/2);}m.box(0,.31,0,.52,.43,.58,C.blue,0,.095);m.box(0,.41,.30,.38,.19,.035,C.navy,0,.035);for(const s of[-1,1])m.sphere(s*.105,.43,.327,.037,C.lime,1,1,.4);m.cylinder(0,.68,-.05,.018,.30,C.grey,10);m.sphere(0,.85,-.05,.065,C.lime);m.box(0,.57,-.035,.23,.07,.23,C.white,0,.035);});}
  function robotScene(m,p,animPos,animYaw){
    stage(m,5.8,5.8);const c=robotConfig(p),route=validatePath(p.path,p).path;
    for(let y=0;y<5;y++)for(let x=0;x<5;x++){const obstacle=c.obstacles.some(q=>q[0]===x&&q[1]===y);m.box(x-2,.075,y-2,.92,.12,.92,(x+y)%2?C.white:'#edf2fc',0,.055);if(obstacle){contact(m,x-2,y-2,.78,.78,.137);m.box(x-2,.50,y-2,.78,.74,.78,C.navy,0,.085);m.box(x-2,.89,y-2,.63,.035,.63,C.grey,0,.025);m.box(x-2,.914,y-2,.39,.012,.065,C.pale,Math.PI/4,.005);m.box(x-2,.915,y-2,.39,.012,.065,C.pale,-Math.PI/4,.005);}}
    for(let i=1;i<route.length;i++)m.line(route[i-1].map(v=>v-2),route[i].map(v=>v-2),.12,C.lime,.155);
    route.forEach(q=>m.cylinder(q[0]-2,.157,q[1]-2,.105,.025,C.lime,16));
    m.ring(c.start[0]-2,.15,c.start[1]-2,.33,.022,C.blue);m.ring(c.goal[0]-2,.16,c.goal[1]-2,.39,.012,C.pale);m.ring(c.goal[0]-2,.16,c.goal[1]-2,.32,.032,C.lime);
    m.cylinder(c.goal[0]-1.72,.47,c.goal[1]-2.24,.018,.65,C.grey,10);m.box(c.goal[0]-1.59,.73,c.goal[1]-2.24,.27,.18,.025,C.lime,0,.008);
    let pos=animPos||(cell(p.position)?p.position:route.at(-1)||c.start);robotModel(m,pos[0]-2,pos[1]-2,animYaw??0);
    // A compact orientation mark on the near edge; grid coordinates stay fixed.
    for(let i=0;i<5;i++)m.box(i-2,.02,2.67,.20,.035,.05,C.pale,0,.01);
  }
  function panel(m,x,y,z,w,h,col=C.navy){m.box(x,y,z,w,h,.10,col,0,.05);m.box(x,y,z+.057,w-.13,h-.13,.018,C.white,0,.025);}
  function checkMark(m,x,y,z,scale=.5){m.group(x,y,z,0,()=>{m.box(-.13*scale,0,0,.15*scale,.54*scale,.045,C.lime,0,.02);m.box(.12*scale,.21*scale,0,.15*scale,.83*scale,.045,C.lime,0,.02);});}
  const XR_STAGES=['entry','action','feedback'];
  function xrVisitor(p){
    const choice=p.visitorChoice==='satellite'||p.visitorChoice==='rover'?p.visitorChoice:'';
    const stage=typeof p.visitorStage==='number'?XR_STAGES[p.visitorStage]||'':XR_STAGES.includes(p.visitorStage)?p.visitorStage:'';
    return{choice,stage};
  }
  function xrScene(m,p){
    const visitor=xrVisitor(p),satelliteChosen=visitor.choice==='satellite',roverChosen=visitor.choice==='rover';
    stage(m,5.7,4.8);m.box(0,1.25,-2.05,5.55,2.5,.16,C.navy,0,.07);m.box(-2.72,.93,0,.15,1.86,4.1,C.pale,0,.06);m.box(0,.025,0,5.25,.035,3.9,'#e3eaf8',0,.05);
    m.box(0,2.39,-1.95,5.17,.045,.025,C.blue,0,.01);m.box(-2.62,1.77,0,.027,.035,3.84,C.white,0,.01);
    for(let i=-2;i<=2;i++){m.box(i,.049,0,.014,.01,3.85,C.line,0,0);m.box(0,.050,i*.75,5.15,.01,.014,C.line,0,0);}
    // Stagger the exhibits across the default camera's horizontal axis, leaving clear silhouettes.
    contact(m,-.65,.24,1.26,1.26,.052);m.cylinder(-.65,.24,.24,.66,.46,C.white,32);m.cylinder(-.65,.49,.24,.68,.05,satelliteChosen?C.lime:C.blue,32);
    if(satelliteChosen)m.ring(-.65,.54,.24,.77,.035,C.lime);
    satellite(m,-.65,1.07,.24,.68);
    contact(m,1.37,-.40,1.42,1.46,.052);m.box(1.37,.13,-.40,1.42,.18,1.46,C.white,0,.07);m.box(1.37,.23,-.40,1.44,.045,1.48,roverChosen?C.lime:C.blue,0,.045);
    if(roverChosen)m.ring(1.37,.27,-.40,.94,.035,C.lime);
    rover(m,1.37,.235,-.40);
    for(let i=0;i<3;i++){
      const x=-.62+i*.66,active=visitor.stage===XR_STAGES[i];
      m.cylinder(x,.08,1.72,.11,.045,active?C.lime:C.line,18);
      if(active)m.ring(x,.11,1.72,.17,.018,C.blue);
      if(i<2)m.box(x+.33,.07,1.72,.37,.02,.028,C.line,0,.005);
    }
    panel(m,-1.57,1.35,-1.91,1.43,1.03);panel(m,1.05,1.45,-1.91,2.65,1.34);
    if(p.entry==='goal'){
      m.box(-1.57,1.59,-1.844,.98,.095,.023,C.blue,0,.02);m.box(-1.7,1.39,-1.84,.72,.045,.025,C.grey,0,.01);m.box(-1.57,1.12,-1.83,.60,.19,.032,C.blue,0,.045);
      for(let i=0;i<4;i++)m.cylinder(-1.35+i*.20,.07,1.5-i*.30,.065,.025,C.lime,12);
    }else if(p.entry==='autoride'){
      m.box(-1.57,1.40,-1.81,.61,.37,.11,C.blue,0,.035);m.cylinder(-1.57,1.4,-1.72,.12,.08,C.navy,20,Math.PI/2);for(let i=0;i<6;i++)m.box(-1.35+i*.20,.07,1.50,.10,.035,.08,C.sky,0,.01);
    }else if(p.entry==='finish'){
      m.cylinder(-1.57,1.37,-1.80,.26,.055,C.lime,28,Math.PI/2);m.box(-1.57,.97,-1.83,.86,.07,.02,C.grey,0,.01);
    }else{m.box(-1.57,1.36,-1.84,.7,.05,.02,C.line,0,.01);}
    // Keep the action control in the near-left corner, away from both exhibits.
    m.group(-.35,0,.42,0,()=>{if(p.action==='voice'){
      m.cylinder(-1.55,.15,.65,.25,.12,C.blue,24);m.cylinder(-1.55,.62,.65,.035,.9,C.grey,12);m.sphere(-1.55,1.19,.65,.17,C.navy,1,1.6,1);for(let i=0;i<3;i++)m.ring(-1.55,1.20,.65,.27+i*.1,.015,C.sky,Math.PI/2);
    }else if(p.action==='headset'){
      m.box(-1.55,.25,.73,.85,.45,.66,C.white,0,.07);m.box(-1.55,.62,.74,.70,.35,.41,C.navy,0,.09);for(const s of[-1,1])m.cylinder(-1.55+s*.17,.62,.96,.11,.03,C.blue,20,Math.PI/2);m.ring(-1.55,.63,.61,.31,.045,C.grey);
    }else if(p.action==='select'){
      m.box(-1.55,.14,.73,.85,.19,.64,C.white,0,.06);m.box(-1.55,.25,.73,.63,.045,.43,C.blue,0,.06);m.cylinder(-1.55,.29,.73,.09,.03,C.lime,20);
    }else{m.box(-1.55,.12,.73,.75,.2,.55,C.line,0,.05);}});
    if(p.feedback==='explain'){
      m.box(.55,1.79,-1.84,1.07,.11,.027,C.blue,0,.025);for(let i=0;i<3;i++)m.box(.91,1.55-i*.16,-1.84,1.75-i*.2,.055,.027,C.grey,0,.012);m.box(1.60,1.05,-1.82,.85,.20,.045,C.blue,0,.04);m.ring(1.38,1.05,-1.78,.065,.014,C.white,Math.PI/2);
    }else if(p.feedback==='praise'){
      m.cylinder(1.05,1.44,-1.81,.35,.05,C.lime,32,Math.PI/2);m.box(1.05,.97,-1.83,1.20,.08,.025,C.grey,0,.012);
    }else if(p.feedback==='close'){
      m.box(1.05,1.45,-1.80,2.55,1.22,.07,C.grey,0,.04);for(let i=0;i<6;i++)m.box(.0+i*.42,1.45,-1.752,.025,1.12,.015,C.line,0,0);
    }else{for(let i=0;i<3;i++)m.box(1.05,1.65-i*.20,-1.84,1.65,.055,.025,C.line,0,.01);}
    m.box(2.32,.30,1.23,.35,.56,.36,C.blue,0,.055);m.sphere(2.32,.68,1.23,.16,C.lime);
  }
  const VERTEX = 'precision highp float;attribute vec3 aPosition;attribute vec3 aNormal;attribute vec3 aColor;uniform mat4 uVP;varying mediump vec3 vNormal;varying mediump vec3 vColor;varying mediump vec3 vWorld;void main(){vNormal=aNormal;vColor=aColor;vWorld=aPosition;gl_Position=uVP*vec4(aPosition,1.0);}';
  const FRAGMENT = 'precision mediump float;varying mediump vec3 vNormal;varying mediump vec3 vColor;varying mediump vec3 vWorld;uniform vec3 uEye;void main(){vec3 n=normalize(vNormal);vec3 l=normalize(vec3(-0.45,0.85,0.65));vec3 f=normalize(vec3(0.65,0.4,-0.6));vec3 view=normalize(uEye-vWorld);float diffuse=max(dot(n,l),0.0);float sky=0.5+0.5*n.y;float shade=0.46+0.36*diffuse+0.13*sky+0.08*max(dot(n,f),0.0);vec3 h=normalize(l+view);float sheen=pow(max(dot(n,h),0.0),32.0)*0.09;float rim=pow(1.0-max(dot(n,view),0.0),3.0)*0.025;vec3 col=vColor*shade+sheen+rim;if(vWorld.y < -0.35)col=mix(col,vec3(0.914,0.937,0.98),0.46);float fog=smoothstep(18.0,42.0,distance(uEye,vWorld))*0.28;gl_FragColor=vec4(mix(col,vec3(0.914,0.937,0.98),fog),1.0);}';
  const LABELS={campus:'Кампус восьми лабораторий',engineering:'Объёмная модель держателя',robot:'Робот на поле пять на пять',xr:'Виртуальная выставка: спутник с солнечными панелями и шестиколёсный марсоход'};
  const VIEWS={iso:{yaw:.65,pitch:.65,label:'Объёмный вид'},top:{yaw:0,pitch:Math.PI/2-.008,label:'Сверху'},front:{yaw:0,pitch:0,label:'Спереди'},side:{yaw:Math.PI/2,pitch:0,label:'Сбоку справа'}};
  function mount(element, options={}) {
    if(!element||typeof element.appendChild!=='function')throw new TypeError('TechScenes.mount expects an element');
    if(element.__techScene)element.__techScene.destroy();
    let params={kind:'campus',...options};if(!LABELS[params.kind])params.kind='campus';params.highlightPart=params.kind==='engineering'?engineeringLayout(params).highlightPart:null;
    const host=element,canvas=document.createElement('canvas'),guide=document.createElement('div'),caption=document.createElement('div'),fallback=document.createElement('div'),markers=document.createElement('div');
    host.classList.add('tech-scene-host');canvas.className='tech-scene-canvas';canvas.tabIndex=0;canvas.setAttribute('role','img');
    guide.className='tech-scene-guide';guide.textContent='Повернуть: потяни · Масштаб: + / − · Сброс: 0';guide.setAttribute('aria-hidden','true');
    caption.className='tech-scene-caption';caption.setAttribute('aria-hidden','true');
    fallback.className='tech-scene-fallback';fallback.hidden=true;fallback.setAttribute('role','status');
    markers.className='tech-campus-markers';markers.hidden=true;markers.setAttribute('role','group');markers.setAttribute('aria-label','Выбор лаборатории в 3D кампусе');
    host.append(canvas,guide,caption,markers,fallback);
    let gl=null,program=null,buffer=null,locations=null,vertexCount=0,raf=0,disposed=false,lost=false,available=false,lastError='',notificationTimer=0;
    let renderer='none',context2d=null,softwareFaces=[],lastSoftwareFrame=-Infinity;
    let animation=null,animatedPosition=null,animatedYaw=0,lastMesh=null,dragged=false,pinch=0,pausedAt=0;
    let displayedExploded=params.kind==='engineering'?engineeringLayout(params).exploded:0,explodedTransition=null;
    const pointers=new Map(),listeners=[],campusButtons=new Map(),campusStems=new Map();let campusProjection=[];
    const motion=global.matchMedia?global.matchMedia('(prefers-reduced-motion: reduce)'):{matches:false};
    const bases={campus:{distance:12.7,target:[0,.55,0]},engineering:{distance:8.5,target:[0,.65,0]},robot:{distance:10.5,target:[0,.35,0]},xr:{distance:10,target:[0,.75,-.1]}};
    let camera={yaw:.65,pitch:.65,...bases[params.kind]};camera.target=camera.target.slice();
    function setCamera(input){if(!input)return;const base=bases[params.kind];camera.yaw=finite(input.yaw,camera.yaw);camera.pitch=clamp(finite(input.pitch,camera.pitch),0,Math.PI/2-.008);camera.distance=clamp(finite(input.distance,camera.distance),base.distance*.46,base.distance*2.3);if(Array.isArray(input.target)&&input.target.length===3&&input.target.every(Number.isFinite))camera.target=input.target.slice();}
    function cameraView(){const yaw=(camera.yaw%TAU+TAU)%TAU;return Object.keys(VIEWS).find(key=>{const view=VIEWS[key],difference=Math.abs(yaw-view.yaw);return Math.min(difference,TAU-difference)<1e-7&&Math.abs(camera.pitch-view.pitch)<1e-7;})||'custom';}
    setCamera(params.camera);
    function listen(target,type,fn,opts){target.addEventListener(type,fn,opts);listeners.push(()=>target.removeEventListener(type,fn,opts));}
    function dispatch(name,detail){if(disposed)return;canvas.dispatchEvent(new CustomEvent(name,{detail,bubbles:true}));}
    function unavailable(reason){available=false;lastError=reason;host.setAttribute('data-render-error',String(reason));host.setAttribute('data-render-status','unavailable');canvas.hidden=true;guide.hidden=true;caption.hidden=true;hideCampusButtons();fallback.hidden=false;fallback.textContent='3D-представление сейчас недоступно. Продолжи задание в обычном виде.';const detail={kind:params.kind,reason};clearTimeout(notificationTimer);notificationTimer=setTimeout(()=>{dispatch('techscene:unavailable',detail);if(typeof params.onUnavailable==='function'&&!disposed)try{params.onUnavailable(detail);}catch(_e){}},0);}
    function initSoftware(reason){
      try{context2d=canvas.getContext('2d',{alpha:false,desynchronized:true});}catch(_error){context2d=null;}
      if(!context2d)return false;
      renderer='software-3d';available=true;lost=false;lastError=reason;host.setAttribute('data-render-error',reason);host.setAttribute('data-render-status',renderer);canvas.hidden=false;guide.hidden=false;caption.hidden=false;fallback.hidden=true;return true;
    }
    function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const info=gl.getShaderInfoLog(s)||'shader-compile';gl.deleteShader(s);throw new Error(info);}return s;}
    function initGL(){
      try{
        gl=canvas.getContext('webgl',{alpha:false,antialias:true,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
        if(!gl){if(initSoftware('webgl-unavailable'))return true;unavailable('webgl-unavailable; canvas2d-unavailable');return false;}
        const v=shader(gl.VERTEX_SHADER,VERTEX),f=shader(gl.FRAGMENT_SHADER,FRAGMENT);program=gl.createProgram();gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);gl.deleteShader(v);gl.deleteShader(f);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'program-link');
        buffer=gl.createBuffer();locations={p:gl.getAttribLocation(program,'aPosition'),n:gl.getAttribLocation(program,'aNormal'),c:gl.getAttribLocation(program,'aColor'),vp:gl.getUniformLocation(program,'uVP'),eye:gl.getUniformLocation(program,'uEye')};
        gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.clearColor(.914,.937,.98,1);renderer='webgl';available=true;lost=false;lastError='';host.setAttribute('data-render-error','');host.setAttribute('data-render-status',renderer);canvas.hidden=false;guide.hidden=false;caption.hidden=false;fallback.hidden=true;return true;
      }catch(error){unavailable('render-initialization-failed: '+String(error.message||error));return false;}
    }
    function text(){
      const instructions=' Перетаскивание поворачивает сцену. Стрелки на клавиатуре поворачивают, плюс и минус меняют масштаб, ноль сбрасывает вид.';
      let description=LABELS[params.kind];
      host.setAttribute('data-scene-kind',params.kind);host.setAttribute('data-scene-exploded',String(params.kind==='engineering'&&engineeringLayout(params).exploded>0));
      host.setAttribute('data-scene-part',params.kind==='engineering'?engineeringLayout(params).highlightPart||'':'');
      const view=cameraView();host.setAttribute('data-scene-view',view);
      if(params.kind==='campus'){const selected=campusItems(params).find(x=>x.id===params.selectedLab);if(selected)description+=' · Выбрана лаборатория: '+selected.short;}
      if(params.kind==='engineering'){const layout=engineeringLayout(params);description+=': '+layout.thickness+' мм · '+layout.ribs+' '+(layout.ribs===1?'ребро':layout.ribs>=2&&layout.ribs<=4?'ребра':'рёбер');if(layout.exploded>0)description+=' · Состав модели';if(layout.highlightPart)description+=' · Выделено: '+({base:'основание',wall:'стенка',ribs:'рёбра'}[layout.highlightPart]);}
      if(params.kind==='robot'){const p=animatedPosition||(cell(params.position)?params.position:robotConfig(params).start);description+=': столбец '+(Math.round(p[0])+1)+', строка '+(Math.round(p[1])+1)+'. Старт (1,5), цель (5,1).';}
      if(params.kind==='xr'){
        const labels={goal:'цель и старт',autoride:'пролёт без пояснения',finish:'финиш до действия',voice:'только голос',select:'выбор кнопкой',headset:'обязательная гарнитура',close:'закрытие сцены',praise:'только похвала',explain:'пояснение и повтор'};
        description+=' · '+[params.entry,params.action,params.feedback].map(v=>labels[v]||'выбери этап').join(' / ');
        const visitor=xrVisitor(params),stageLabels={entry:'вход',action:'действие',feedback:'обратная связь'};
        description+=' · '+(visitor.choice==='satellite'?'Выбран спутник':visitor.choice==='rover'?'Выбран марсоход':'Объект пока не выбран');
        if(visitor.stage)description+=' · Этап посетителя: '+stageLabels[visitor.stage];
      }
      if(VIEWS[view])description+=' · '+VIEWS[view].label;
      caption.textContent=description;canvas.setAttribute('aria-label',description+'.'+(params.kind==='campus'?' Выбери метку 1–8 или лабораторию в списке рядом.':params.kind==='engineering'&&engineeringLayout(params).exploded>0?' Условное разнесение частей: параметры и размеры не меняются.':'')+instructions);
    }
    function rebuild(schedule=true){
      if(disposed)return;const m=new Mesh();if(params.kind==='campus')campus(m,params);else if(params.kind==='engineering')engineering(m,{...params,exploded:displayedExploded});else if(params.kind==='robot')robotScene(m,params,animatedPosition,animatedYaw);else xrScene(m,params);
      lastMesh=m.array();vertexCount=lastMesh.length/9;
      if(available&&!lost&&renderer==='webgl'){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,lastMesh,gl.DYNAMIC_DRAW);}else if(renderer==='software-3d')prepareSoftwareFaces();syncCampusButtons();text();if(schedule)requestRender();
    }
    function chooseCampus(id){
      if(disposed||!available||lost||params.kind!=='campus'||!CAMPUS_IDS.includes(id))return;
      if(params.selectedLab!==id){params.selectedLab=id;rebuild();}
      dispatch('techscene:labselect',{id});
      if(typeof params.onSelectLab==='function')try{params.onSelectLab(id);}catch(_error){}
    }
    function hideCampusButtons(){
      markers.hidden=true;campusProjection=[];
      for(const button of campusButtons.values()){button.hidden=true;button.tabIndex=-1;button.setAttribute('data-campus-visible','false');if(document.activeElement===button&&!canvas.hidden)canvas.focus({preventScroll:true});}
      for(const stem of campusStems.values())stem.hidden=true;
    }
    function syncCampusButtons(){
      if(params.kind!=='campus'||!available||lost){hideCampusButtons();return;}
      markers.hidden=false;
      for(const item of campusItems(params)){
        let button=campusButtons.get(item.id);
        if(!button){
          const stem=document.createElement('span');stem.className='tech-campus-stem';stem.setAttribute('aria-hidden','true');stem.hidden=true;campusStems.set(item.id,stem);markers.appendChild(stem);
          button=document.createElement('button');button.type='button';button.className='tech-campus-marker';button.setAttribute('data-campus-id',item.id);button.textContent=String(item.index+1).padStart(2,'0');button.hidden=true;button.tabIndex=-1;markers.appendChild(button);campusButtons.set(item.id,button);
          let origin=null,moved=false;
          listen(button,'pointerdown',event=>{origin={x:event.clientX,y:event.clientY};moved=false;event.stopPropagation();});
          listen(button,'pointermove',event=>{if(origin&&Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>8)moved=true;event.stopPropagation();});
          listen(button,'pointerup',event=>{if(origin&&Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>8)moved=true;origin=null;event.stopPropagation();});
          listen(button,'pointercancel',()=>{origin=null;moved=true;});
          listen(button,'click',event=>{event.preventDefault();event.stopPropagation();if(event.detail!==0&&moved){moved=false;return;}moved=false;chooseCampus(item.id);});
        }
        const selected=params.selectedLab===item.id,status=item.completed?'Проба проверена':item.skipped?'Проба пропущена':'Проба ещё не проверена';
        button.setAttribute('aria-label',String(item.index+1)+'. '+item.label+'. '+status);button.setAttribute('aria-pressed',String(selected));button.setAttribute('title',item.label);button.setAttribute('data-status',item.completed?'complete':item.skipped?'skipped':'open');
      }
    }
    function placeCampusButtons(matrix){
      if(params.kind!=='campus'||!available||lost){hideCampusButtons();return;}
      markers.hidden=false;
      const box=canvas.getBoundingClientRect(),width=box.width||host.clientWidth||640,height=box.height||host.clientHeight||380,half=22,gap=5;
      const items=campusItems(params),selected=params.selectedLab,placed=[],view=[];
      const top=height<340?51:57,bottom=height-47;
      const centre=projectPoint([0,.55,0],matrix,width,height)||{x:width/2,y:height/2};
      const candidates=items.map(item=>({item,point:projectPoint(campusAnchor(item.index),matrix,width,height)}));
      // Prioritise the active/focused button if space gets tight, then near roofs.
      candidates.sort((a,b)=>(Number(b.item.id===selected)-Number(a.item.id===selected))||(Number(document.activeElement===campusButtons.get(b.item.id))-Number(document.activeElement===campusButtons.get(a.item.id)))||((a.point?.depth??2)-(b.point?.depth??2))||a.item.index-b.item.index);
      for(const {item,point} of candidates){
        const button=campusButtons.get(item.id),stem=campusStems.get(item.id);let position=null;
        if(point&&width>=half*2+4&&bottom-top>=half*2){
          const dx=point.x-centre.x,dy=point.y-centre.y,length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
          const options=[],minX=half+2,maxX=width-half-2,minY=top+half,maxY=bottom-half;
          // Start directly above the roof, then fan labels outward with a visible stem.
          for(const radius of [0,24,44,66,88])for(const tangent of radius?[0,-22,22]:[0]){
            const x=clamp(point.x+ux*radius-uy*tangent,minX,maxX),y=clamp(point.y-24+uy*radius+ux*tangent,minY,maxY);
            if(placed.some(other=>Math.abs(other.x-x)<half*2+gap&&Math.abs(other.y-y)<half*2+gap))continue;
            options.push({x,y,distance:Math.hypot(x-point.x,y-point.y)});
          }
          // At narrow widths, fan directions alone can trap a back-row marker.
          // Search a bounded neighbourhood rather than stacking buttons or inventing
          // a new roof coordinate. The connector always starts at the true projection.
          if(!options.length)for(const radius of [24,44,66,88])for(let step=0;step<16;step++){
            const angle=step*TAU/16,x=clamp(point.x+Math.cos(angle)*radius,minX,maxX),y=clamp(point.y-24+Math.sin(angle)*radius,minY,maxY);
            if(placed.some(other=>Math.abs(other.x-x)<half*2+gap&&Math.abs(other.y-y)<half*2+gap))continue;
            options.push({x,y,distance:Math.hypot(x-point.x,y-point.y)});
          }
          options.sort((a,b)=>a.distance-b.distance);position=options[0]||null;
        }
        button.hidden=!position;button.tabIndex=position?0:-1;stem.hidden=!position;
        button.setAttribute('data-campus-visible',String(!!position));
        if(point){button.setAttribute('data-campus-x',point.x.toFixed(2));button.setAttribute('data-campus-y',point.y.toFixed(2));}else{button.removeAttribute('data-campus-x');button.removeAttribute('data-campus-y');}
        if(position){
          placed.push(position);button.style.left=position.x.toFixed(2)+'px';button.style.top=position.y.toFixed(2)+'px';
          const dx=position.x-point.x,dy=position.y-point.y,length=Math.hypot(dx,dy),visibleLength=Math.max(0,length-half+2);
          stem.style.left=point.x.toFixed(2)+'px';stem.style.top=point.y.toFixed(2)+'px';stem.style.width=visibleLength.toFixed(2)+'px';stem.style.transform='rotate('+Math.atan2(dy,dx)+'rad)';stem.setAttribute('data-selected',String(item.id===selected));
        }else if(document.activeElement===button)canvas.focus({preventScroll:true});
        view.push({id:item.id,index:item.index,world:campusAnchor(item.index),visible:!!position,anchor:point?{x:point.x,y:point.y,depth:point.depth}:null,position:position?{x:position.x,y:position.y}:null});
      }
      campusProjection=view.sort((a,b)=>a.index-b.index);
    }
    function resize(){if(disposed)return;const box=host.getBoundingClientRect(),software=renderer==='software-3d',dpr=Math.min(software?1.25:2,global.devicePixelRatio||1),w=Math.min(software?1600:2560,Math.max(1,Math.round((box.width||640)*dpr))),h=Math.min(software?1200:2048,Math.max(1,Math.round((box.height||380)*dpr)));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}requestRender();}
    function prepareSoftwareFaces(){
      softwareFaces=[];if(!lastMesh)return;const d=lastMesh,light=norm([-.45,.85,.65]),fill=norm([.65,.4,-.6]),floor=rgb(C.floor);
      for(let i=0;i<d.length;i+=27){
        const cx=(d[i]+d[i+9]+d[i+18])/3,cy=(d[i+1]+d[i+10]+d[i+19])/3,cz=(d[i+2]+d[i+11]+d[i+20])/3;
        const n=norm([d[i+3]+d[i+12]+d[i+21],d[i+4]+d[i+13]+d[i+22],d[i+5]+d[i+14]+d[i+23]]);
        const maxY=Math.max(d[i+1],d[i+10],d[i+19]);
        const shade=.46+.36*Math.max(dot(n,light),0)+.13*(.5+.5*n[1])+.08*Math.max(dot(n,fill),0);
        const color='rgb('+[d[i+6],d[i+7],d[i+8]].map((v,k)=>{let lit=v*shade+.012;if(maxY<-.35)lit=lit*.54+floor[k]*.46;return Math.round(clamp(lit,0,1)*255);}).join(',')+')';
        softwareFaces.push({offset:i,cx,cy,cz,nx:n[0],ny:n[1],nz:n[2],color,layer:maxY<-.35?0:maxY<=.04?1:2});
      }
    }
    function clipPolygon(input,plane){
      if(!input.length)return input;const output=[];
      const signed=p=>plane===0?p[3]+p[0]:plane===1?p[3]-p[0]:plane===2?p[3]+p[1]:plane===3?p[3]-p[1]:plane===4?p[3]+p[2]:p[3]-p[2];
      let previous=input[input.length-1],pd=signed(previous),pin=pd>=0;
      for(const current of input){const cd=signed(current),cin=cd>=0;if(cin!==pin){const t=pd/(pd-cd);output.push(previous.map((v,k)=>v+(current[k]-v)*t));}if(cin)output.push(current);previous=current;pd=cd;pin=cin;}
      return output;
    }
    function drawSoftware(eye,vp){
      const ctx=context2d,d=lastMesh,w=canvas.width,h=canvas.height,forward=norm(sub(eye,camera.target)),visible=[];
      ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=C.floor;ctx.fillRect(0,0,w,h);ctx.lineWidth=.4;ctx.lineJoin='round';
      if(!d)return;
      for(const face of softwareFaces){
        const dx=eye[0]-face.cx,dy=eye[1]-face.cy,dz=eye[2]-face.cz;
        if(face.nx*dx+face.ny*dy+face.nz*dz<=0)continue;
        let polygon=[];
        for(const offset of[face.offset,face.offset+9,face.offset+18]){const x=d[offset],y=d[offset+1],z=d[offset+2];polygon.push([vp[0]*x+vp[4]*y+vp[8]*z+vp[12],vp[1]*x+vp[5]*y+vp[9]*z+vp[13],vp[2]*x+vp[6]*y+vp[10]*z+vp[14],vp[3]*x+vp[7]*y+vp[11]*z+vp[15]]);}
        // Homogeneous six-plane clipping handles the near plane and viewport edges.
        for(let plane=0;plane<6&&polygon.length;plane++)polygon=clipPolygon(polygon,plane);
        if(polygon.length<3)continue;
        const projected=polygon.map(p=>[(p[0]/p[3]*.5+.5)*w,(.5-p[1]/p[3]*.5)*h]);
        if(projected.some(p=>!p.every(Number.isFinite)))continue;
        visible.push({points:projected,depth:dx*forward[0]+dy*forward[1]+dz*forward[2],color:face.color,layer:face.layer});
      }
      // Draw broad ground and the raised platform before buildings; depth-sort within each layer.
      visible.sort((a,b)=>a.layer-b.layer||b.depth-a.depth);
      let previousColor='';
      for(const face of visible){const p=face.points;if(previousColor!==face.color){ctx.fillStyle=face.color;ctx.strokeStyle=face.color;previousColor=face.color;}ctx.beginPath();ctx.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)ctx.lineTo(p[i][0],p[i][1]);ctx.closePath();ctx.fill();ctx.stroke();}
    }
    function reduced(){return params.reducedMotion===undefined?motion.matches:!!params.reducedMotion;}
    function finishPlay(completed,reason='complete'){if(!animation)return;const done=animation.resolve,position=(animatedPosition||animation.path.at(-1)).slice(),result={completed,position,reason};animation=null;params.position=position;animatedPosition=null;done(result);dispatch('techscene:playend',result);}
    function stopPlay(reason='cancelled'){if(animation)finishPlay(false,reason);}
    function tickAnimation(now){
      if(!animation)return;const a=animation,path=a.path,elapsed=now-a.started,segment=Math.floor(elapsed/a.step);
      if(segment>=path.length-1){animatedPosition=path.at(-1).slice();params.position=animatedPosition.slice();const reason=a.reason;finishPlay(reason==='complete',reason);rebuild();return;}
      const from=path[segment],to=path[segment+1],u=clamp((elapsed%a.step)/a.step,0,1),smooth=u*u*(3-2*u);animatedPosition=[from[0]+(to[0]-from[0])*smooth,from[1]+(to[1]-from[1])*smooth];animatedYaw=Math.atan2(to[0]-from[0],to[1]-from[1]);rebuild();
    }
    function tickExploded(now){
      if(!explodedTransition)return;
      const transition=explodedTransition,u=clamp((now-transition.started)/360,0,1),smooth=u*u*(3-2*u);
      displayedExploded=transition.from+(transition.to-transition.from)*smooth;
      if(u>=1){displayedExploded=transition.to;explodedTransition=null;}
      rebuild(false);
    }
    function settleExploded(){explodedTransition=null;displayedExploded=params.kind==='engineering'?engineeringLayout(params).exploded:0;}
    function requestRender(){if(!disposed&&available&&!lost&&!raf&&!(document.hidden&&pausedAt))raf=requestAnimationFrame(draw);}
    function paintFrame(){
      if(disposed||!available||lost)return false;
      const aspect=canvas.width/Math.max(1,canvas.height),distance=camera.distance*(aspect<1?1/aspect:1),cp=Math.cos(camera.pitch),eye=[camera.target[0]+Math.sin(camera.yaw)*cp*distance,camera.target[1]+Math.sin(camera.pitch)*distance,camera.target[2]+Math.cos(camera.yaw)*cp*distance],vp=multiply(perspective(.67,aspect,.1,100),lookAt(eye,camera.target));
      placeCampusButtons(vp);
      if(renderer==='software-3d'){drawSoftware(eye,vp);return true;}
      if(renderer!=='webgl')return false;
      gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      for(const [attr,offset]of[[locations.p,0],[locations.n,12],[locations.c,24]]){gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,3,gl.FLOAT,false,36,offset);}
      gl.uniformMatrix4fv(locations.vp,false,vp);gl.uniform3fv(locations.eye,new Float32Array(eye));gl.drawArrays(gl.TRIANGLES,0,vertexCount);return true;
    }
    function draw(now){
      raf=0;if(disposed||!available||lost)return;if(renderer==='software-3d'&&(animation||explodedTransition)&&now-lastSoftwareFrame<1000/30){requestRender();return;}if(animation)tickAnimation(now);if(explodedTransition)tickExploded(now);
      paintFrame();if(renderer==='software-3d')lastSoftwareFrame=now;if(animation||explodedTransition)requestRender();
    }
    function capture(){
      if(disposed||!available||lost||document.hidden||canvas.hidden||host.hidden||host.isConnected===false||canvas.width<1||canvas.height<1||typeof canvas.toDataURL!=='function')return null;
      if(host.closest?.('[hidden]')||(host.getClientRects&&!host.getClientRects().length))return null;
      try{
        if(renderer==='webgl'&&gl.isContextLost?.())return null;
        // Repaint and read in the same task: WebGL may discard its drawing buffer
        // after presentation. Keep the displayed mesh/animation position unchanged.
        if(!paintFrame())return null;
        const png=canvas.toDataURL('image/png');
        return typeof png==='string'&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(png)?png:null;
      }catch(_error){return null;}
    }
    function rotate(dx,dy){if(disposed)return;camera.yaw=(camera.yaw+finite(dx,0))%TAU;camera.pitch=clamp(camera.pitch+finite(dy,0),0,Math.PI/2-.008);text();requestRender();}
    function zoom(delta){if(disposed)return;const b=bases[params.kind].distance;camera.distance=clamp(camera.distance*Math.exp(clamp(finite(delta,0),-2,2)*.10),b*.46,b*2.3);requestRender();}
    function reset(){if(disposed)return;const b=bases[params.kind];camera={yaw:.65,pitch:.65,distance:b.distance,target:b.target.slice()};text();requestRender();}
    function setView(view){if(disposed||!Object.hasOwn(VIEWS,view))return;camera.yaw=VIEWS[view].yaw;camera.pitch=VIEWS[view].pitch;text();requestRender();}
    function pointerDistance(){const p=[...pointers.values()];return p.length>1?Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y):0;}
    function down(e){if(disposed||!available||(e.pointerType==='mouse'&&e.button!==0))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(pointers.size===1)dragged=false;if(pointers.size===2)pinch=pointerDistance();canvas.setPointerCapture?.(e.pointerId);canvas.classList.add('is-dragging');if(e.pointerType==='mouse')canvas.focus({preventScroll:true});e.stopPropagation();}
    function move(e){if(!pointers.has(e.pointerId))return;const prev=pointers.get(e.pointerId),dx=e.clientX-prev.x,dy=e.clientY-prev.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(Math.abs(dx)+Math.abs(dy)>2)dragged=true;if(pointers.size>1){const next=pointerDistance();if(pinch>0&&next>0)zoom(Math.log(pinch/next)*10);pinch=next;}else rotate(-dx*.009,dy*.007);if(e.cancelable)e.preventDefault();}
    function up(e){pointers.delete(e.pointerId);pinch=pointerDistance();if(!pointers.size)canvas.classList.remove('is-dragging');try{if(canvas.hasPointerCapture?.(e.pointerId))canvas.releasePointerCapture(e.pointerId);}catch(_e){}}
    function key(e){if(e.altKey||e.metaKey||e.ctrlKey)return;const actions={ArrowLeft:()=>rotate(-.15,0),ArrowRight:()=>rotate(.15,0),ArrowUp:()=>rotate(0,.12),ArrowDown:()=>rotate(0,-.12),'+':()=>zoom(-1),'=':()=>zoom(-1),'-':()=>zoom(1),'_':()=>zoom(1),'0':reset,Home:reset};if(actions[e.key]){e.preventDefault();e.stopPropagation();actions[e.key]();}}
    listen(canvas,'pointerdown',down);listen(canvas,'pointermove',move);listen(canvas,'pointerup',up);listen(canvas,'pointercancel',up);listen(canvas,'lostpointercapture',up);listen(canvas,'keydown',key);
    listen(canvas,'click',e=>{if(dragged){e.preventDefault();e.stopPropagation();dragged=false;}});
    // Ordinary wheel scrolling is deliberately left to the page. Pinch works by pointers.
    listen(canvas,'webglcontextlost',e=>{e.preventDefault();lost=true;available=false;if(raf)cancelAnimationFrame(raf);raf=0;stopPlay('context-lost');settleExploded();fallback.hidden=false;fallback.textContent='3D-сцена приостановлена. Восстанавливаем изображение…';guide.hidden=true;hideCampusButtons();dispatch('techscene:unavailable',{kind:params.kind,reason:'context-lost'});});
    listen(canvas,'webglcontextrestored',()=>{if(!disposed&&initGL()){resize();rebuild();dispatch('techscene:restored',{kind:params.kind});}});
    listen(document,'visibilitychange',()=>{if(document.hidden){pausedAt=performance.now();if(raf)cancelAnimationFrame(raf);raf=0;}else{if(pausedAt){const pause=performance.now()-pausedAt;if(animation)animation.started+=pause;if(explodedTransition)explodedTransition.started+=pause;}pausedAt=0;requestRender();}});
    function motionChanged(){if(reduced()){let changed=false;if(animation){animatedPosition=animation.path.at(-1).slice();finishPlay(animation.reason==='complete',animation.reason);changed=true;}if(explodedTransition){settleExploded();changed=true;}if(changed)rebuild();}}
    if(motion.addEventListener)listen(motion,'change',motionChanged);
    let observer=null;if(global.ResizeObserver){observer=new ResizeObserver(resize);observer.observe(host);}else listen(global,'resize',resize);
    const controller={
      update(patch={}){if(disposed)return controller;if(animation&&('path'in patch||'position'in patch||'obstacles'in patch))stopPlay('updated');const oldKind=params.kind,oldSelected=params.selectedLab;params={...params,...patch};if(!LABELS[params.kind])params.kind=oldKind;params.highlightPart=params.kind==='engineering'?engineeringLayout(params).highlightPart:null;if(oldKind!==params.kind){reset();settleExploded();}else if(params.kind==='engineering'&&'exploded'in patch){const target=engineeringLayout(params).exploded;if(!available||lost||reduced()||Math.abs(target-displayedExploded)<.001)settleExploded();else explodedTransition={from:displayedExploded,to:target,started:performance.now()};}if(patch.camera)setCamera(patch.camera);animatedPosition=null;if(params.kind==='campus'&&oldKind==='campus'&&oldSelected===params.selectedLab){syncCampusButtons();text();requestRender();}else rebuild();motionChanged();return controller;},
      reset,setView,rotate,zoom,capture,
      getCamera(){return{yaw:camera.yaw,pitch:camera.pitch,distance:camera.distance,target:camera.target.slice()};},
      play(input){
        if(disposed||params.kind!=='robot'||!available)return Promise.resolve({completed:false,position:cell(params.position)?params.position.slice():robotConfig(params).start,reason:disposed?'destroyed':params.kind!=='robot'?'not-robot':'unavailable'});
        stopPlay('restarted');const checked=validatePath(input===undefined?params.path:input,params),route=checked.path;params.path=route.map(v=>v.slice());params.position=route[0].slice();animatedPosition=route[0].slice();
        return new Promise(resolve=>{animation={path:route,started:performance.now(),step:390,resolve,reason:checked.reason};if(reduced()||route.length<2){animatedPosition=route.at(-1).slice();finishPlay(checked.reason==='complete',checked.reason);rebuild();}else{rebuild();requestRender();}});
      },
      getDebug(){const engineeringState=params.kind==='engineering'?engineeringLayout({...params,exploded:displayedExploded}):null;return{available,lost,disposed,renderer,kind:params.kind,vertices:vertexCount,width:canvas.width,height:canvas.height,playing:!!animation,position:(animatedPosition||(cell(params.position)?params.position:robotConfig(params).start)).slice(),camera:controller.getCamera(),error:lastError,exploded:params.kind==='engineering'?engineeringLayout(params).exploded:0,displayedExploded,transitioning:!!explodedTransition,highlightPart:engineeringState?.highlightPart||null,engineeringParts:engineeringState?engineeringState.parts.map(part=>({...part,position:part.position.slice(),size:part.size.slice(),origin:part.origin.slice()})):[],selectedLab:CAMPUS_IDS.includes(params.selectedLab)?params.selectedLab:null,campusMarkers:campusProjection.map(x=>({id:x.id,index:x.index,world:x.world.slice(),visible:x.visible,anchor:x.anchor?{...x.anchor}:null,position:x.position?{...x.position}:null}))};},
      destroy(){if(disposed)return;disposed=true;stopPlay('destroyed');explodedTransition=null;clearTimeout(notificationTimer);if(raf)cancelAnimationFrame(raf);raf=0;observer?.disconnect();listeners.splice(0).forEach(remove=>remove());pointers.clear();if(gl&&!lost){if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);}buffer=null;program=null;lastMesh=null;softwareFaces=[];context2d=null;gl=null;canvas.remove();guide.remove();caption.remove();markers.remove();fallback.remove();campusButtons.clear();campusStems.clear();campusProjection=[];host.classList.remove('tech-scene-host');if(host.__techScene===controller)delete host.__techScene;}
    };
    Object.defineProperty(controller,'available',{get:()=>available&&!disposed});host.__techScene=controller;text();if(initGL()){resize();rebuild();}return controller;
  }
  global.TechScenes=Object.freeze({mount,version:'1.2.0'});
})(window);
