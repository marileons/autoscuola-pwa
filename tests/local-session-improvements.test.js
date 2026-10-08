"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto"),{DatabaseSync}=require("node:sqlite");
const root=path.join(__dirname,".."),gps=require("../lesson-gps.js"),source=fs.readFileSync(path.join(root,"app.js"),"utf8");
test("classificazione errori conserva watcher, linea e posizione mentre il GPS continua",()=>{
 const errors=require("../driving-errors.js"),catalog=errors.defaultCatalog?errors.defaultCatalog():{categories:[]};
 let persisted=0,renders=0;const route=[{lat:44.4,lng:8.9,time:1}],state={watch:7,tempRoute:route,tempErrors:[{id:"error",occurredAt:new Date().toISOString(),category:"unclassified",specificErrors:[],note:"",status:"pending"}],editingErrorId:"error"};
 const context=vm.createContext({state,window:{AgendaAuth:{can:()=>true}},DRIVING_ERRORS:errors,persistDrivingErrorDraft(){persisted++},renderDrivingErrors(){renders++}});
 for(const name of ["updateDrivingErrorFromCard","saveDrivingErrorEdit"])vm.runInContext(source.split(/\r?\n/).find(line=>line.startsWith("function "+name+"(")),context);
 const card={querySelector:selector=>({value:selector.includes("category")?"unclassified":"Nota sintetica durante la marcia"}),querySelectorAll:()=>[]};
 context.saveDrivingErrorEdit("error",card,catalog);
 assert.equal(state.watch,7);assert.equal(state.tempRoute,route);assert.equal(route.length,1);assert.equal(persisted,1);assert.equal(renders,1);assert.equal(state.editingErrorId,null);assert.match(state.tempErrors[0].note,/durante la marcia/);
});
test("GPS: acquisizione, punto iniziale accurato, jitter, velocità e partenza",()=>{
 const filter=gps.create(),p=(time,accuracy=5,lat=44.4)=>({lat,lng:8.9,accuracy,time});
 assert.equal(filter.observe(p(1000,100),null).ready,false);
 assert.equal(filter.observe(p(2000),0).ready,true);
 assert.equal(filter.observe(p(4000,5,44.400001),null).speed,0);
 assert.ok(filter.observe(p(6000,5,44.4002),10).speed>0);
 assert.equal(filter.observe(p(5000),10).accept,false);
 assert.equal(filter.observe(p(8000,150),20).speed,null);
 const direct=gps.create();assert.equal(direct.observe(p(1000),10).speed,36);
 assert.equal(gps.create().observe(p(1000),-1).speed,null);
 assert.equal(gps.create().observe(p(1000),500).speed,null);
});
test("GPS: solo velocità non salva punti, stop e callback accodati",()=>{
 let callback,cleared=0,persisted=0;
 const state={watch:null,tempRoute:[],gpsNeedsBreak:false},c=vm.createContext({state,window:{LessonGps:gps,AgendaAuth:{can:()=>true}},navigator:{geolocation:{watchPosition(fn){callback=fn;return 7},clearWatch(){cleared++}}},updateGpsUi(){},drawLive(){},persistLessonSession(){persisted++},alert(){throw Error("unexpected")}});
 for(const name of ["distance","bearing","bearingDelta","evaluateGpsPoint","startGps","stopGps"])vm.runInContext(source.split(/\r?\n/).find(l=>l.startsWith("function "+name+"(")),c);
 c.startGps(true);callback({coords:{latitude:44.4,longitude:8.9,accuracy:5,speed:10},timestamp:1000});
 assert.equal(state.indicativeSpeed,36);assert.equal(state.tempRoute.length,0);assert.equal(persisted,0);
 c.stopGps();callback({coords:{latitude:44.5,longitude:8.9,accuracy:5,speed:10},timestamp:2000});
 assert.equal(cleared,1);assert.equal(state.indicativeSpeed,null);assert.equal(state.tempRoute.length,0);
});
test("0006 e presenza: database fittizio, record invariati, solo stesso ADMIN/dispositivo diverso",async()=>{
 const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
 for(const name of fs.readdirSync(path.join(root,"migrations")).filter(n=>/^000[1-5]_.*sql$/.test(n)).sort())db.exec(fs.readFileSync(path.join(root,"migrations",name),"utf8"));
 for(const [id,role]of [["admin","ADMIN"],["other","ADMIN"],["normal","ISTRUTTORE"]])db.prepare("INSERT INTO users(id,username,name,role,authorization_role,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id,id,"TEST",role,role,"synthetic-not-a-password","synthetic-not-a-salt","2026-01-01","2026-01-01");
 const hash=x=>crypto.createHash("sha256").update(x).digest("base64");
 for(const [token,id]of [["a","admin"],["b","admin"],["c","other"],["d","normal"]])db.prepare("INSERT INTO sessions(id_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(hash(token),id,"2099-01-01","2026-01-01");
 const before=JSON.stringify(db.prepare("SELECT * FROM users ORDER BY id").all()),sessions=db.prepare("SELECT * FROM sessions ORDER BY id_hash").all();
 db.exec(fs.readFileSync(path.join(root,"migrations/0006_admin_presence.sql"),"utf8"));
 assert.equal(JSON.stringify(db.prepare("SELECT * FROM users ORDER BY id").all()),before);
 for(const row of db.prepare("SELECT * FROM sessions ORDER BY id_hash").all()){assert.equal(row.presence_device_hash,null);assert.equal(row.presence_seen_at,null);delete row.presence_device_hash;delete row.presence_seen_at;assert.deepEqual(row,sessions.shift())}
 assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
 const prepare=(sql,args=[])=>({bind:(...v)=>prepare(sql,v),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)});
 const worker=(await import("data:text/javascript;base64,"+Buffer.from(fs.readFileSync(path.join(root,"worker.js"))).toString("base64"))).default,env={DB:{prepare}};
 const call=(token,device="1",origin="https://local.test")=>worker.fetch(new Request("https://local.test/api/auth/presence",{method:"POST",headers:{origin,...(token?{cookie:"agenda_session_v2="+token}:{})},body:JSON.stringify({deviceHash:device.repeat(64)})}),env);
 assert.equal((await call(null)).status,401);assert.equal((await call("d")).status,403);assert.equal((await call("a","1","https://wrong.test")).status,403);
 await call("b","2");await call("c","3");assert.equal((await(await call("a")).json()).peers.length,1);
 db.prepare("UPDATE sessions SET presence_device_hash=? WHERE id_hash=?").run("1".repeat(64),hash("b"));assert.equal((await(await call("a")).json()).peers.length,0);
 db.prepare("UPDATE sessions SET presence_device_hash=?,presence_seen_at=? WHERE id_hash=?").run("2".repeat(64),"2000-01-01",hash("b"));assert.equal((await(await call("a")).json()).peers.length,0);
 db.prepare("UPDATE sessions SET purpose='PASSWORD_CHANGE' WHERE id_hash=?").run(hash("a"));assert.equal((await call("a")).status,403);
 db.prepare("UPDATE sessions SET purpose='NORMAL' WHERE id_hash=?").run(hash("a"));
 const unavailable={DB:{prepare:sql=>{if(sql.includes("presence_"))throw Error("synthetic unavailable");return prepare(sql)}}};
 const response=await worker.fetch(new Request("https://local.test/api/auth/presence",{method:"POST",headers:{origin:"https://local.test",cookie:"agenda_session_v2=a"},body:JSON.stringify({deviceHash:"1".repeat(64)})}),unavailable);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{peers:[],unavailable:true});
 db.close();
});
