import {operationalCode,operationalAvailability} from "./shared-calendar-operational.js";
import {centralIdentity,handleCentral,secretarySQL,vehicleLocationSQL,vehicleBoundarySQL,vehicleReservationSQL} from "./shared-calendar-central-secretary.js";
import {handleSecretaryReminders} from "./shared-calendar-secretary-reminders.js";
// Calendar-only API. Loaded lazily by the Worker only with the explicit flag.
import {hydrateEvents,saveEvent,calendarInstructorSQL} from "./shared-calendar-events.js";
import {handleCoordination,refreshPrograms,agendaUpdateSummary} from "./shared-calendar-coordination.js";
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const text=(value,max=120,optional=false)=>{if(optional&&(value==null||value===""))return "";if(typeof value!=="string"||!value.trim()||value.length>max)fail(400,"Campo non valido.");return value.trim()};
const instant=value=>{if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))fail(400,"Data o orario non valido.");const day=value.slice(0,10),clock=value.slice(11,16);if(new Date(day+"T00:00:00Z").toISOString().slice(0,10)!==day||Number(clock.slice(0,2))>23||Number(clock.slice(3))>59||Number(value.slice(17,19).replace(/[^0-9]/g,"")||0)>59)fail(400,"Data o orario non valido.");return new Date(value).toISOString()};
const strict=(body,keys)=>{if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))fail(400,"Campi non consentiti.");};
const version=v=>{if(!Number.isSafeInteger(v)||v<1)fail(400,"Versione non valida.");return v};
const instructorTargetSQL="u.active=1 AND u.role='ISTRUTTORE' AND (u.authorization_role IS NULL OR u.authorization_role='ISTRUTTORE') AND u.access_profile IS NULL AND u.is_primary_admin=0";
const vehicles=["DISPONIBILE","TRASFERIMENTO_PROGRAMMATO","IN_TRASFERIMENTO","MANUTENZIONE","NON_UTILIZZABILE","DISMESSO"];
const conflict="L'appuntamento è stato modificato da un altro utente. Ricarica la versione aggiornata prima di continuare.";
// Autonomous local-report authorization: no calendar events, proposals or operational switch.
export async function handleReportScope(request,env,session,role,primary){
 const url=new URL(request.url);if(request.method!=="GET"||url.search)return json({error:"Richiesta non consentita."},400);
 if(session.purpose!=="NORMAL"||!["ADMIN","SEGRETERIA"].includes(role)||(request.headers.get("origin")&&request.headers.get("origin")!==url.origin)||request.headers.get("sec-fetch-site")==="cross-site")return json({error:"Accesso non consentito."},403);
 const q=(sql,...args)=>env.DB.prepare(sql).bind(...args),all=async(sql,...args)=>(await q(sql,...args).all()).results;
 const central=role==="SEGRETERIA"?await centralIdentity(q,session.user.id):null;
 const sites=await all(primary||central?"SELECT id,name,active FROM calendar_sites WHERE active=1 ORDER BY name,id":"SELECT z.id,z.name,z.active FROM calendar_sites z JOIN calendar_user_sites a ON a.site_id=z.id WHERE a.user_id=? AND z.active=1 ORDER BY z.name,z.id",...(primary||central?[]:[session.user.id]));
 const ids=sites.map(s=>s.id),own=primary?ids:(await all("SELECT a.site_id FROM calendar_user_sites a JOIN calendar_sites z ON z.id=a.site_id WHERE a.user_id=? AND z.active=1",session.user.id)).map(r=>r.site_id);
 return json({sites,config:{enabled:true,manage:true,central:!!central,sites:ids,writeSites:own,examWriteSites:central?ids:own}});
}
export async function handleCalendar(request,env,session,role,primary){
 const url=new URL(request.url),route=url.pathname.slice("/api/calendar/".length),method=request.method;
 if(!["true",true].includes(env.SHARED_CALENDAR_ENABLED))return json({error:"Risorsa non disponibile."},404);
 if(session.purpose!=="NORMAL"||!["ISTRUTTORE","ADMIN","SEGRETERIA"].includes(role))return json({error:"Accesso non consentito."},403);
 if((request.headers.get("origin")&&request.headers.get("origin")!==url.origin)||request.headers.get("sec-fetch-site")==="cross-site"||(method!=="GET"&&request.headers.get("origin")!==url.origin))return json({error:"Richiesta non autorizzata."},403);
 const db=env.DB,user=session.user.id,globalManage=primary,manage=primary||role==="SEGRETERIA"||role==="ADMIN",requiredSites=new Set(),examSites=new Set(),now=new Date().toISOString();
 const q=(sql,...args)=>db.prepare(sql).bind(...args),all=async(sql,...args)=>(await q(sql,...args).all()).results;
 let capacityContext=null,central=null,writeIds=[],vehicleOperation=false,adminGlobalOperation=false,assignmentSites=[],designationVersion=0;
 const batch=async(stmts,guard=null)=>{const checks=[q("INSERT OR REPLACE INTO calendar_write_guard(id,rate_ok) SELECT 1,CASE WHEN count(*)+(SELECT count(*) FROM calendar_coordination_audit WHERE actor_id=? AND created_at>?)<30 THEN 1 ELSE 0 END FROM calendar_event_audit WHERE actor_id=? AND created_at>?",user,new Date(Date.now()-60000).toISOString(),user,new Date(Date.now()-60000).toISOString())];if(!primary)checks.push(q("INSERT OR REPLACE INTO calendar_write_guard(id,assignment_ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM calendar_operational_state WHERE id=1 AND enabled=1) THEN 1 ELSE 0 END"));if(role==="ADMIN"&&!primary&&!adminGlobalOperation)checks.push(q("INSERT OR REPLACE INTO calendar_write_guard(id,assignment_ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.active=1 AND u.role='ADMIN' AND (u.authorization_role IS NULL OR u.authorization_role='ADMIN') AND u.access_profile IS NULL) AND EXISTS(SELECT 1 FROM calendar_user_sites a JOIN calendar_sites z ON z.id=a.site_id WHERE a.user_id=? AND z.active=1) AND NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM calendar_user_sites a JOIN calendar_sites z ON z.id=a.site_id WHERE a.user_id=? AND a.site_id=r.value AND z.active=1)) THEN 1 ELSE 0 END",user,user,JSON.stringify([...requiredSites]),user));if(role==="ISTRUTTORE")checks.push(q("INSERT OR REPLACE INTO calendar_write_guard(id,assignment_ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND access_profile IS NULL AND role='ISTRUTTORE' AND (authorization_role IS NULL OR authorization_role='ISTRUTTORE')) AND NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM calendar_user_sites a JOIN calendar_sites z ON z.id=a.site_id WHERE a.user_id=? AND a.site_id=r.value AND z.active=1)) THEN 1 ELSE 0 END",user,JSON.stringify([...requiredSites]),user));checks.push(q("INSERT OR REPLACE INTO calendar_write_guard(id,assignment_ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND session_version=? AND ((?=1 AND role='ADMIN' AND (authorization_role IS NULL OR authorization_role='ADMIN') AND is_primary_admin=1 AND access_profile IS NULL) OR (?='SEGRETERIA' AND role='ISTRUTTORE' AND (authorization_role IS NULL OR authorization_role='ISTRUTTORE') AND access_profile='SEGRETERIA') OR (?='ADMIN' AND role='ADMIN' AND (authorization_role IS NULL OR authorization_role='ADMIN') AND access_profile IS NULL) OR (?='ISTRUTTORE' AND role='ISTRUTTORE' AND (authorization_role IS NULL OR authorization_role='ISTRUTTORE') AND access_profile IS NULL))) THEN 1 ELSE 0 END",user,session.user.session_version,primary?1:0,role,role,role));if(role==="SEGRETERIA"){
 const centralWrite=!!central&&(vehicleOperation||examSites.size>0);
 if(centralWrite)checks.push(q("INSERT OR REPLACE INTO calendar_write_guard(id,assignment_ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM calendar_central_secretary d JOIN users u ON u.id=d.user_id WHERE d.id=1 AND d.user_id=? AND d.version=? AND "+secretarySQL+") AND NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM calendar_sites z WHERE z.id=r.value AND z.active=1) OR (?=0 AND r.value NOT IN(SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM calendar_user_sites a WHERE a.user_id=? AND a.site_id=r.value))) THEN 1 ELSE 0 END",user,designationVersion,JSON.stringify([...requiredSites]),vehicleOperation?1:0,JSON.stringify([...examSites]),user));
 else checks.push(q("INSERT OR REPLACE INTO calendar_write_guard(id,assignment_ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM calendar_user_sites a JOIN calendar_sites z ON z.id=a.site_id WHERE a.user_id=? AND z.active=1) AND NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM calendar_user_sites a JOIN calendar_sites z ON z.id=a.site_id WHERE a.user_id=? AND a.site_id=r.value AND z.active=1)) THEN 1 ELSE 0 END",user,JSON.stringify([...requiredSites]),user));
 };if(adminGlobalOperation)checks.push(q("INSERT OR REPLACE INTO calendar_write_guard(id,assignment_ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.active=1 AND u.role='ADMIN' AND (u.authorization_role IS NULL OR u.authorization_role='ADMIN') AND u.access_profile IS NULL AND u.is_primary_admin=0) AND NOT EXISTS(SELECT 1 FROM json_each(?) r WHERE NOT EXISTS(SELECT 1 FROM calendar_sites z WHERE z.id=r.value AND z.active=1)) THEN 1 ELSE 0 END",user,JSON.stringify([...requiredSites])));if(guard)checks.push(guard);const refresh=route==="events"||route==="central/exam-vehicles"||["coordination/status","coordination/move","coordination/duplicate","coordination/repeat"].includes(route);return(await db.batch([...checks,...stmts,...(refresh?refreshPrograms(q,user,now,[...requiredSites]):[])])).slice(checks.length,checks.length+stmts.length)};
 const audit=(type,id,action)=>q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) VALUES(?,?,?,?,?)",user,type,id,action,now);
 try{
  const operational=await q("SELECT o.*,u.name AS administrator FROM calendar_operational_state o LEFT JOIN users u ON u.id=o.updated_by WHERE o.id=1").first();
  if(!operational)fail(503,"Stato operativo Agenda non disponibile. Riprova senza modificare dati.");
  if(route==="operational-status"&&(method!=="GET"||url.search))fail(400,"Richiesta non consentita.");
  if(route==="operational-status"&&!primary&&operational.enabled!==1)return json({operational:{enabled:false,available:false,primary:false,version:operational.version},incoming:{count:0,revision:0,counts:{}},response:{revision:0}});
  if(!primary&&operational.enabled!==1)return json({error:"Agenda condivisa temporaneamente sospesa dall’amministratore",code:"CALENDAR_SUSPENDED"},403);
  if(route==="config"&&method==="POST"){
   if(!primary)fail(403,"Operazione riservata al principale.");if(url.search)fail(400,"Parametri non consentiti.");
   const raw=await request.text();if(raw.length>512)fail(413,"Richiesta troppo grande.");let body;try{body=JSON.parse(raw)}catch{fail(400,"Richiesta non valida.")}
   strict(body,["enabled","version"]);if(typeof body.enabled!=="boolean")fail(400,"Stato non valido.");version(body.version);
   const result=await batch([q("UPDATE calendar_operational_state SET enabled=?,version=version+1,updated_at=?,updated_by=? WHERE id=1 AND version=?",body.enabled?1:0,now,user,body.version),
    q("INSERT INTO user_management_audit(id,occurred_at,actor_user_id,action,outcome,reason_code,request_id,actor_user_ref,actor_name) SELECT ?,?,?,?,'SUCCESS','CALENDAR_OPERATIONAL_SWITCH',?,?,? WHERE changes()=1",crypto.randomUUID(),now,user,body.enabled?"ENABLE_SHARED_CALENDAR_USERS":"SUSPEND_SHARED_CALENDAR_USERS",crypto.randomUUID(),user,session.user.name||null)]);
   if(!result[0].meta.changes)fail(409,"Stato modificato da un altro dispositivo. Aggiorna prima di confermare.");
   return json({ok:true});
  }
  central=role==="SEGRETERIA"?await centralIdentity(q,user):null;designationVersion=central?.version||0;
  writeIds=primary?(await all("SELECT id FROM calendar_sites WHERE active=1")).map(s=>s.id):(await all("SELECT a.site_id FROM calendar_user_sites a JOIN calendar_sites s ON s.id=a.site_id WHERE a.user_id=? AND s.active=1",user)).map(s=>s.site_id);
  if(role==="SEGRETERIA"&&!central&&!writeIds.length)fail(403,"Nessuna sede assegnata alla Segreteria.");
  if(route==="central/designation")return json(await handleCentral(request,{q,all,batch,user,now,primary,central,manage,strict,fail,text,instant,version,session,conflict}));
  // Global fleet/assignment scope never changes the ordinary event or sync scope.
  const secondary=role==="ADMIN"&&!primary;
  assignmentSites=role==="ADMIN"?await all("SELECT * FROM calendar_sites WHERE active=1 ORDER BY name,id"):[];
  adminGlobalOperation=secondary&&["memberships","vehicles","movements","central/fleet","central/transfer"].includes(route);
  if(secondary&&route==="coordination/availability"&&method==="POST"){try{adminGlobalOperation=JSON.parse(await request.clone().text()).kind==="vehicle"}catch{}}
  vehicleOperation=!!central&&(route==="vehicles"||route==="movements"||["central/transfer","central/exam-vehicles","coordination/read"].includes(route));
  if(central&&route==="coordination/availability"&&method==="POST"){try{vehicleOperation=JSON.parse(await request.clone().text()).kind==="vehicle"}catch{}}
  const sites=await all(globalManage||central||adminGlobalOperation?"SELECT * FROM calendar_sites"+(primary?"":" WHERE active=1")+" ORDER BY name,id":"SELECT s.* FROM calendar_sites s JOIN calendar_user_sites a ON a.site_id=s.id WHERE a.user_id=?"+((role==="ADMIN"||role==="SEGRETERIA")&&!primary?" AND s.active=1":"")+" ORDER BY s.name,s.id",...(globalManage||central||adminGlobalOperation?[]:[user]));
  const ids=sites.map(s=>s.id),scope=ids.length?ids.map(()=>"?").join(","):"NULL";
  const site=(id,eventType=null)=>{const examAccess=!!central&&eventType==="ESAME";if(examAccess&&!sites.some(s=>s.id===id&&s.active===1))fail(403,"Sede non autorizzata.");if(method==="POST"&&role==="SEGRETERIA"&&!vehicleOperation&&!examAccess&&!writeIds.includes(id))fail(403,"CONSULTAZIONE CENTRALE IN SOLA LETTURA");if(!ids.includes(id)||(role==="ADMIN"&&!primary&&!sites.some(s=>s.id===id&&s.active===1)))fail(403,"Sede non autorizzata.");requiredSites.add(id);if(examAccess)examSites.add(id);return id};
  const vehicleSite=id=>{if(!primary&&!central)return site(id);if(!ids.includes(id))fail(403,"Sede non autorizzata.");requiredSites.add(id);return id};
  if(role==="ISTRUTTORE"&&["vehicles","vehicle-availability","movements","motorcycle-codes"].includes(route))fail(403,"Il parco veicoli non è disponibile per il profilo Istruttore.");
  const proposalEligibility="EXISTS(SELECT 1 FROM users u JOIN calendar_user_sites a ON a.user_id=u.id JOIN calendar_sites z ON z.id=a.site_id WHERE "+calendarInstructorSQL+" AND u.id=p.instructor_id AND a.site_id=p.site_id AND z.active=1)";
  const proposalGuard=(p)=>q("INSERT OR REPLACE INTO calendar_coordination_guard(id,ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM calendar_instructor_proposals p WHERE p.id=? AND p.version=? AND p.state='IN ATTESA' AND p.withdrawn_at IS NULL AND "+proposalEligibility+") THEN 1 ELSE 0 END",p.id,p.version);
  const proposalAudit=(action,p)=>q("INSERT INTO calendar_coordination_audit(actor_id,actor_name,action,entity_id,site_id,version,snapshot,created_at) VALUES(?,?,?,?,?,?,json_object('instructor_id',?,'state',?),?)",user,session.user.name,action,p.id,p.site_id,p.version,p.instructor_id,p.state,now);
  if(route==="proposal-updates"||route==="operational-status"){
   if(method!=="GET"||url.search)fail(400,"Richiesta non consentita.");
   const scope=JSON.stringify(primary?sites.filter(s=>s.active===1).map(s=>s.id):writeIds),ownScope=JSON.stringify(ids),operator=manage?1:0;
   const incoming=await q("SELECT count(*) AS count,COALESCE(MAX((SELECT MAX(seq) FROM calendar_coordination_audit a WHERE a.entity_id=p.id AND a.action='PROPOSTA CREATA')),0) AS revision FROM calendar_instructor_proposals p WHERE ?=1 AND p.state='IN ATTESA' AND p.withdrawn_at IS NULL AND p.site_id IN(SELECT value FROM json_each(?)) AND "+proposalEligibility,operator,scope).first();
   const response=await q("SELECT COALESCE(MAX(a.seq),0) AS revision FROM calendar_coordination_audit a JOIN calendar_instructor_proposals p ON p.id=a.entity_id WHERE a.action IN('PROPOSTA INSERITA','PROPOSTA NON ACCOLTA') AND p.instructor_id=? AND p.personal_archived=0 AND p.withdrawn_at IS NULL AND p.site_id IN(SELECT value FROM json_each(?)) AND "+proposalEligibility,user,ownScope).first();const counts=manage?await all("SELECT p.site_id,count(*) AS count FROM calendar_instructor_proposals p WHERE p.state='IN ATTESA' AND p.withdrawn_at IS NULL AND p.site_id IN(SELECT value FROM json_each(?)) AND "+proposalEligibility+" GROUP BY p.site_id",scope):[];return json({...(route==="operational-status"?{operational:{enabled:operational.enabled===1,available:primary||operational.enabled===1,primary:!!primary,version:operational.version}}:{}),incoming:{count:Number(incoming.count),revision:Number(incoming.revision),counts:Object.fromEntries(counts.map(r=>[r.site_id,Number(r.count)]))},response:{revision:Number(response.revision)}});
  }
  if(route==="proposals"){
   if(method==="GET"){
    if([...url.searchParams.keys()].some(k=>!["site","personal","archived"].includes(k))||url.searchParams.has("personal")&&url.searchParams.get("personal")!=="1")fail(400,"Parametri non consentiti.");
    const personal=role==="ISTRUTTORE"||url.searchParams.get("personal")==="1";if(personal&&!["ADMIN","ISTRUTTORE"].includes(role))fail(403,"Proposte personali non consentite.");
    const sid=site(url.searchParams.get("site"));if(personal&&!await q("SELECT u.id FROM users u JOIN calendar_user_sites a ON a.user_id=u.id JOIN calendar_sites z ON z.id=a.site_id WHERE "+calendarInstructorSQL+" AND u.id=? AND a.site_id=? AND z.active=1",user,sid).first())fail(403,"Nessuna assegnazione personale attiva come istruttore in questa sede.");if(!personal&&!primary&&!writeIds.includes(sid))fail(403,"Non puoi elaborare le guide di questa sede.");
    const archived=url.searchParams.get("archived");if(archived!==null&&(!personal||archived!=="1"))fail(400,"Filtro non consentito.");
    const rows=await all("SELECT p.*,u.name AS instructor_name FROM calendar_instructor_proposals p JOIN users u ON u.id=p.instructor_id WHERE p.site_id=? AND "+proposalEligibility+(personal?" AND p.instructor_id=? AND "+(archived==="1"?"(p.personal_archived=1 OR p.withdrawn_at IS NOT NULL)":"p.personal_archived=0 AND p.withdrawn_at IS NULL"):" AND p.state='IN ATTESA' AND p.withdrawn_at IS NULL")+" ORDER BY p.created_at DESC,p.id LIMIT 100",sid,...(personal?[user]:[]));
    const proposals=[];for(const p of rows){const actual=p.event_id?await q("SELECT e.id,e.site_id,e.starts_at,e.ends_at,e.student_name,e.category,e.status,e.note,(SELECT group_concat(code_snapshot,' · ') FROM calendar_event_operational_resources WHERE event_id=e.id) AS operational_codes FROM calendar_events e WHERE e.id=? AND e.site_id=? AND EXISTS(SELECT 1 FROM calendar_event_instructors i WHERE i.event_id=e.id AND i.user_id=?)",p.event_id,sid,p.instructor_id).first():null;const {request_key,...safe}=p;proposals.push({...safe,state:p.withdrawn_at?"RITIRATA":p.state,actual:actual||null})}return json({proposals});
   }
   if(method!=="POST"||url.search)fail(405,"Operazione non consentita.");
   const raw=await request.text();if(raw.length>4096)fail(413,"Richiesta troppo grande.");let b;try{b=JSON.parse(raw)}catch{fail(400,"Richiesta non valida.")}
   if(Object.hasOwn(b,"personal_action")){
    if(!["ISTRUTTORE","ADMIN"].includes(role))fail(403,"Azione personale non consentita.");strict(b,["id","version","personal_action"]);const p=await q("SELECT * FROM calendar_instructor_proposals WHERE id=? AND instructor_id=?",text(b.id),user).first();if(!p)fail(404,"Proposta personale non disponibile.");site(p.site_id);version(b.version);
    const ownGuard=q("INSERT OR REPLACE INTO calendar_coordination_guard(id,ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM calendar_instructor_proposals p WHERE p.id=? AND p.instructor_id=? AND p.version=? AND "+proposalEligibility+") THEN 1 ELSE 0 END",p.id,user,b.version);
    if(!await q("SELECT p.id FROM calendar_instructor_proposals p WHERE p.id=? AND "+proposalEligibility,p.id).first())fail(403,"Assegnazione personale non più valida.");if(p.version!==b.version)fail(409,"Proposta già aggiornata: consulta l’esito corrente.");
    const action=b.personal_action;if(!['withdraw','archive','restore'].includes(action))fail(400,"Azione non consentita.");if(action==='withdraw'&&(p.state!=='IN ATTESA'||p.withdrawn_at))fail(409,"Proposta già elaborata: consulta l’esito corrente.");if(action!=='withdraw'&&(!['INSERITA','NON ACCOLTA'].includes(p.state)||p.withdrawn_at))fail(409,"Puoi archiviare soltanto una proposta già elaborata.");
    await batch([action==='withdraw'?q("UPDATE calendar_instructor_proposals SET withdrawn_at=?,personal_archived=1,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='IN ATTESA' AND withdrawn_at IS NULL",now,user,now,p.id,b.version):q("UPDATE calendar_instructor_proposals SET personal_archived=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?",action==='archive'?1:0,user,now,p.id,b.version),proposalAudit(action==='withdraw'?'PROPOSTA RITIRATA':action==='archive'?'ARCHIVIA PROPOSTA PERSONALE':'RIPRISTINA PROPOSTA PERSONALE',{...p,state:action==='withdraw'?'RITIRATA':p.state})],ownGuard);return json({ok:true});
   }
   if(role==="ISTRUTTORE"||role==="ADMIN"&&Object.hasOwn(b,"request_key")){
    strict(b,["request_key","site_id","student_name","starts_at","ends_at","category","motorcycle_code","note"]);const sid=site(b.site_id),start=instant(b.starts_at),end=instant(b.ends_at),name=text(b.student_name,120),code=text(b.motorcycle_code,12,true),note=text(b.note,200,true),key=text(b.request_key,80);
    if(!['auto','moto'].includes(b.category)||end<=start||Date.parse(end)-Date.parse(start)>86400000||start<now)fail(400,"Verifica giorno, ora, durata e tipo di guida.");if(/[<>]/.test(name+code+note)||code&&!/^[A-Za-z0-9-]{1,12}$/.test(code))fail(400,"Inserisci soltanto dati organizzativi validi.");
    const personalAssignment="EXISTS(SELECT 1 FROM users u JOIN calendar_user_sites a ON a.user_id=u.id JOIN calendar_sites z ON z.id=a.site_id WHERE "+calendarInstructorSQL+" AND u.id=? AND a.site_id=? AND z.active=1)";if(!(await q("SELECT "+personalAssignment+" AS allowed",user,sid).first()).allowed)fail(403,"Nessuna assegnazione personale attiva come istruttore in questa sede.");
    const personalGuard=q("INSERT OR REPLACE INTO calendar_coordination_guard(id,ok) SELECT 1,CASE WHEN "+personalAssignment+" THEN 1 ELSE 0 END",user,sid);
    const old=await q("SELECT * FROM calendar_instructor_proposals WHERE instructor_id=? AND request_key=?",user,key).first();if(old)return json({id:old.id,state:old.withdrawn_at?"RITIRATA":old.state});
    const id=crypto.randomUUID();await batch([q("INSERT OR IGNORE INTO calendar_instructor_proposals(id,request_key,instructor_id,site_id,student_name,starts_at,ends_at,category,motorcycle_code,note,created_at,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",id,key,user,sid,name,start,end,b.category,code,note,now,now,user),q("INSERT INTO calendar_coordination_audit(actor_id,actor_name,action,entity_id,site_id,version,snapshot,created_at) SELECT ?,?,'PROPOSTA CREATA',?,?,1,'{}',? WHERE changes()=1",user,session.user.name,id,sid,now)],personalGuard);
    const saved=await q("SELECT id,state FROM calendar_instructor_proposals WHERE instructor_id=? AND request_key=?",user,key).first();return json(saved);
   }
   if(!manage)fail(403,"Elaborazione non consentita.");strict(b,["id","version","reason"]);const p=await q("SELECT * FROM calendar_instructor_proposals WHERE id=?",text(b.id)).first();if(!p)fail(404,"Proposta non disponibile.");site(p.site_id);if(!primary&&!writeIds.includes(p.site_id))fail(403,"Non puoi elaborare le guide di questa sede.");version(b.version);if(p.version!==b.version||p.state!=="IN ATTESA"||p.withdrawn_at)fail(409,"Proposta già elaborata. Aggiorna l’elenco.");const reason=text(b.reason,200);if(/[<>]/.test(reason))fail(400,"Inserisci una motivazione in testo semplice.");await batch([q("UPDATE calendar_instructor_proposals SET state='NON ACCOLTA',reason=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?",reason,user,now,p.id,p.version),proposalAudit("PROPOSTA NON ACCOLTA",{...p,state:'NON ACCOLTA'})],proposalGuard(p));return json({ok:true});
  }
  if(route==="reminders"||route==="reminders/catalog")return json(await handleSecretaryReminders(request,{q,all,batch,site,user,now,role,primary,writeIds,strict,text,version,fail}));
  if(route.startsWith("central/"))return json(await handleCentral(request,{q,all,batch,site,vehicleSite,user,now,text,instant,strict,version,fail,conflict,manage,primary,central,role,ids,writeIds,session,hydrateEvents,saveEvent,fleetAdmin:secondary,onCapacity:data=>capacityContext=data}));
  if(route.startsWith("coordination/"))return json(await handleCoordination(request,{q,all,batch,site,user,now,text,instant,strict,version,fail,conflict,manage,primary,central,writeIds,role,ids,session,hydrateEvents,saveEvent,calendarInstructorSQL,onCapacity:data=>capacityContext=data}));
  if(method==="GET"){
   const allowed={config:[],sites:[],"motorcycle-codes":[],events:["site","from","to","deleted"],sync:["cursor","updated_since"],vehicles:["site","at","until","category","type","event"],"vehicle-availability":["site","from","to","event"],instructors:["site"],memberships:[],movements:["vehicle"]};
   if(!allowed[route])fail(404,"Risorsa non trovata.");
   if([...url.searchParams.keys()].some(k=>!allowed[route].includes(k)))fail(400,"Parametri non consentiti.");
   if(route==="config")return json({...(role==="SEGRETERIA"?{officeLabel:writeIds.length?"Segreteria "+sites.filter(s=>writeIds.includes(s.id)).map(s=>s.name).join(" / "):"Segreteria",central:!!central}:{}),enabled:true,coordination:true,manage,central:!!central,vehicleManage:primary||!!central||manage,fleetManage:role==="ADMIN"||!!central,assignmentManage:role==="ADMIN",assignmentSites,...(role==="ADMIN"?{personalProposalSites:(await all("SELECT a.site_id FROM calendar_user_sites a JOIN calendar_sites z ON z.id=a.site_id JOIN users u ON u.id=a.user_id WHERE "+calendarInstructorSQL+" AND u.id=? AND z.active=1 ORDER BY z.name,z.id",user)).map(s=>s.site_id)}:{}), fleetSites:secondary?assignmentSites:sites,operationalCodeManage:primary||!!central||role==="ADMIN",writeSites:writeIds,examWriteSites:central?sites.filter(s=>s.active===1).map(s=>s.id):writeIds,manageCatalog:globalManage,assign:primary,sites:ids,...(primary?{operational:{enabled:operational.enabled===1,version:operational.version,updated_at:operational.updated_at,administrator:operational.administrator||(operational.updated_by?"Amministratore non più disponibile":null)}}:{})});
   if(route==="sites")return json({sites});
   if(route==="motorcycle-codes")return json({codes:globalManage||ids.length?await all("SELECT id,code,sort_order,active,version FROM calendar_motorcycle_codes ORDER BY sort_order,id"):[]});
   if(route==="memberships"){
    if(role!=="ADMIN")fail(403,"Gestione assegnazioni non consentita.");
    if(!primary)return json({sites:assignmentSites,memberships:await all("SELECT a.user_id,a.site_id FROM calendar_user_sites a JOIN users u ON u.id=a.user_id WHERE "+instructorTargetSQL+" ORDER BY a.user_id,a.site_id"),users:await all("SELECT u.id,u.name FROM users u WHERE "+instructorTargetSQL+" ORDER BY u.name,u.id")});
    return json({sites:assignmentSites,memberships:await all("SELECT user_id,site_id FROM calendar_user_sites ORDER BY site_id,user_id"),users:await all("SELECT id,name FROM users WHERE active=1 AND ((access_profile IS NULL AND ((role='ISTRUTTORE' AND (authorization_role IS NULL OR authorization_role='ISTRUTTORE')) OR (role='ADMIN' AND (authorization_role IS NULL OR authorization_role='ADMIN')))) OR (role='ISTRUTTORE' AND (authorization_role IS NULL OR authorization_role='ISTRUTTORE') AND access_profile='SEGRETERIA' AND is_primary_admin=0)) ORDER BY name,id")});
   }
   if(route==="instructors"){
    const id=site(url.searchParams.get("site"));
    return json({instructors:await all("SELECT u.id,u.name FROM users u WHERE "+calendarInstructorSQL+" AND EXISTS(SELECT 1 FROM calendar_user_sites a JOIN calendar_sites s ON s.id=a.site_id WHERE a.user_id=u.id AND a.site_id=? AND s.active=1)"+(role==="ISTRUTTORE"?" AND u.id=?":"")+" ORDER BY u.name,u.id",id,...(role==="ISTRUTTORE"?[user]:[]))});
   }
   if(route==="events"){
    const id=site(url.searchParams.get("site")),from=instant(url.searchParams.get("from")),to=instant(url.searchParams.get("to"));
    if(to<=from||Date.parse(to)-Date.parse(from)>32*86400000)fail(400,"Intervallo massimo: 31 giorni.");
    return json({events:await hydrateEvents(await all("SELECT e.* FROM calendar_events e WHERE e.site_id=? AND e.deleted=? AND e.starts_at<? AND e.ends_at>?"+(role==="ISTRUTTORE"?" AND EXISTS(SELECT 1 FROM calendar_event_instructors own WHERE own.event_id=e.id AND own.user_id=?)":"")+" ORDER BY e.starts_at,e.id",id,url.searchParams.get("deleted")==="1"&&manage?1:0,to,from,...(role==="ISTRUTTORE"?[user]:[])),all)});
   }
   if(route==="sync"){
    const cursor=Number(url.searchParams.get("cursor")||0);
    if(!Number.isSafeInteger(cursor)||cursor<0)fail(400,"Cursore non valido.");
    const since=url.searchParams.has("updated_since")?instant(url.searchParams.get("updated_since")):"";
    const agendaUpdate=role==="ISTRUTTORE"?await agendaUpdateSummary({q,user,role,ids,now}):null;
    // A global monotonic sequence avoids timestamp ties; current rows are sent,
    // not obsolete versions. Last successful cursor advances only on commit.
    const rows=await all("SELECT e.*,(SELECT MAX(a.seq) FROM calendar_event_audit a WHERE a.entity_type='event' AND a.entity_id=e.id) AS change_seq FROM calendar_events e WHERE e.site_id IN ("+scope+") AND change_seq>? AND e.updated_at>=?"+(role==="ISTRUTTORE"?" AND EXISTS(SELECT 1 FROM calendar_event_instructors own WHERE own.event_id=e.id AND own.user_id=?)":"")+" ORDER BY change_seq,e.id LIMIT 200",...ids,cursor,since,...(role==="ISTRUTTORE"?[user]:[]));
    const visibleIds=(await all("SELECT id FROM calendar_events WHERE site_id IN ("+scope+") AND deleted=0"+(role==="ISTRUTTORE"?" AND EXISTS(SELECT 1 FROM calendar_event_instructors own WHERE own.event_id=calendar_events.id AND own.user_id=?)":""),...ids,...(role==="ISTRUTTORE"?[user]:[]))).map(e=>e.id);
    return json({...(role==="ISTRUTTORE"?{agendaUpdate}:{}),visibleIds,events:await hydrateEvents(rows,all),cursor:rows.length?rows.at(-1).change_seq:cursor,more:rows.length===200,sites,scope:ids});
   }
   if(route==="vehicle-availability"){
    const sid=site(url.searchParams.get("site")),start=instant(url.searchParams.get("from")),end=instant(url.searchParams.get("to"));if(end<=start||Date.parse(end)-Date.parse(start)>86400000)fail(400,"Seleziona una fascia valida di massimo 24 ore.");
    const exclude=url.searchParams.get("event")||"";if(exclude){const e=await q("SELECT site_id FROM calendar_events WHERE id=?",exclude).first();if(!e)fail(404,"Appuntamento non disponibile.");site(e.site_id)}
    return json(await operationalAvailability(all,{site_id:sid,starts_at:start,ends_at:end,exclude}));
   }
   if(route==="vehicles"){
    const id=site(url.searchParams.get("site")),at=instant(url.searchParams.get("at")||now),until=instant(url.searchParams.get("until")||at);
    if(new Set(url.searchParams.keys()).size!==[...url.searchParams.keys()].length)fail(400,"Parametri duplicati non consentiti.");
    const rows=await all("SELECT v.*,"+vehicleLocationSQL("v","clock.at")+" AS current_site_id FROM calendar_vehicles v CROSS JOIN(SELECT ? AS at) clock WHERE "+vehicleLocationSQL("v","clock.at")+"=? ORDER BY v.name,v.id",at,id);
    const category=url.searchParams.get("category"),vehicleType=url.searchParams.get("type");if(vehicleType&&!["Auto","Moto"].includes(vehicleType))fail(400,"Tipo di veicolo non valido.");
    if(until<at)fail(400,"Intervallo non valido.");
    const excluded=url.searchParams.get("event")||"";if(excluded){const row=await q("SELECT site_id FROM calendar_events WHERE id=?",excluded).first();if(!row)fail(404,"Appuntamento non trovato.");site(row.site_id)}
    const crossing=new Set((await all("SELECT v.id FROM calendar_vehicles v CROSS JOIN(SELECT ? AS starts_at,? AS ends_at) clock WHERE "+vehicleBoundarySQL("v.id","clock.starts_at","clock.ends_at"),at,until)).map(v=>v.id));
    const unavailable=new Set(category||vehicleType?(await all("SELECT vehicle_id FROM calendar_vehicle_movements WHERE effective_at>? AND effective_at<? UNION SELECT x.vehicle_id FROM calendar_events e JOIN calendar_event_vehicles x ON x.event_id=e.id WHERE "+vehicleReservationSQL()+" AND e.deleted=0 AND e.status NOT IN ('ANNULLATA','ANNULLATO') AND e.starts_at<? AND e.ends_at>? AND e.id<>?",at,until,until,at,excluded)).map(x=>x.vehicle_id):[]);
    const blockedAvailability=new Set((await all("SELECT resource_id FROM calendar_resource_availability WHERE kind='vehicle' AND deleted=0 AND reason IN('MANUTENZIONE','GUASTO','TEMPORANEAMENTE FUORI SEDE') AND site_id=? AND starts_at<? AND ends_at>?",id,until,at)).map(x=>x.resource_id));
    return json({vehicles:rows.filter(v=>v.current_site_id===id&&(!(category||vehicleType)||!blockedAvailability.has(v.id))&&!unavailable.has(v.id)&&(!(category||vehicleType)||!crossing.has(v.id))&&(!vehicleType||(v.type===vehicleType&&["DISPONIBILE","TRASFERIMENTO_PROGRAMMATO"].includes(v.status)))&&(!category||(JSON.parse(v.categories).includes(category)&&["DISPONIBILE","TRASFERIMENTO_PROGRAMMATO"].includes(v.status)))).map(v=>({...v,categories:JSON.parse(v.categories)})),until});
   }
   if(route==="movements"){
    if(!manage)fail(403,"Operazione non consentita.");
    const vehicle=text(url.searchParams.get("vehicle")),v=await q("SELECT site_id FROM calendar_vehicles WHERE id=?",vehicle).first();if(!v)fail(404,"Veicolo non trovato.");site(v.site_id);const movements=await all("SELECT * FROM calendar_vehicle_movements WHERE vehicle_id=? ORDER BY effective_at,id",vehicle);for(const m of movements){site(m.from_site_id);site(m.to_site_id)}return json({movements});
   }
  }
  if(method!=="POST")fail(405,"Operazione non consentita.");
  if(!manage)fail(403,"Agenda in sola lettura.");
  if(url.search)fail(400,"Parametri non consentiti.");
  const raw=await request.text();if(raw.length>8192)fail(413,"Richiesta troppo grande.");
  let b;try{b=JSON.parse(raw)}catch{fail(400,"Richiesta non valida.")}
  const count=await q("SELECT count(*) AS n FROM calendar_event_audit WHERE actor_id=? AND created_at>?",user,new Date(Date.now()-60000).toISOString()).first();
  if(count.n>=30)fail(429,"Troppe modifiche. Attendi un minuto.");
  if(route==="motorcycle-codes"){
   if(!globalManage)fail(403,"Gestione catalogo non consentita.");strict(b,["id","code","sort_order","active","version"]);
   const code=text(b.code,80).normalize("NFKC").replace(/\s+/g,"").toUpperCase();
   if(!/^[A-Z0-9-]{1,20}$/.test(code)||!Number.isSafeInteger(b.sort_order)||b.sort_order<0||b.sort_order>100000||typeof b.active!=="boolean")fail(400,"Sigla, ordine o stato non validi.");
   const id=b.id?text(b.id):crypto.randomUUID(),active=b.active?1:0;
   const stmt=b.id?q("UPDATE calendar_motorcycle_codes SET code=?,normalized_code=?,sort_order=?,active=?,version=version+1,updated_at=? WHERE id=? AND version=?",code,code,b.sort_order,active,now,id,version(b.version)):q("INSERT INTO calendar_motorcycle_codes(id,code,normalized_code,sort_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",id,code,code,b.sort_order,active,now,now);
   const result=await batch([stmt,q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) SELECT ?,'motorcycle_code',?,?,? WHERE changes()=1",user,id,b.id?(active?"UPDATE":"DEACTIVATE"):"CREATE",now)]);
   if(!result[0].meta.changes)fail(409,conflict);return json({id});
  }
  if(route==="memberships"){
   if(role!=="ADMIN")fail(403,"Gestione assegnazioni non consentita.");
   strict(b,["user_id","site_id","assigned"]);site(b.site_id);text(b.user_id);
   if(typeof b.assigned!=="boolean")fail(400,"Assegnazione non valida.");
   const eligible=primary?"u.active=1 AND ((u.access_profile IS NULL AND ((u.role='ISTRUTTORE' AND (u.authorization_role IS NULL OR u.authorization_role='ISTRUTTORE')) OR (u.role='ADMIN' AND (u.authorization_role IS NULL OR u.authorization_role='ADMIN')))) OR (u.role='ISTRUTTORE' AND (u.authorization_role IS NULL OR u.authorization_role='ISTRUTTORE') AND u.access_profile='SEGRETERIA' AND u.is_primary_admin=0))":instructorTargetSQL;
   if(!await q("SELECT u.id FROM users u WHERE u.id=? AND "+eligible,b.user_id).first())fail(403,"Seleziona un account Istruttore attivo e coerente. Gli altri profili sono protetti.");
   const future="EXISTS(SELECT 1 FROM calendar_events e JOIN calendar_event_instructors i ON i.event_id=e.id WHERE i.user_id=? AND e.site_id=? AND e.ends_at>? AND e.deleted=0 AND e.status NOT IN('ANNULLATA','ANNULLATO'))";
   if(!b.assigned&&(await q("SELECT "+future+" AS present",b.user_id,b.site_id,now).first()).present)fail(409,"L’istruttore ha appuntamenti futuri o in corso nella sede. Gestiscili esplicitamente nell’Agenda prima di rimuovere l’assegnazione.");
   const guard=q("INSERT OR REPLACE INTO calendar_coordination_guard(id,ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=? AND "+eligible+") AND (?=1 OR NOT "+future+") THEN 1 ELSE 0 END",b.user_id,b.assigned?1:0,b.user_id,b.site_id,now);
   await batch([q("INSERT INTO calendar_coordination_audit(actor_id,actor_name,action,entity_id,site_id,version,snapshot,created_at) VALUES(?,?,'ASSEGNAZIONE ISTRUTTORE',?,?,1,json_object('assigned',?,'previous',EXISTS(SELECT 1 FROM calendar_user_sites WHERE user_id=? AND site_id=?)),?)",user,session.user.name,b.user_id,b.site_id,b.assigned?1:0,b.user_id,b.site_id,now),b.assigned?q("INSERT OR IGNORE INTO calendar_user_sites(user_id,site_id) VALUES(?,?)",b.user_id,b.site_id):q("DELETE FROM calendar_user_sites WHERE user_id=? AND site_id=?",b.user_id,b.site_id),audit("membership",b.user_id,(b.assigned?"ASSIGN:":"REVOKE:")+b.site_id)],guard);return json({ok:true});
  }
  if(route==="sites"){
   if(!globalManage)fail(403,"Gestione sedi non consentita.");strict(b,["id","name","active","version"]);const name=text(b.name),active=b.active===true?1:b.active===false?0:fail(400,"Stato non valido."),id=b.id?site(b.id):crypto.randomUUID();
   const statement=b.id?q("UPDATE calendar_sites SET name=?,active=?,version=version+1,updated_at=? WHERE id=? AND version=?",name,active,now,id,version(b.version)):q("INSERT INTO calendar_sites(id,name,active,created_at,updated_at) VALUES(?,?,?,?,?)",id,name,active,now,now);
   const result=await batch([statement,q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) SELECT ?,'site',?,?,? WHERE changes()=1",user,id,b.id?"UPDATE":"CREATE",now)]);
   if(!result[0].meta.changes)fail(409,conflict);return json({id});
  }
  if(route==="vehicles"){
   strict(b,["id","name","plate","type","categories","transmission","site_id","usual_site_id","status","mileage","version","operational_code"]);
   if(Object.hasOwn(b,"operational_code")&&!primary&&!central&&role!=="ADMIN")fail(403,"La modifica della sigla operativa è riservata agli amministratori autorizzati e alla Segreteria centrale.");
   const name=text(b.name),plate=text(b.plate,20,true).normalize("NFKC").replace(/\s+/g,"").toUpperCase(),type=b.type,cats=b.categories;
   if(!["Auto","Moto"].includes(type)||!Array.isArray(cats)||!cats.length||cats.length>20||!vehicles.includes(b.status)||!["","manuale","automatico"].includes(b.transmission||""))fail(400,"Veicolo non valido.");
   cats.forEach(c=>text(c,40));if(b.usual_site_id)site(b.usual_site_id);
   const mileage=b.mileage??null;if(mileage!==null&&(!Number.isFinite(mileage)||mileage<0))fail(400,"Chilometraggio non valido.");
   const id=b.id?text(b.id):crypto.randomUUID(),old=b.id?await q("SELECT * FROM calendar_vehicles WHERE id=?",id).first():null;
   let currentVehicleSite=null;if(old){const located=await q("SELECT "+vehicleLocationSQL("v","clock.at")+" AS site FROM calendar_vehicles v CROSS JOIN(SELECT ? AS at) clock WHERE v.id=?",now,id).first();currentVehicleSite=site(located.site)}else site(b.site_id);
   if(b.id&&(!old||old.site_id!==b.site_id))fail(400,"Per cambiare sede usa SPOSTA VEICOLO.");
   const code=operationalCode(Object.hasOwn(b,"operational_code")?b.operational_code:old?.operational_code);
   const args=[name,plate,type,JSON.stringify(cats),b.transmission||"",b.usual_site_id||null,b.status,mileage,code,now];
   const stmt=b.id?q("UPDATE calendar_vehicles SET name=?,plate=?,type=?,categories=?,transmission=?,usual_site_id=?,status=?,mileage=?,operational_code=?,updated_at=?,version=version+1 WHERE id=? AND version=?",...args,id,version(b.version)):q("INSERT INTO calendar_vehicles(name,plate,type,categories,transmission,usual_site_id,status,mileage,operational_code,updated_at,id,site_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",...args,id,b.site_id,now);
   const plateGuard=q("INSERT OR REPLACE INTO calendar_write_guard(id,vehicle_ok) SELECT 1,CASE WHEN ?='' OR ?='DISMESSO' OR NOT EXISTS(SELECT 1 FROM calendar_vehicles WHERE id<>? AND status<>'DISMESSO' AND upper(replace(trim(plate),' ',''))=?) THEN 1 ELSE 0 END",plate,b.status,id,plate);
   if(plate&&b.status!=="DISMESSO"&&(await all("SELECT id FROM calendar_vehicles WHERE id<>? AND status<>'DISMESSO' AND upper(replace(trim(plate),' ',''))=?",id,plate)).length)fail(409,"Esiste già un veicolo attivo con questa targa.");
   const vehicleScopeGuard=old&&!primary&&!central?q("INSERT OR REPLACE INTO calendar_coordination_guard(id,ok) SELECT 1,CASE WHEN EXISTS(SELECT 1 FROM calendar_vehicles v CROSS JOIN(SELECT ? AS at) clock WHERE v.id=? AND v.version=? AND "+vehicleLocationSQL("v","clock.at")+"=?) THEN 1 ELSE 0 END",now,id,version(b.version),currentVehicleSite):null;
   const result=await batch([plateGuard,stmt,q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) SELECT ?,'vehicle',?,?,? WHERE changes()=1",user,id,b.id?"UPDATE":"CREATE",now),...(secondary?[q("INSERT INTO calendar_coordination_audit(actor_id,actor_name,action,entity_id,site_id,version,snapshot,created_at) SELECT ?,?,'GESTIONE MEZZO',?,?,1,?,? WHERE EXISTS(SELECT 1 FROM calendar_vehicles WHERE id=?)",user,session.user.name,id,b.usual_site_id||b.site_id,JSON.stringify({before:old,after:{...b,plate}}),now,id)]:[])],vehicleScopeGuard);
   if(!result[1].meta.changes)fail(409,conflict);return json({id});
  }
  if(route==="movements"){
   strict(b,["vehicle_id","to_site_id","effective_at","mileage","reason","confirm_conflicts","version"]);
   const id=text(b.vehicle_id),to=site(b.to_site_id),at=instant(b.effective_at);
   if(at<now)fail(400,"Il trasferimento non può essere retroattivo.");
   const v=await q("SELECT * FROM calendar_vehicles WHERE id=?",id).first();if(!v)fail(404,"Veicolo non trovato.");site(v.site_id);
   if(await q("SELECT id FROM calendar_vehicle_transfers WHERE vehicle_id=? AND deleted=0 AND COALESCE(ends_at,'9999-12-31')>?",id,at).first())fail(409,"Esiste un trasferimento centrale con un intervallo incompatibile. Consulta il parco aziendale.");
   const later=await q("SELECT id FROM calendar_vehicle_movements WHERE vehicle_id=? AND effective_at>=? AND NOT EXISTS(SELECT 1 FROM calendar_vehicle_movement_revocations r WHERE r.movement_id=calendar_vehicle_movements.id)",id,at).first();if(later)fail(409,"Esiste già un trasferimento successivo. Non modificato.");
   const last=await q("SELECT to_site_id FROM calendar_vehicle_movements WHERE vehicle_id=? AND NOT EXISTS(SELECT 1 FROM calendar_vehicle_movement_revocations r WHERE r.movement_id=calendar_vehicle_movements.id) ORDER BY effective_at DESC LIMIT 1",id).first(),from=last?.to_site_id||v.usual_site_id||v.site_id;site(from);
   if(to===from)fail(400,"Scegli una sede diversa.");
   const conflicts=await all("SELECT e.id,e.starts_at,e.ends_at,e.site_id,e.version FROM calendar_events e JOIN calendar_event_vehicles x ON x.event_id=e.id WHERE "+vehicleReservationSQL()+" AND x.vehicle_id=? AND e.ends_at>? AND e.deleted=0 AND e.status NOT IN('ANNULLATA','ANNULLATO') AND e.site_id<>? ORDER BY e.starts_at,e.id",id,at,to);
   for(const e of conflicts)site(e.site_id);
   if(conflicts.length&&b.confirm_conflicts!==true)return json({error:"Appuntamenti incompatibili: conferma esplicitamente il trasferimento.",conflicts},409);
   const mileage=b.mileage??null;if(mileage!==null&&(!Number.isFinite(mileage)||mileage<0))fail(400,"Chilometraggio non valido.");
   const movement=crypto.randomUUID();
   const transferGuard=q("INSERT OR REPLACE INTO calendar_write_guard(id,transfer_ok) SELECT 1,CASE WHEN ?=1 OR NOT EXISTS(SELECT 1 FROM calendar_events e JOIN calendar_event_vehicles x ON x.event_id=e.id WHERE "+vehicleReservationSQL()+" AND x.vehicle_id=? AND e.ends_at>? AND e.site_id<>? AND e.deleted=0 AND e.status NOT IN('ANNULLATA','ANNULLATO')) THEN 1 ELSE 0 END",b.confirm_conflicts===true?1:0,id,at,to);
   const result=await batch([q("UPDATE calendar_vehicles SET version=version+1,updated_at=? WHERE id=? AND version=?",now,id,version(b.version)),q("INSERT INTO calendar_vehicle_movements(id,vehicle_id,from_site_id,to_site_id,effective_at,mileage,reason,confirmed,actor_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()=1",movement,id,from,to,at,mileage,text(b.reason,200,true),b.confirm_conflicts===true?1:0,user,now),q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) SELECT ?,'movement',?,'TRANSFER',? WHERE changes()=1",user,movement,now)],transferGuard);
   if(!result[0].meta.changes)fail(409,conflict);return json({id:movement,conflicts});
  }
  if(route==="events"){
   let proposal=null;if(Object.hasOwn(b,"proposal_id")||Object.hasOwn(b,"proposal_version")){
    const {proposal_id,proposal_version,...eventBody}=b;b=eventBody;proposal=await q("SELECT * FROM calendar_instructor_proposals WHERE id=?",text(proposal_id)).first();if(!proposal)fail(404,"Proposta non disponibile.");version(proposal_version);if(proposal.version!==proposal_version||proposal.state!=="IN ATTESA"||proposal.withdrawn_at)fail(409,"Proposta già elaborata. Aggiorna l’elenco.");
    site(proposal.site_id);if(!primary&&!writeIds.includes(proposal.site_id))fail(403,"Non puoi elaborare le guide di questa sede.");if(b.id||b.deleted||b.site_id!==proposal.site_id||(b.event_type&&b.event_type!=="GUIDA")||b.instructor_id!==proposal.instructor_id||!['PROGRAMMATA','CONFERMATA'].includes(b.status))fail(400,"Inserisci una nuova guida per l’istruttore e la sede della proposta.");
   }
   return json(await saveEvent(b,{q,all,batch:proposal?async(ops,guard)=>(await batch([proposalGuard(proposal),...ops],guard)).slice(1):batch,site,user,now,text,instant,strict,version,fail,conflict,completeProposal:proposal?(id,token)=>[q("UPDATE calendar_instructor_proposals SET state='INSERITA',event_id=?,version=version+1,updated_at=?,updated_by=? WHERE id=? AND state='IN ATTESA' AND version=? AND EXISTS(SELECT 1 FROM calendar_events WHERE id=? AND write_token=?)",id,now,user,proposal.id,proposal.version,id,token),proposalAudit("PROPOSTA INSERITA",{...proposal,state:'INSERITA'})]:null,onCapacity:data=>capacityContext=data}));
  }
  fail(404,"Risorsa non trovata.");
 }catch(e){
  const reason=String(e.message||"");
  if(reason.includes("CALENDAR_OPERATIONAL_CAPACITY")){let details=[];if(capacityContext){const a=await operationalAvailability(all,{...capacityContext,exclude:capacityContext.id});const requests=capacityContext.resources||[];details=a.groups.map(g=>({code:g.code,type:g.type,requested:requests.filter(r=>r.code===g.code&&r.type===g.type).length,available:g.available})).filter(g=>g.requested>g.available);}return json({error:"Non sono disponibili abbastanza veicoli con sigla "+(details[0]?.code||"richiesta")+" nella sede e nella fascia oraria selezionate.",code:"VEHICLE_CAPACITY",capacity:details},409);}
  if(reason.includes("CALENDAR_COORDINATION_CONFLICT"))return json({error:"Conflitto organizzativo: risorsa indisponibile, prenotata o appuntamento modificato. Aggiorna e verifica il periodo."},409);
  if(reason.includes("CALENDAR_REMINDER_CONFLICT"))return json({error:"Promemoria o catalogo modificati: ricarica prima di salvare."},409);
  if(reason.includes("calendar_secretary_reminder_catalog.site_id"))return json({error:"Sigla già presente, anche se disattivata."},409);
  if(reason.includes("calendar_motorcycle_codes.normalized_code"))return json({error:"Sigla già presente, anche se disattivata."},409);
  if(reason.includes("CALENDAR_MOTORCYCLE_CODE"))return json({error:"Sigla moto modificata o non disponibile. Ricarica il catalogo prima di salvare."},409);
  if(reason.includes("CALENDAR_RATE"))return json({error:"Troppe modifiche. Attendi un minuto."},429);
  if(reason.includes("CALENDAR_TRANSFER_CONFLICT"))return json({error:"Sono comparsi nuovi appuntamenti incompatibili. Ricarica prima di confermare."},409);
  if(reason.includes("CALENDAR_CONFLICT"))return json({error:"Conflitto: istruttore, allievo o veicolo già impegnato."},409);
  if(reason.includes("CALENDAR_ASSIGNMENT")&&!primary){const current=await q("SELECT enabled FROM calendar_operational_state WHERE id=1").first();if(current?.enabled!==1)return json({error:"Agenda condivisa temporaneamente sospesa dall’amministratore",code:"CALENDAR_SUSPENDED"},403)}
  if(reason.includes("CALENDAR_ASSIGNMENT")&&role==="SEGRETERIA"){
   const actor=await q("SELECT u.id FROM users u WHERE u.id=? AND u.session_version=? AND "+secretarySQL,user,session.user.session_version).first(),currentCentral=vehicleOperation&&central?await centralIdentity(q,user):null;
   const assigned=await all("SELECT a.site_id FROM calendar_user_sites a JOIN calendar_sites z ON z.id=a.site_id WHERE a.user_id=? AND z.active=1",user),authorized=actor&&(vehicleOperation&&central?currentCentral?.version===designationVersion:assigned.length>0&&[...requiredSites].every(id=>assigned.some(a=>a.site_id===id)));
   return json({error:authorized?"Istruttore non assegnato o sede non disponibile.":"Designazione o assegnazione della Segreteria non più autorizzata."},authorized?409:403);
  }
  if(reason.includes("CALENDAR_ASSIGNMENT")&&role==="ADMIN"&&!primary)return json({error:"Assegnazione alla sede non più valida. Aggiorna prima di modificare."},403);
   if(reason.includes("CALENDAR_ASSIGNMENT"))return json({error:"Istruttore non assegnato o sede non disponibile."},409);
  if(reason.includes("CALENDAR_VEHICLE"))return json({error:route==="vehicles"?"Targa già assegnata a un veicolo attivo. Verifica prima di salvare.":"VEICOLO NON DISPONIBILE IN QUESTA SEDE o nell’orario scelto."},409);
  if(route==="vehicle-availability"&&!e.status)return json({error:"Disponibilità mezzi temporaneamente non disponibile. Riprova il caricamento.",code:"VEHICLE_AVAILABILITY_UNAVAILABLE"},503);
  return json({...(e.conflicts?{conflicts:e.conflicts}:{}),error:e.status?e.message:"Calendario non disponibile. Nessun dato precedente è stato sostituito."},e.status||503);
 }
}
