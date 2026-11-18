const modes=new Set(['render','panorama','model','sketch','plan']);
const rooms=new Set(['living','kitchen','bedroom','bath','all']);
let restoring=false;
function restoreView(){
  const [mode,room]=location.hash.slice(1).split('/');
  if(!modes.has(mode)||!rooms.has(room))return;
  restoring=true;
  document.querySelector('[data-room="'+room+'"].room')?.click();
  document.querySelector('button[data-mode="'+mode+'"]')?.click();
  restoring=false;
}
window.addEventListener('apartment:view',event=>{
  if(restoring)return;
  const {id,mode}=event.detail;
  if(!modes.has(mode)||!rooms.has(id))return;
  const fragment='#'+mode+'/'+id;
  if(location.hash!==fragment)history.replaceState(null,'',fragment);
});
window.addEventListener('hashchange',restoreView);
restoreView();
