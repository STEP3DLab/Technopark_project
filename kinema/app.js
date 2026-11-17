'use strict';
/* KINEMA / dependency-free interactive mechanics atlas */
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const rad = deg => deg * Math.PI / 180;
const deg = radians => radians * 180 / Math.PI;
const round = (n, digits=1) => Number(n).toFixed(digits).replace('.', ',');
const clamp = (n,lo,hi) => Math.min(hi,Math.max(lo,n));
const pt = (x,y) => ({x,y});
const vec = (p,q) => ({x:q.x-p.x,y:q.y-p.y});
const plus = (p,q) => ({x:p.x+q.x,y:p.y+q.y});
const length = p => Math.hypot(p.x,p.y);
const angPoint = (p,r,t) => pt(p.x+r*Math.cos(t),p.y+r*Math.sin(t));
const fontMono = '10px Consolas, "Liberation Mono", monospace';
const inkWhite='#edf0ef', inkGray='#80888c', inkDim='#51595d', inkBack='#111417';
const motionPrefersReduced=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function canvasInfo(canvas){
  const rect=canvas.getBoundingClientRect();const w=Math.max(rect.width||canvas.clientWidth||400,1),h=Math.max(rect.height||canvas.clientHeight||350,1);
  const dpr=Math.min(window.devicePixelRatio||1,2);
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);return {c,w,h};
}
function modelView(w,h,b={xmin:-250,xmax:250,ymin:-220,ymax:230}){
 const scale=Math.min((w-50)/(b.xmax-b.xmin),(h-45)/(b.ymax-b.ymin));
 const cx=(b.xmin+b.xmax)/2,cy=(b.ymin+b.ymax)/2;
 return (p)=>({x:w/2+(p.x-cx)*scale,y:h/2-(p.y-cy)*scale});
}
function line2(c,a,b,width=3,color=inkWhite,dash=null){c.save();c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';if(dash)c.setLineDash(dash);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.restore();}
function path2(c,points,width=1.5,color=inkGray,dash=null){if(points.length<2)return;c.save();c.lineWidth=width;c.strokeStyle=color;c.lineCap='round';c.lineJoin='round';if(dash)c.setLineDash(dash);c.beginPath();c.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)c.lineTo(points[i].x,points[i].y);c.stroke();c.restore();}
function circle2(c,p,r,fill=inkBack,stroke=inkWhite,width=2){c.save();c.beginPath();c.arc(p.x,p.y,r,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.lineWidth=width;c.strokeStyle=stroke;c.stroke();}c.restore();}
function label2(c,p,text,dx=10,dy=-11,color='#a5abae'){c.save();c.fillStyle=color;c.font=fontMono;c.fillText(text,p.x+dx,p.y+dy);c.restore();}
function link2(c,P,a,b,width=13,color='#dadfdf',trim=false){const A=P(a),B=P(b);line2(c,A,B,width+2,'#202528');line2(c,A,B,width,color);if(!trim){circle2(c,A,6,inkBack,color,2);circle2(c,B,6,inkBack,color,2);}}
function grounded(c,P,p,offset=1){const s=P(p);const y=s.y+offset;line2(c,{x:s.x-24,y:y+17},{x:s.x+24,y:y+17},2,'#788085');for(let i=-16;i<=16;i+=10)line2(c,{x:s.x+i-6,y:y+23},{x:s.x+i+1,y:y+17},1,'#687174');circle2(c,s,7,'#0f1113','#ebeeee',2);}
function trajectory(c,P,points,color='#6b747a'){path2(c,points.map(P),1.2,color,[5,6]);}
function smallArrow(c,a,b,color='#b2b9bb'){line2(c,a,b,1.2,color);const t=Math.atan2(b.y-a.y,b.x-a.x);const h=7;line2(c,b,{x:b.x-h*Math.cos(t-.45),y:b.y-h*Math.sin(t-.45)},1.2,color);line2(c,b,{x:b.x-h*Math.cos(t+.45),y:b.y-h*Math.sin(t+.45)},1.2,color);}
function dashedCircle(c,p,r,color='#586166',width=1){c.save();c.strokeStyle=color;c.lineWidth=width;c.setLineDash([4,7]);c.beginPath();c.arc(p.x,p.y,r,0,TAU);c.stroke();c.restore();}
function fourbar(theta){const A=pt(-155,-80),D=pt(155,-80),B=angPoint(A,70,theta);const cLen=240,oLen=190;const BD=vec(B,D),dist=length(BD),u=pt(BD.x/dist,BD.y/dist);const a=(cLen*cLen-oLen*oLen+dist*dist)/(2*dist),h=Math.sqrt(Math.max(0,cLen*cLen-a*a));const C=pt(B.x+a*u.x-h*u.y,B.y+a*u.y+h*u.x);return{A,B,C,D};}
function slider(theta,r=76,l=198){const A=pt(-165,0),B=angPoint(A,r,theta),x=Math.sqrt(Math.max(0,l*l-(r*Math.sin(theta))**2));const S=pt(A.x+r*Math.cos(theta)+x,0);return{A,B,S,x:S.x-A.x};}
function yoke(theta){const A=pt(-70,0),B=angPoint(A,104,theta),S=pt(B.x,0);return{A,B,S};}
function robot(theta,second){const A=pt(-40,-30),B=angPoint(A,140,theta),E=angPoint(B,112,theta+second);return{A,B,E};}
function drawSlider(c,w,h,theta,opts){const r=opts.r||76,l=opts.l||198,P=modelView(w,h,{xmin:-300,xmax:350,ymin:-208,ymax:210});const {A,B,S,x}=slider(theta,r,l);
 line2(c,P(pt(-85,0)),P(pt(296,0)),2,'#667075');line2(c,P(pt(-85,35)),P(pt(296,35)),1,'#353c40');line2(c,P(pt(-85,-35)),P(pt(296,-35)),1,'#353c40');
 if(opts.traces){trajectory(c,P,Array.from({length:100},(_,i)=>angPoint(A,r,i*TAU/99)));trajectory(c,P,[pt(A.x+l-r,0),pt(A.x+l+r,0)],'#626a70');}
 link2(c,P,A,B,12,'#a5adb1');link2(c,P,B,S,13,'#e6e9e9');grounded(c,P,A);
 let p=P(S);c.fillStyle='#cbd0d0';c.strokeStyle='#f6f7f7';c.lineWidth=1;c.beginPath();c.roundRect(p.x-29,p.y-23,58,46,4);c.fill();c.stroke();line2(c,{x:p.x-13,y:p.y},{x:p.x+13,y:p.y},1.4,'#6d7477');circle2(c,p,7,'#16191b','#f5f5f4',2);
 if(opts.labels){label2(c,P(A),'O');label2(c,P(B),'B',10,-15);label2(c,p,'P',11,-18);label2(c,{x:p.x,y:p.y+42},'НАПРАВЛЯЮЩАЯ',-51,7,'#858c90');}
 return{x,stroke:2*r};}
function drawFourbar(c,w,h,theta,opts){const P=modelView(w,h,{xmin:-280,xmax:290,ymin:-210,ymax:270});const{A,B,C,D}=fourbar(theta);
 if(opts.traces){trajectory(c,P,Array.from({length:120},(_,i)=>fourbar(i*TAU/119).B));trajectory(c,P,Array.from({length:120},(_,i)=>fourbar(i*TAU/119).C),'#7c868b');trajectory(c,P,Array.from({length:120},(_,i)=>{const q=fourbar(i*TAU/119);return pt(q.B.x*.6+q.C.x*.4,q.B.y*.6+q.C.y*.4)}),'#4d565a');}
 line2(c,P(A),P(D),4,'#636c70');link2(c,P,A,B,11,'#b4bec2');link2(c,P,B,C,14,'#f2f3f3');link2(c,P,C,D,12,'#889499');grounded(c,P,A);grounded(c,P,D);
 if(opts.labels){label2(c,P(A),'A',-18,-16);label2(c,P(B),'B',8,-12);label2(c,P(C),'C',9,-12);label2(c,P(D),'D',9,-15);}
 return{angle:deg(Math.atan2(C.y-D.y,C.x-D.x)),bc:Math.hypot(C.x-B.x,C.y-B.y)};}
