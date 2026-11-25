// AURA, mm
$fn=120;
part="shade"; // shade, base, lid
function r(z)=60+15*sin(180*z/195);
function p(z,a,t)=[(r(z)+2*cos(24*(a-z*.7))-t)*cos(a),(r(z)+2*cos(24*(a-z*.7))-t)*sin(a),z];
module shade(){ n=240; m=98; v=[for(t=[0,1.6],j=[0:m],i=[0:n-1])p(j*195/m,i*360/n,t)]; k=n*(m+1); f=concat([for(j=[0:m-1],i=[0:n-1]) [j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i]],[for(j=[0:m-1],i=[0:n-1]) [k+j*n+i,k+(j+1)*n+i,k+(j+1)*n+(i+1)%n,k+j*n+(i+1)%n]],[for(i=[0:n-1]) [i,k+i,k+(i+1)%n,(i+1)%n]],[for(i=[0:n-1]) [m*n+i,m*n+(i+1)%n,k+m*n+(i+1)%n,k+m*n+i]]); polyhedron(v,f,convexity=10);}
module base(){difference(){union(){cylinder(h=25,r=75);translate([0,0,25])cylinder(h=4,r=56);}translate([0,0,-1])cylinder(h=20,r=65);translate([0,0,18])cylinder(h=12,r=4);translate([0,-76,5])cube([12,20,8],center=true);translate([0,0,25])cylinder(h=5,r=50);}}
module lid(){difference(){cylinder(h=3,r=64.7);for(a=[0:30:330])translate([45*cos(a),45*sin(a),-1])cylinder(h=5,r=2);}}
if(part=="shade")shade();else if(part=="base")base();else lid();
