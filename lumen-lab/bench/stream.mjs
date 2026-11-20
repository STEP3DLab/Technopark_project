import {appendFrame,decodeFrame,LineReader} from './protocol.mjs';
// Streams contain arbitrary USB fragments, occasionally including a partial first line.
export async function receive(reader,session,changed,shouldStop){
  let reason='eof';const decoder=new TextDecoder();
  const framing=new LineReader(line=>{
    if(reason!=='eof')return;
    let frame;try{frame=decodeFrame(line)}catch{session.rejected++;return}
    const status=appendFrame(session,frame);
    if(status==='order'){session.rejected++;return}
    if(status==='limit'||status==='reboot'){reason=status;return}
    session.lastArrival=Date.now();changed();
  },()=>session.rejected++);
  while(reason==='eof'&&!shouldStop()){
    const {done,value}=await reader.read();if(done)break;
    if(value)framing.feed(decoder.decode(value,{stream:true}));
  }
  return reason;
}
