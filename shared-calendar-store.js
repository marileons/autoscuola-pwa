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

 function changes(previous,pages,next,role){
  if(previous.account!==next.account)throw Error("Account calendario non corrispondente.");
  if(role!=="ISTRUTTORE")return{...next,notifications:[],seen:{}};
  const account=next.account,prior=new Map(previous.events.map(e=>[e.id,e])),incoming=new Map(),seen={...(previous.seen||{})},pending=new Map((previous.notifications||[]).filter(n=>next.scope.includes(n.site_id)).map(n=>[n.id,n]));
  for(const page of pages)for(const e of page.events)incoming.set(e.id,e);
  const own=e=>!!e&&(e.instructors||[{id:e.instructor_id}]).some(p=>p.id===account),stamp=e=>String(e.version)+":"+String(e.updated_at||"");
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  for(const e of incoming.values()){
   const old=prior.get(e.id),revision=stamp(e);if(!next.scope.includes(e.site_id)||(!own(e)&&!own(old)))continue;
   if(seen[e.id]===revision)continue;seen[e.id]=revision;
   if(e.updated_by===account){pending.delete(e.id);continue}
   if(old&&stamp(old)===revision)continue;
   const labels=[];
   if(e.deleted)labels.push("Evento eliminato");
   else if(["ANNULLATA","ANNULLATO"].includes(e.status))labels.push("Annullamento");
   else if(!old)labels.push(e.event_type==="ESAME"?"Nuova seduta ESAME":"Nuova guida");
   else{
    if(old.starts_at!==e.starts_at||old.ends_at!==e.ends_at)labels.push("Cambio orario");
    if(old.site_id!==e.site_id)labels.push("Cambio sede");
    if(!same(old.instructors,e.instructors))labels.push(own(e)?"Assegnazione istruttore":"Rimozione assegnazione");
    const a=old.participants||[],b=e.participants||[];
    if(a.length!==b.length)labels.push(b.length>a.length?"Aggiunta partecipante":"Rimozione partecipante");
    if(!same(a.map(p=>[p.id,p.name]),b.map(p=>[p.id,p.name])))labels.push("Cambio allievo");
    if(!same(a.map(p=>p.motorcycle_code_snapshot||""),b.map(p=>p.motorcycle_code_snapshot||"")))labels.push("Cambio sigla moto");
    if(!same(old.vehicles,e.vehicles)||!same(a.map(p=>p.vehicle_id),b.map(p=>p.vehicle_id)))labels.push("Cambio veicolo");
    if(old.category!==e.category)labels.push("Cambio categoria");
    if(old.meeting_point!==e.meeting_point)labels.push("Cambio località");
    if(old.note!==e.note)labels.push("Nota aggiornata");
    if(old.status!==e.status)labels.push("Stato aggiornato");
   }
   if(!labels.length)labels.push("Evento aggiornato");
   pending.set(e.id,{id:e.id,revision,site_id:e.site_id,starts_at:e.starts_at,ends_at:e.ends_at,title:e.event_type==="ESAME"?"ESAME":("GUIDA · "+(e.participants||[]).map(p=>p.name).join(", ")||e.student_name),description:[...new Set(labels)].join(" · "),unavailable:!!e.deleted});
  }
  // A moved event outside the current scope is intentionally not disclosed by sync.
  // Only the previously authorised snapshot can be shown, never its new location.
  const visible=new Set(next.events.map(e=>e.id));
  for(const old of previous.events)if(own(old)&&next.scope.includes(old.site_id)&&!visible.has(old.id)&&!incoming.has(old.id)){
   const revision="unavailable:"+stamp(old);if(seen[old.id]===revision)continue;seen[old.id]=revision;pending.set(old.id,{id:old.id,revision,site_id:old.site_id,starts_at:old.starts_at,ends_at:old.ends_at,title:"Evento precedentemente assegnato",description:"Evento non più disponibile nella sede autorizzata; verifica con la segreteria.",unavailable:true});
  }
  return{...next,notifications:[...pending.values()],seen};
 }

 function scheduler({active,visible,run,setInterval=root.setInterval.bind(root),clearInterval=root.clearInterval.bind(root)}){
  let timer=null,busy=false;
  const tick=async()=>{if(busy||!active()||!visible())return;busy=true;try{await run()}finally{busy=false}};
  return{update(){if(timer!==null){clearInterval(timer);timer=null}if(active()&&visible())timer=setInterval(tick,60000)},tick,stop(){if(timer!==null)clearInterval(timer);timer=null}};
 }
 const api={DB_NAME,create,merge,changes,scheduler};if(typeof module!=="undefined")module.exports=api;root.SharedCalendarStore=api;
})(typeof window!=="undefined"?window:globalThis);