function gearTooth(c,p,r,n,t,scale=1){const outer=r+8*scale,base=r-4*scale;const steps=n*4;c.beginPath();for(let i=0;i<steps;i++){const a=t+i*TAU/steps,rr=(i%4===0||i%4===3)?base:outer;const x=p.x+rr*Math.cos(a),y=p.y+rr*Math.sin(a);if(i===0)c.moveTo(x,y);else c.lineTo(x,y);}c.closePath();c.fillStyle='#181d20';c.strokeStyle='#dce1e0';c.lineWidth=2;c.fill();c.stroke();circle2(c,p,r*.73,'#23292c','#676f73',1);circle2(c,p,r*.18,'#0a0d10','#f0f3f2',3);}
function drawGears(c,w,h,theta,opts){const P=modelView(w,h,{xmin:-310,xmax:300,ymin:-235,ymax:235});const z1=opts.z1||18,z2=opts.z2||32;const totalR=202,r1=totalR*z1/(z1+z2),r2=totalR*z2/(z1+z2),A=pt(-145,0),B=pt(A.x+r1+r2,0);const a=P(A),b=P(B),rad1=Math.hypot(P(pt(A.x+r1,A.y)).x-a.x,0),rad2=Math.abs(P(pt(B.x+r2,0)).x-b.x);
 if(opts.traces){dashedCircle(c,a,rad1,'#8e989b');dashedCircle(c,b,rad2,'#8e989b');line2(c,a,b,1,'#5c6569',[5,6]);}
 gearTooth(c,a,rad1,z1,theta,rad1/70);gearTooth(c,b,rad2,z2,-theta*z1/z2 + Math.PI/z2,rad2/105);
 line2(c,a,{x:a.x+rad1*.64*Math.cos(theta),y:a.y-rad1*.64*Math.sin(theta)},4,'#e8ebea');line2(c,b,{x:b.x+rad2*.64*Math.cos(-theta*z1/z2),y:b.y-rad2*.64*Math.sin(-theta*z1/z2)},4,'#c4cbce');
 if(opts.labels){label2(c,a,`Z₁=${z1}`,-15,-rad1-22);label2(c,b,`Z₂=${z2}`,-16,-rad2-22);label2(c,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},'↔',-5,-14);}
 return{ratio:z2/z1,rotation:-theta*z1/z2};}
function drawCam(c,w,h,theta,opts){const P=modelView(w,h,{xmin:-230,xmax:230,ymin:-205,ymax:256});const A=pt(0,-42),e=31,R=81,rollerR=23,C=angPoint(A,e,theta),targetX=A.x,fy=C.y+Math.sqrt(Math.max(0,(R+rollerR)**2-(targetX-C.x)**2));const roller=pt(targetX,fy);
 if(opts.traces){trajectory(c,P,Array.from({length:100},(_,i)=>angPoint(A,e,i*TAU/99)),'#727b7c');line2(c,P(pt(targetX,-80)),P(pt(targetX,243)),1,'#505a60',[4,7]);}
 const cp=P(C),pp=P(A);const radScreen=Math.abs(P(pt(C.x+R,C.y)).x-cp.x),rollScreen=Math.abs(P(pt(roller.x+rollerR,roller.y)).x-P(roller).x);
 c.beginPath();c.arc(cp.x,cp.y,radScreen,0,TAU);c.fillStyle='#212629';c.fill();c.strokeStyle='#d2dada';c.lineWidth=3;c.stroke();
 line2(c,pp,cp,2,'#858e92',[4,4]);circle2(c,cp,6,'#f0f3f2','#f0f3f2',1);grounded(c,P,A);
 const rp=P(roller);circle2(c,rp,rollScreen,'#242b2e','#e9eeed',2);circle2(c,rp,5,'#e4e9e9',null);
 line2(c,P(pt(-33,243)),P(pt(-33,114)),2,'#677073');line2(c,P(pt(33,243)),P(pt(33,114)),2,'#677073');line2(c,rp,P(pt(targetX,243)),12,'#d4dada');
 if(opts.labels){label2(c,pp,'O',-25,-12);label2(c,cp,'C',12,6);label2(c,rp,'РОЛИК',18,-9);}
 return{lift:fy-(A.y+R+rollerR-e),y:fy};}
function drawYoke(c,w,h,theta,opts){const P=modelView(w,h,{xmin:-275,xmax:275,ymin:-204,ymax:205});const{A,B,S}=yoke(theta);const a=P(A),b=P(B),s=P(S);
 line2(c,P(pt(-245,0)),P(pt(238,0)),1.5,'#566166');if(opts.traces){trajectory(c,P,Array.from({length:100},(_,i)=>angPoint(A,104,i*TAU/99)));trajectory(c,P,[pt(A.x-104,0),pt(A.x+104,0)],'#7b8589');}
 link2(c,P,A,B,11,'#b4bdc0');grounded(c,P,A);
 c.strokeStyle='#f0f2f1';c.fillStyle='#262c2e';c.lineWidth=4;c.beginPath();c.roundRect(s.x-23,s.y-111,46,222,9);c.fill();c.stroke();c.strokeStyle='#8d979a';c.lineWidth=1;c.strokeRect(s.x-11,s.y-89,22,178);
 circle2(c,b,10,'#f3f3f1','#121517',3);
 if(opts.labels){label2(c,a,'O',-21,-15);label2(c,b,'ПАЛЕЦ',15,-10);label2(c,s,'КУЛИСА',32,8);}
 return{x:S.x-A.x};}
function drawRobot(c,w,h,theta,opts){const P=modelView(w,h,{xmin:-305,xmax:295,ymin:-292,ymax:292});const phi=rad(opts.robotSecond||-40);const{A,B,E}=robot(theta,phi);
 if(opts.traces){trajectory(c,P,Array.from({length:100},(_,i)=>angPoint(A,140,i*TAU/99)),'#515c60');trajectory(c,P,Array.from({length:100},(_,i)=>{const r=robot(i*TAU/99,phi);return r.E}),'#879197');dashedCircle(c,P(A),Math.abs(P(pt(A.x+252,A.y)).x-P(A).x),'#4b5559');}
 link2(c,P,A,B,17,'#d4dbdc');link2(c,P,B,E,14,'#aeb8bc');grounded(c,P,A);circle2(c,P(E),10,'#f0f2f0','#131719',2);smallArrow(c,{x:P(E).x+27,y:P(E).y+9},{x:P(E).x+53,y:P(E).y+9},'#9ca5a9');
 if(opts.labels){label2(c,P(A),'O',-20,-13);label2(c,P(B),'J₁',11,-12);label2(c,P(E),'TCP',11,-15);}
 return{x:E.x-A.x,y:E.y-A.y};}
