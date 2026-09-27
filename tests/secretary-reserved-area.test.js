"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const root = path.resolve(__dirname, "..");
const loadWorker = () => import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(path.join(root,"worker.js"))).toString("base64")}`);
const migrations = fs.readdirSync(path.join(root,"migrations")).filter(x => /^000[1-5]_.*\.sql$/.test(x)).sort();
const apply = (db, name) => db.exec(fs.readFileSync(path.join(root,"migrations",name),"utf8"));
const hash = text => crypto.createHash("sha256").update(text).digest("base64");
const password = "SoloTestPassword!";
function seed(db,id,role="ISTRUTTORE",assigned=role,primary=0) {
  const salt=Buffer.from("synthetic-salt-only").toString("base64"), digest=crypto.pbkdf2Sync(password,Buffer.from(salt,"base64"),100000,32,"sha256").toString("base64");
  db.prepare("INSERT INTO users(id,username,name,role,authorization_role,is_primary_admin,password_hash,password_salt,password_iterations,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)").run(id,id,"TEST "+id,role,assigned,primary,digest,salt,100000,"2026-01-01","2026-01-01");
  db.prepare("INSERT INTO sessions(id_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(hash(id),id,"2099-01-01","2026-01-01");
}
function adapter(db) {
  function prepare(sql,args=[]) { return { bind:(...values)=>prepare(sql,values), first:async()=>db.prepare(sql).get(...args)||null, all:async()=>({results:db.prepare(sql).all(...args)}), run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}) }; }
  return { prepare, batch:async statements=>{db.exec("BEGIN");try{const out=[];for(const s of statements)out.push(await s.run());db.exec("COMMIT");return out}catch(e){db.exec("ROLLBACK");throw e}} };
}
async function fixture() {
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");migrations.forEach(x=>apply(db,x));
  seed(db,"primary","ADMIN","ADMIN",1);seed(db,"admin","ADMIN");seed(db,"manager","ISTRUTTORE","USER_MANAGER");seed(db,"instructor");
  const w=(await loadWorker()).default, env={DB:adapter(db),ASSETS:{fetch:async()=>new Response("asset")}};
  const call=async(id,url,body,origin="https://local.test")=>w.fetch(new Request("https://local.test"+url,{method:body===undefined?"GET":"POST",headers:{origin,...(id?{cookie:"agenda_session_v2="+id}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);
  const unlock=async id=>{
    assert.equal((await call(id,"/api/reserved-area/configure",{pin:"7391",confirmPin:"7391",operatorPassword:password})).status,200);
    assert.equal((await call(id,"/api/reserved-area/unlock",{pin:"7391"})).status,200);
  };
  return {db,call,unlock};
}

test("0005 additiva: record precedenti, namespace, credenziali e FK invariati",async()=>{
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");migrations.slice(0,4).forEach(x=>apply(db,x));
  seed(db,"existing","ISTRUTTORE",null);seed(db,"primary","ADMIN","ADMIN",1);
  db.prepare("INSERT INTO user_employment_periods(id,user_id,employment_type,effective_from,created_at,created_by) VALUES(?,?,?,?,?,?)").run("p","existing","PART_TIME","2026-08-31","2026-01-01","primary");
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name);
  const before=Object.fromEntries(tables.map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all().map(r=>({...r}))]));
  const sql=fs.readFileSync(path.join(root,"migrations",migrations[4]),"utf8");assert.doesNotMatch(sql.replace(/^--.*$/gm,"").replace(/ON DELETE CASCADE/g,""),/\b(DROP|UPDATE|INSERT|DELETE)\b/i);
  apply(db,migrations[4]);
  for(const t of tables){const cols=Object.keys(before[t][0]||{});assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n,before[t].length);if(cols.length)assert.deepEqual(db.prepare(`SELECT ${cols.join(",")} FROM ${t} ORDER BY 1`).all().map(r=>({...r})),before[t]);}
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  assert.ok(db.prepare("SELECT access_profile FROM users").all().every(r=>r.access_profile===null));
  const w=await loadWorker();for(const row of db.prepare("SELECT * FROM users").all()){assert.equal(await w.verifyPassword(password,row),true);assert.equal(w.publicUser(row).id,row.id);}
  assert.throws(()=>db.prepare("UPDATE users SET access_profile='ROOT'").run(),/CHECK/);
  assert.throws(()=>apply(db,migrations[4]),/duplicate column/);db.close();
});

test("SEGRETERIA fail-closed: combinazioni complete e valori malformati",async()=>{
  const {effectiveRole,publicUser,capabilitiesFor}=await loadWorker();
  for(const role of ["ADMIN","ISTRUTTORE","USER_MANAGER",null])for(const assigned of ["ADMIN","ISTRUTTORE","USER_MANAGER",null,""])for(const profile of ["SEGRETERIA","","ROOT",false,0,{}," SEGRETERIA"]){
    const row={role,authorization_role:assigned,access_profile:profile};
    const expected=role==="ISTRUTTORE"&&assigned==="ISTRUTTORE"&&profile==="SEGRETERIA"?"SEGRETERIA":null;
    assert.equal(effectiveRole(row),expected);assert.equal(capabilitiesFor(row).manageUsers,false);
  }
  assert.equal(effectiveRole({role:"ISTRUTTORE",authorization_role:null,access_profile:null}),"ISTRUTTORE");
  const user=publicUser({id:"s",role:"ISTRUTTORE",authorization_role:"ISTRUTTORE",access_profile:"SEGRETERIA"});assert.equal(user.role,"SEGRETERIA");assert.equal(Object.hasOwn(user,"access_profile"),false);assert.equal(Object.hasOwn(user,"authorization_role"),false);
});

test("PIN server: sessioni limitate, conferma, scadenza, revoca e assenza di segreti Audit",async()=>{
  const {db,call,unlock}=await fixture();try{
    assert.equal((await call("primary","/api/users")).status,403);
    assert.equal((await call("instructor","/api/reserved-area/status")).status,403);
    db.prepare("UPDATE sessions SET purpose='PASSWORD_CHANGE' WHERE user_id='manager'").run();
    assert.equal((await call("manager","/api/reserved-area/configure",{pin:"7391",confirmPin:"7391",operatorPassword:password})).status,403);
    await unlock("primary");assert.equal((await call("primary","/api/users")).status,200);
    const stored=db.prepare("SELECT * FROM reserved_area_pins").get();assert.notEqual(stored.pin_hash,"7391");assert.ok(stored.pin_iterations>=100000);
    db.prepare("UPDATE sessions SET reserved_area_until='2000-01-01' WHERE user_id='primary'").run();assert.equal((await call("primary","/api/users")).status,403);
    assert.equal((await call("primary","/api/reserved-area/unlock",{pin:"7391"})).status,200);
    assert.equal((await call("primary","/api/reserved-area/lock",{})).status,200);assert.equal((await call("primary","/api/users")).status,403);
    assert.equal((await call("primary","/api/reserved-area/reset",{operatorPassword:password})).status,200);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM reserved_area_pins").get().n,0);
    const audit=JSON.stringify(db.prepare("SELECT * FROM user_management_audit").all());assert.equal(audit.includes(password),false);assert.equal(audit.includes("7391"),false);assert.equal(audit.includes(stored.pin_hash),false);
  }finally{db.close()}
});

test("creazione SEGRETERIA soltanto dal principale, payload rigidi e rollback precedente",async()=>{
  const {db,call,unlock}=await fixture();try{
    await unlock("primary");await unlock("admin");await unlock("manager");
    const body={name:"TEST SEGRETERIA",username:"secretary",operatorPassword:password};
    for(const actor of [null,"admin","manager","instructor"])assert.notEqual((await call(actor,"/api/user-management/secretaries",body)).status,201);
    assert.equal((await call("primary","/api/user-management/secretaries",{...body,access_profile:"SEGRETERIA"})).status,400);
    const created=await call("primary","/api/user-management/secretaries",body);assert.equal(created.status,201);const result=await created.json();assert.equal(result.user.role,"SEGRETERIA");
    const row=db.prepare("SELECT * FROM users WHERE id=?").get(result.user.id);assert.equal(row.role,"ISTRUTTORE");assert.equal(row.authorization_role,"ISTRUTTORE");assert.equal(row.access_profile,"SEGRETERIA");assert.equal(row.must_change_password,1);
    db.prepare("INSERT INTO sessions(id_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").run(hash("secretary-session"),row.id,"2099-01-01","2026-01-01");
    const me=await(await call("secretary-session","/api/auth/me")).json();assert.equal(me.user.role,"SEGRETERIA");assert.equal(Object.hasOwn(me.user,"access_profile"),false);
    for(const asset of ["/app.js","/student-multi-import.js","/student-license-store.js"])assert.equal((await call("secretary-session",asset)).status,200,asset);
    for(const resource of ["/register-local-vault.js","/api/users","/api/user-management/users","/api/user-management/audit","/api/reserved-area/status","/api/exams/instructors"])assert.equal((await call("secretary-session",resource)).status,403,resource);
    for(const role of ["ADMIN","USER_MANAGER","ISTRUTTORE"])assert.equal((await call("secretary-session","/api/users",{role,access_profile:null})).status,403);
    const list=await (await call("manager","/api/user-management/users")).json();assert.equal(list.users.some(u=>u.id===row.id),false);
    assert.equal((await call("manager",`/api/user-management/users/${row.id}/status`,{active:false})).status,404);
    // The previous Worker ignores access_profile and would authorize ISTRUTTORE.
    const previousRole=row.authorization_role||row.role;assert.equal(previousRole,"ISTRUTTORE");assert.equal(row.active,1);
    const {execFileSync}=require("node:child_process");
    const previousSource=execFileSync("git",["show","dbf9e1a55bc01192a2bffe722963de0e150d9d8c:worker.js"],{cwd:root,encoding:"utf8"});
    const previousWorker=(await import(`data:text/javascript;base64,${Buffer.from(previousSource).toString("base64")}`)).default;
    const oldRequest=()=>new Request("https://local.test/api/auth/me",{headers:{cookie:"agenda_session_v2=secretary-session"}});
    assert.equal((await(await previousWorker.fetch(oldRequest(),{DB:adapter(db)})).json()).user.role,"ISTRUTTORE","old Worker ignores the new profile");
    assert.equal((await call("primary",`/api/user-management/users/${row.id}/status`,{active:false})).status,200);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE access_profile='SEGRETERIA' AND active=1").get().n,0,"mandatory prerequisite before rollback");
    assert.equal((await previousWorker.fetch(oldRequest(),{DB:adapter(db)})).status,401);
    assert.equal((await call("primary","/api/users",{access_profile:"SEGRETERIA"})).status,400);
    assert.equal((await call("primary","/api/users",{role:"SEGRETERIA"})).status,400);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM user_management_audit WHERE action='CREATE_SECRETARY'").get().n,1);
  }finally{db.close()}
});

test("PIN: cinque errori persistiti impediscono tentativi successivi",async()=>{
  const {db,call,unlock}=await fixture();try{await unlock("primary");await call("primary","/api/reserved-area/lock",{});for(let n=0;n<5;n++)assert.equal((await call("primary","/api/reserved-area/unlock",{pin:"0000"})).status,403);assert.equal((await call("primary","/api/reserved-area/unlock",{pin:"7391"})).status,429);assert.equal((await call("primary","/api/users")).status,403)}finally{db.close()}
});
