// Server only. Private notes never join event hydration or instructor documents.
export async function handleSecretaryReminders(request,c){
 const {q,all,batch,site,user,now,role,primary,writeIds,strict,text,version,fail}=c;
 if(!["SEGRETERIA","ADMIN"].includes(role))fail(403,"Promemoria non autorizzati.");
 const url=new URL(request.url),catalog=url.pathname.endsWith("/reminders/catalog");
 const sid=request.method==="GET"?url.searchParams.get("site"):null;
 const authorize=id=>{if(!primary&&!writeIds.includes(id))fail(403,"Sede non autorizzata per i promemoria delle guide.");return site(id)};
 const guard=(sql,...args)=>q("INSERT OR REPLACE INTO calendar_secretary_reminder_guard(id,ok) SELECT 1,CASE WHEN "+sql+" THEN 1 ELSE 0 END",...args);
 const seed=[{id:"default:W",code:"W",description:"Messaggio WhatsApp inviato",active:1,version:0},{id:"default:P",code:"P",description:"Pagato",active:1,version:0}];
 const loadCatalog=async id=>{const rows=await all("SELECT id,code,description,active,version FROM calendar_secretary_reminder_catalog WHERE site_id=? ORDER BY normalized_code,id",id);return [...rows,...seed.filter(x=>!rows.some(r=>r.id===id+":"+x.id)).map(x=>({...x,id:id+":"+x.id}))]};
 if(request.method==="GET"){
  if([...url.searchParams.keys()].some(k=>k!=="site")||url.searchParams.getAll("site").length!==1)fail(400,"Parametri non consentiti.");authorize(sid);
  return {catalog:await loadCatalog(sid),reminders:await all("SELECT r.* FROM calendar_secretary_reminders r JOIN calendar_events e ON e.id=r.event_id JOIN calendar_event_participants p ON p.event_id=r.event_id AND p.participant_key=r.participant_key WHERE e.site_id=? AND e.event_type='GUIDA' AND e.deleted=0 ORDER BY r.event_id,r.participant_key",sid)};
 }
 if(request.method!=="POST")fail(405,"Metodo non consentito.");const raw=await request.text();if(raw.length>16000)fail(413,"Richiesta troppo grande.");let b;try{b=JSON.parse(raw)}catch{fail(400,"Richiesta non valida.")}
 if(catalog){
  strict(b,["site_id","id","version","code","description","active"]);const id=authorize(text(b.site_id)),entries=await loadCatalog(id),prior=b.id?entries.find(x=>x.id===b.id):null;
  if(b.id&&!prior)fail(404,"Voce non disponibile.");if(prior&&b.version!==prior.version)fail(409,"Catalogo modificato: ricarica prima di salvare.");
  const code=text(b.code,12).normalize("NFKC").trim().toLocaleUpperCase("it-IT"),description=text(b.description,120);if(!/^[\p{L}\p{N}]+$/u.test(code)||typeof b.active!=="boolean")fail(400,"Inserisci sigla, descrizione e stato validi.");
  if(entries.some(x=>x.id!==prior?.id&&x.code.normalize("NFKC").trim().toLocaleUpperCase("it-IT")===code))fail(409,"Sigla già presente, anche se disattivata.");
  const cid=prior?.id||crypto.randomUUID(),expected=prior?.version||0;
  await batch([guard("COALESCE((SELECT version FROM calendar_secretary_reminder_catalog WHERE id=?),0)=?",cid,expected),q("INSERT INTO calendar_secretary_reminder_catalog(id,site_id,code,normalized_code,description,active,version) VALUES(?,?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET code=excluded.code,normalized_code=excluded.normalized_code,description=excluded.description,active=excluded.active,version=calendar_secretary_reminder_catalog.version+1",cid,id,code,code,description,b.active?1:0)]);
  return {ok:true};
 }
 strict(b,["event_id","participant_key","event_version","version","selected"]);
 const event=await q("SELECT id,site_id,version,event_type,deleted FROM calendar_events WHERE id=?",text(b.event_id)).first();if(!event)fail(404,"Guida non disponibile.");authorize(event.site_id);
 if(event.event_type!=="GUIDA"||event.deleted)fail(403,"Promemoria disponibili soltanto sulle guide.");version(b.event_version);if(event.version!==b.event_version)fail(409,"Guida modificata: aggiorna prima di continuare.");
 const key=text(b.participant_key,260);if(!await q("SELECT 1 FROM calendar_event_participants WHERE event_id=? AND participant_key=?",event.id,key).first())fail(409,"Allievo modificato: aggiorna la guida.");
 if(!Number.isSafeInteger(b.version)||b.version<0||!Array.isArray(b.selected)||b.selected.length>50||new Set(b.selected).size!==b.selected.length)fail(400,"Selezione non valida.");
 const prior=await q("SELECT * FROM calendar_secretary_reminders WHERE event_id=? AND participant_key=?",event.id,key).first();if((prior?.version||0)!==b.version)fail(409,"Promemoria modificati da un’altra Segreteria. Riapri il menu.");
 const old=JSON.parse(prior?.items||"[]"),entries=await loadCatalog(event.site_id),items=b.selected.map(id=>{const previous=old.find(x=>x.id===id);if(previous)return previous;const item=entries.find(x=>x.id===id&&x.active===1);if(!item)fail(409,"Voce modificata o disattivata. Riapri il menu.");return{id:item.id,code:item.code,description:item.description}});
 await batch([guard("EXISTS(SELECT 1 FROM calendar_events e JOIN calendar_event_participants p ON p.event_id=e.id WHERE e.id=? AND e.version=? AND e.event_type='GUIDA' AND e.deleted=0 AND e.site_id=? AND p.participant_key=?) AND COALESCE((SELECT version FROM calendar_secretary_reminders WHERE event_id=? AND participant_key=?),0)=?",event.id,b.event_version,event.site_id,key,event.id,key,b.version),...items.filter(x=>!old.some(o=>o.id===x.id)).map(x=>{const row=entries.find(r=>r.id===x.id);return guard("COALESCE((SELECT version FROM calendar_secretary_reminder_catalog WHERE id=? AND active=1),0)=? AND NOT EXISTS(SELECT 1 FROM calendar_secretary_reminder_catalog WHERE id=? AND active=0)",x.id,row.version,x.id)}),q("INSERT INTO calendar_secretary_reminders(event_id,participant_key,items,version,updated_by,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(event_id,participant_key) DO UPDATE SET items=excluded.items,version=calendar_secretary_reminders.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at",event.id,key,JSON.stringify(items),user,now)]);
 return {ok:true};
}