const mechDefinitions={
 slider:{name:'Кривошипно-ползунный',code:'RRRP',intro:'Вращение кривошипа преобразуется в прямолинейное возвратно-поступательное движение ползуна.',dof:1,labels:['ПОЛОЖЕНИЕ ПОЛЗУНА','ПОЛНЫЙ ХОД'],formula:'x = r cos θ + √(l² − r² sin² θ)',insight:'При постоянной угловой скорости кривошипа ползун ускоряется и замедляется. Полный ход равен 2r.',note:'4 звена со стойкой · 3 пары R + 1 пара P · M = 1',draw:drawSlider},
 fourbar:{name:'Шарнирный четырёхзвенник',code:'4R',intro:'Четыре звена связаны вращательными парами. Входное вращение определяет положение остальных звеньев.',dof:1,labels:['УГОЛ ВЫХОДНОГО ЗВЕНА','ДЛИНА ШАТУНА'],formula:'|B − C| = l₂ ; |C − D| = l₃',insight:'Положение C — пересечение двух окружностей. Выбирая ветвь сборки, ты выбираешь конфигурацию механизма.',note:'4 звена со стойкой · 4 пары R · M = 3 × 3 − 2 × 4 = 1',draw:drawFourbar},
 gears:{name:'Цилиндрическая зубчатая пара',code:'RR + H',intro:'Внешнее зацепление двух колёс передаёт вращение с постоянным передаточным отношением и меняет его направление.',dof:1,labels:['МОДУЛЬ ОТНОШЕНИЯ |i|','УГОЛ ВЕДОМОГО'],formula:'ω₂ / ω₁ = − z₁ / z₂',insight:'Для внешней пары вращения направлены противоположно. Колесо с большим числом зубьев вращается медленнее.',note:'2 вращательные пары к стойке + 1 высшая пара зацепления · M = 1',draw:drawGears},
 cam:{name:'Эксцентриковый кулачок',code:'R + P + H',intro:'Профиль вращающегося эксцентрика задаёт движение роликового толкателя вдоль направляющей.',dof:1,labels:['ПОДЪЁМ ТОЛКАТЕЛЯ','ВХОДНОЙ УГОЛ'],formula:'y = e sin θ + √((R + ρ)² − e² cos² θ)',insight:'Контакт профиля и ролика — высшая пара. Форма кулачка определяет закон перемещения ведомого звена.',note:'Схема с идеальным постоянным контактом; R + P + высшая пара · M = 1',draw:drawCam},
 yoke:{name:'Кулиса / Scotch yoke',code:'R + P + SLOT',intro:'Палец кривошипа перемещается внутри прорези кулисы, напрямую превращая вращение в поступательное движение.',dof:1,labels:['СМЕЩЕНИЕ КУЛИСЫ','ПОЛНЫЙ ХОД'],formula:'x = r cos θ;  v = − rω sin θ',insight:'Поступательное движение строго гармоническое при постоянной ω. В прорези есть скользящий контакт.',note:'Идеализированная пара «палец–прорезь» без зазоров и трения · M = 1',draw:drawYoke},
 robot:{name:'Двухзвенный манипулятор 2R',code:'R + R',intro:'Два независимых вращательных шарнира определяют положение точки инструмента в рабочей плоскости.',dof:2,labels:['КООРДИНАТА X','КООРДИНАТА Y'],formula:'x = l₁cos θ₁ + l₂cos(θ₁ + θ₂)',insight:'Два управляющих угла нужны для задания произвольного достижимого положения рабочего органа. Изучи рабочую зону.',note:'3 звена со стойкой · 2 пары R · M = 3 × 2 − 2 × 2 = 2',draw:drawRobot}
};
const simulator={mech:'slider',theta:rad(42),speed:1,playing:!motionPrefersReduced,traces:true,labels:true,r:76,l:198,robotSecond:-40,z1:18,z2:32};
const heroState={theta:rad(35)};
function simulationOptions(){return{traces:simulator.traces,labels:simulator.labels,r:simulator.r,l:simulator.l,robotSecond:simulator.robotSecond,z1:simulator.z1,z2:simulator.z2};}
function displayMechanism(){const def=mechDefinitions[simulator.mech],t=simulator.theta;const output=def.draw(canvasInfo($('labCanvas')).c,$('labCanvas').clientWidth,$('labCanvas').clientHeight,t,simulationOptions());
 $('mechNumber').textContent=`МЕХАНИЗМ / ${String(Object.keys(mechDefinitions).indexOf(simulator.mech)+1).padStart(2,'0')}`;$('mechClass').textContent=simulator.mech==='robot'?'2 DOF':'ПЛОСКИЙ';$('viewportTag').textContent=def.code;$('mechTitle').textContent=def.name;$('mechIntro').textContent=def.intro;$('mechMobility').textContent=String(def.dof).padStart(2,'0');$('metricLabel1').textContent=def.labels[0];$('metricLabel2').textContent=def.labels[1];$('mechFormula').textContent=def.formula;$('mechInsight').textContent=def.insight;$('mechNote').textContent=def.note;
 let a='—',b='—';switch(simulator.mech){case 'slider':a=`${round(output.x)} мм`;b=`${round(output.stroke,0)} мм`;break;case 'fourbar':a=`${round(output.angle)}°`;b=`${round(output.bc,0)} мм`;break;case 'gears':a=`${round(output.ratio,2)} : 1`;b=`${round(deg(output.rotation)%360)}°`;break;case 'cam':a=`${round(output.lift)} мм`;b=`${round(deg(t))}°`;break;case 'yoke':a=`${round(output.x)} мм`;b='208 мм';break;case 'robot':a=`${round(output.x)} мм`;b=`${round(output.y)} мм`;break;}
 $('metricValue1').textContent=a;$('metricValue2').textContent=b;if(simulator.mech==='robot'){const det=140*112*Math.sin(rad(simulator.robotSecond));$('robotSingularity').textContent=Math.abs(det)<250?'ОСОБОЕ ПОЛОЖЕНИЕ / det J ≈ 0 · ПОТЕРЯ НАПРАВЛЕНИЯ МГНОВЕННОГО ДВИЖЕНИЯ':`det J = ${round(det,0)} мм² · ОБЫЧНОЕ ПОЛОЖЕНИЕ`;} $('angleValue').textContent=`${String(Math.round((deg(t)%360+360)%360)).padStart(3,'0')}°`;
}
function drawHero(){const{c,w,h}=canvasInfo($('heroCanvas'));const def=mechDefinitions.fourbar;def.draw(c,w,h,heroState.theta,{traces:true,labels:true});$('heroAngle').textContent=`${String(Math.floor(deg(heroState.theta)%360)).padStart(3,'0')}.${String(Math.floor(deg(heroState.theta)*10)%10)}°`;}
function changeMech(key){if(!mechDefinitions[key])return;simulator.mech=key;$('mechanismTabs').querySelectorAll('button').forEach(b=>{const selected=b.dataset.mech===key;b.classList.toggle('active',selected);b.setAttribute('aria-selected',selected);b.tabIndex=selected?0:-1;});$('geometryControls').hidden=key!=='slider';$('robotControls').hidden=key!=='robot';$('gearControls').hidden=key!=='gears';displayMechanism();}
function syncPlayButton(){$('playIcon').textContent=simulator.playing?'Ⅱ':'▶';$('playPause').setAttribute('aria-label',simulator.playing?'Поставить механизм на паузу':'Запустить механизм');}
$('mechanismTabs').addEventListener('click',e=>{const el=e.target.closest('button[data-mech]');if(el)changeMech(el.dataset.mech);});
$('playPause').addEventListener('click',()=>{simulator.playing=!simulator.playing;syncPlayButton();});
$('angleRange').addEventListener('input',e=>{simulator.theta=rad(Number(e.target.value));simulator.playing=false;syncPlayButton();displayMechanism();});
$('speedRange').addEventListener('input',e=>{simulator.speed=Number(e.target.value);$('speedValue').textContent=`${round(simulator.speed)}×`;drawMotionPlot();});
$('tracesSwitch').addEventListener('change',e=>{simulator.traces=e.target.checked;displayMechanism();});
$('labelsSwitch').addEventListener('change',e=>{simulator.labels=e.target.checked;displayMechanism();});
$('crankLength').addEventListener('input',e=>{simulator.r=Number(e.target.value);$('crankOut').textContent=simulator.r+' мм';displayMechanism();});
$('rodLength').addEventListener('input',e=>{simulator.l=Number(e.target.value);$('rodOut').textContent=simulator.l+' мм';displayMechanism();});
$('robotAngle').addEventListener('input',e=>{simulator.robotSecond=Number(e.target.value);$('robotOut').textContent=simulator.robotSecond+'°';displayMechanism();});
$('gearPreset').addEventListener('change',e=>{[simulator.z1,simulator.z2]=e.target.value.split(',').map(Number);displayMechanism();});
$('labCanvas').addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;const rect=e.currentTarget.getBoundingClientRect();if(e.clientY-rect.top<35||rect.bottom-e.clientY<35)return;simulator.playing=false;syncPlayButton();simulator.theta=TAU*clamp((e.clientX-rect.left)/rect.width,0,1);$('angleRange').value=Math.round(deg(simulator.theta));displayMechanism();});

