const test=require("node:test"),a=require("node:assert/strict"),fs=require("fs"),path=require("path"),{DatabaseSync}=require("node:sqlite"),{fixture,root}=require("./shared-calendar-support.js");
test("0026 additiva in memoria: conserva la configurazione precedente e usa auto",()=>{
 const db=new DatabaseSync(":memory:");try{for(const name of fs.readdirSync(path.join(root,"migrations")).filter(x=>x.endsWith(".sql")&&x<"0026").sort())db.exec(fs.readFileSync(path.join(root,"migrations",name),"utf8"));db.exec("INSERT INTO app_home_sections VALUES(1,'[\"moto\"]',7,NULL,'2026-01-01')");
 const before={...db.prepare("SELECT * FROM app_home_sections").get()};db.exec(fs.readFileSync(path.join(root,"migrations/0026_global_christmas_theme.sql"),"utf8"));const after={...db.prepare("SELECT * FROM app_home_sections").get()};a.equal(after.christmas_theme,"auto");delete after.christmas_theme;a.deepEqual(after,before);a.equal(db.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
 }finally{db.close()}
});
test("assenza distinta da errore; principale salva, altri ruoli e origine esterna rifiutati",async()=>{
 const f=await fixture();try{
 const publicGet=()=>f.worker.fetch(f.request(null,"/api/public-config/christmas-theme"),f.env);
 let response=await publicGet();a.equal(response.status,200);a.equal((await response.json()).mode,"auto");
 const body={enabled:["auto","moto"],version:0,christmasTheme:"on"};
 for(const who of ["admin","i1","i2","secretary","manager",null]){response=await f.worker.fetch(f.request(who,"/api/home-sections",body),f.env);a.ok([401,403].includes(response.status),who)}
 a.equal((await f.worker.fetch(f.request("principal","/api/home-sections",body,{origin:"https://foreign.invalid"}),f.env)).status,403);
 response=await f.worker.fetch(f.request("principal","/api/home-sections",body),f.env);a.equal(response.status,200,await response.clone().text());a.equal((await response.json()).christmasTheme.mode,"on");
 for(const who of ["principal","admin","i1","secretary","manager"]){const data=await(await f.worker.fetch(f.request(who,"/api/auth/me"),f.env)).json();a.equal(data.christmasTheme.mode,"on",who)}
 const bad={...f.env,DB:{prepare(){throw Error("schema assente")}}};response=await f.worker.fetch(f.request(null,"/api/public-config/christmas-theme"),bad);a.equal(response.status,503);const data=await response.json();a.equal(data.available,false);a.equal(data.mode,undefined);
 }finally{f.close()}
});
test("persistenza condivisa, validazione, conflitti e vecchi salvataggi Home non azzerano il tema",async()=>{
 const f=await fixture();try{const save=body=>f.worker.fetch(f.request("principal","/api/home-sections",body),f.env);
 a.equal((await save({enabled:["auto"],version:0,christmasTheme:"off"})).status,200);
 for(const christmasTheme of ["yes",null,3])a.equal((await save({enabled:["auto"],version:1,christmasTheme})).status,400);
 a.equal((await save({enabled:["moto"],version:1})).status,200);a.equal(f.db.prepare("SELECT christmas_theme FROM app_home_sections").get().christmas_theme,"off");
 a.equal((await save({enabled:["moto"],version:1,christmasTheme:"on"})).status,409);
 const response=await f.worker.fetch(f.request("i1","/api/home-sections/self"),f.env);const data=await response.json();a.equal(data.christmasTheme.mode,"off");a.equal(data.christmasTheme.version,2);
 }finally{f.close()}
});
