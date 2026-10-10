// Calendar-only API. Loaded lazily by the Worker only with the explicit flag.
import {hydrateEvents,saveEvent} from "./shared-calendar-events.js";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const text=(value,max=120,optional=false)=>{if(optional&&(value==null||value===""))return "";if(typeof value!=="string"||!value.trim()||value.length>max)fail(400,"Campo non valido.");return value.trim()};
const instant=value=>{if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail(400,"Data o orario non valido.");const day=value.slice(0,10),clock=value.slice(11,16);if(new Date(day+"T00:00:00Z").toISOString().slice(0,10)!==day||Number(clock.slice(0,2))>23||Number(clock.slice(3))>59||Number(value.slice(17,19).replace(/[^0-9]/g,"")||0)>59)fail(400,"Data o orario non valido.");return new Date(value).toISOString()};
const strict=(body,keys)=>{if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))fail(400,"Campi non consentiti.");};
const version=v=>{if(!Number.isSafeInteger(v)||v<1)fail(400,"Versione non valida.");return v};
const vehicles=["DISPONIBILE","TRASFERIMENTO_PROGRAMMATO","IN_TRASFERIMENTO","MANUTENZIONE","NON_UTILIZZABILE","DISMESSO"];
const conflict="L'appuntamento è stato modificato da un altro utente. Ricarica la versione aggiornata prima di continuare.";
export async function handleCalendar(request,env,session,role,primary){
 const url=new URL(request.url),route=url.pathname.slice("/api/calendar/".length),method=request.method;
 if(!["true",true].includes(env.SHARED_CALENDAR_ENABLED))return json({error:"Risorsa non disponibile."},404);
 if(session.purpose!=="NORMAL"||!["ISTRUTTORE","ADMIN","SEGRETERIA"].includes(role))return json({error:"Accesso non consentito."},403);
 if((request.headers.get("origin")&&request.headers.get("origin")!==url.origin)||request.headers.get("sec-fetch-site")==="cross-site"||(method!=="GET"&&request.headers.get("origin")!==url.origin))return json({error:"Richiesta non autorizzata."},403);
 const db=env.DB,user=session.user.id,manage=primary||role==="SEGRETERIA",now=new Date().toISOString();
 const q=(sql,...args)=>db.prepare(sql).bind(...args),all=async(sql,...args)=>(await q(sql,...args).all()).results;
 const batch=async(stmts,guard=null)=>{const checks=[q("INSERT OR REPLACE INTO calendar_write_guard(id,rate_ok) SELECT 1,CASE WHEN count(*)<30 THEN 1 ELSE 0 END FROM calendar_event_audit WHERE actor_id=? AND created_at>?",user,new Date(Date.now()-60000).toISOString())];if(guard)checks.push(guard);return(await db.batch([...checks,...stmts])).slice(checks.length)};
 const audit=(type,id,action)=>q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) VALUES(?,?,?,?,?)",user,type,id,action,now);
 try{
  const sites=await all(manage?"SELECT * FROM calendar_sites ORDER BY name,id":"SELECT s.* FROM calendar_sites s JOIN calendar_user_sites a ON a.site_id=s.id WHERE a.user_id=? ORDER BY s.name,s.id",...(manage?[]:[user]));
  const ids=sites.map(s=>s.id),scope=ids.length?ids.map(()=>"?").join(","):"NULL";
  const site=id=>{if(!ids.includes(id))fail(403,"Sede non autorizzata.");return id};
  if(method==="GET"){
   const allowed={config:[],sites:[],events:["site","from","to","deleted"],sync:["cursor","updated_since"],vehicles:["site","at","until","category","event"],instructors:["site"],memberships:[],movements:["vehicle"]};
   if(!allowed[route])fail(404,"Risorsa non trovata.");
   if([...url.searchParams.keys()].some(k=>!allowed[route].includes(k)))fail(400,"Parametri non consentiti.");
   if(route==="config")return json({enabled:true,manage,assign:primary,sites:ids});
   if(route==="sites")return json({sites});
   if(route==="memberships"){
    if(!primary)fail(403,"Operazione riservata al principale.");
    return json({memberships:await all("SELECT user_id,site_id FROM calendar_user_sites ORDER BY site_id,user_id"),users:await all("SELECT id,name FROM users WHERE active=1 AND access_profile IS NULL AND ((role='ISTRUTTORE' AND (authorization_role IS NULL OR authorization_role='ISTRUTTORE')) OR (role='ADMIN' AND (authorization_role IS NULL OR authorization_role='ADMIN'))) ORDER BY name,id")});
   }
   if(route==="instructors"){
    const id=site(url.searchParams.get("site"));
    return json({instructors:await all("SELECT u.id,u.name FROM users u JOIN calendar_user_sites a ON a.user_id=u.id WHERE a.site_id=? AND u.active=1 AND u.role='ISTRUTTORE' AND (u.authorization_role IS NULL OR u.authorization_role='ISTRUTTORE') AND u.access_profile IS NULL ORDER BY u.name,u.id",id)});
   }
   if(route==="events"){
    const id=site(url.searchParams.get("site")),from=instant(url.searchParams.get("from")),to=instant(url.searchParams.get("to"));
    if(to<=from||Date.parse(to)-Date.parse(from)>32*86400000)fail(400,"Intervallo massimo: 31 giorni.");
    return json({events:await hydrateEvents(await all("SELECT e.* FROM calendar_events e WHERE e.site_id=? AND e.deleted=? AND e.starts_at<? AND e.ends_at>? ORDER BY e.starts_at,e.id",id,url.searchParams.get("deleted")==="1"&&manage?1:0,to,from),all)});
   }
   if(route==="sync"){
    const cursor=Number(url.searchParams.get("cursor")||0);
    if(!Number.isSafeInteger(cursor)||cursor<0)fail(400,"Cursore non valido.");
    const since=url.searchParams.has("updated_since")?instant(url.searchParams.get("updated_since")):"";
    // A global monotonic sequence avoids timestamp ties; current rows are sent,
    // not obsolete versions. Last successful cursor advances only on commit.
    const rows=await all("SELECT e.*,(SELECT MAX(a.seq) FROM calendar_event_audit a WHERE a.entity_type='event' AND a.entity_id=e.id) AS change_seq FROM calendar_events e WHERE e.site_id IN ("+scope+") AND change_seq>? AND e.updated_at>=? ORDER BY change_seq,e.id LIMIT 200",...ids,cursor,since);
    const visibleIds=(await all("SELECT id FROM calendar_events WHERE site_id IN ("+scope+") AND deleted=0",...ids)).map(e=>e.id);
    return json({visibleIds,events:await hydrateEvents(rows,all),cursor:rows.length?rows.at(-1).change_seq:cursor,more:rows.length===200,sites,scope:ids});
   }
   if(route==="vehicles"){
    const id=site(url.searchParams.get("site")),at=instant(url.searchParams.get("at")||now),until=instant(url.searchParams.get("until")||at);
    const rows=await all("SELECT v.*,COALESCE((SELECT m.to_site_id FROM calendar_vehicle_movements m WHERE m.vehicle_id=v.id AND m.effective_at<=? ORDER BY m.effective_at DESC LIMIT 1),v.site_id) AS current_site_id FROM calendar_vehicles v ORDER BY v.name,v.id",at);
    const category=url.searchParams.get("category");
    if(until<at)fail(400,"Intervallo non valido.");
    const excluded=url.searchParams.get("event")||"";if(excluded){const row=await q("SELECT site_id FROM calendar_events WHERE id=?",excluded).first();if(!row)fail(404,"Appuntamento non trovato.");site(row.site_id)}
    const unavailable=new Set(category?(await all("SELECT vehicle_id FROM calendar_vehicle_movements WHERE effective_at>? AND effective_at<? UNION SELECT x.vehicle_id FROM calendar_events e JOIN calendar_event_vehicles x ON x.event_id=e.id WHERE e.deleted=0 AND e.status NOT IN ('ANNULLATA','ANNULLATO') AND e.starts_at<? AND e.ends_at>? AND e.id<>?",at,until,until,at,excluded)).map(x=>x.vehicle_id):[]);
    return json({vehicles:rows.filter(v=>v.current_site_id===id&&!unavailable.has(v.id)&&(!category||(JSON.parse(v.categories).includes(category)&&["DISPONIBILE","TRASFERIMENTO_PROGRAMMATO"].includes(v.status)))).map(v=>({...v,categories:JSON.parse(v.categories)})),until});
   }
   if(route==="movements"){
    if(!manage)fail(403,"Operazione non consentita.");
    return json({movements:await all("SELECT * FROM calendar_vehicle_movements WHERE vehicle_id=? ORDER BY effective_at,id",text(url.searchParams.get("vehicle")))});
   }
  }
  if(method!=="POST")fail(405,"Operazione non consentita.");
  if(!manage)fail(403,"Agenda in sola lettura.");
  if(url.search)fail(400,"Parametri non consentiti.");
  const raw=await request.text();if(raw.length>8192)fail(413,"Richiesta troppo grande.");
  let b;try{b=JSON.parse(raw)}catch{fail(400,"Richiesta non valida.")}
  const count=await q("SELECT count(*) AS n FROM calendar_event_audit WHERE actor_id=? AND created_at>?",user,new Date(Date.now()-60000).toISOString()).first();
  if(count.n>=30)fail(429,"Troppe modifiche. Attendi un minuto.");
  if(route==="memberships"){
   if(!primary)fail(403,"Operazione riservata al principale.");
   strict(b,["user_id","site_id","assigned"]);site(b.site_id);text(b.user_id);
   if(typeof b.assigned!=="boolean")fail(400,"Assegnazione non valida.");
   const target=await q("SELECT id FROM users WHERE id=? AND active=1 AND access_profile IS NULL AND ((role='ISTRUTTORE' AND (authorization_role IS NULL OR authorization_role='ISTRUTTORE')) OR (role='ADMIN' AND (authorization_role IS NULL OR authorization_role='ADMIN')))",b.user_id).first();
   if(!target)fail(400,"Utente non assegnabile.");
   await batch([b.assigned?q("INSERT OR IGNORE INTO calendar_user_sites(user_id,site_id) VALUES(?,?)",b.user_id,b.site_id):q("DELETE FROM calendar_user_sites WHERE user_id=? AND site_id=?",b.user_id,b.site_id),audit("membership",b.user_id,b.assigned?"ASSIGN":"REVOKE")]);return json({ok:true});
  }
  if(route==="sites"){
   strict(b,["id","name","active","version"]);const name=text(b.name),active=b.active===true?1:b.active===false?0:fail(400,"Stato non valido."),id=b.id?site(b.id):crypto.randomUUID();
   const statement=b.id?q("UPDATE calendar_sites SET name=?,active=?,version=version+1,updated_at=? WHERE id=? AND version=?",name,active,now,id,version(b.version)):q("INSERT INTO calendar_sites(id,name,active,created_at,updated_at) VALUES(?,?,?,?,?)",id,name,active,now,now);
   const result=await batch([statement,q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) SELECT ?,'site',?,?,? WHERE changes()=1",user,id,b.id?"UPDATE":"CREATE",now)]);
   if(!result[0].meta.changes)fail(409,conflict);return json({id});
  }
  if(route==="vehicles"){
   strict(b,["id","name","plate","type","categories","transmission","site_id","usual_site_id","status","mileage","version"]);
   const name=text(b.name),plate=text(b.plate,20,true),type=b.type,cats=b.categories;
   if(!["Auto","Moto"].includes(type)||!Array.isArray(cats)||!cats.length||cats.length>20||!vehicles.includes(b.status)||!["","manuale","automatico"].includes(b.transmission||""))fail(400,"Veicolo non valido.");
   cats.forEach(c=>text(c,40));site(b.site_id);if(b.usual_site_id)site(b.usual_site_id);
   const mileage=b.mileage??null;if(mileage!==null&&(!Number.isFinite(mileage)||mileage<0))fail(400,"Chilometraggio non valido.");
   const id=b.id?text(b.id):crypto.randomUUID(),old=b.id?await q("SELECT * FROM calendar_vehicles WHERE id=?",id).first():null;
   if(b.id&&(!old||old.site_id!==b.site_id))fail(400,"Per cambiare sede usa SPOSTA VEICOLO.");
   const args=[name,plate,type,JSON.stringify(cats),b.transmission||"",b.usual_site_id||null,b.status,mileage,now];
   const stmt=b.id?q("UPDATE calendar_vehicles SET name=?,plate=?,type=?,categories=?,transmission=?,usual_site_id=?,status=?,mileage=?,updated_at=?,version=version+1 WHERE id=? AND version=?",...args,id,version(b.version)):q("INSERT INTO calendar_vehicles(name,plate,type,categories,transmission,usual_site_id,status,mileage,updated_at,id,site_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",...args,id,b.site_id,now);
   const result=await batch([stmt,q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) SELECT ?,'vehicle',?,?,? WHERE changes()=1",user,id,b.id?"UPDATE":"CREATE",now)]);
   if(!result[0].meta.changes)fail(409,conflict);return json({id});
  }
  if(route==="movements"){
   strict(b,["vehicle_id","to_site_id","effective_at","mileage","reason","confirm_conflicts","version"]);
   const id=text(b.vehicle_id),to=site(b.to_site_id),at=instant(b.effective_at);
   if(at<now)fail(400,"Il trasferimento non può essere retroattivo.");
   const v=await q("SELECT * FROM calendar_vehicles WHERE id=?",id).first();if(!v)fail(404,"Veicolo non trovato.");
   const later=await q("SELECT id FROM calendar_vehicle_movements WHERE vehicle_id=? AND effective_at>=?",id,at).first();if(later)fail(409,"Esiste già un trasferimento successivo. Non modificato.");
   const last=await q("SELECT to_site_id FROM calendar_vehicle_movements WHERE vehicle_id=? ORDER BY effective_at DESC LIMIT 1",id).first(),from=last?.to_site_id||v.site_id;
   if(to===from)fail(400,"Scegli una sede diversa.");
   const conflicts=await all("SELECT e.id,e.starts_at,e.ends_at,e.site_id,e.version FROM calendar_events e JOIN calendar_event_vehicles x ON x.event_id=e.id WHERE x.vehicle_id=? AND e.ends_at>? AND e.deleted=0 AND e.status NOT IN('ANNULLATA','ANNULLATO') AND e.site_id<>? ORDER BY e.starts_at,e.id",id,at,to);
   if(conflicts.length&&b.confirm_conflicts!==true)return json({error:"Appuntamenti incompatibili: conferma esplicitamente il trasferimento.",conflicts},409);
   const mileage=b.mileage??null;if(mileage!==null&&(!Number.isFinite(mileage)||mileage<0))fail(400,"Chilometraggio non valido.");
   const movement=crypto.randomUUID();
   const transferGuard=q("INSERT OR REPLACE INTO calendar_write_guard(id,transfer_ok) SELECT 1,CASE WHEN ?=1 OR NOT EXISTS(SELECT 1 FROM calendar_events e JOIN calendar_event_vehicles x ON x.event_id=e.id WHERE x.vehicle_id=? AND e.ends_at>? AND e.site_id<>? AND e.deleted=0 AND e.status NOT IN('ANNULLATA','ANNULLATO')) THEN 1 ELSE 0 END",b.confirm_conflicts===true?1:0,id,at,to);
   const result=await batch([q("UPDATE calendar_vehicles SET version=version+1,updated_at=? WHERE id=? AND version=?",now,id,version(b.version)),q("INSERT INTO calendar_vehicle_movements(id,vehicle_id,from_site_id,to_site_id,effective_at,mileage,reason,confirmed,actor_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()=1",movement,id,from,to,at,mileage,text(b.reason,200,true),b.confirm_conflicts===true?1:0,user,now),q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) SELECT ?,'movement',?,'TRANSFER',? WHERE changes()=1",user,movement,now)],transferGuard);
   if(!result[0].meta.changes)fail(409,conflict);return json({id:movement,conflicts});
  }
  if(route==="events")return json(await saveEvent(b,{q,all,batch,site,user,now,text,instant,strict,version,fail,conflict}));
  fail(404,"Risorsa non trovata.");
 }catch(e){
  const reason=String(e.message||"");
  if(reason.includes("CALENDAR_RATE"))return json({error:"Troppe modifiche. Attendi un minuto."},429);
  if(reason.includes("CALENDAR_TRANSFER_CONFLICT"))return json({error:"Sono comparsi nuovi appuntamenti incompatibili. Ricarica prima di confermare."},409);
  if(reason.includes("CALENDAR_CONFLICT"))return json({error:"Conflitto: istruttore, allievo o veicolo già impegnato."},409);
  if(reason.includes("CALENDAR_ASSIGNMENT"))return json({error:"Istruttore non assegnato o sede non disponibile."},409);
  if(reason.includes("CALENDAR_VEHICLE"))return json({error:"Veicolo non disponibile, in un'altra sede o incompatibile."},409);
  return json({error:e.status?e.message:"Calendario non disponibile. Nessun dato precedente è stato sostituito."},e.status||503);
 }
}