/* Spatial joint viewer — lightweight, editable, self-contained 3D renderer. */
const jointDefinitions={
 R:{name:'Вращательная пара',eng:'REVOLUTE',dof:1,description:'Разрешает относительный поворот вокруг одной заданной оси. Три перемещения и два других поворота ограничены.',allowed:'Rz',blocked:'Tx, Ty, Tz, Rx, Ry',example:'ПРИМЕР: ось рычага, подшипниковый узел, дверная петля.',params:[{label:'УГОЛ · Rz',min:-170,max:170,unit:'°',value:36}]},
 P:{name:'Поступательная пара',eng:'PRISMATIC',dof:1,description:'Разрешает только поступательное перемещение по одной направляющей; относительное вращение исключено.',allowed:'Tx',blocked:'Ty, Tz, Rx, Ry, Rz',example:'ПРИМЕР: ползун станка, линейная направляющая, шток.',params:[{label:'СМЕЩЕНИЕ · Tx',min:-100,max:100,unit:'мм',value:35}]},
 C:{name:'Цилиндрическая пара',eng:'CYLINDRICAL',dof:2,description:'Одновременно допускает вращение вокруг общей оси и независимое осевое скольжение вдоль неё.',allowed:'Rz, Tz',blocked:'Tx, Ty, Rx, Ry',example:'ПРИМЕР: вал, свободно вращающийся и скользящий во втулке.',params:[{label:'ПОВОРОТ · Rz',min:-170,max:170,unit:'°',value:40},{label:'СДВИГ · Tz',min:-70,max:70,unit:'мм',value:30}]},
 S:{name:'Сферическая пара',eng:'SPHERICAL',dof:3,description:'Совпадающий центр двух деталей разрешает три независимых относительных вращения, но запрещает поступательные смещения.',allowed:'Rx, Ry, Rz',blocked:'Tx, Ty, Tz',example:'ПРИМЕР: шаровой шарнир подвески, шаровая опора.',params:[{label:'КРЕН · Rx',min:-65,max:65,unit:'°',value:25},{label:'ТАНГАЖ · Ry',min:-65,max:65,unit:'°',value:-20},{label:'РЫСКАНЬЕ · Rz',min:-170,max:170,unit:'°',value:45}]},
 U:{name:'Карданная пара',eng:'UNIVERSAL',dof:2,description:'Два взаимно перпендикулярных последовательных вращательных шарнира позволяют менять наклон соединяемых звеньев.',allowed:'Rx, Ry',blocked:'Tx, Ty, Tz, Rz*',example:'ПРИМЕР: карданное сочленение. *Rz не является независимой обобщённой координатой.',params:[{label:'ПОВОРОТ · Rx',min:-65,max:65,unit:'°',value:32},{label:'ПОВОРОТ · Ry',min:-65,max:65,unit:'°',value:-25}]},
 H:{name:'Винтовая пара',eng:'HELICAL',dof:1,description:'Осевое перемещение жёстко связано с углом поворота: за полный оборот происходит сдвиг на один ход винтовой линии.',allowed:'Rz ↔ Tz',blocked:'4 независимые координаты + связь Rz/Tz',example:'ПРИМЕР: винт–гайка, ходовой винт; связь Δz = p·Δθ/(2π).',params:[{label:'ПОВОРОТ · Rz',min:-360,max:360,unit:'°',value:110}]},
 E:{name:'Плоская пара',eng:'PLANAR',dof:3,description:'Две контактирующие плоскости позволяют два независимых перемещения вдоль поверхности и поворот вокруг её нормали.',allowed:'Tx, Ty, Rz',blocked:'Tz, Rx, Ry',example:'ПРИМЕР: плоская скользящая опора в идеализированной модели.',params:[{label:'СДВИГ · Tx',min:-85,max:85,unit:'мм',value:30},{label:'СДВИГ · Ty',min:-85,max:85,unit:'мм',value:20},{label:'ПОВОРОТ · Rz',min:-160,max:160,unit:'°',value:28}]},
 F:{name:'Жёсткое соединение',eng:'FIXED',dof:0,description:'Никакого относительного движения между соединёнными звеньями. Они образуют одно жёсткое тело в кинематическом смысле.',allowed:'Ничего',blocked:'Tx, Ty, Tz, Rx, Ry, Rz',example:'ПРИМЕР: сварное соединение, жёстко закреплённая деталь.',params:[]}
};
const jointState={type:'R',yaw:0.66,pitch:0.59,playing:!motionPrefersReduced,time:0,values:[],drag:null};
const v3=(x,y,z)=>({x,y,z});
const add3=(a,b)=>v3(a.x+b.x,a.y+b.y,a.z+b.z);
const sub3=(a,b)=>v3(a.x-b.x,a.y-b.y,a.z-b.z);
const scale3=(p,k)=>v3(p.x*k,p.y*k,p.z*k);
const dot3=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const cross3=(a,b)=>v3(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);
const norm3=p=>scale3(p,1/Math.max(.000001,Math.sqrt(dot3(p,p))));
const rotZ3=(p,a)=>v3(p.x*Math.cos(a)-p.y*Math.sin(a),p.x*Math.sin(a)+p.y*Math.cos(a),p.z);
const rotY3=(p,a)=>v3(p.x*Math.cos(a)+p.z*Math.sin(a),p.y,-p.x*Math.sin(a)+p.z*Math.cos(a));
const rotX3=(p,a)=>v3(p.x,p.y*Math.cos(a)-p.z*Math.sin(a),p.y*Math.sin(a)+p.z*Math.cos(a));
let surfaces=[],sceneOverlays=[];
const shades={fixed:['#32383c','#464c4f','#60696b','#5b6368','#40484c','#737b7d'],mobile:['#7a8589','#aeb9bc','#eff2f0','#c9d1d2','#879296','#dbe1df'],dark:['#20272b','#343b3e','#586164','#495357','#353e42','#6c787b']};
function face(pts,kind='fixed',index=0){
 const u=sub3(pts[1],pts[0]),v=sub3(pts[2],pts[0]);
 const normal=norm3(cross3(u,v)),light=norm3(v3(-.65,-.8,1.6));
 const lit=.35+.65*Math.max(0,dot3(normal,light));
 const base=kind==='mobile'?151:kind==='fixed'?43:35;
 const span=kind==='mobile'?91:kind==='fixed'?68:54;
 const value=Math.round(base+span*lit);
 surfaces.push({pts,color:`rgb(${value},${value+Math.min(3,255-value)},${value+Math.min(3,255-value)})`});
} 
function box3(center,size,turn=0,kind='fixed'){
 const [sx,sy,sz]=size.map(n=>n/2);const coords=[[-sx,-sy,-sz],[sx,-sy,-sz],[sx,sy,-sz],[-sx,sy,-sz],[-sx,-sy,sz],[sx,-sy,sz],[sx,sy,sz],[-sx,sy,sz]].map(([x,y,z])=>add3(center,rotZ3(v3(x,y,z),turn)));
 [[0,1,2,3],[4,7,6,5],[0,4,5,1],[1,5,6,2],[2,6,7,3],[3,7,4,0]].forEach((indices,i)=>face(indices.map(k=>coords[k]),kind,i));
}
function tube3(a,b,r,kind='fixed',segments=18){const d=norm3(sub3(b,a)),temp=Math.abs(d.z)<.86?v3(0,0,1):v3(0,1,0),u=norm3(cross3(d,temp)),v=cross3(d,u);let ringA=[],ringB=[];for(let i=0;i<segments;i++){const t=i/segments*TAU,off=add3(scale3(u,r*Math.cos(t)),scale3(v,r*Math.sin(t)));ringA.push(add3(a,off));ringB.push(add3(b,off));}
 face([...ringA].reverse(),kind,3);face([...ringB],kind,2);for(let i=0;i<segments;i++)face([ringA[i],ringA[(i+1)%segments],ringB[(i+1)%segments],ringB[i]],kind,i%6);
}
function sphere3(center,r,kind='mobile'){const latSteps=9,lonSteps=20;for(let i=0;i<latSteps;i++){const f0=-Math.PI/2+i*Math.PI/latSteps,f1=-Math.PI/2+(i+1)*Math.PI/latSteps;for(let j=0;j<lonSteps;j++){const t0=j*TAU/lonSteps,t1=(j+1)*TAU/lonSteps;const sph=(f,t)=>add3(center,v3(r*Math.cos(f)*Math.cos(t),r*Math.cos(f)*Math.sin(t),r*Math.sin(f)));face([sph(f0,t0),sph(f0,t1),sph(f1,t1),sph(f1,t0)],kind,(j+i)%6);}}}
function overlayLine(points,color='#7e8b90',dash=[4,5],width=1){sceneOverlays.push({points,color,dash,width});}
function cylinderBase(){box3(v3(0,0,-1.10),[2.15,2.15,.40],0,'fixed');tube3(v3(0,0,-.9),v3(0,0,-.05),.52,'fixed');}
function makeJointModel(type,q){surfaces=[];sceneOverlays=[];const toRad=n=>rad(n||0);
 switch(type){
 case 'R':{const t=toRad(q[0]);cylinderBase();tube3(v3(0,0,-.12),v3(0,0,.65),.27,'mobile');tube3(v3(0,0,.67),v3(1.8*Math.cos(t),1.8*Math.sin(t),.67),.19,'mobile');sphere3(v3(1.8*Math.cos(t),1.8*Math.sin(t),.67),.23,'mobile');overlayLine([v3(0,0,1.3),v3(0,0,-1.3)],'#b9c5c9',[5,5]);break;}
 case 'P':{box3(v3(0,0,-.88),[3.6,1.72,.39],0,'fixed');for(const y of[-.54,.54])tube3(v3(-1.6,y,-.49),v3(1.6,y,-.49),.11,'fixed');const x=(q[0]||0)/100;box3(v3(x,0,-.2),[1.04,1.65,.66],0,'mobile');box3(v3(x,0,.2),[.72,.85,.3],0,'mobile');overlayLine([v3(-1.85,0,.6),v3(1.85,0,.6)],'#9caaaf',[5,5]);break;}
 case 'C':{const t=toRad(q[0]),z=(q[1]||0)/115;cylinderBase();tube3(v3(0,0,-.45+z),v3(0,0,1.14+z),.23,'mobile');tube3(v3(0,0,1.05+z),v3(1.44*Math.cos(t),1.44*Math.sin(t),1.05+z),.14,'mobile');overlayLine([v3(0,0,-1.4),v3(0,0,2)],'#acb8bc',[5,5]);break;}
 case 'S':{box3(v3(0,0,-1.13),[1.65,1.65,.4],0,'fixed');tube3(v3(0,0,-.85),v3(0,0,-.33),.62,'fixed');sphere3(v3(0,0,0),.65,'dark');sphere3(v3(0,0,.05),.51,'mobile');const pose=p=>rotZ3(rotY3(rotX3(p,toRad(q[0])),toRad(q[1])),toRad(q[2]));const a=pose(v3(0,0,.25)),b=pose(v3(0,0,1.9));tube3(a,b,.2,'mobile');const top=pose(v3(.3,0,1.45)),end=pose(v3(-.3,0,1.45));tube3(top,end,.075,'mobile');break;}
 case 'U':{const a=toRad(q[0]),b=toRad(q[1]);box3(v3(0,0,-1.18),[1.55,1.45,.42],0,'fixed');tube3(v3(0,0,-.95),v3(0,0,-.31),.4,'fixed');tube3(v3(-.78,0,-.1),v3(.78,0,-.1),.16,'fixed');const pose=p=>rotX3(p,a);tube3(pose(v3(0,-.75,.04)),pose(v3(0,.75,.04)),.13,'mobile');sphere3(v3(0,0,0),.42,'dark');const end=rotX3(rotY3(v3(0,0,1.85),b),a);tube3(v3(0,0,.1),end,.19,'mobile');sphere3(end,.19,'mobile');break;}
 case 'H':{const t=toRad(q[0]),z=(q[0]||0)/360*.83;cylinderBase();tube3(v3(0,0,-.40+z),v3(0,0,1.28+z),.25,'mobile');box3(v3(0,0,1.35+z),[1.1,.38,.22],t,'mobile');const points=[];for(let i=0;i<=90;i++){const a=i/90*8*Math.PI+t;points.push(v3(.285*Math.cos(a),.285*Math.sin(a),-.32+z+i/90*1.53));}overlayLine(points,'#d6dfdf',[],1.4);overlayLine([v3(0,0,-1.4),v3(0,0,2.2)],'#9eadb0',[5,5]);break;}
 case 'E':{box3(v3(0,0,-.78),[3.6,3.15,.38],0,'fixed');for(let i=-1;i<=1;i++){overlayLine([v3(-1.65,i*.8,-.56),v3(1.65,i*.8,-.56)],'#6b7579',[3,7]);overlayLine([v3(i*.85,-1.4,-.56),v3(i*.85,1.4,-.56)],'#6b7579',[3,7]);}box3(v3((q[0]||0)/100,(q[1]||0)/100,-.23),[1.15,1.0,.56],toRad(q[2]),'mobile');tube3(v3((q[0]||0)/100,(q[1]||0)/100,.08),v3((q[0]||0)/100,(q[1]||0)/100,.55),.13,'mobile');break;}
 case 'F':{box3(v3(-.52,0,-.75),[1.8,1.35,.5],0,'fixed');box3(v3(.66,0,-.1),[1.45,1.05,.5],0,'mobile');box3(v3(.23,0,-.46),[.9,.82,.75],0,'dark');for(const x of[-.12,.88])tube3(v3(x,-.38,.2),v3(x,-.38,.4),.085,'fixed');break;}
 }
}
function viewProject3(p,w,h,scale){const cy=Math.cos(jointState.yaw),sy=Math.sin(jointState.yaw),ce=Math.cos(jointState.pitch),se=Math.sin(jointState.pitch);const x=p.x*cy-p.y*sy,y=p.x*sy+p.y*cy;return{x:w/2+x*scale,y:h*.54+(y*se-p.z*ce)*scale,depth:y*ce+p.z*se};}
function renderJoint(){const{c,w,h}=canvasInfo($('jointCanvas'));const scale=Math.min(w/5.8,h/4.2,116),p=(v)=>viewProject3(v,w,h,scale);c.lineJoin='round';
 for(let a=-3;a<=3;a++){const z=-1.42;const x1=p(v3(-3,a,z)),x2=p(v3(3,a,z)),y1=p(v3(a,-3,z)),y2=p(v3(a,3,z));line2(c,x1,x2,.65,'#394248');line2(c,y1,y2,.65,'#394248');}
 makeJointModel(jointState.type,jointState.values);const faces=surfaces.map(f=>({...f,view:f.pts.map(p),depth:f.pts.reduce((sum,t)=>sum+p(t).depth,0)/f.pts.length})).sort((a,b)=>a.depth-b.depth);
 for(const f of faces){c.beginPath();f.view.forEach((a,i)=>i?c.lineTo(a.x,a.y):c.moveTo(a.x,a.y));c.closePath();c.fillStyle=f.color;c.fill();c.lineWidth=.8;c.strokeStyle='#14181b';c.stroke();}
 for(const o of sceneOverlays){path2(c,o.points.map(p),o.width,o.color,o.dash);}
 const origin=p(v3(-2.35,-1.75,-1.40));const labels=[['X',v3(-1.72,-1.75,-1.40),'#8e989d'],['Y',v3(-2.35,-1.12,-1.40),'#8e989d'],['Z',v3(-2.35,-1.75,-.77),'#d6dcde']];for(const[l,xyz,color]of labels){const a=p(xyz);smallArrow(c,origin,a,color);label2(c,a,l,6,-3,color);}
}
function buildJointControls(){const def=jointDefinitions[jointState.type];$('jointTopTag').textContent=jointState.type+' / '+def.eng;$('jointTitle').textContent=def.name;$('jointDescription').textContent=def.description;$('jointDof').textContent=def.dof;$('jointAllowed').textContent=def.allowed;$('jointBlocked').textContent=def.blocked;$('jointExample').textContent=def.example;
 const container=$('jointControls');container.replaceChildren();if(!def.params.length){const el=document.createElement('div');el.className='small-mono';el.textContent='НЕТ НЕЗАВИСИМЫХ ПЕРЕМЕЩЕНИЙ';container.append(el);}def.params.forEach((param,i)=>{const row=document.createElement('div');row.className='joint-control-row';const label=document.createElement('label');const id='jointParam'+i;label.htmlFor=id;const lab=document.createElement('span');lab.textContent=param.label;const out=document.createElement('output');out.id='jointOutput'+i;out.textContent=`${Math.round(jointState.values[i])} ${param.unit}`;label.append(lab,out);const range=document.createElement('input');range.type='range';range.id=id;range.min=param.min;range.max=param.max;range.value=jointState.values[i];range.step=1;range.addEventListener('input',e=>{jointState.playing=false;syncJointPlay();jointState.values[i]=Number(e.target.value);out.textContent=`${Math.round(jointState.values[i])} ${param.unit}`;renderJoint();});row.append(label,range);container.append(row);});syncJointPlay();renderJoint();}
