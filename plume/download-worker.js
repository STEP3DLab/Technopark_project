'use strict';
importScripts('./vendor/lzma-d.js');
self.onmessage=async () => {
  try{
    const response=await fetch('./assets/Plume_100mm.zip');
    if(!response.ok)throw new Error('Archive unavailable');
    const bytes=new Uint8Array(await response.arrayBuffer());
    const header=new DataView(bytes.buffer);
    const size=header.getUint32(22,true),length=header.getUint32(18,true);
    const start=30+header.getUint16(26,true)+header.getUint16(28,true);
    if(header.getUint32(0,true)!==0x04034b50 || header.getUint16(8,true)!==14 || size!==26706684 || start+length>bytes.length || header.getUint16(start+2,true)!==5)throw new Error('Invalid model archive');
    // ZIP method 14 stores LZMA properties and the stream separately from the file size.
    const input=new Uint8Array(13+length-9);
    input.set(bytes.subarray(start+4,start+9),0);
    new DataView(input.buffer).setUint32(5,size,true);
    input.set(bytes.subarray(start+9,start+length),13);
    const stl=self.LZMA.decompress(input);
    if(stl.length!==size)throw new Error('Incomplete model');
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',stl)),v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!=='59cbe623a2d9fb8fca8a9f8d1330188c9e82ed58a470204c1fbf298c42bb056c')throw new Error('Model checksum mismatch');
    self.postMessage({buffer:stl.buffer},[stl.buffer]);
  }catch{self.postMessage({error:true});}
};
