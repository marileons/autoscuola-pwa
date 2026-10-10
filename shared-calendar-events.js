// Organizational sessions only. This module never reads local exams or outcomes.
export async function hydrateEvents(rows,all){
 if(!rows.length)return rows;
 const ids=JSON.stringify(rows.map(e=>e.id)),tables=["calendar_event_instructors","calendar_event_vehicles","calendar_event_participants"];
 const data=await Promise.all(tables.map(t=>all("SELECT * FROM "+t+" WHERE event_id IN(SELECT value FROM json_each(?)) ORDER BY event_id,position",ids)));
 return rows.map(e=>{const {write_token,...safe}=e;return{...safe,instructors:data[0].filter(x=>x.event_id===e.id).map(x=>({id:x.user_id,name:x.name})),vehicles:data[1].filter(x=>x.event_id===e.id).map(x=>({id:x.vehicle_id,name:x.name})),participants:data[2].filter(x=>x.event_id===e.id).map(x=>({id:x.student_id,name:x.name}))}});
}
export async function saveEvent(b,c){
 const {q,all,batch,site,user,now,text,instant,strict,version,fail,conflict}=c;
 strict(b,["id","version","event_type","site_id","starts_at","ends_at","student_id","student_name","category","instructor_id","vehicle_id","instructors","vehicles","participants","meeting_point","examiner","note","status","deleted"]);
 const type=b.event_type||"GUIDA";if(!["GUIDA","ESAME"].includes(type))fail(400,"Tipo evento non valido.");
 const exam=type==="ESAME",states=exam?["PROGRAMMATO","CONFERMATO","ANNULLATO","CONCLUSO"]:["PROGRAMMATA","CONFERMATA","ANNULLATA","ASSENTE","SVOLTA"];
 if(!states.includes(b.status)||(b.deleted!==undefined&&typeof b.deleted!=="boolean"))fail(400,"Stato organizzativo non valido.");
 if(exam&&["student_id","student_name","instructor_id","vehicle_id"].some(k=>k in b))fail(400,"Usa gli elenchi di risorse per la seduta d'esame.");
 if(!exam&&["instructors","vehicles","participants","meeting_point","examiner"].some(k=>k in b))fail(400,"Campi riservati alle sedute d'esame.");
 const id=b.id?text(b.id):crypto.randomUUID(),start=instant(b.starts_at),end=instant(b.ends_at),sid=site(b.site_id),category=text(b.category,40);
 if(end<=start||Date.parse(end)-Date.parse(start)>86400000)fail(400,"L'ora finale deve seguire l'inizio; durata massima 24 ore.");
 const ids=(items,label)=>{if(!Array.isArray(items)||items.length>50)fail(400,"Elenco "+label+" non valido.");const result=items.map(x=>text(x));if(new Set(result).size!==result.length)fail(400,"Risorse duplicate.");return result};
 const instructors=ids(exam?b.instructors:[text(b.instructor_id)],"istruttori"),vehicles=ids(exam?b.vehicles:(b.vehicle_id?[text(b.vehicle_id)]:[]),"veicoli");
 if(!instructors.length||(exam&&!vehicles.length))fail(400,"Seleziona almeno un istruttore e, per l'esame, un veicolo.");
 const entries=exam?b.participants:[{id:b.student_id||null,name:b.student_name}];
 if(!Array.isArray(entries)||!entries.length||entries.length>100)fail(400,"Inserisci da 1 a 100 allievi.");
 const participants=entries.map(p=>{strict(p,["id","name"]);const name=text(p.name),id=text(p.id,120,true)||null;return{id,name,key:id?"id:"+id:"name:"+name.normalize("NFKC").toLocaleLowerCase("it").replace(/\s+/g," ")}});
 if(new Set(participants.map(p=>p.key)).size!==participants.length)fail(400,"Allievo duplicato nella seduta.");
 const old=b.id?await q("SELECT * FROM calendar_events WHERE id=?",id).first():null;
 if(b.id&&!old)fail(404,"Appuntamento non trovato.");
 if(old&&old.event_type!==type)fail(400,"Il tipo di un evento esistente non può essere cambiato.");
 const previous=old?(await hydrateEvents([old],all))[0]:null;
 const teachers=await all("SELECT id,name FROM users WHERE id IN(SELECT value FROM json_each(?))",JSON.stringify(instructors));
 const cars=await all("SELECT id,name FROM calendar_vehicles WHERE id IN(SELECT value FROM json_each(?))",JSON.stringify(vehicles));
 if(teachers.length!==instructors.length||cars.length!==vehicles.length)fail(400,"Risorsa non disponibile.");
 const t=instructors.map(id=>({id,name:previous?.instructors.find(x=>x.id===id)?.name||teachers.find(x=>x.id===id).name}));
 const v=vehicles.map(id=>({id,name:previous?.vehicles.find(x=>x.id===id)?.name||cars.find(x=>x.id===id).name}));
 const token=crypto.randomUUID(),deleted=b.deleted?1:0;
 const args=[sid,start,end,participants[0].id,participants[0].name,category,t[0].id,t[0].name,v[0]?.id||null,text(b.note,200,true),b.status,deleted,user,now,type,exam?text(b.meeting_point,160):"",text(b.examiner,120,true),token];
 const stmt=old?q("UPDATE calendar_events SET site_id=?,starts_at=?,ends_at=?,student_id=?,student_name=?,category=?,instructor_id=?,instructor_name=?,vehicle_id=?,note=?,status=?,deleted=?,updated_by=?,updated_at=?,event_type=?,meeting_point=?,examiner=?,write_token=?,version=version+1 WHERE id=? AND version=?",...args,id,version(b.version)):q("INSERT INTO calendar_events(site_id,starts_at,ends_at,student_id,student_name,category,instructor_id,instructor_name,vehicle_id,note,status,deleted,updated_by,updated_at,event_type,meeting_point,examiner,write_token,id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",...args,id,user,now);
 const guard=q("WITH c AS(SELECT ? id,? site_id,? starts_at,? ends_at,? category,? instructors,? vehicles,? participants,? cancelled) INSERT OR REPLACE INTO calendar_write_guard(id,conflict_ok,assignment_ok,vehicle_ok) SELECT 1,CASE WHEN c.cancelled=1 THEN 1 WHEN EXISTS(SELECT 1 FROM calendar_events e WHERE e.id<>c.id AND e.deleted=0 AND e.status NOT IN('ANNULLATA','ANNULLATO') AND c.starts_at<e.ends_at AND c.ends_at>e.starts_at AND (EXISTS(SELECT 1 FROM calendar_event_instructors x JOIN json_each(c.instructors) j ON x.user_id=json_extract(j.value,'$.id') WHERE x.event_id=e.id) OR EXISTS(SELECT 1 FROM calendar_event_vehicles x JOIN json_each(c.vehicles) j ON x.vehicle_id=json_extract(j.value,'$.id') WHERE x.event_id=e.id) OR EXISTS(SELECT 1 FROM calendar_event_participants x JOIN json_each(c.participants) j ON (x.student_id IS NOT NULL AND x.student_id=json_extract(j.value,'$.id')) OR ((x.student_id IS NULL OR json_extract(j.value,'$.id') IS NULL) AND lower(trim(x.name))=lower(trim(json_extract(j.value,'$.name')))) WHERE x.event_id=e.id))) THEN 0 ELSE 1 END,CASE WHEN c.cancelled=1 THEN 1 WHEN EXISTS(SELECT 1 FROM json_each(c.instructors) j WHERE NOT EXISTS(SELECT 1 FROM users u JOIN calendar_user_sites s ON s.user_id=u.id JOIN calendar_sites z ON z.id=s.site_id WHERE u.id=json_extract(j.value,'$.id') AND s.site_id=c.site_id AND z.active=1 AND u.active=1 AND u.role='ISTRUTTORE' AND (u.authorization_role IS NULL OR u.authorization_role='ISTRUTTORE') AND u.access_profile IS NULL)) THEN 0 ELSE 1 END,CASE WHEN c.cancelled=1 THEN 1 WHEN EXISTS(SELECT 1 FROM json_each(c.vehicles) j WHERE NOT EXISTS(SELECT 1 FROM calendar_vehicles v WHERE v.id=json_extract(j.value,'$.id') AND v.status IN('DISPONIBILE','TRASFERIMENTO_PROGRAMMATO') AND COALESCE((SELECT m.to_site_id FROM calendar_vehicle_movements m WHERE m.vehicle_id=v.id AND m.effective_at<=c.starts_at ORDER BY m.effective_at DESC LIMIT 1),v.site_id)=c.site_id AND NOT EXISTS(SELECT 1 FROM calendar_vehicle_movements m WHERE m.vehicle_id=v.id AND m.effective_at>c.starts_at AND m.effective_at<c.ends_at) AND EXISTS(SELECT 1 FROM json_each(v.categories) WHERE value=c.category))) THEN 0 ELSE 1 END FROM c",id,sid,start,end,category,JSON.stringify(t),JSON.stringify(v),JSON.stringify(participants),deleted||["ANNULLATA","ANNULLATO"].includes(b.status)?1:0);
 const current="EXISTS(SELECT 1 FROM calendar_events WHERE id=? AND write_token=?)";
 const operations=[stmt];
 for(const table of ["calendar_event_instructors","calendar_event_vehicles","calendar_event_participants"])operations.push(q("DELETE FROM "+table+" WHERE event_id=? AND "+current,id,id,token));
 operations.push(q("INSERT INTO calendar_event_instructors(event_id,user_id,name,position) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.name'),CAST(key AS INTEGER) FROM json_each(?) WHERE "+current,id,JSON.stringify(t),id,token));
 operations.push(q("INSERT INTO calendar_event_vehicles(event_id,vehicle_id,name,position) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.name'),CAST(key AS INTEGER) FROM json_each(?) WHERE "+current,id,JSON.stringify(v),id,token));
 operations.push(q("INSERT INTO calendar_event_participants(event_id,participant_key,student_id,name,position) SELECT ?,json_extract(value,'$.key'),json_extract(value,'$.id'),json_extract(value,'$.name'),CAST(key AS INTEGER) FROM json_each(?) WHERE "+current,id,JSON.stringify(participants),id,token));
 const action=deleted?"DELETE":!old?"CREATE":(old.deleted?"RESTORE_":"UPDATE_")+b.status+(JSON.stringify(previous.instructors)!==JSON.stringify(t)?"_INSTRUCTOR":"")+(JSON.stringify(previous.vehicles)!==JSON.stringify(v)?"_VEHICLE":"");
 operations.push(q("INSERT INTO calendar_event_audit(actor_id,entity_type,entity_id,action,created_at) SELECT ?,'event',?,?,? WHERE "+current,user,id,action,now,id,token));
 const result=await batch(operations,guard);if(!result[0].meta.changes)fail(409,conflict);
 return{id};
}