function changeJoint(type){if(!jointDefinitions[type])return;jointState.type=type;jointState.values=jointDefinitions[type].params.map(x=>x.value);jointState.playing=!motionPrefersReduced && type!=='F';$('jointButtons').querySelectorAll('button').forEach(b=>{const on=b.dataset.joint===type;b.classList.toggle('active',on);b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});buildJointControls();}
$('jointButtons').addEventListener('click',e=>{const button=e.target.closest('button[data-joint]');if(button)changeJoint(button.dataset.joint);});
$('resetCamera').addEventListener('click',()=>{jointState.yaw=.66;jointState.pitch=.59;renderJoint();});
const jointAnimationButton=document.createElement('button');jointAnimationButton.type='button';jointAnimationButton.id='jointAuto';$('resetCamera').before(jointAnimationButton);
function syncJointPlay(){jointAnimationButton.textContent=jointState.playing?'СТОП Ⅱ':'АНИМИРОВАТЬ ▶';jointAnimationButton.disabled=jointState.type==='F';}
jointAnimationButton.addEventListener('click',()=>{jointState.playing=!jointState.playing;syncJointPlay();});
const jointCanvas=$('jointCanvas');jointCanvas.addEventListener('pointerdown',e=>{jointState.drag={x:e.clientX,y:e.clientY,yaw:jointState.yaw,pitch:jointState.pitch};jointCanvas.setPointerCapture(e.pointerId);});
jointCanvas.addEventListener('pointermove',e=>{if(!jointState.drag)return;const d=jointState.drag;jointState.yaw=d.yaw+(e.clientX-d.x)*.012;jointState.pitch=clamp(d.pitch+(e.clientY-d.y)*.008,-.15,1.52);renderJoint();});
const stopDrag=()=>{jointState.drag=null;};jointCanvas.addEventListener('pointerup',stopDrag);jointCanvas.addEventListener('pointercancel',stopDrag);jointCanvas.addEventListener('lostpointercapture',stopDrag);

