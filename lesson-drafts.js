(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.LessonDrafts=api})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
function key(accountId,studentId,lessonId){if(!accountId||!studentId)throw Error("Identità della bozza guida non valida.");return JSON.stringify([String(accountId),String(studentId),String(lessonId||"new")])}
function elapsed(draft,now=Date.now()){return Math.max(0,now-Number(draft.startedAt||now))}
async function signature(draft){const bytes=new TextEncoder().encode(JSON.stringify([draft.accountId,draft.studentId,draft.id,draft.startedAt,draft.date,draft.time,draft.duration,draft.notes,draft.route,draft.errors,draft.checklist,...(draft.activityDraft?[draft.activityDraft]:[])]));const hash=await globalThis.crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("")}
function createStore({indexedDB=globalThis.indexedDB,backend}={}){let opened,queue=Promise.resolve();const serial=task=>{const value=queue.then(task);queue=value.catch(()=>{});return value};
 async function db(){return opened||(opened=new Promise((resolve,reject)=>{const req=indexedDB.open("agenda_istruttori_lesson_drafts",1);req.onupgradeneeded=()=>req.result.createObjectStore("drafts",{keyPath:"key"});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)}))}
 async function operation(mode,action){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction("drafts",mode),request=action(tx.objectStore("drafts"));let value;request.onsuccess=()=>{value=request.result};tx.oncomplete=()=>resolve(clone(value));tx.onerror=tx.onabort=()=>reject(tx.error||Error("Bozza guida non salvata. Mantieni aperta la pagina."))})}
 const io=backend||{get:id=>operation("readonly",s=>s.get(id)),put:value=>operation("readwrite",s=>s.put(value)),remove:id=>operation("readwrite",s=>s.delete(id)),list:()=>operation("readonly",s=>s.getAll())};
 async function changeRows(rows,restore){
  if(backend){for(const row of rows)await (restore?io.put(row):io.remove(row.key));return}
  const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction("drafts","readwrite"),store=tx.objectStore("drafts");for(const row of rows){if(restore)store.put(row);else store.delete(row.key)}tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error("Aggiornamento bozze non riuscito."))});
 }
 async function removeStudents(account,ids){return serial(async()=>{
  if(!account||!Array.isArray(ids)||ids.some(id=>typeof id!=="string"||!id))throw Error("Identità delle bozze non valida.");
  const rows=(await io.list()).filter(row=>row.accountId===String(account)&&ids.includes(row.studentId));
  try{await changeRows(rows,false)}catch(error){await changeRows(rows,true);throw error}
  return()=>serial(async()=>{await changeRows(rows,true);for(const row of rows)if(JSON.stringify(await io.get(row.key))!==JSON.stringify(row))throw Error("Ripristino bozze non verificato.")});
 })}
 return{removeStudents,save(raw){const draft=clone(raw);draft.key=key(draft.accountId,draft.studentId,draft.lessonId);if(!draft.id||!Number.isFinite(draft.startedAt))return Promise.reject(Error("Bozza guida non valida."));draft.elapsedMs=elapsed(draft);return serial(async()=>{await io.put(draft);return clone(draft)})},load:(account,student,lesson)=>serial(()=>io.get(key(account,student,lesson))),remove:(account,student,lesson)=>serial(()=>io.remove(key(account,student,lesson)))}
}
function memoryBackend(){const map=new Map;return{list:async()=>clone([...map.values()]),get:async key=>clone(map.get(key)),put:async value=>map.set(value.key,clone(value)),remove:async key=>map.delete(key)}}
return Object.freeze({key,elapsed,signature,createStore,memoryBackend});
});
