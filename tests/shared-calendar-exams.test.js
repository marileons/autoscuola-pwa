"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {fixture,event,root}=require("./shared-calendar-support.js"),store=require("../shared-calendar-store.js");
const exam=(x={})=>({event_type:"ESAME",site_id:"a",starts_at:"2090-01-10T09:00:00.000Z",ends_at:"2090-01-10T11:00:00.000Z",category:"auto",meeting_point:"LOCALITÀ FITTIZIA",examiner:"ESAMINATORE FITTIZIO",instructors:["i1","i2"],vehicles:["v","v2"],participants:[{id:"p1",name:"ALLIEVO UNO"},{id:"p2",name:"ALLIEVO DUE"}],note:"Solo organizzazione",status:"PROGRAMMATO",...x});
async function run(fn){const f=await fixture();try{f.db.exec("INSERT INTO calendar_vehicles(id,name,type,categories,site_id,status,created_at,updated_at) SELECT 'v2','SECONDA AUTO',type,categories,site_id,status,created_at,updated_at FROM calendar_vehicles WHERE id='v'; INSERT INTO calendar_vehicles(id,name,type,categories,site_id,status,created_at,updated_at) SELECT 'vb','AUTO SEDE B',type,categories,'b',status,created_at,updated_at FROM calendar_vehicles WHERE id='v';");await fn(f)}finally{f.close()}}
async function create(f,b=exam()){const r=await f.call("secretary","events",b);assert.equal(r.status,200,await r.clone().text());return(await r.json()).id}
test("ESAME unico con più allievi, istruttori e veicoli; ordine e fotografie",()=>run(async f=>{
 const id=await create(f),data=await(await f.call("i1","sync")).json(),e=data.events[0];
 assert.equal(e.id,id);assert.equal(e.event_type,"ESAME");assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,1);
 assert.deepEqual(e.participants,exam().participants);assert.deepEqual(e.instructors.map(x=>x.id),["i1","i2"]);assert.deepEqual(e.vehicles.map(x=>x.id),["v","v2"]);assert.equal("write_token" in e,false);
 f.db.exec("UPDATE users SET name='RINOMINATO' WHERE id='i2'");assert.equal((await(await f.call("i1","sync")).json()).events[0].instructors[1].name,"FITTIZIO i2");
}));
for(const [resource,guide]of [["istruttore",{instructor_id:"i2",vehicle_id:null,student_id:"different"}],["veicolo",{instructor_id:"i2",vehicle_id:"v2",student_id:"different"}],["partecipante",{instructor_id:"i2",vehicle_id:null,student_id:"p2"}]])test("conflitto ESAME/GUIDA su "+resource,()=>run(async f=>{
 const b=exam({instructors:resource==="istruttore"?["i1","i2"]:["i1"]});await create(f,b);
 const before=f.db.prepare("SELECT * FROM calendar_events").all();assert.equal((await f.call("secretary","events",event(guide))).status,409);assert.deepEqual(f.db.prepare("SELECT * FROM calendar_events").all(),before);
}));
test("creazione simultanea ESAME/GUIDA: una sola prenotazione atomica",()=>run(async f=>{
 const results=await Promise.all([f.call("secretary","events",exam()),f.call("secretary","events",event())]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,1);
}));
test("ESAMI contemporanei in sedi diverse con risorse disgiunte",()=>run(async f=>{
 await create(f,exam({instructors:["i1"],vehicles:["v"]}));await create(f,exam({site_id:"b",instructors:["i2"],vehicles:["vb"],participants:[{id:"b",name:"SEDE B"}]}));
 assert.equal((await(await f.call("i1","sync")).json()).events.length,1);assert.equal((await(await f.call("i2","sync")).json()).events.length,2);
}));
test("annullamento seduta libera tutte le risorse, CONCLUSO mantiene lo storico",()=>run(async f=>{
 const id=await create(f);assert.equal((await f.call("secretary","events",exam({id,version:1,status:"ANNULLATO"}))).status,200);
 const second=await create(f);assert.equal((await f.call("secretary","events",exam({id:second,version:1,status:"CONCLUSO"}))).status,200);
 assert.equal(f.db.prepare("SELECT status FROM calendar_events WHERE id=?").get(second).status,"CONCLUSO");
}));
test("ESAME lettura assegnata e nessuna scrittura da istruttore/ADMIN secondario",()=>run(async f=>{
 await create(f);for(const user of ["i1","admin"]){assert.equal((await f.call(user,"events",exam())).status,403);assert.equal((await(await f.call(user,"sync")).json()).events[0].participants.length,2)}
 for(const user of ["manager","blocked","invalid"])assert.notEqual((await f.call(user,"sync")).status,200);
}));
test("ESAME incremento, cache offline, riapertura e tombstone preservano liste complete",()=>run(async f=>{
 const id=await create(f),first=await(await f.call("i1","sync")).json(),empty={account:"i1",scope:[],sites:[],events:[],cursor:0};
 const cached=store.merge(empty,[first],"i1");assert.deepEqual(JSON.parse(JSON.stringify(cached)).events[0].participants,exam().participants);
 await f.call("secretary","events",exam({id,version:1,note:"aggiornata"}));const next=await(await f.call("i1","sync?cursor="+first.cursor)).json();
 const merged=store.merge(cached,[next],"i1");assert.equal(merged.events[0].note,"aggiornata");assert.equal(merged.events[0].vehicles.length,2);
 await f.call("secretary","events",exam({id,version:2,deleted:true}));assert.equal(store.merge(merged,[await(await f.call("i1","sync?cursor="+next.cursor)).json()],"i1").events.length,0);
}));
test("CAS fallito non modifica partecipanti, risorse o audit; secondo tentativo corretto",()=>run(async f=>{
 const id=await create(f);await f.call("secretary","events",exam({id,version:1,note:"prima"}));
 const tables=["calendar_events","calendar_event_instructors","calendar_event_vehicles","calendar_event_participants","calendar_event_audit"],snapshot=()=>tables.map(t=>f.db.prepare("SELECT * FROM "+t).all()),before=snapshot();
 assert.equal((await f.call("secretary","events",exam({id,version:1,participants:[{id:"new",name:"NUOVO"}]}))).status,409);assert.deepEqual(snapshot(),before);
 assert.equal((await f.call("secretary","events",exam({id,version:2,participants:[{id:"new",name:"NUOVO"}]}))).status,200);
}));
test("risorse duplicate, mancanti ed esiti locali sono rifiutati",()=>run(async f=>{
 assert.equal((await f.call("secretary","events",event({participants:exam().participants}))).status,400);
 for(const changes of [{instructors:["i1","i1"]},{vehicles:[]},{participants:[]},{participants:[{id:"p",name:"A"},{id:"p",name:"B"}]},{status:"IDONEO"},{outcome:"RESPINTO"},{participants:[{name:"A",outcome:"ASSENTE"}]}])assert.equal((await f.call("secretary","events",exam(changes))).status,400);
 assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,0);
}));
test("trasferimento e disponibilità considerano anche il secondo veicolo ESAME",()=>run(async f=>{
 await create(f);assert.deepEqual((await(await f.call("i1","vehicles?site=a&at=2090-01-10T09:00Z&until=2090-01-10T11:00Z&category=auto")).json()).vehicles,[]);
 assert.equal((await f.call("secretary","movements",{vehicle_id:"v2",version:1,to_site_id:"b",effective_at:"2090-01-09T10:00Z"})).status,409);
}));
test("modulo e archivi ESAMI locali non modificati o importati; schema solo additivo",()=>run(async f=>{
 for(const file of ["exams.js","tests/exams.test.js","tests/exams-integration.test.js"]){assert.equal(fs.readFileSync(path.join(root,file),"utf8").replace(/\r\n/g,"\n"),cp.execFileSync("git",["show","bd7d5cc412456ed9ff941250e0e0c10be9b18f84:"+file],{cwd:root,encoding:"utf8"}).replace(/\r\n/g,"\n"))}
 const sql=fs.readFileSync(path.join(root,"migrations/0007_shared_calendar.sql"),"utf8");assert.doesNotMatch(sql,/\b(?:ALTER|DROP|INSERT|UPDATE|DELETE)\b/i);
 for(const table of ["calendar_event_instructors","calendar_event_vehicles","calendar_event_participants"])assert.ok(f.db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(table));
 assert.deepEqual(f.db.prepare("PRAGMA foreign_key_check").all(),[]);
}));