/* Practice: conceptual questions + explanations, never a superficial score-only quiz. */
const questions=[
 {category:'01 / СТЕПЕНИ СВОБОДЫ',q:'Сколько независимых координат описывают свободное жёсткое тело в пространстве?',options:['3','4','5','6'],correct:3,why:'Три поступательные координаты Tx, Ty, Tz и три угла поворота Rx, Ry, Rz — всего 6.'},
 {category:'01 / СТЕПЕНИ СВОБОДЫ',q:'Сколько степеней свободы у свободного жёсткого тела, движущегося строго в плоскости?',options:['1','2','3','6'],correct:2,why:'Остаются два независимых поступательных движения Tx, Ty и один поворот Rz.'},
 {category:'01 / КИНЕМАТИЧЕСКИЕ ПАРЫ',q:'Какая пара допускает только один относительный поворот?',options:['Поступательная P','Вращательная R','Сферическая S','Плоская E'],correct:1,why:'Идеальная вращательная пара (R) оставляет единственную независимую угловую координату.'},
 {category:'01 / КИНЕМАТИЧЕСКИЕ ПАРЫ',q:'Сколько степеней свободы имеет идеальная сферическая пара S?',options:['1','2','3','0'],correct:2,why:'Шарнир допускает 3 вращения относительно общего центра и запрещает все 3 относительных перемещения.'},
 {category:'02 / СВЯЗИ',q:'В чём принципиальное отличие винтовой пары H от цилиндрической C?',options:['H допускает только скольжение','В H поворот и осевой ход связаны','C не допускает вращения','H имеет три степени свободы'],correct:1,why:'У цилиндрической пары Rz и Tz независимы (2 DOF). У винтовой они связаны шагом, остаётся 1 DOF.'},
 {category:'02 / ЗВЕНЬЯ',q:'Сколько звеньев, включая стойку, в идеальной классической кривошипно-ползунной схеме?',options:['2','3','4','5'],correct:2,why:'Стойка, кривошип, шатун, ползун: n = 4. Входная и выходная детали тоже считаются звеньями.'},
 {category:'02 / ФОРМУЛА ПОДВИЖНОСТИ',q:'Для плоского механизма n = 4, j₁ = 4, j₂ = 0. Чему равна подвижность M?',options:['0','1','2','3'],correct:1,why:'M = 3(n − 1) − 2j₁ − j₂ = 3×3 − 2×4 = 1.'},
 {category:'02 / МАНИПУЛЯТОР',q:'У плоского манипулятора с двумя последовательными независимыми шарнирами R сколько степеней свободы?',options:['1','2','3','6'],correct:1,why:'Углы θ₁ и θ₂ независимы: две управляющие координаты, M = 2.'},
 {category:'03 / СКОРОСТЬ',q:'Кривошип вращается с постоянной ω. Будет ли ползун двигаться с постоянной линейной скоростью?',options:['Да, всегда','Нет, его скорость обычно изменяется','Да, но только при длинном шатуне','Ползун вообще не движется'],correct:1,why:'Связь x(θ) нелинейна. Производная v = (dx/dθ)ω зависит от угла θ.'},
 {category:'03 / ЗУБЧАТЫЕ ПЕРЕДАЧИ',q:'Как направлены вращения двух наружнозубых колёс в зацеплении?',options:['Всегда одинаково','Всегда противоположно','Зависит от материала','Зависит только от диаметра'],correct:1,why:'Внешнее зацепление меняет знак угловой скорости: ω₂/ω₁ = −z₁/z₂.'},
 {category:'03 / ПЕРЕДАТОЧНОЕ ОТНОШЕНИЕ',q:'Колесо на 20 зубьев вращается со скоростью 600 об/мин и ведёт наружное колесо на 40 зубьев. Скорость ведомого?',options:['1200 об/мин','600 об/мин','300 об/мин','150 об/мин'],correct:2,why:'|n₂| = 600×20/40 = 300 об/мин, направление противоположное.'},
 {category:'03 / ПЕРЕМЕЩЕНИЕ',q:'Каков полный ход ползуна в идеальном центральном кривошипно-ползунном механизме при r = 65 мм?',options:['65 мм','100 мм','130 мм','260 мм'],correct:2,why:'Крайние положения отличаются на удвоенный радиус кривошипа: H = 2r = 130 мм.'},
 {category:'04 / СТРУКТУРНЫЙ АНАЛИЗ',q:'В плоском четырёхзвеннике 4 шарнирные пары R и 4 звена, включая стойку. M = ?',options:['0','1','2','4'],correct:1,why:'M = 3(4 − 1) − 2×4 = 9 − 8 = 1, если ограничения независимы.'},
 {category:'04 / ВЫСШИЕ ПАРЫ',q:'Что служит типичным примером высшей кинематической пары?',options:['Идеальная поступательная направляющая','Сварное соединение','Контакт зубьев шестерён','Подшипник вращения'],correct:2,why:'Зубчатое зацепление — высшая кинематическая пара, идеализированная как контакт по линии/точке.'},
 {category:'04 / КИНЕМАТИКА',q:'Как из закона положения q(t) получить скорость?',options:['Проинтегрировать дважды','Взять производную dq/dt','Умножить на время','Найти квадрат положения'],correct:1,why:'Скорость — первая производная координаты по времени, ускорение — вторая.'},
 {category:'04 / ГРАНИЦЫ МОДЕЛИ',q:'Как правильно пользоваться структурной формулой M при зависимых или избыточных связях?',options:['Применять без проверки в любом случае','Заменять n количеством шарниров','Проверять независимость связей и особые положения','Всегда считать M = 1'],correct:2,why:'Формула предполагает независимые ограничения; при зависимостях и особых геометриях нужен дополнительный анализ кинематических уравнений.'}
];
const quiz={index:0,chosen:null,answers:[],active:true};
function safeGet(key){try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
function safeSet(key,v){try{localStorage.setItem(key,JSON.stringify(v));}catch{}}
const doneLessons=safeGet('kinema_lessons_v1')||{};
if((safeGet('kinema_quiz_v1')?.score||0)<13)delete doneLessons.mastery;
function refreshProgress(){const ids=['freedom','pairs','mechanisms','mastery'];const n=ids.filter(x=>doneLessons[x]).length;ids.forEach(id=>{const card=document.querySelector(`[data-lesson="${id}"]`),done=!!doneLessons[id];card?.classList.toggle('complete',done);const status=$('status-'+id);if(status)status.textContent=done?'ИЗУЧЕНО ✓':'НЕ ПРОЙДЕНО';const btn=card?.querySelector('.mark-lesson');if(btn){btn.disabled=id==='mastery';btn.innerHTML=id==='mastery'?(done?'ЗАЧЁТ СДАН ✓':'АВТОЗАЧЁТ ПОСЛЕ 13/16'):(done?'Вернуть в изучение':'Отметить изученным')+' <span>↗</span>';}});$('courseProgress').textContent=`${n} из 4 занятий`;$('progressFill').style.width=`${n*25}%`;$('navRing').style.setProperty('--progress',n*25);$('navPct').textContent=n*25;}
document.querySelectorAll('[data-mark]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.mark;if(id==='mastery')return;doneLessons[id]=!doneLessons[id];safeSet('kinema_lessons_v1',doneLessons);refreshProgress();}));
$('resetProgress').addEventListener('click',()=>{if(!confirm('Сбросить все четыре отметки об изучении? Результат проверки знаний останется сохранён.'))return;for(const id of Object.keys(doneLessons))delete doneLessons[id];safeSet('kinema_lessons_v1',doneLessons);refreshProgress();});
function setLastScore(){const last=safeGet('kinema_quiz_v1');$('lastScore').textContent=last?`ПОСЛЕДНЯЯ ПОПЫТКА / ${last.score} ИЗ 16 · ${last.date}`:'ПОПЫТОК ЕЩЁ НЕ БЫЛО';}
function renderQuiz(){const q=questions[quiz.index];$('quizMain').hidden=false;$('quizEnd').hidden=true;$('quizCounter').textContent=`ВОПРОС ${String(quiz.index+1).padStart(2,'0')} / 16`;$('quizCategory').textContent=q.category;$('quizProgressBar').style.width=`${quiz.index/questions.length*100}%`;$('questionText').textContent=q.q;$('quizFeedback').hidden=true;$('quizNext').disabled=true;$('quizNext').innerHTML=quiz.index===questions.length-1?'Завершить проверку <span>↗</span>':'Следующий вопрос <span>↗</span>';
 const parent=$('quizAnswers');parent.replaceChildren();q.options.forEach((opt,i)=>{const b=document.createElement('button');b.type='button';b.className='quiz-choice';const l=document.createElement('span');l.className='choice-letter';l.textContent=String.fromCharCode(65+i);const t=document.createElement('span');t.textContent=opt;b.append(l,t);b.addEventListener('click',()=>answerQuestion(i));parent.append(b);});quiz.chosen=null;updateQuizScore();}
function updateQuizScore(){const score=quiz.answers.filter((item,i)=>item===questions[i]?.correct).length;$('quizRunningScore').textContent=`${score} правильных из ${quiz.answers.length}`;}
function answerQuestion(selected){if(quiz.chosen!==null)return;quiz.chosen=selected;const q=questions[quiz.index];quiz.answers[quiz.index]=selected;const good=selected===q.correct;Array.from($('quizAnswers').children).forEach((b,i)=>{b.disabled=true;if(i===q.correct)b.classList.add('correct');else if(i===selected)b.classList.add('wrong');});const feedback=$('quizFeedback');feedback.hidden=false;feedback.replaceChildren();const label=document.createElement('span');label.className='feedback-label';label.textContent=good?'ВЕРНО / ПОЧЕМУ ТАК':'НЕВЕРНО / РАЗБОР';const p=document.createElement('p');p.textContent=q.why;feedback.append(label,p);$('quizNext').disabled=false;updateQuizScore();}
function endQuiz(){const score=quiz.answers.filter((a,i)=>a===questions[i].correct).length;const success=score>=13;const result={score,date:new Date().toLocaleDateString('ru-RU'),timestamp:Date.now()};safeSet('kinema_quiz_v1',result);setLastScore();if(success){doneLessons.mastery=true;safeSet('kinema_lessons_v1',doneLessons);refreshProgress();}const end=$('quizEnd');$('quizMain').hidden=true;end.hidden=false;$('quizCounter').textContent='ПРОВЕРКА ЗАВЕРШЕНА';$('quizCategory').textContent=success?'ЦЕЛЬ ДОСТИГНУТА':'ПРОДОЛЖАЙ ПРАКТИКУ';$('quizProgressBar').style.width='100%';end.replaceChildren();
 const scoreEl=document.createElement('div');scoreEl.className='quiz-end-score';scoreEl.innerHTML=`${score}<small> / 16</small>`;const h=document.createElement('h3');h.textContent=success?'Базовые принципы усвоены.':'Ошибки — ориентир для следующей попытки.';const p=document.createElement('p');p.className='quiz-end-note';p.textContent=success?'Результат хороший. Для уверенного инженерного понимания теперь решай реальные задачи, строй схемы и проверяй предельные положения.':'Вернись к кинематическим парам, формуле подвижности и механизмам. Затем повтори проверку.';const wrong=quiz.answers.map((a,i)=>a===questions[i].correct?null:i+1).filter(Boolean);const review=document.createElement('div');review.className='quiz-review';review.textContent=wrong.length?'ВОПРОСЫ ДЛЯ ПОВТОРЕНИЯ: '+wrong.map(n=>String(n).padStart(2,'0')).join(' · '):'ВСЕ ОТВЕТЫ ВЕРНЫ. МОЖНО ПЕРЕХОДИТЬ К САМОСТОЯТЕЛЬНОМУ ПРОЕКТИРОВАНИЮ.';const actions=document.createElement('div');actions.className='quiz-end-actions';const retry=document.createElement('button');retry.type='button';retry.className='dark-btn';retry.textContent='Пройти ещё раз ↻';retry.addEventListener('click',()=>{quiz.index=0;quiz.answers=[];renderQuiz();});const lab=document.createElement('a');lab.href='#lab';lab.className='outline-btn';lab.textContent='Вернуться к механизмам ↗';actions.append(retry,lab);end.append(scoreEl,h,p,review,actions);}
$('quizNext').addEventListener('click',()=>{if(quiz.chosen===null)return;if(quiz.index===questions.length-1)endQuiz();else{quiz.index++;renderQuiz();}});

/* RAF animation paused when browser tab hidden; no network dependency. */
const viewActive={hero:true,lab:false,joint:false};
if('IntersectionObserver' in window){
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){if(entry.target.classList.contains('hero-sim'))viewActive.hero=entry.isIntersecting;if(entry.target.classList.contains('lab-viewport'))viewActive.lab=entry.isIntersecting;if(entry.target.classList.contains('joint-viewport'))viewActive.joint=entry.isIntersecting;}},{rootMargin:'160px 0px'});
 [document.querySelector('.hero-sim'),document.querySelector('.lab-viewport'),document.querySelector('.joint-viewport')].forEach(element=>observer.observe(element));
}else{viewActive.lab=true;viewActive.joint=true;}
let lastTick=0,lastJointDOM=0;
function animate(now){
 if(lastTick && now-lastTick<26){requestAnimationFrame(animate);return;}
 const dt=lastTick?Math.min(.085,(now-lastTick)/1000):.016;lastTick=now;
 if(document.hidden){requestAnimationFrame(animate);return;}
 if(!motionPrefersReduced&&viewActive.hero)heroState.theta=(heroState.theta+dt*.43)%TAU;
 if(simulator.playing&&viewActive.lab){simulator.theta+=dt*rad(54)*simulator.speed;$('angleRange').value=Math.round((deg(simulator.theta)%360+360)%360);}
 if(jointState.playing&&viewActive.joint&&jointDefinitions[jointState.type].params.length){jointState.time+=dt;const params=jointDefinitions[jointState.type].params;jointState.values=params.map((item,i)=>{const normalized=Math.sin(jointState.time*(i===0?.6:.42)+i*.93);return Math.round((item.max-item.min)*.32*normalized+(item.min+item.max)/2);});if(now-lastJointDOM>75){params.forEach((param,i)=>{const r=$('jointParam'+i),o=$('jointOutput'+i);if(r)r.value=jointState.values[i];if(o)o.textContent=jointState.values[i]+' '+param.unit;});lastJointDOM=now;}}
 if(viewActive.hero)drawHero();if(viewActive.lab)displayMechanism();if(viewActive.joint)renderJoint();requestAnimationFrame(animate);
}
function onScroll(){const scrolled=document.documentElement.scrollTop,max=document.documentElement.scrollHeight-innerHeight;$('scrollProgress').style.transform=`scaleX(${max>0?clamp(scrolled/max,0,1):0})`;}
window.addEventListener('scroll',onScroll,{passive:true});
window.addEventListener('resize',()=>{drawHero();displayMechanism();renderJoint();},{passive:true});
refreshProgress();setLastScore();renderQuiz();changeJoint('R');syncPlayButton();drawHero();displayMechanism();onScroll();requestAnimationFrame(animate);

