/* Scene units are metres. The four-millimetre solid base is below the relief. */
export const DEFAULT_RELIEF = 12;
const BASE_M = .004;

export function heightAt(z, rangeMm) {
  return z > BASE_M ? BASE_M + (z - BASE_M) * rangeMm / DEFAULT_RELIEF : z;
}

export function terrainModifier(positions, normals, onUpdate = () => {}) {
  const sourceZ = new Float32Array(positions.length / 3);
  const sourceNormals = new Float32Array(normals);
  for (let i=0,j=2; j<positions.length; i++,j+=3) sourceZ[i]=positions[j];
  return value => {
    const factor=value / DEFAULT_RELIEF;
    for (let i=0, j=0; j<positions.length; i++,j+=3) {
      const z=sourceZ[i];
      positions[j+2]=heightAt(z,value);
      if (z <= BASE_M || factor === 1) {
        normals[j]=sourceNormals[j]; normals[j+1]=sourceNormals[j+1]; normals[j+2]=sourceNormals[j+2];
      } else {
        // Inverse-transpose normal transform for a Z-only scale.
        const nx=sourceNormals[j]*factor, ny=sourceNormals[j+1]*factor, nz=sourceNormals[j+2];
        const inv=1/(Math.sqrt(nx*nx+ny*ny+nz*nz)||1);
        normals[j]=nx*inv; normals[j+1]=ny*inv; normals[j+2]=nz*inv;
      }
    }
    onUpdate();
  };
}

export function threeReliefModifiers(scene) {
  const updates=[];
  scene.traverse(region => {
    if (!region.userData.part) return;
    for (const child of region.children) {
      if (child.name.startsWith('Рельеф')) {
        child.traverse(node => {
          if (!node.isMesh) return;
          const g=node.geometry;
          const position=g.getAttribute('position'), normal=g.getAttribute('normal');
          updates.push(terrainModifier(position.array,normal.array,()=>{
            position.needsUpdate=true; normal.needsUpdate=true;
            g.computeBoundingSphere(); g.computeBoundingBox();
          }));
        });
      } else {
        const seatZ=child.position.z;
        updates.push(value=>{child.position.z=heightAt(seatZ,value);});
      }
    }
  });
  return value=>{for(const update of updates) update(value);};
}

export function cpuReliefModifiers(parts) {
  const updates=[];
  for (const part of parts) {
    if (part.role==='terrain') updates.push(terrainModifier(part.positions,part.normals));
    else if (part.role==='fitting') {
      const seatZ=part.offset[2];
      updates.push(value=>{part.offset[2]=heightAt(seatZ,value);});
    }
  }
  return value=>{for(const update of updates) update(value);};
}

export function reliefControl() {
  const group=document.createElement('div');
  group.className='av-relief';
  const row=document.createElement('label');
  row.className='av-relief-label';
  const title=document.createElement('span');
  title.textContent='Перепад рельефа';
  const input=document.createElement('input');
  input.type='range'; input.min='6'; input.max='18'; input.step='0.1'; input.value=String(DEFAULT_RELIEF);
  input.setAttribute('aria-label', 'Перепад рельефа, миллиметры');
  input.disabled=true;
  const output=document.createElement('output');
  row.append(title,input,output);
  const note=document.createElement('p');
  note.append('Файлы для печати рассчитаны на 12 мм. Для другого перепада задайте параметр ');
  const arg=document.createElement('code'); arg.textContent='--relief';
  const source=document.createElement('a');source.href='source/build_terrain.py';source.textContent='build_terrain.py';
  note.append(arg,' при пересборке в ',source,'.');
  group.append(row,note);
  let listener=()=>{}, pending=0;
  function set(value) {
    input.value=String(value);
    const formatted=Number(input.value).toLocaleString('ru-RU',{maximumFractionDigits:1})+' мм';
    output.value=formatted;
    input.setAttribute('aria-valuetext',formatted);
    if(!pending)pending=requestAnimationFrame(()=>{pending=0;listener(Number(input.value));});
  }
  input.oninput=()=>set(input.value);
  set(DEFAULT_RELIEF);
  return {element:group, reset:()=>set(DEFAULT_RELIEF),
          bind(callback){listener=callback;input.disabled=false;callback(Number(input.value));}};
}
