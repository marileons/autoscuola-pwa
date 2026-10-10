"use strict";
(function(root){
 const DB_NAME="agenda_istruttori_shared_calendar";
 function create(indexedDB=root.indexedDB){
  let pending;
  function open(){return pending||(pending=new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore("cache",{keyPath:"account"});r.onsuccess=()=>resolve(r.result);r.onerror=()=>{pending=null;reject(r.error)};r.onblocked=()=>reject(Error("Archivio calendario occupato."))}));}
  async function load(account){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction("cache"),r=tx.objectStore("cache").get(account);tx.oncomplete=()=>resolve(r.result||{account,events:[],sites:[],scope:[],cursor:0,syncedAt:null});tx.onabort=()=>reject(tx.error);r.onerror=()=>reject(r.error)});}
  async function save(snapshot){if(!snapshot.account||!Array.isArray(snapshot.events)||!Array.isArray(snapshot.scope))throw Error("Copia calendario non valida.");const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction("cache","readwrite");tx.objectStore("cache").put(snapshot);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error("Salvataggio calendario non riuscito."));tx.onerror=()=>{};});}
  return{load,save,close:async()=>{if(pending)(await pending).close();pending=null}};
 }
 function merge(previous,pages,account){
  if(previous.account!==account)throw Error("Account calendario non corrispondente.");
  const events=new Map(previous.events.map(e=>[e.id,e]));let cursor=previous.cursor,scope=previous.scope,sites=previous.sites;
  for(const page of pages){
   if(!Array.isArray(page.events)||!Array.isArray(page.scope)||!Array.isArray(page.sites)||!Number.isSafeInteger(page.cursor)||page.cursor<cursor)throw Error("Risposta calendario non valida.");
   scope=page.scope;sites=page.sites;
   if(!Array.isArray(page.visibleIds))throw Error("Elenco autorizzazioni non valido.");
   const visible=new Set(page.visibleIds);for(const id of events.keys())if(!visible.has(id))events.delete(id);
   for(const e of page.events){if(typeof e.id!=="string"||!scope.includes(e.site_id)||!Number.isInteger(e.version)||!Number.isFinite(Date.parse(e.starts_at)))throw Error("Appuntamento non valido.");if(e.deleted)events.delete(e.id);else events.set(e.id,e);}
   cursor=page.cursor;
  }
  return{account,events:[...events.values()].filter(e=>scope.includes(e.site_id)),scope,sites,cursor,syncedAt:new Date().toISOString()};
 }
 function scheduler({active,visible,run,setInterval=root.setInterval.bind(root),clearInterval=root.clearInterval.bind(root)}){
  let timer=null,busy=false;
  const tick=async()=>{if(busy||!active()||!visible())return;busy=true;try{await run()}finally{busy=false}};
  return{update(){if(timer!==null){clearInterval(timer);timer=null}if(active()&&visible())timer=setInterval(tick,60000)},tick,stop(){if(timer!==null)clearInterval(timer);timer=null}};
 }
 const api={DB_NAME,create,merge,scheduler};if(typeof module!=="undefined")module.exports=api;root.SharedCalendarStore=api;
})(typeof window!=="undefined"?window:globalThis);