/* Scientific output plot and editable structural-mobility calculator. */
function getOutputForPlot(mech,t){switch(mech){
 case 'slider':return slider(t,simulator.r,simulator.l).x;
 case 'fourbar':return fourbar(t).C.y;
 case 'gears':return -deg(t)*simulator.z1/simulator.z2;
 case 'cam':{const e=31,R=81,rollerR=23;return e*Math.sin(t)+Math.sqrt((R+rollerR)**2-(e*Math.cos(t))**2)-(R+rollerR-e);}
 case 'yoke':return yoke(t).S.x-yoke(t).A.x;
 case 'robot':return robot(t,rad(simulator.robotSecond)).E.x-robot(t,rad(simulator.robotSecond)).A.x;
 default:return 0;}}
const plotNames={q:'ПОЛОЖЕНИЕ',v:'СКОРОСТЬ',a:'УСКОРЕНИЕ'};
const plotBaseLabels={slider:'x',fourbar:'y(C)',gears:'Δφ₂',cam:'h',yoke:'x',robot:'x(TCP)'};
function motionValue(mech,t,mode){
 const f=x=>getOutputForPlot(mech,x), omega=rad(54)*simulator.speed;
 if(mode==='q')return f(t);
 const h=.001;
 if(mode==='v')return (f(t+h)-f(t-h))/(2*h)*omega;
 return (f(t+h)-2*f(t)+f(t-h))/(h*h)*omega*omega;
}
function drawMotionPlot(){
 const {c,w,h}=canvasInfo($('motionPlot'));
 const pad={left:45,right:14,top:16,bottom:15},pw=w-pad.left-pad.right,ph=h-pad.top-pad.bottom;
 const mode=simulator.plotMode||'q';
 const data=Array.from({length:181},(_,i)=>motionValue(simulator.mech,i*TAU/180,mode));
 const min=Math.min(...data),max=Math.max(...data),rawSpread=max-min;
 const margin=Math.max(rawSpread*.08,Math.max(Math.abs(min),Math.abs(max),1)*.025);
 const low=min-margin, high=max+margin,spread=high-low;
 const plotY=y=>pad.top+ph*(1-(y-low)/spread),plotX=t=>pad.left+pw*t/TAU;
 for(let i=0;i<=4;i++){const x=pad.left+pw*i/4;line2(c,{x,y:pad.top},{x,y:h-pad.bottom},.7,'#354044');}
 for(let i=0;i<=2;i++){const y=pad.top+ph*i/2;line2(c,{x:pad.left,y},{x:w-pad.right,y},.7,'#354044');}
 if(low<0 && high>0){const zero=plotY(0);line2(c,{x:pad.left,y:zero},{x:w-pad.right,y:zero},.85,'#7d8788',[4,5]);}
 const t=(simulator.theta%TAU+TAU)%TAU;
 const mark=pt(plotX(t),plotY(motionValue(simulator.mech,t,mode)));
 path2(c,data.map((v,i)=>pt(plotX(i*TAU/180),plotY(v))),1.9,'#ecf0ef');
 line2(c,{x:mark.x,y:pad.top},{x:mark.x,y:h-pad.bottom},1,'#899698',[4,4]);
 circle2(c,mark,4.4,'#f2f5f4','#151a1c',1);
 c.fillStyle='#bac2c2';c.font='9px Consolas,monospace';
 c.fillText(round(max,rawSpread<1?2:0),3,pad.top+6);
 c.fillText(round(min,rawSpread<1?2:0),3,h-pad.bottom);
 const unit=simulator.mech==='gears'?'°':'мм';const postfix=mode==='q'?'':mode==='v'?'/с':'/с²';
 $('plotLabel').textContent=`${mode==='q'?'':mode==='v'?'d/dt ':'d²/dt² '}${plotBaseLabels[simulator.mech]} / ${unit}${postfix}`;
 $('plotMeta').textContent=`ω₁ = ${round(54*simulator.speed,1)}°/с · УСКОРЕНИЕ ВХОДА = 0 · ${simulator.mech==='gears'?'φ₂ ЗА ОДИН ОБОРОТ':'ЧИСЛЕННЫЕ ПРОИЗВОДНЫЕ'}`;
 $('motionPlot').setAttribute('aria-label',`${plotNames[mode]}: ${plotBaseLabels[simulator.mech]} в ${unit}${postfix} по углу входного звена`);
}
simulator.plotMode='q';
document.querySelectorAll('[data-plot]').forEach(button=>button.addEventListener('click',()=>{
 simulator.plotMode=button.dataset.plot;
 document.querySelectorAll('[data-plot]').forEach(b=>{const active=b===button;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 drawMotionPlot();
}));
const mobilityInputs=['calcN','calcJ1','calcJ2'].map($);
function updateMobility(){const values=mobilityInputs.map(e=>Math.max(0,Math.min(60,Math.trunc(Number(e.value)||0))));const[n,j1,j2]=values;const M=3*(n-1)-2*j1-j2;$('calcM').textContent=String(M);$('calcReason').textContent=`M = 3(${n} − 1) − 2×${j1} − ${j2} = ${M}. `+(n<2?'Требуется минимум два звена.':M<0?'Проверь схему: формально переограниченная система.':M===0?'Структура без относительной подвижности.':M===1?'Один независимый кинематический вход.':`${M} независимых кинематических координат (при независимых связях).`);}
$('mobilityPreset').addEventListener('change',e=>{if(e.target.value==='custom')return;const nums=e.target.value.split(',');mobilityInputs.forEach((el,i)=>el.value=nums[i]);updateMobility();});
mobilityInputs.forEach(el=>el.addEventListener('input',()=>{$('mobilityPreset').value='custom';updateMobility();}));
updateMobility();
/* Plot is called alongside each redraw; upgrade existing render without external charting dependencies. */
const originalDisplayMechanism=displayMechanism;
displayMechanism=function(){originalDisplayMechanism();drawMotionPlot();};
displayMechanism();

/* Roving focus for accessible keyboard tablists. */
for(const [group,attribute,activate] of [['mechanismTabs','mech',changeMech],['jointButtons','joint',changeJoint]]){
 $(group).addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const buttons=Array.from($(group).querySelectorAll('button'));
  const index=buttons.indexOf(document.activeElement);if(index<0)return;
  event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'||event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
  activate(buttons[next].dataset[attribute]);buttons[next].focus();
 });
}
/* Two-link planar inverse kinematics. Distances are measured from joint O. */
function solve2R(x,y,branch=1){
 const l1=140,l2=112,rr=x*x+y*y;
 if(!Number.isFinite(rr)||rr>(l1+l2)**2+1e-7||rr<(l1-l2)**2-1e-7)return null;
 const cos2=clamp((rr-l1*l1-l2*l2)/(2*l1*l2),-1,1);
 const t2=branch*Math.acos(cos2);
 const t1=Math.atan2(y,x)-Math.atan2(l2*Math.sin(t2),l1+l2*Math.cos(t2));
 return {theta1:t1,theta2:t2,det:l1*l2*Math.sin(t2)};
}
$('ikSolve').addEventListener('click',()=>{
 const x=Number($('ikX').value),y=Number($('ikY').value),target=$('ikResult');
 if(!$('ikX').value.trim()||!$('ikY').value.trim()||![x,y].every(Number.isFinite)){
  target.textContent='Введи конечные числовые координаты X и Y.';target.dataset.state='error';return;
 }
 const solution=solve2R(x,y,Number($('ikBranch').value));
 if(!solution){target.textContent=`ТОЧКА НЕДОСТИЖИМА / R=${round(Math.hypot(x,y))} ММ. ДОПУСТИМО 28–252 ММ.`;target.dataset.state='error';return;}
 simulator.playing=false;syncPlayButton();simulator.theta=solution.theta1;simulator.robotSecond=deg(solution.theta2);
 $('angleRange').value=Math.round((deg(simulator.theta)%360+360)%360);
 $('robotAngle').value=Math.round(simulator.robotSecond);$('robotOut').textContent=round(simulator.robotSecond,1)+'°';
 displayMechanism();const actual=robot(solution.theta1,solution.theta2);
 const error=Math.hypot(actual.E.x-actual.A.x-x,actual.E.y-actual.A.y-y);
 target.dataset.state='success';target.textContent=`θ₁ = ${round(deg(solution.theta1),2)}° · θ₂ = ${round(deg(solution.theta2),2)}° · ПОГРЕШНОСТЬ ${round(error,4)} ММ.`;
});
/* Active investigation with numeric answer plus required experiment configuration. */
const experiments={
 slider:{title:'Эксперимент 01 / полный ход',prompt:'Установи длину кривошипа r = 90 мм. Каким станет полный ход ползуна? Введи число в миллиметрах.',expected:180,unit:'мм',ready:()=>simulator.r===90,guide:'Для опыта сначала установи кривошип 90 мм. H = 2r.'},
 fourbar:{title:'Эксперимент 02 / замкнутый контур',prompt:'Останови четырёхзвенник на угле θ = 180°. Какова длина шатуна между точками B и C?',expected:240,unit:'мм',ready:()=>!simulator.playing&&Math.abs(((deg(simulator.theta)%360)+360)%360-180)<=1,guide:'Останови анимацию и выстави ведущий угол 180°.'},
 gears:{title:'Эксперимент 03 / передача вращения',prompt:'Выбери зубчатую пару 12 : 36. Чему равен модуль передаточного отношения |i| = z₂/z₁?',expected:3,unit:':1',ready:()=>simulator.z1===12&&simulator.z2===36,guide:'В списке числа зубьев выбери 12 : 36.'},
 cam:{title:'Эксперимент 04 / закон подъёма',prompt:'Поставь входной угол кулачка θ = 90°. Каков подъём роликового толкателя относительно минимума?',expected:62,unit:'мм',ready:()=>!simulator.playing&&Math.abs(((deg(simulator.theta)%360)+360)%360-90)<=1,guide:'Поставь механизм на паузу и угол θ = 90°.'},
 yoke:{title:'Эксперимент 05 / гармоническое движение',prompt:'Останови кулису при θ = 0°. Чему равно смещение от средней точки (r = 104 мм)?',expected:104,unit:'мм',ready:()=>!simulator.playing&&(((deg(simulator.theta)%360)+360)%360<=1||((deg(simulator.theta)%360)+360)%360>=359),guide:'Останови анимацию и поставь угол θ = 0°.'},
 robot:{title:'Эксперимент 06 / рабочая область 2R',prompt:'Длины звеньев l₁ = 140 мм и l₂ = 112 мм. Каков внешний радиус зоны досягаемости TCP?',expected:252,unit:'мм',ready:()=>true,guide:'Сложи длины двух звеньев.'}
};
const solvedExperiments=safeGet('kinema_experiments_v2')||{};
function updateExperiment(){
 const item=experiments[simulator.mech],n=Object.values(solvedExperiments).filter(Boolean).length;
 $('experimentTitle').textContent=item.title;$('experimentPrompt').textContent=item.prompt;
 $('experimentUnit').textContent=item.unit;$('experimentCount').textContent=`${String(n).padStart(2,'0')} / 06`;
 $('experimentAnswer').value='';$('experimentFeedback').dataset.state=solvedExperiments[simulator.mech]?'success':'neutral';
 $('experimentFeedback').textContent=solvedExperiments[simulator.mech]?'Эксперимент выполнен. Можно повторить.':'Рассчитай результат, затем проверь при нужных параметрах.';
}
$('experimentCheck').addEventListener('click',()=>{
 const item=experiments[simulator.mech],field=$('experimentAnswer'),feedback=$('experimentFeedback');
 const number=Number(field.value.replace(',','.'));
 if(!field.value.trim()||!Number.isFinite(number)){
  feedback.dataset.state='error';feedback.textContent='Введи числовой ответ.';return;
 }
 if(Math.abs(number-item.expected)>0.15){feedback.dataset.state='error';feedback.textContent='Пока не сходится. Используй формулу и сравни результат с моделью.';return;}
 if(!item.ready()){feedback.dataset.state='error';feedback.textContent=item.guide;return;}
 solvedExperiments[simulator.mech]=true;safeSet('kinema_experiments_v2',solvedExperiments);
 const n=Object.values(solvedExperiments).filter(Boolean).length;$('experimentCount').textContent=`${String(n).padStart(2,'0')} / 06`;
 feedback.dataset.state='success';feedback.textContent=`ПРАВИЛЬНО / ${round(item.expected,0)} ${item.unit}. ${n===6?'Все шесть экспериментов выполнены.':'Переходи к следующему механизму.'}`;
});
$('experimentAnswer').addEventListener('keydown',e=>{if(e.key==='Enter')$('experimentCheck').click();});
const originalChangeMech=changeMech;
changeMech=function(key){originalChangeMech(key);updateExperiment();};
updateExperiment();
