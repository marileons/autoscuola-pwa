"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process"),{DatabaseSync}=require("node:sqlite");
const {fixture,event,root}=require("./shared-calendar-support.js"),store=require("../shared-calendar-store.js");
const moto=(extra={})=>({event_type:"GUIDA",site_id:"a",starts_at:"2090-01-10T09:00:00.000Z",ends_at:"2090-01-10T10:00:00.000Z",category:"moto",instructor_id:"i1",participants:[{id:"p1",name:"ROSSI FITTIZIO",motorcycle_code_id:"moto-code-sh",vehicle_id:"m1"},{id:"p2",name:"BIANCHI FITTIZIO",motorcycle_code_id:"moto-code-k2",vehicle_id:"m2"}],status:"PROGRAMMATA",...extra});
async function run(fn){const f=await fixture();try{
 for(const [id,site]of [["m1","a"],["m2","a"],["mb","b"]])f.db.prepare("INSERT INTO calendar_vehicles(id,name,type,categories,site_id,status,created_at,updated_at) VALUES(?,?,'Moto','[\"moto\",\"corso-moto\"]',?,'DISPONIBILE','2026-01-01','2026-01-01')").run(id,"MOTO FITTIZIA "+id,site);
 await fn(f);
}finally{f.close()}}
const catalog=async f=>(await(await f.call("secretary","motorcycle-codes")).json()).codes;
async function create(f,b=moto()){const r=await f.call("secretary","events",b);assert.equal(r.status,200,await r.clone().text());return(await r.json()).id}
const read=async(f,id)=>(await(await f.call("i1","sync")).json()).events.find(e=>e.id===id);
const changeCode=async(f,id,extra={})=>{const c=(await catalog(f)).find(c=>c.id===id);return f.call("secretary","motorcycle-codes",{id,version:c.version,code:c.code,sort_order:c.sort_order,active:!!c.active,...extra})};
test("catalogo iniziale ordinato, duplicati case/spazi e disattivati rifiutati",()=>run(async f=>{
 assert.deepEqual((await catalog(f)).map(c=>c.code),["C","M","S","SN","SH","GSX","K2","K"]);
 for(const code of ["sh"," SH ","s h","\tS\nH"])assert.equal((await f.call("secretary","motorcycle-codes",{code,sort_order:0,active:true})).status,409);
 assert.equal((await changeCode(f,"moto-code-sh",{active:false})).status,200);
 assert.equal((await f.call("secretary","motorcycle-codes",{code:"SH",sort_order:1,active:true})).status,409);
}));
test("creazione rinomina ordine attivazione e CAS del catalogo",()=>run(async f=>{
 const r=await f.call("principal","motorcycle-codes",{code:" z9 ",sort_order:0,active:true});assert.equal(r.status,200);const id=(await r.json()).id;
 assert.equal((await catalog(f))[0].code,"Z9");assert.equal((await changeCode(f,id,{code:"Z10",sort_order:99,active:false})).status,200);
 assert.equal((await catalog(f)).at(-1).code,"Z10");
 assert.equal((await f.call("secretary","motorcycle-codes",{id,version:1,code:"STALE",sort_order:0,active:true})).status,409);
 assert.equal((await changeCode(f,id,{active:true})).status,200);
}));
test("una guida moto due allievi, sigle diverse e due veicoli: un solo evento",()=>run(async f=>{
 const id=await create(f),e=await read(f,id);assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,1);
 assert.deepEqual(e.participants.map(p=>[p.id,p.motorcycle_code_snapshot,p.vehicle_id]),[["p1","SH","m1"],["p2","K2","m2"]]);assert.equal(e.instructors.length,1);
 assert.equal(e.vehicles.length,2);assert.equal(e.version,1);
}));
test("sigle operative non sono risorse fisiche: due allievi con SH senza veicolo",()=>run(async f=>{
 const id=await create(f,moto({participants:[{id:"p1",name:"UNO",motorcycle_code_id:"moto-code-sh"},{id:"p2",name:"DUE",motorcycle_code_id:"moto-code-sh"}]}));
 assert.equal((await read(f,id)).vehicles.length,0);assert.deepEqual((await read(f,id)).participants.map(p=>p.motorcycle_code_snapshot),["SH","SH"]);
}));
test("rinomina e disattivazione non cambiano fotografie, nemmeno durante una modifica",()=>run(async f=>{
 const id=await create(f);await changeCode(f,"moto-code-sh",{code:"SH-NUOVA",active:false});
 assert.equal((await read(f,id)).participants[0].motorcycle_code_snapshot,"SH");
 assert.equal((await f.call("secretary","events",moto({id,version:1,note:"Modifica innocua"}))).status,200);
 assert.equal((await read(f,id)).participants[0].motorcycle_code_snapshot,"SH");
 assert.equal((await f.call("secretary","events",moto({starts_at:"2090-01-11T09:00Z",ends_at:"2090-01-11T10:00Z"}))).status,409);
 await changeCode(f,"moto-code-sh",{active:true});const fresh=await create(f,moto({starts_at:"2090-01-11T09:00Z",ends_at:"2090-01-11T10:00Z"}));
 assert.equal((await read(f,fresh)).participants[0].motorcycle_code_snapshot,"SH-NUOVA");
}));
test("aggiunta rimozione e riapertura aggiornano la stessa guida senza conflitto interno",()=>run(async f=>{
 const id=await create(f),third={id:"p3",name:"TERZO",motorcycle_code_id:"moto-code-c"};
 assert.equal((await f.call("secretary","events",moto({id,version:1,participants:[...moto().participants,third]}))).status,200);
 assert.equal((await read(f,id)).participants.length,3);
 assert.equal((await f.call("secretary","events",moto({id,version:2,participants:[moto().participants[1]]}))).status,200);
 const e=await read(f,id);assert.equal(e.participants.length,1);assert.equal(e.participants[0].motorcycle_code_snapshot,"K2");assert.equal(e.version,3);
 assert.deepEqual(e.vehicles.map(v=>v.id),["m2"]);assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,1);
}));
test("stesso veicolo fisico in due righe rifiutato senza scritture",()=>run(async f=>{
 const p=moto().participants;p[1].vehicle_id="m1";assert.equal((await f.call("secretary","events",moto({participants:p}))).status,409);
 assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,0);
}));
for(const [name,extra]of [["veicolo",{instructor_id:"i2",participants:[{id:"other",name:"ALTRO",vehicle_id:"m2"}]}],["allievo",{instructor_id:"i2",participants:[{id:"p2",name:"BIANCHI FITTIZIO"}]}],["istruttore",{participants:[{id:"other",name:"ALTRO"}]}]])test("conflitto reale tra eventi moto: "+name,()=>run(async f=>{
 await create(f);assert.equal((await f.call("secretary","events",moto(extra))).status,409);assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,1);
}));
test("annullamento libera tutti i partecipanti e veicoli",()=>run(async f=>{
 const id=await create(f);assert.equal((await f.call("secretary","events",moto({id,version:1,status:"ANNULLATA"}))).status,200);await create(f);
}));
test("sede e trasferimenti del secondo veicolo controllati dal server",()=>run(async f=>{
 const p=moto().participants;p[1].vehicle_id="mb";assert.equal((await f.call("secretary","events",moto({participants:p}))).status,409);
 const id=await create(f);const transfer={vehicle_id:"m2",to_site_id:"b",effective_at:"2090-01-09T10:00Z",version:1};
 assert.equal((await f.call("secretary","movements",transfer)).status,409);assert.equal((await f.call("secretary","movements",{...transfer,confirm_conflicts:true})).status,200);
 assert.equal((await read(f,id)).participants[1].vehicle_id,"m2");
 assert.equal((await f.call("secretary","events",moto({starts_at:"2090-01-11T09:00Z",ends_at:"2090-01-11T10:00Z"}))).status,409);
}));
test("ESAME con sigla e veicolo individuale conserva gli esiti esclusivamente locali",()=>run(async f=>{
 const b=moto({event_type:"ESAME",status:"PROGRAMMATO",instructors:["i1","i2"],vehicles:[],meeting_point:"LUOGO FITTIZIO"});delete b.instructor_id;
 const id=await create(f,b);assert.equal((await read(f,id)).participants[1].motorcycle_code_snapshot,"K2");assert.equal((await read(f,id)).vehicles.length,2);
 assert.equal((await f.call("secretary","events",{...b,status:"IDONEO"})).status,400);
}));
test("guide AUTO restano singole, payload privilegiati e snapshot contraffatti rifiutati",()=>run(async f=>{
 assert.equal((await f.call("secretary","events",event({participants:moto().participants}))).status,400);
 for(const p of [{...moto().participants[0],motorcycle_code_snapshot:"FALSO"},{...moto().participants[0],role:"ADMIN"}])assert.equal((await f.call("secretary","events",moto({participants:[p]}))).status,400);
 assert.equal((await f.call("secretary","motorcycle-codes",{code:"X",sort_order:0,active:true,role:"ADMIN"})).status,400);
}));
test("permessi API catalogo, guide multiple e flag restano fail-closed",()=>run(async f=>{
 for(const who of ["i1","admin","manager"]){assert.equal((await f.call(who,"motorcycle-codes",{code:"X",sort_order:0,active:true})).status,403);assert.equal((await f.call(who,"events",moto())).status,403)}
 for(const who of [null,"blocked","invalid"])assert.equal((await f.call(who,"motorcycle-codes")).status,401);
 assert.equal((await f.call("i1","motorcycle-codes",null,{purpose:"PASSWORD_CHANGE"})).status,403);
 f.db.exec("DELETE FROM calendar_user_sites WHERE user_id='admin'");assert.deepEqual((await(await f.call("admin","motorcycle-codes")).json()).codes,[]);
 f.env.SHARED_CALENDAR_ENABLED=false;assert.equal((await f.call("principal","motorcycle-codes")).status,404);
}));
test("due aggiornamenti concorrenti: uno solo, sigle e assegnazioni non mescolate",()=>run(async f=>{
 const id=await create(f),results=await Promise.all([f.call("secretary","events",moto({id,version:1,note:"A"})),f.call("secretary","events",moto({id,version:1,participants:[moto().participants[0]]}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal((await read(f,id)).version,2);assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_event_audit WHERE entity_type='event'").get().n,2);
}));
test("rinomina concorrente al salvataggio rifiutata atomicamente; retry usa nuovo valore",()=>run(async f=>{
 const batch=f.env.DB.batch;let once=true;f.env.DB.batch=async statements=>{if(once){once=false;f.db.exec("UPDATE calendar_motorcycle_codes SET code='SH2',normalized_code='SH2',version=version+1 WHERE id='moto-code-sh'")}return batch(statements)};
 assert.equal((await f.call("secretary","events",moto())).status,409);assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,0);
 const id=await create(f);assert.equal((await read(f,id)).participants[0].motorcycle_code_snapshot,"SH2");
}));
test("errore nella scrittura delle associazioni provoca rollback completo",()=>run(async f=>{
 const id=await create(f),tables=["calendar_events","calendar_event_participants","calendar_participant_motorcycles","calendar_event_vehicles","calendar_event_audit"],snapshot=()=>tables.map(t=>f.db.prepare("SELECT * FROM "+t).all()),before=snapshot(),prepare=f.env.DB.prepare;
 f.env.DB.prepare=sql=>{const result=prepare(sql);if(!sql.startsWith("INSERT INTO calendar_participant_motorcycles"))return result;return{bind:()=>({run:async()=>{throw Error("Errore sintetico")}})}};
 assert.equal((await f.call("secretary","events",moto({id,version:1,participants:[moto().participants[0]]}))).status,503);assert.deepEqual(snapshot(),before);
 f.env.DB.prepare=prepare;assert.equal((await f.call("secretary","events",moto({id,version:1,note:"Retry"}))).status,200);
}));
test("cache incrementale conserva sigle storiche, rimozione e isolamento account",()=>run(async f=>{
 const id=await create(f),page=await(await f.call("i1","sync")).json(),empty={account:"i1",events:[],sites:[],scope:[],cursor:0},cached=store.merge(empty,[page],"i1");
 assert.equal(JSON.parse(JSON.stringify(cached)).events[0].participants[0].motorcycle_code_snapshot,"SH");await changeCode(f,"moto-code-sh",{code:"RENAMED"});
 assert.equal((await(await f.call("i1","sync?cursor="+page.cursor)).json()).events.length,0);
 await f.call("secretary","events",moto({id,version:1,participants:[moto().participants[0]]}));
 const updated=store.merge(cached,[await(await f.call("i1","sync?cursor="+page.cursor)).json()],"i1");assert.equal(updated.events[0].participants.length,1);assert.equal(updated.events[0].participants[0].motorcycle_code_snapshot,"SH");
 assert.throws(()=>store.merge(cached,[],"other"));
}));
test("0008 additiva idempotente: vecchi record e schema invariati, Worker precedente leggibile",async()=>{
 const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");try{
 for(const file of fs.readdirSync(path.join(root,"migrations")).filter(f=>f.endsWith(".sql")&&!f.startsWith("0008")).sort())db.exec(fs.readFileSync(path.join(root,"migrations",file),"utf8"));
 db.exec("INSERT INTO users(id,username,name,role,password_hash,password_salt,created_at,updated_at) VALUES('old','old','FITTIZIO','ISTRUTTORE','fake','fake','2026-01-01','2026-01-01'); INSERT INTO sessions(id_hash,user_id,expires_at,created_at) VALUES('fake','old','2099-01-01','2026-01-01'); INSERT INTO user_employment_periods(id,user_id,employment_type,effective_from,created_at) VALUES('p','old','PART_TIME','2026-01-05','2026-01-01'); INSERT INTO user_management_audit(id,occurred_at,action,outcome,reason_code,request_id) VALUES('a','2026-01-01','TEST','SUCCESS','TEST','fake');");
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name),snapshot=()=>names.map(n=>[n,db.prepare('SELECT * FROM "'+n+'"').all(),db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(n)]),before=snapshot();
 const sql=fs.readFileSync(path.join(root,"migrations/0008_calendar_motorcycle_codes.sql"),"utf8");assert.doesNotMatch(sql,/\b(ALTER|DROP|UPDATE|DELETE FROM)\b/i);db.exec(sql);assert.deepEqual(snapshot(),before);
 db.exec("UPDATE calendar_motorcycle_codes SET code='CUSTOM',normalized_code='CUSTOM',active=0 WHERE id='moto-code-sh'");db.exec(sql);assert.equal(db.prepare("SELECT count(*) n FROM calendar_motorcycle_codes").get().n,8);assert.equal(db.prepare("SELECT code FROM calendar_motorcycle_codes WHERE id='moto-code-sh'").get().code,"CUSTOM");assert.deepEqual(snapshot(),before);
 assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
}finally{db.close()}
});
test("eventi 0007 senza sigle compatibili e lettura precedente ignora nuove tabelle",()=>run(async f=>{
 const oldEvents=cp.execFileSync("git",["show","5e70e433d50eac0ccf3366ceed00bb231d5dbb54:shared-calendar-events.js"],{cwd:root,encoding:"utf8"}),module=(await import("data:text/javascript;base64,"+Buffer.from(oldEvents).toString("base64")));
 const id=await create(f,event()),e=await read(f,id);assert.deepEqual(e.participants,[{id:"student-fiction",name:"ALLIEVO FITTIZIO"}]);
 const oldRead=await module.hydrateEvents(f.db.prepare("SELECT * FROM calendar_events").all(),async(sql,...args)=>f.db.prepare(sql).all(...args));assert.equal(oldRead[0].id,id);
 assert.equal((await f.call("secretary","events",event({id,version:1,note:"Compatibile"}))).status,200);
}));
test("rollback applicativo: il vecchio salvataggio non può cancellare le nuove associazioni",()=>run(async f=>{
 const get=file=>cp.execFileSync("git",["show","5e70e433d50eac0ccf3366ceed00bb231d5dbb54:"+file],{cwd:root,encoding:"utf8"}),data=source=>"data:text/javascript;base64,"+Buffer.from(source).toString("base64");
 const previousApi=await import(data(get("shared-calendar-api.js").replace("./shared-calendar-events.js",data(get("shared-calendar-events.js")))));
 const id=await create(f),tables=["calendar_events","calendar_event_participants","calendar_participant_motorcycles","calendar_event_vehicles","calendar_event_audit"],snapshot=()=>tables.map(t=>f.db.prepare("SELECT * FROM "+t).all()),before=snapshot();
 const response=await previousApi.handleCalendar(f.request("secretary","/api/calendar/events",event({id,version:1,category:"moto",vehicle_id:"m1",student_id:"p1",student_name:"ROSSI FITTIZIO"})),f.env,{purpose:"NORMAL",user:{id:"secretary"}},"SEGRETERIA",false);
 assert.equal(response.status,503);assert.deepEqual(snapshot(),before);
}));
