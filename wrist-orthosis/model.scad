// Wrist cable orthosis V01, mm. Bench demonstrator only.
// openscad -D 'part="upper"' -o upper.stl model.scad
part="assembly"; print_pose=false; explode=0; $fn=72;
L=150; rx0=43; rx1=35; rz0=31; rz1=25; wall=3;
module box(x,y,z,dx,dy,dz){translate([x,y,z])cube([dx,dy,dz]);}
module cylx(x,y,z,d,h){translate([x,y,z])rotate([0,90,0])cylinder(d=d,h=h);}
module cyly(x,y,z,d,h){translate([x,y,z])rotate([-90,0,0])cylinder(d=d,h=h);}
module cylz(x,y,z,d,h){translate([x,y,z])cylinder(d=d,h=h);}
module slotz(x,y,z,w,l,h){hull(){for(s=[-1,1])cylz(x,y+s*(l-w)/2,z,w,h);}}
module slotx(x,y,z,d,l,h){hull(){for(s=[-1,1])cylx(x,y+s*(l-d)/2,z,d,h);}}
module taper(a,b,c,d,l,y=0){translate([0,y,0])rotate([-90,0,0])linear_extrude(height=l,scale=[b/a,d/c])scale([a,c])circle(r=1);}
module cavity(){taper(rx0-wall+(rx0-rx1)/L,rx1-wall-(rx0-rx1)/L,rz0-wall+(rz0-rz1)/L,rz1-wall-(rz0-rz1)/L,L+2,-1);}
module halfshell(active=false){difference(){union(){intersection(){taper(rx0,rx1,rz0,rz1,L);box(-60,-.1,0,120,L+.2,60);}
for(s=[-1,1],p=[[26,45],[119,40]])translate([s*p[1],p[0],0])hull(){for(a=[-1,1],b=[-1,1])cylz(a*6,b*15,0,5,5);}
if(active){hull(){box(-23,12,21,46,88,3);box(-30,12,33,60,88,3);} // flat drive deck
hull(){box(-10,88,23,20,58,3);box(-10,88,33,20,67,3);} // guide rail
for(p=[[109,49],[127,49],[145,49]])hull(){box(-7,p[0]-3,34,14,6,3);cyly(0,p[0]-3,p[1],12,6);}
}}cavity();for(s=[-1,1],p=[[26,45],[119,40]])slotz(s*p[1]+s*1.8,p[0],-.2,5.5,26,5.5);
if(active){for(x=[-12,12],y=[18,94])cylz(x,y,31,4.2,5.3);for(y=[109,127,145])cyly(0,y-4,49,4.2,8);}
}}
// Gear train: 18/90, module 0.6, 20-degree pressure angle. 0.14 mm total tooth thinning.
m=.6; z1=18; z2=90; pa=20; backlash=.14; yc=65; yp=yc-m*(z1+z2)/2; za=74;
function inv(a)=tan(a)*180/PI-a;
function polar(r,a)=[r*cos(a),r*sin(a)];
function th(r,rp,rb,n)=90/n-backlash/(2*rp)*180/PI+inv(pa)-inv(acos(min(1,rb/r)));
function gearpts(n)=let(rp=m*n/2,rb=rp*cos(pa),rr=rp-1.25*m,ra=rp+m,rs=max(rb,rr),step=360/n,tb=th(rs,rp,rb,n),tt=th(ra,rp,rb,n)) [for(k=[0:n-1])each concat([if(rr<rs-.00001)polar(rr,k*step-tb)], [for(j=[0:6])let(r=rs+(ra-rs)*j/6)polar(r,k*step-th(r,rp,rb,n))], [for(j=[1:3])polar(ra,k*step-tt+2*tt*j/3)], [for(j=[5:-1:0])let(r=rs+(ra-rs)*j/6)polar(r,k*step+th(r,rp,rb,n))], [if(rr<rs-.00001)polar(rr,k*step+tb)], [for(j=[1:3])polar(rr,k*step+tb+(step-2*tb)*j/4)])];
module teeth(n,h=8){linear_extrude(height=h)polygon(gearpts(n));}
module dbore(h,d=6.35,flat=2.4){intersection(){cylinder(d=d,h=h);box(-d,-d,-.01,d+flat,2*d,h+.02);}}
module driven(){difference(){union(){teeth(z2);cylinder(d=16,h=12);}translate([0,0,-.1])dbore(12.2);translate([-8.2,0,10])rotate([0,90,0])cylinder(d=2.7,h=6);}}
module pinion(){difference(){union(){teeth(z1);translate([0,0,-3])cylinder(d=18,h=3.05);}translate([0,0,-3.1])cylinder(d=3.2,h=11.2);translate([0,0,-3.1])cylinder(d=7.4,h=3.1);for(a=[0,180])rotate([0,0,a])translate([6.6,0,-3.1])cylinder(d=2,h=3.15);}}
module spool(){difference(){union(){cylinder(d=26,h=3);cylinder(d=16,h=25);translate([0,0,22])cylinder(d=26,h=3);}translate([0,0,-.1])dbore(25.2);translate([-8.1,0,5])rotate([0,90,0])cylinder(d=2.7,h=5.4);translate([10.5,0,-.1])cylinder(d=2.6,h=3.2);}}
module plate(){difference(){hull(){for(x=[-29,29],y=[15,97])cylz(x,y,36,6,4);}for(x=[-12,12],y=[18,94])cylz(x,y,35.9,3.5,4.2);for(p=[[-19,16],[-19,93],[19,52],[19,86]]){cylz(p[0],p[1],35.9,3.4,4.2);cylz(p[0],p[1],35.9,6.2,2.1);}}}
module motorwall(){difference(){union(){box(-28,-5,40,6,101,49);box(-28,12,40,13,84,5);}cylx(-28.1,yc,za,10.2,6.2);cylx(-28.1,yp,za,22,6.2); // horn clearance
for(y=[yp-31,yp+13.5],z=[za-5,za+5])slotx(-28.1,y,z,3.3,7,6.2);
for(y=[16,93])cylz(-19,y,39.9,2.7,5.2);}}
module supportwall(){difference(){union(){hull(){box(22,48,40,6,42,6);cylx(22,yc,za,27,6);}box(15,48,40,13,42,5);}cylx(21.9,yc,za,10.2,6.2);for(y=[52,86])cylz(19,y,39.9,2.7,5.2);}}
module bush(){difference(){union(){cylinder(d=9.95,h=7.4);cylinder(d=13,h=1.4);}translate([0,0,-.1])cylinder(d=6.35,h=7.6);}}
module shaft(){union(){cylinder(d=6,h=13);translate([0,0,13])dbore(42,6,2.2);translate([0,0,55])cylinder(d=6,h=13);}}
module spacer(h=1.8){difference(){cylinder(d=10,h=h);translate([0,0,-.1])cylinder(d=6.4,h=h+.2);}}
module collar(){difference(){cylinder(d=12,h=4);translate([0,0,-.1])cylinder(d=6.4,h=4.2);translate([5.9,0,2])rotate([0,-90,0])cylinder(d=2.7,h=4);}}
module motor_ref(){color("#313943")box(-60.8,yp-30.4,za-10.05,32.8,40.8,20.1);color("#424d59")box(-30.5,yp-34.7,za-10.05,2.5,49.5,20.1);color("#bf954e")cylx(-28,yp,za,5.9,9);}
module cable_ref(){color("#d68a35")for(p=[[[0,65,66],[0,109,49]],[[0,109,49],[0,127,49]],[[0,127,49],[0,145,49]],[[0,145,49],[0,160,49]]])hull(){for(v=p)translate(v)sphere(d=1.3,$fn=16);}}
module axispart(x,y,z,phase=0){translate([x,y,z])rotate([0,90,0])rotate([0,0,phase])children();}
module assembly(){color("#e9edf0")translate([0,0,2])halfshell(true);color("#c0cad3")translate([0,0,-2-explode])rotate([0,180,0])halfshell(false);translate([0,0,2+explode*.6]){color("#4c7892")plate();color("#4c7892")translate([-explode*.4,0,0])motorwall();color("#4c7892")translate([explode*.4,0,0])supportwall();color("#e8a34a")axispart(-20,yc,za)driven();color("#e8a34a")axispart(-20,yp,za,10)pinion();color("#9bbdc2")axispart(-6,yc,za)spool();color("#a8a8ad")axispart(-34,yc,za)shaft();color("#e0e0e0"){axispart(-29.4,yc,za)bush();translate([29.4,yc,za])rotate([0,-90,0])bush();axispart(-21.8,yc,za)spacer();axispart(-8,yc,za)spacer();axispart(19.2,yc,za)spacer(2.8);axispart(-33.4,yc,za)collar();axispart(29.4,yc,za)collar();}translate([-explode*.5,0,0])motor_ref();cable_ref();}}
if(part=="upper") {if(print_pose)rotate([90,0,0])halfshell(true);else halfshell(true);}
else if(part=="lower"){if(print_pose)rotate([90,0,0])halfshell(false);else halfshell(false);}
else if(part=="plate")translate([0,0,-36])plate();
else if(part=="motorwall"){if(print_pose)rotate([0,-90,0])motorwall();else motorwall();}
else if(part=="supportwall"){if(print_pose)rotate([0,90,0])supportwall();else supportwall();}
else if(part=="driven")driven();else if(part=="pinion")translate([0,0,3])pinion();else if(part=="spool")spool();else if(part=="bush")bush();else if(part=="shaft")shaft();else if(part=="spacer2")spacer();else if(part=="spacer3")spacer(2.8);else if(part=="collar")collar();else if(part=="motor_ref")motor_ref();else if(part=="cable_ref")cable_ref();else assembly();
