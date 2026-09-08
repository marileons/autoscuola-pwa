(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.AgendaFullBackupStream=api})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const DEFAULT_CHUNK_BYTES=1024*1024;
function abortError(){const error=new Error("Ripristino annullato dall’utente.");error.name="AbortError";return error}
function checkAbort(signal){if(signal&&signal.aborted)throw abortError()}
async function readSlice(file,start,end){return file.slice(start,end).text()}
function documentBoundary(state,text,start){
  let depth=state.depth,inString=state.inString,escaped=state.escaped;
  for(let index=start;index<text.length;index++){
    const char=text[index];
    if(inString){if(escaped)escaped=false;else if(char==="\\")escaped=true;else if(char==='"')inString=false;continue}
    if(char==='"'){inString=true;continue}
    if(char==="{")depth++;
    else if(char==="}"&&--depth===0)return{end:index+1,next:index+1,state:{depth:0,inString:false,escaped:false}};
  }
  return{end:-1,next:text.length,state:{depth,inString,escaped}};
}
async function parseLegacyBackup(file,options={}){
  if(!file||!Number.isFinite(file.size)||file.size<=0)throw new Error("File backup vuoto o non leggibile.");
  const chunkBytes=Math.max(64*1024,Number(options.chunkBytes)||DEFAULT_CHUNK_BYTES),marker='"documents":[',signal=options.signal;
  let offset=0,buffer="",header=null,count=0,scanState=null,documentStart=-1,scanIndex=0,arrayEnded=false,maxBufferedChars=0;
  while(offset<file.size||buffer.length){
    checkAbort(signal);
    if(offset<file.size){const end=Math.min(file.size,offset+chunkBytes);buffer+=await readSlice(file,offset,end);maxBufferedChars=Math.max(maxBufferedChars,buffer.length);offset=end;options.onProgress?.({phase:"reading",loaded:offset,total:file.size});}
    if(!header){
      const markerIndex=buffer.indexOf(marker);
      if(markerIndex<0){if(offset>=file.size)throw new Error("File non leggibile o formato JSON non compatibile.");continue}
      try{header=JSON.parse(buffer.slice(0,markerIndex)+marker+']}' )}catch(error){throw new Error("Intestazione del backup non leggibile o JSON corrotto.")}
      buffer=buffer.slice(markerIndex+marker.length);options.onHeader?.(header);continue;
    }
    if(arrayEnded){if(offset>=file.size){if(buffer.trim()!=="}")throw new Error("Dati inattesi dopo la sezione documenti.");return{header,count,maxBufferedChars}}continue}
    let consumed=0;
    while(consumed<buffer.length){
      checkAbort(signal);
      if(documentStart<0){
        while(consumed<buffer.length&&/[\s,]/.test(buffer[consumed]))consumed++;
        if(consumed>=buffer.length)break;
        if(buffer[consumed]==="]"){
          buffer=buffer.slice(consumed+1);arrayEnded=true;consumed=0;break;
        }
        if(buffer[consumed]!=="{")throw new Error("Documento del backup non valido.");
        documentStart=consumed;scanIndex=consumed;scanState={depth:0,inString:false,escaped:false};
      }
      const boundary=documentBoundary(scanState,buffer,scanIndex);
      scanState=boundary.state;scanIndex=boundary.next;
      if(boundary.end<0)break;
      let serialized;
      try{serialized=JSON.parse(buffer.slice(documentStart,boundary.end))}catch(error){throw new Error("Documento del backup non leggibile o JSON corrotto.")}
      await options.onDocument?.(serialized,count);
      count++;options.onProgress?.({phase:"documents",loaded:count,total:Number(header?.metadata?.documents)||0});
      consumed=boundary.end;documentStart=-1;scanState=null;scanIndex=consumed;
    }
    if(arrayEnded)continue;
    if(documentStart>=0){
      if(documentStart>0){buffer=buffer.slice(documentStart);scanIndex-=documentStart;documentStart=0}
      if(offset>=file.size)throw new Error("File troncato durante la lettura di un documento.");
    }else if(consumed>0)buffer=buffer.slice(consumed);
    if(offset>=file.size&&buffer.length===0)break;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  throw new Error("File troncato: chiusura del backup mancante.");
}
function estimateBinaryBytes(fileBytes){return Math.ceil(Math.max(0,Number(fileBytes)||0)*0.75)}
async function estimateCapacity(fileBytes,currentBytes=0,storage=typeof navigator!=="undefined"?navigator.storage:null){
  const estimatedNew=estimateBinaryBytes(fileBytes),required=estimatedNew+Math.max(0,Number(currentBytes)||0),result={requiredBytes:required,availableBytes:null,quota:null,usage:null,supported:false,sufficient:null};
  if(!storage||typeof storage.estimate!=="function")return result;
  try{const estimate=await storage.estimate();result.quota=Number(estimate.quota)||0;result.usage=Number(estimate.usage)||0;result.availableBytes=Math.max(0,result.quota-result.usage);result.supported=true;result.sufficient=result.availableBytes>=required;return result}catch{return result}
}
return Object.freeze({DEFAULT_CHUNK_BYTES,parseLegacyBackup,estimateBinaryBytes,estimateCapacity});
});
