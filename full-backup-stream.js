(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.AgendaFullBackupStream=api})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const DEFAULT_CHUNK_BYTES=256*1024,MAX_HEADER_BYTES=32*1024*1024,MAX_DOCUMENT_METADATA_BYTES=256*1024;
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function backupError(code,message){const error=new Error(message);error.code=code;return error}
function abortError(){const error=new Error("Ripristino annullato dall’utente.");error.name="AbortError";return error}
function checkAbort(signal){if(signal?.aborted)throw abortError()}
const rotateRight=(x,n)=>(x>>>n)|(x<<(32-n));
class Sha256{
 constructor(){this.h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);this.b=new Uint8Array(64);this.w=new Uint32Array(64);this.n=0;this.total=0;this.done=false}
 update(value){if(this.done)throw Error("SHA-256 già completato");const bytes=value instanceof Uint8Array?value:new Uint8Array(value);let p=0;this.total+=bytes.length;if(this.n){const take=Math.min(64-this.n,bytes.length);this.b.set(bytes.subarray(0,take),this.n);this.n+=take;p=take;if(this.n===64){this.compress(this.b);this.n=0}}while(p+64<=bytes.length){this.compress(bytes.subarray(p,p+64));p+=64}if(p<bytes.length){this.b.set(bytes.subarray(p));this.n=bytes.length-p}return this}
 compress(c){const w=this.w,r=rotateRight;for(let i=0;i<16;i++){const p=i*4;w[i]=((c[p]<<24)|(c[p+1]<<16)|(c[p+2]<<8)|c[p+3])>>>0}for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(r(x,7)^r(x,18)^(x>>>3))+w[i-7]+(r(y,17)^r(y,19)^(y>>>10)))>>>0}const state=this.h;let a=state[0],b=state[1],d=state[2],e=state[3],f=state[4],g=state[5],h=state[6],j=state[7];for(let i=0;i<64;i++){const t1=(j+(r(f,6)^r(f,11)^r(f,25))+((f&g)^(~f&h))+K[i]+w[i])>>>0,t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&d)^(b&d)))>>>0;j=h;h=g;g=f;f=(e+t1)>>>0;e=d;d=b;b=a;a=(t1+t2)>>>0}this.h[0]=(this.h[0]+a)>>>0;this.h[1]=(this.h[1]+b)>>>0;this.h[2]=(this.h[2]+d)>>>0;this.h[3]=(this.h[3]+e)>>>0;this.h[4]=(this.h[4]+f)>>>0;this.h[5]=(this.h[5]+g)>>>0;this.h[6]=(this.h[6]+h)>>>0;this.h[7]=(this.h[7]+j)>>>0}
 hex(){if(!this.done){const bits=this.total*8,hi=Math.floor(bits/0x100000000),lo=bits>>>0;this.b[this.n++]=128;if(this.n>56){this.b.fill(0,this.n);this.compress(this.b);this.n=0}this.b.fill(0,this.n,56);for(let i=0;i<4;i++){this.b[56+i]=(hi>>>(24-i*8))&255;this.b[60+i]=(lo>>>(24-i*8))&255}this.compress(this.b);this.done=true}return Array.from(this.h,x=>x.toString(16).padStart(8,"0")).join("")}
}
const K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function decode64(text,final){if(!text)return new Uint8Array;if(text.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text)||(!final&&text.includes("=")))throw Error("Contenuto Base64 non valido.");let raw;try{raw=atob(text)}catch{throw Error("Contenuto Base64 non valido.")}const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
async function readWindow(blob){
 if(typeof blob.arrayBuffer==="function")return blob.arrayBuffer();
 if(typeof FileReader!=="undefined")return new Promise((resolve,reject)=>{const reader=new FileReader;reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||backupError("READ","Blocco del backup non leggibile."));reader.readAsArrayBuffer(blob)});
 throw backupError("READ","Il browser non permette la lettura del file. Aggiorna il browser senza cancellare i dati dell’app.");
}
class Reader{
 constructor(file,chunk,signal,progress){this.file=file;this.chunk=chunk;this.signal=signal;this.progress=progress;this.offset=0;this.buffer="";this.max=0;this.maxReadBytes=0;this.decoder=new TextDecoder("utf-8",{fatal:true});this.finished=false}
 async more(){
  checkAbort(this.signal);if(this.finished)return false;
  if(this.offset>=this.file.size){this.finished=true;try{this.buffer+=this.decoder.decode()}catch{throw backupError("UTF8","Codifica UTF-8 del backup non valida o carattere finale troncato.")}return!!this.buffer.length}
  const end=Math.min(this.file.size,this.offset+this.chunk);let raw;
  try{raw=await readWindow(this.file.slice(this.offset,end))}catch(error){if(error instanceof RangeError||error?.name==="QuotaExceededError")throw error;throw backupError("READ","Impossibile leggere un blocco del backup. Verifica che il file sia disponibile sul dispositivo.")}
  const bytes=new Uint8Array(raw);if(!bytes.length||bytes.length>end-this.offset)throw backupError("TRUNCATED","File troncato: il blocco letto non corrisponde alla dimensione del file.");
  this.offset+=bytes.length;this.maxReadBytes=Math.max(this.maxReadBytes,bytes.length);
  try{this.buffer+=this.decoder.decode(bytes,{stream:true})}catch{throw backupError("UTF8","Codifica UTF-8 del backup non valida.")}
  this.max=Math.max(this.max,this.buffer.length);this.progress?.({phase:"reading",loaded:this.offset,total:this.file.size});return true;
 }
 take(n){const value=this.buffer.slice(0,n);this.buffer=this.buffer.slice(n);return value}
 async ensure(){while(!this.buffer.length&&await this.more());return!!this.buffer.length}
 async ws(){while(await this.ensure()){const m=this.buffer.match(/^[ \t\r\n\uFEFF]+/);if(!m)return;this.take(m[0].length)}}
 async expect(token){await this.ws();if(!await this.ensure())throw backupError("TRUNCATED","File troncato: struttura JSON incompleta.");if(this.take(1)!==token)throw backupError("JSON_INVALID","Struttura JSON del backup non valida.")}
 async json(limit,label="Metadati"){
  await this.ws();if(!await this.ensure())throw backupError("TRUNCATED","File troncato durante la lettura dei metadati.");
  const first=this.buffer[0],structured=first==="{"||first==="[",string=first==='"',stack=[],parts=[];let quoted=false,escaped=false,bytes=0,started=false,done=false;
  const append=part=>{bytes+=new TextEncoder().encode(part).length;if(bytes>limit)throw backupError("METADATA_LIMIT",label+" oltre il limite di sicurezza ("+Math.floor(limit/1024)+" KB disponibili). Il file non è stato applicato.");parts.push(part)};
  while(!done){
   checkAbort(this.signal);if(!await this.ensure())throw backupError("TRUNCATED","File troncato durante i metadati JSON.");let used=0;
   for(;used<this.buffer.length;used++){
    const c=this.buffer[used];
    if(!structured&&!string){if(/[\s,}\]]/.test(c)){done=true;break}continue}
    if(quoted){if(escaped)escaped=false;else if(c==="\\")escaped=true;else if(c==='"'){quoted=false;if(string){used++;done=true;break}}}
    else if(c==='"'){quoted=true;started=true}
    else if(c==="{"||c==="["){stack.push(c);started=true;if(stack.length>128)throw backupError("JSON_INVALID","Metadati JSON troppo annidati.")}
    else if(c==="}"||c==="]"){const open=stack.pop();if((c==="}"&&open!=="{")||(c==="]"&&open!=="["))throw backupError("JSON_INVALID","Struttura JSON dei metadati non valida.");if(started&&!stack.length){used++;done=true;break}}
   }
   if(used)append(this.take(used));
   if(!done&&!await this.more()){if(!structured&&!string&&parts.length)done=true;else throw backupError("TRUNCATED","File troncato nei metadati JSON.")}
  }
  try{return{value:JSON.parse(parts.join("")),bytes}}catch(error){if(error instanceof RangeError)throw error;throw backupError("JSON_INVALID","Metadati del backup: JSON non valido.")}
 }
}
async function parseLegacyBackup(file,options={}){
 try{
  if(!file||!Number.isSafeInteger(file.size)||file.size<=0)throw backupError("EMPTY","File backup vuoto o non leggibile.");
  const signal=options.signal,chunk=Math.max(1,Math.min(1024*1024,Number(options.chunkBytes)||DEFAULT_CHUNK_BYTES)),limit=Math.max(1,Math.min(MAX_HEADER_BYTES,Number(options.maxHeaderBytes)||MAX_HEADER_BYTES)),reader=new Reader(file,chunk,signal,options.onProgress),header={},keys=new Set;let count=0,headerBytes=0;
  await reader.ws();if(!await reader.ensure()||reader.buffer[0]!=="{")throw backupError("FORMAT","Il file non è un backup JSON completo di Agenda Istruttori.");await reader.expect("{");
  async function document(){
   await reader.expect("{");const meta={},fields=new Set;let metadataBytes=0,hasData=false;
   for(;;){
    await reader.ws();if(!await reader.ensure())throw backupError("TRUNCATED","File troncato: documento incompleto.");if(reader.buffer[0]==="}"){reader.take(1);break}
    if(fields.size)await reader.expect(",");const key=(await reader.json(1024,"Nome campo")).value;if(typeof key!=="string"||fields.has(key)||key==="__proto__")throw backupError("JSON_INVALID","Campo documento duplicato o non valido.");fields.add(key);await reader.expect(":");
    if(key!=="dataBase64"){const result=await reader.json(MAX_DOCUMENT_METADATA_BYTES-metadataBytes,"Metadati documento");metadataBytes+=result.bytes+key.length+3;if(metadataBytes>MAX_DOCUMENT_METADATA_BYTES)throw backupError("METADATA_LIMIT","Metadati di un documento eccessivi.");Object.defineProperty(meta,key,{value:result.value,enumerable:true,configurable:true});continue}
    if(hasData)throw backupError("JSON_INVALID","Contenuto documento duplicato.");hasData=true;
    if(!Number.isSafeInteger(meta.size)||meta.size<0)throw backupError("DOCUMENT_SIZE","Dimensione dichiarata del documento non valida.");
    if(typeof meta.sha256!=="string"||!/^[a-f0-9]{64}$/i.test(meta.sha256))throw backupError("CHECKSUM","Checksum del documento mancante o non valido.");
    await reader.expect('"');const expected=Math.ceil(meta.size/3)*4,remaining=file.size-reader.offset+new TextEncoder().encode(reader.buffer).length;
    if(!Number.isSafeInteger(expected)||expected>remaining)throw backupError("TRUNCATED","File troncato o dimensione dichiarata incompatibile con il contenuto disponibile.");
    await options.onDocumentStart?.(meta,count);const hash=new Sha256;let size=0,carry="",encoded=0;
    for(;;){
     checkAbort(signal);if(!await reader.ensure())throw backupError("TRUNCATED","File troncato durante il contenuto Base64.");const quote=reader.buffer.indexOf('"'),part=reader.take(quote>=0?quote:reader.buffer.length);encoded+=part.length;if(encoded>expected)throw backupError("DOCUMENT_SIZE","Dimensione del documento diversa da quella dichiarata.");const text=carry+part,usable=quote>=0?text.length:Math.max(0,Math.floor((text.length-4)/4)*4);
     if(usable){let bytes;try{bytes=decode64(text.slice(0,usable),quote>=0)}catch{throw backupError("BASE64","Contenuto Base64 del documento non valido.")}hash.update(bytes);size+=bytes.length;if(size>meta.size)throw backupError("DOCUMENT_SIZE","Dimensione del documento diversa da quella dichiarata.");await options.onDocumentChunk?.(meta,bytes,count)}carry=text.slice(usable);
     if(quote>=0){reader.take(1);break}await pause();
    }
    if(size!==meta.size||encoded!==expected)throw backupError("DOCUMENT_SIZE","Dimensione del documento diversa da quella dichiarata.");const digest=hash.hex();if(digest!==meta.sha256.toLowerCase())throw backupError("CHECKSUM","Controllo integrità fallito: checksum del documento errato.");
    // Historical writers put Base64 last. Metadata after it would not be checksum-verifiable at start.
    await reader.ws();if(!await reader.ensure())throw backupError("TRUNCATED","File troncato: chiusura documento mancante.");if(reader.buffer[0]!=="}")throw backupError("JSON_INVALID","Campi inattesi dopo il contenuto del documento.");reader.take(1);await options.onDocumentEnd?.(meta,{size,sha256:digest},count);count++;options.onProgress?.({phase:"documents",loaded:count,total:Number(header.metadata?.documents)||0});return;
   }
   if(!hasData)throw backupError("JSON_INVALID","Contenuto Base64 del documento mancante.");
  }
  for(;;){
   await reader.ws();if(!await reader.ensure())throw backupError("TRUNCATED","File troncato: chiusura del backup mancante.");if(reader.buffer[0]==="}"){reader.take(1);break}
   if(keys.size)await reader.expect(",");const key=(await reader.json(1024,"Nome campo")).value;if(typeof key!=="string"||keys.has(key)||key==="__proto__")throw backupError("JSON_INVALID","Campo del backup duplicato o non valido.");keys.add(key);await reader.expect(":");
   if(key==="documents"){
    if(header.format!=="AgendaIstruttoriFullBackup")throw backupError("FORMAT","Il file non è un backup completo di Agenda Istruttori.");await reader.expect("[");
    let first=true;for(;;){await reader.ws();if(!await reader.ensure())throw backupError("TRUNCATED","File troncato: sezione documenti incompleta.");if(reader.buffer[0]==="]"){reader.take(1);break}if(!first)await reader.expect(",");await document();first=false}header.documents=[];
   }else{
    const result=await reader.json(Math.max(0,limit-headerBytes));headerBytes+=result.bytes+key.length+3;if(headerBytes>limit)throw backupError("METADATA_LIMIT","Metadati del backup oltre il limite di sicurezza di "+Math.floor(limit/1024/1024)+" MB.");Object.defineProperty(header,key,{value:result.value,enumerable:true,configurable:true});
    if(key==="format"&&result.value!=="AgendaIstruttoriFullBackup")throw backupError("FORMAT","Il file non è un backup completo di Agenda Istruttori.");
    if(key==="formatVersion"&&![1,2,3,4].includes(result.value))throw backupError("VERSION","Versione del backup non supportata.");
   }
  }
  await reader.ws();while(await reader.more())await reader.ws();if(reader.buffer.length)throw backupError("JSON_INVALID","Dati inattesi dopo la chiusura del backup.");
  if(header.format!=="AgendaIstruttoriFullBackup"||!keys.has("documents"))throw backupError("FORMAT","Il file non è un backup completo di Agenda Istruttori.");if(![1,2,3,4].includes(header.formatVersion))throw backupError("VERSION","Versione del backup non supportata.");
  await options.onHeader?.(header);return{header,count,maxBufferedChars:reader.max,maxReadBytes:reader.maxReadBytes,metadataBytes:headerBytes};
 }catch(error){if(error instanceof RangeError)throw backupError("MEMORY","Memoria insufficiente per leggere i metadati del backup. I dati esistenti non sono stati modificati.");throw error}
}
function estimateBinaryBytes(fileBytes){return Math.ceil(Math.max(0,Number(fileBytes)||0)*.75)}
async function estimateCapacity(fileBytes,currentBytes=0,storage=typeof navigator!=="undefined"?navigator.storage:null){const required=estimateBinaryBytes(fileBytes)+Math.max(0,Number(currentBytes)||0),result={requiredBytes:required,availableBytes:null,quota:null,usage:null,supported:false,sufficient:null};if(!storage?.estimate)return result;try{const estimate=await storage.estimate();result.quota=Number(estimate.quota)||0;result.usage=Number(estimate.usage)||0;result.availableBytes=Math.max(0,result.quota-result.usage);result.supported=true;result.sufficient=result.availableBytes>=required}catch{}return result}
// Output remains format 4 JSON. Only small strings/byte windows live on the
// JS heap; Blob parts hold the completed output without one giant Base64 string.
async function jsonBlob(value){
 const parts=[];let pending="";
 function flush(){if(pending){parts.push(new Blob([pending]));pending="";}}
 function* tokens(v){
  if(typeof v==="string"){yield '"';for(let i=0;i<v.length;i+=32768)yield asciiJson(v.slice(i,i+32768)).slice(1,-1);yield '"';}
  else if(Array.isArray(v)){yield '[';for(let i=0;i<v.length;i++){if(i)yield ',';yield* tokens(v[i]===undefined?null:v[i])}yield ']';}
  else if(v&&typeof v==="object"){yield '{';let first=true;for(const k of Object.keys(v)){if(v[k]===undefined)continue;if(!first)yield ',';first=false;yield asciiJson(k)+':';yield* tokens(v[k])}yield '}';}
  else yield JSON.stringify(v);
 }
 for(const token of tokens(value)){pending+=token;if(pending.length>=65536){flush();await new Promise(r=>setTimeout(r,0));}}
 flush();return new Blob(parts,{type:"application/json"});
}
function asciiJson(value){return JSON.stringify(value).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));}
const BASE64_ALPHABET="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function verifyEncodedBlock(encoded,bytes){if(encoded.length!==Math.ceil(bytes.length/3)*4)throw backupError("BASE64","Verifica della codifica documento non riuscita.");for(let i=0,j=0;i<bytes.length;i+=3,j+=4){const a=bytes[i],b=i+1<bytes.length?bytes[i+1]:0,c=i+2<bytes.length?bytes[i+2]:0;if(encoded[j]!==BASE64_ALPHABET[a>>>2]||encoded[j+1]!==BASE64_ALPHABET[((a&3)<<4)|(b>>>4)]||encoded[j+2]!==(i+1<bytes.length?BASE64_ALPHABET[((b&15)<<2)|(c>>>6)]:"=")||encoded[j+3]!==(i+2<bytes.length?BASE64_ALPHABET[c&63]:"="))throw backupError("BASE64","Verifica della codifica documento non riuscita.")}}
async function createLegacyFile(header,keys,readDocument,fileName,{onProgress=()=>{},signal}={}){
 const parts=[],block=3*8192;let maxBufferBytes=0,maxEncodedChars=0,readBytes=0;
 try{
  for(let index=0;index<keys.length;index++){
   checkAbort(signal);const record=await readDocument(keys[index]);if(!record||!(record.blob instanceof Blob))throw backupError("READ","Documento non leggibile durante il backup.");
   const blob=record.blob,hash=new Sha256,documentParts=[];
   onProgress("Preparazione documenti",index,keys.length);
   for(let offset=0;offset<blob.size;offset+=block){
    checkAbort(signal);const bytes=new Uint8Array(await readWindow(blob.slice(offset,Math.min(offset+block,blob.size))));
    if(bytes.length!==Math.min(block,blob.size-offset))throw backupError("READ","Lettura incompleta di un documento durante il backup.");
    readBytes+=bytes.length;maxBufferBytes=Math.max(maxBufferBytes,bytes.length);
    const encoded=btoa(String.fromCharCode(...bytes));verifyEncodedBlock(encoded,bytes);
    hash.update(bytes);documentParts.push(new Blob([encoded]));maxEncodedChars=Math.max(maxEncodedChars,encoded.length);
    if((offset+bytes.length)%(block*32)===0||offset+bytes.length===blob.size){onProgress("Preparazione documenti",index,keys.length,{loadedBytes:offset+bytes.length,totalBytes:blob.size});await pause()}
   }
   const metadata={id:String(record.id),originalName:String(record.originalName||"documento"),title:String(record.title||record.originalName||"Documento"),mimeType:String(record.mimeType||blob.type||"application/octet-stream"),size:blob.size,createdAt:Number(record.createdAt||Date.now()),section:String(record.section||"common"),sha256:hash.hex()};
   if(index)parts.push(new Blob([',']));parts.push(new Blob([asciiJson(metadata).slice(0,-1)+',"dataBase64":"',...documentParts,'"}']));documentParts.length=0;onProgress("Documenti completati",index+1,keys.length);
  }
  const body=new Blob(parts);parts.length=0;const cleanHeader={...header};delete cleanHeader.documents;delete cleanHeader.metadata;
  const metadata={...header.metadata,documents:keys.length,approximateBytes:0};onProgress("Preparazione schede e fotografie",0,0);
  const complete=await jsonBlob(cleanHeader);
  if(complete.size>MAX_HEADER_BYTES)throw backupError("METADATA_LIMIT","Schede, fotografie e metadati superano il limite di sicurezza di 32 MB. Nessun backup incompleto è stato prodotto.");
  const stem=complete.slice(0,complete.size-1);let prefix;
  for(let attempt=0;attempt<4;attempt++){checkAbort(signal);prefix=new Blob([stem,complete.size>2?',':'', '"metadata":'+asciiJson(metadata)+',"documents":[']);const size=prefix.size+body.size+2;if(metadata.approximateBytes===size)break;metadata.approximateBytes=size;}
  // The reader applies the same cumulative header budget, including metadata and field names.
  if(prefix.size>MAX_HEADER_BYTES)throw backupError("METADATA_LIMIT","Schede, fotografie e metadati superano il limite di sicurezza di 32 MB.");
  const file=new File([prefix,body,']}'],fileName,{type:"application/json"});onProgress("Backup completo pronto",1,1);return{file,maxBufferBytes,maxEncodedChars,readBytes};
 }catch(error){if(error instanceof RangeError)throw backupError("MEMORY","Memoria insufficiente durante la preparazione del backup. I dati originali sono invariati.");throw error}
}
return Object.freeze({DEFAULT_CHUNK_BYTES,MAX_HEADER_BYTES,MAX_DOCUMENT_METADATA_BYTES,parseLegacyBackup,estimateBinaryBytes,estimateCapacity,createSha256:()=>new Sha256,createLegacyFile,jsonBlob});
});
