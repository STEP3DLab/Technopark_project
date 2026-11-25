// Wrist cable orthosis V07, mm. Bench demonstrator only.
// openscad -D 'part="upper"' -o upper.stl model.scad
part="assembly"; print_pose=false; explode=0; $fn=72;
L=110; rx0=47; rx1=42; rz0=34; rz1=30; wall=3;
guide_w=28; guide_t=7; guide_z=29; guide_tip=160; eye_y=[106,125,147]; eye_d=6.2; eye_ch=1.2; eye_od=16; eye_len=7;

module box(x,y,z,dx,dy,dz){translate([x,y,z])cube([dx,dy,dz]);}
module cylx(x,y,z,d,h){translate([x,y,z])rotate([0,90,0])cylinder(d=d,h=h);}
module cyly(x,y,z,d,h){translate([x,y,z])rotate([-90,0,0])cylinder(d=d,h=h);}
module cylz(x,y,z,d,h){translate([x,y,z])cylinder(d=d,h=h);}
module slotz(x,y,z,w,l,h){hull(){for(s=[-1,1])cylz(x,y+s*(l-w)/2,z,w,h);}}
module slotx(x,y,z,d,l,h){hull(){for(s=[-1,1])cylx(x,y+s*(l-d)/2,z,d,h);}}
module taper(a,b,c,d,l,y=0){translate([0,y,0])rotate([-90,0,0])linear_extrude(height=l,scale=[b/a,d/c])scale([a,c])circle(r=1);}
module cavity(){taper(rx0-wall+(rx0-rx1)/L,rx1-wall-(rx0-rx1)/L,rz0-wall+(rz0-rz1)/L,rz1-wall-(rz0-rz1)/L,L+2,-1);}
// Longitudinal guide eye with identical 45-degree chamfers at both entries.
module guide_eye(y){hull(){box(-10,y-eye_len/2,34,20,eye_len,3);cyly(0,y-eye_len/2,44,eye_od,eye_len);}}
module guide_bore(y){
  cyly(0,y-eye_len/2-.1,44,eye_d,eye_len+.2);
  translate([0,y-eye_len/2-.01,44])rotate([-90,0,0])cylinder(d1=eye_d+2*eye_ch,d2=eye_d,h=eye_ch+.01);
  translate([0,y+eye_len/2-eye_ch,44])rotate([-90,0,0])cylinder(d1=eye_d,d2=eye_d+2*eye_ch,h=eye_ch+.01);
}
module guide_coupon(){difference(){union(){box(-14,-5,29,28,10,7);guide_eye(0);}guide_bore(0);}}
module halfshell(active=false){difference(){union(){intersection(){taper(rx0,rx1,rz0,rz1,L);box(-60,-.1,0,120,L+.2,60);}
// No external strap lugs; slots are cut through the actual shell walls.
if(active){hull(){box(-23,12,21,46,88,3);box(-30,12,33,60,88,3);} // flat drive deck
// One continuous upper-shell/deck tongue, top plane z=36.
// 38 mm rounded root narrows progressively into the 28 mm extension.
hull(){for(x=[-15,15],y=[92,96])cylz(x,y,guide_z,8,guide_t);cylz(0,116,guide_z,guide_w,guide_t);}
hull(){for(y=[116,guide_tip-guide_w/2])cylz(0,y,guide_z,guide_w,guide_t);}
// Solid blended root; inner cavity is cut after union with the shell.
hull(){box(-23,85,22,46,9,3);for(x=[-15,15])cylz(x,94,25,8,11);cylz(0,116,guide_z,guide_w,guide_t);}
for(y=eye_y)guide_eye(y);
}}cavity();for(y=[22,83]){slotx(-60,y,10,5.5,26,35);slotx(25,y,10,5.5,26,35);}
if(active){for(x=[-12,12],y=[18,94])cylz(x,y,31,4.2,5.3);for(y=eye_y)guide_bore(y);}
}}
// Gear train: 18/90, module 0.4, 20-degree pressure angle. 0.14 mm tooth thinning, +0.10 mm nominal center relief.
m=.4; z1=18; z2=90; pa=20; backlash=.14; yc=65; center_distance=m*(z1+z2)/2+.10; yp=yc-center_distance; za=61;
function inv(a)=tan(a)*180/PI-a;
function polar(r,a)=[r*cos(a),r*sin(a)];
function th(r,rp,rb,n)=90/n-backlash/(2*rp)*180/PI+inv(pa)-inv(acos(min(1,rb/r)));
function gearpts(n)=let(rp=m*n/2,rb=rp*cos(pa),rr=rp-1.25*m,ra=rp+m,rs=max(rb,rr),step=360/n,tb=th(rs,rp,rb,n),tt=th(ra,rp,rb,n)) [for(k=[0:n-1])each concat([if(rr<rs-.00001)polar(rr,k*step-tb)], [for(j=[0:6])let(r=rs+(ra-rs)*j/6)polar(r,k*step-th(r,rp,rb,n))], [for(j=[1:3])polar(ra,k*step-tt+2*tt*j/3)], [for(j=[5:-1:0])let(r=rs+(ra-rs)*j/6)polar(r,k*step+th(r,rp,rb,n))], [if(rr<rs-.00001)polar(rr,k*step+tb)], [for(j=[1:3])polar(rr,k*step+tb+(step-2*tb)*j/4)])];
module teeth(n,h=8){linear_extrude(height=h)polygon(gearpts(n));}
module dbore(h,d=6.35,flat=2.4){intersection(){cylinder(d=d,h=h);box(-d,-d,-.01,d+flat,2*d,h+.02);}}
module driven(){difference(){union(){teeth(z2);cylinder(d=16,h=12);}translate([0,0,-.1])dbore(12.2);translate([8.2,0,10])rotate([0,-90,0])cylinder(d=2.7,h=6.4);}}
// Extended coupling flange, stock 25T horn is NOT printed. Radial M2 slots and recessed heads.
pinion_hub=6; horn_rmin=5.2; horn_rmax=7.1;
module radial_slot(a,z,d,h){rotate([0,0,a])hull(){for(r=[horn_rmin,horn_rmax])translate([r,0,z])cylinder(d=d,h=h);}}
module pinion(){difference(){union(){teeth(z1);translate([0,0,-pinion_hub])cylinder(d=20,h=pinion_hub+.05);}translate([0,0,-pinion_hub-.1])cylinder(d=3.2,h=pinion_hub+8.2);translate([0,0,-pinion_hub-.1])cylinder(d=7.4,h=2.1);for(a=[0,180]){radial_slot(a,-pinion_hub-.1,2.3,pinion_hub+.2);radial_slot(a,-2.2,4.1,2.3);}}}
module spool(){difference(){union(){cylinder(d=26,h=3);cylinder(d=16,h=25);translate([0,0,22])cylinder(d=26,h=3);}translate([0,0,-.1])dbore(25.2);translate([8.2,0,5])rotate([0,-90,0])cylinder(d=2.7,h=6.4);translate([10.5,0,-.1])cylinder(d=2.6,h=3.2);}}
// Integral stepped motor support. Motor rests on top of shelf (z=50.95).
// No intermediate frame or shim. Motor and shaft alignment preserved.
servo_length=40.8; servo_width=20.1; servo_ear_pitch=49.5; servo_ear_near=14.7; servo_ear_z=5;
servo_ymin=yp-30.4; servo_ymax=servo_ymin+servo_length;
servo_bottom=za-servo_width/2;
// Flat rectangular bearing pad, no upstands or perimeter features.
module shelf_outline(z,h){box(-70,5.5,z,41.6,56.5,h);}
module belt_slot(x,y,z,h){hull(){for(dx=[-3.3,3.3])cylz(x+dx,y,z,3.8,h);}}
module plate(){difference(){union(){
 hull(){for(x=[-29,29],y=[15,97])cylz(x,y,36,6,4);}
 shelf_outline(36,servo_bottom-36);
 // Flat support surface at servo_bottom. Retention strap passages are flush.
 // Nominal 0.4 mm separation from the wall; pad overlaps base.
 }for(x=[-12,12],y=[18,94])cylz(x,y,35.9,3.5,4.2);
 for(p=[[-19,16],[-19,93],[19,52],[19,86]]){cylz(p[0],p[1],35.9,3.4,4.2);cylz(p[0],p[1],35.9,6.2,2.1);}
 for(x=[-61.5,-46.5],y=[9.5,57.5])belt_slot(x,y,35.9,servo_bottom-36+.2);
}}
// Shaft support with clearance window for pinion; no frame attachment holes.
module motorwall(){difference(){union(){box(-28,5,40,6,91,39);box(-28,12,40,13,84,5);}cylx(-28.1,yc,za,10.2,6.2);cylx(-28.1,yp,za,22,6.2);
cylx(-21.9,yc,za,38,7.1);
for(y=[16,93])cylz(-19,y,39.9,2.7,5.2);}}
// Strap-slot test piece, not installed.
module servo_coupon(){difference(){box(-22,-8,0,44,16,3);for(x=[-9,9])belt_slot(x,0,-.1,3.2);}}
module supportwall(){difference(){union(){hull(){box(22,48,40,6,42,6);cylx(22,yc,za,18,6);}box(15,48,40,13,42,5);}cylx(21.9,yc,za,10.2,6.2);for(y=[52,86])cylz(19,y,39.9,2.7,5.2);}}
module bush(){difference(){union(){cylinder(d=9.95,h=7.4);cylinder(d=13,h=1.4);}translate([0,0,-.1])cylinder(d=6.35,h=7.6);}}
module shaft(){union(){cylinder(d=6,h=13);translate([0,0,13])dbore(42,6,2.2);translate([0,0,55])cylinder(d=6,h=13);}}
module spacer(h=1.8){difference(){cylinder(d=10,h=h);translate([0,0,-.1])cylinder(d=6.4,h=h+.2);}}
module collar(){difference(){cylinder(d=12,h=4);translate([0,0,-.1])cylinder(d=6.4,h=4.2);translate([6.2,0,2])rotate([0,-90,0])cylinder(d=2.7,h=4.2);}}
// Small fit coupon. Hole centers x=-24,-12,0,12,24 at y=0; D bore at y=15.
module fit_coupon(){difference(){hull(){for(x=[-29,29],y=[-5,20])cylz(x,y,0,6,5);}for(p=[[-24,2.7],[-12,3.5],[0,4.2],[12,6.35],[24,10.2]])cylz(p[0],0,-.1,p[1],5.2);translate([0,15,-.1])dbore(5.2);for(x=[-18,18])slotz(x,14,-.1,5.5,11,5.2);}}
// Non-printable measured envelope. Ear position, upper case steps, spline diameter/length and horn are estimated.
module motor_body(){box(-68.3,servo_ymin,za-servo_width/2,35.5,servo_length,servo_width);}
module motor_ears(){difference(){union(){for(y=[servo_ymin-6.5,servo_ymax-.1])box(-41.5,y,za-servo_width/2,2.5,6.6,servo_width);}for(y=[yp+servo_ear_near-servo_ear_pitch,yp+servo_ear_near],z=[za-servo_ear_z,za+servo_ear_z])slotx(-41.6,y,z,3.2,4.6,2.7);}}
module motor_boss(){cylx(-32.9,yp,za,14,2.6);}
module motor_spline(){cylx(-30.3,yp,za,6,3.4);}
module motor_horn(){difference(){cylx(-30,yp,za,17.5,3.5);cylx(-30.1,yp,za,6.2,3.8);for(k=[-1,1])cylx(-30.1,yp+k*6.6*sin(10),za-k*6.6*cos(10),2.1,3.8);}}
module motor_ref(){color("#313943")motor_body();color("#424d59")motor_ears();color("#4a535e")motor_boss();color("#b0a06e")motor_spline();color("#555b65")motor_horn();}
module cable_ref(){color("#d68a35")for(p=[[[0,65,53],[0,106,44]],[[0,106,44],[0,125,44]],[[0,125,44],[0,147,44]],[[0,147,44],[0,160,44]]])hull(){for(v=p)translate(v)sphere(d=1.3,$fn=16);}}
module axispart(x,y,z,phase=0){translate([x,y,z])rotate([0,90,0])rotate([0,0,phase])children();}
module assembly(){color("#e9edf0")translate([0,0,2])halfshell(true);color("#c0cad3")translate([0,0,-2-explode])rotate([0,180,0])halfshell(false);translate([0,0,2+explode*.6]){color("#4c7892")plate();color("#4c7892")translate([-explode*.4,0,0])motorwall();color("#4c7892")translate([explode*.4,0,0])supportwall();color("#e8a34a")axispart(-20,yc,za)driven();color("#e8a34a")axispart(-20.5,yp,za,10)pinion();color("#9bbdc2")axispart(-6,yc,za)spool();color("#a8a8ad")axispart(-34,yc,za)shaft();color("#e0e0e0"){axispart(-29.4,yc,za)bush();translate([29.4,yc,za])rotate([0,-90,0])bush();axispart(-21.8,yc,za)spacer();axispart(-8,yc,za)spacer();axispart(19.2,yc,za)spacer(2.8);axispart(-33.6,yc,za)collar();axispart(29.6,yc,za)collar();}translate([-explode*.5,0,0])motor_ref();cable_ref();}}
if(part=="upper") {if(print_pose)rotate([90,0,0])halfshell(true);else halfshell(true);}
else if(part=="lower"){if(print_pose)rotate([90,0,0])halfshell(false);else halfshell(false);}
else if(part=="plate")translate([0,0,-36])plate();
else if(part=="motorwall"){if(print_pose)rotate([0,-90,0])motorwall();else motorwall();}
else if(part=="servo_coupon")servo_coupon();
else if(part=="guide_coupon"){if(print_pose)rotate([90,0,0])guide_coupon();else guide_coupon();}
else if(part=="motor_body")motor_body();else if(part=="motor_ears")motor_ears();else if(part=="motor_boss")motor_boss();else if(part=="motor_spline")motor_spline();else if(part=="motor_horn")motor_horn();
else if(part=="supportwall"){if(print_pose)rotate([0,90,0])supportwall();else supportwall();}
else if(part=="driven")driven();else if(part=="pinion")translate([0,0,pinion_hub])pinion();else if(part=="spool")spool();else if(part=="bush")bush();else if(part=="shaft")shaft();else if(part=="spacer2")spacer();else if(part=="spacer3")spacer(2.8);else if(part=="collar")collar();else if(part=="fit_coupon")fit_coupon();else if(part=="motor_ref")motor_ref();else if(part=="cable_ref")cable_ref();else assembly();
