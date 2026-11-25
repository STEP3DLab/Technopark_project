// PETAL / 05 — editable OpenSCAD, millimetres
part="shade"; // shade or base
N=240; M=100;
function smooth(x)=let(t=min(1,max(0,x))) t*t*(3-2*t);
function pt(t,a,d)=let(k=smooth((t-.065)/.57),p=5*(a-75*t),
 r=50+13*sin(180*t)*smooth(t/.12)+8*t*t+10*k*(.72*cos(p)+.28*cos(2*p))-d,
 c=6*sin(180*t)*smooth(t/.12),z=190*t+11*pow(t,4)*cos(p))
 [r*cos(a)+c*cos(130*t),r*sin(a)+c*sin(130*t),z];
module shade(){
 v=concat([for(j=[0:M],i=[0:N-1])pt(j/M,360*i/N,0)],[for(j=[M:-1:0],i=[0:N-1])pt(j/M,360*i/N,1.8)]);
 K=2*(M+1);
 f=[for(j=[0:K-1],i=[0:N-1]) each [[j*N+i,((j+1)%K)*N+(i+1)%N,j*N+(i+1)%N],[j*N+i,((j+1)%K)*N+i,((j+1)%K)*N+(i+1)%N]]];
 polyhedron(v,f,convexity=12);
}
module base(){rotate_extrude($fn=N)polygon([[64,0],[67,3],[67,7],[60,23],[47.8,23],[47.8,29],[40,29],[40,23],[10,23],[10,17],[55,17],[55,0]]);}
if(part=="shade")shade();else base();
