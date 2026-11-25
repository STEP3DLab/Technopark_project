// AURA, mm
$fn=120;
part="shade"; // shade, base
function r(z)=60+15*sin(180*z/195);
function p(z,a,t)=[(r(z)+2*cos(24*(a-z*.7))-t)*cos(a),(r(z)+2*cos(24*(a-z*.7))-t)*sin(a),z];
module shade(){ n=240; m=98; v=[for(t=[0,1.6],j=[0:m],i=[0:n-1])p(j*195/m,i*360/n,t)]; k=n*(m+1); f=concat([for(j=[0:m-1],i=[0:n-1]) [j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i]],[for(j=[0:m-1],i=[0:n-1]) [k+j*n+i,k+(j+1)*n+i,k+(j+1)*n+(i+1)%n,k+j*n+(i+1)%n]],[for(i=[0:n-1]) [i,k+i,k+(i+1)%n,(i+1)%n]],[for(i=[0:n-1]) [m*n+i,m*n+(i+1)%n,k+m*n+(i+1)%n,k+m*n+i]]); polyhedron(v,[for(face=f) [for(i=[len(face)-1:-1:0]) face[i]]],convexity=10);}
module base(){rotate_extrude($fn=240) polygon([[75,0],[75,25],[56,25],[56,29],[50,29],[50,25],[4,25],[4,18],[65,18],[65,0]]);}
if(part=="shade")shade();else if(part=="base")base();
