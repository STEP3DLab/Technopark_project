// All landmarks use the source sticker's 512 × 512 coordinate system.
// Hand-authored expressive motion. No human motion source or remote service.
export const FPS = 24;
export const FRAMES = 72;
export const rig = {
 hello: {head:[274,150,156,145], neck:[271,264], tilt:0.026, nod:2.5,
  arms:[{center:[111,216],radius:[78,115],pivot:[132,294],angle:.22,wave:3,cutX:163}],
  eyes:[[237,138,23,21,.22],[327,176,26,22,.29]],blink:.72},
 thanks:{head:[262,145,157,142],neck:[263,255],tilt:.022,nod:7,
  arms:[{center:[215,292],radius:[54,60],pivot:[192,337],angle:.045,lift:4},
        {center:[419,352],radius:[65,60],pivot:[355,335],angle:-.085,lift:5}],
  eyes:[[214,136,22,22,.2],[295,172,24,22,.28]],blink:.76},
 hug:{head:[268,147,157,143],neck:[263,258],tilt:.022,nod:3,
  arms:[{center:[94,292],radius:[89,79],pivot:[173,303],angle:-.09,reach:10,lift:3},
        {center:[416,316],radius:[86,74],pivot:[341,316],angle:.09,reach:-10,lift:3}],
  eyes:[[226,143,22,22,.24],[301,181,23,21,.31]],blink:.66},
 super:{head:[286,157,160,147],neck:[281,268],tilt:-.042,nod:4,
  arms:[{center:[138,241],radius:[64,87],pivot:[169,309],angle:.075,lift:10,cutX:195}],
  eyes:[],blink:.7},
 confused:{head:[262,148,155,145],neck:[258,260],tilt:.067,nod:-2,
  arms:[{center:[91,311],radius:[88,65],pivot:[169,324],angle:.06,lift:13},
        {center:[424,309],radius:[85,66],pivot:[347,326],angle:-.06,lift:13}],
  eyes:[[215,145,23,23,.16],[294,182,23,23,.27]],blink:.8},
 bye:{head:[280,147,159,140],neck:[274,264],tilt:-.03,nod:3,
  arms:[{center:[119,207],radius:[77,105],pivot:[144,285],angle:.21,wave:3,cutX:173}],
  eyes:[],blink:.7},
};
export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const TAU=Math.PI*2;
export function pose(config,p){
 const ease=Math.sin(Math.PI*p)**2;
 const slow=Math.sin(TAU*p);
 const blink=Math.exp(-Math.pow((p-config.blink)/.032,2));
 return {tilt:config.tilt*slow, nod:config.nod*ease, breath:.005*slow, sway:1.2*slow,blink,
  arms:config.arms.map(a=>{const amount=a.wave?Math.sin(TAU*p*a.wave)*ease:ease;
   const angle=(a.angle||0)*amount;return{cos:Math.cos(-angle),sin:Math.sin(-angle),dx:(a.reach||0)*ease,dy:-(a.lift||0)*ease};})};
}
export function weights(config,x,y){
 const frozen=1-smooth(322,366,y);
 const [hx,hy,rx,ry]=config.head;
 const d=Math.hypot((x-hx)/rx,(y-hy)/ry);
 const head=(1-smooth(.70,1.13,d))*(1-smooth(227,288,y))*smooth(128,177,x)*frozen;
 const arms=config.arms.map(a=>{const d=Math.hypot((x-a.center[0])/a.radius[0],(y-a.center[1])/a.radius[1]);return(1-smooth(.65,1.15,d))*frozen*(a.cutX?1-smooth(a.cutX-24,a.cutX,x):1);});
 return{head,arms,frozen};
}
