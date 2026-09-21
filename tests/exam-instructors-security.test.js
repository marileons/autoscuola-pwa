"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{DatabaseSync}=require("node:sqlite");
const root=path.join(__dirname,"..");
test("elenco istruttori: sessioni, ruoli, minimizzazione e sola lettura su DB fittizio",async()=>{
 const db=new DatabaseSync(":memory:");
 try{
  for(const file of fs.readdirSync(path.join(root,"migrations")).filter(x=>x.endsWith(".sql")).sort())db.exec(fs.readFileSync(path.join(root,"migrations",file),"utf8"));
  const users=[['i2','ISTRUTTORE',null,0,1,'ALFA'],['i1','ISTRUTTORE','ISTRUTTORE',0,1,'ALFA'],['z','ISTRUTTORE','ISTRUTTORE',0,1,'ZETA'],['p','ADMIN','ADMIN',1,1,'PRINCIPALE'],['a','ADMIN',null,0,1,'ADMIN'],['m','ISTRUTTORE','USER_MANAGER',0,1,'GESTORE'],['b','ISTRUTTORE',null,0,0,'BLOCCATO'],['bad','ISTRUTTORE','ADMIN',0,1,'INCOERENTE'],['invalid','ADMIN','ISTRUTTORE',0,1,'INVALID'],['strange','ISTRUTTORE',null,1,1,'FLAG PRIVILEGIATO']];
  users.pop(); // The real schema permits a single primary administrator only.
  for(const [id,role,assigned,primary,active,name]of users){
   db.prepare('INSERT INTO users(id,username,name,role,authorization_role,is_primary_admin,active,password_hash,password_salt,password_iterations,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,id,name,role,assigned,primary,active,'fittizio','fittizio',100000,'2026-01-01','2026-01-01');
   for(const purpose of ['NORMAL','PASSWORD_CHANGE'])db.prepare('INSERT INTO sessions(id_hash,user_id,expires_at,created_at,purpose,session_version) VALUES(?,?,?,?,?,1)').run(crypto.createHash('sha256').update(id+purpose).digest('base64'),id,'2099-01-01','2026-01-01',purpose);
  }
  const statements=[];
  const prepare=(sql,args=[])=>({bind:(...values)=>prepare(sql,values),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{statements.push(sql);return db.prepare(sql).run(...args)}});
  const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(root,'worker.js'),'utf8')).toString('base64'))).default;
  const call=(id,purpose='NORMAL',options={})=>worker.fetch(new Request('https://agenda.test/api/exams/instructors'+(options.query||''),{method:options.method||'GET',headers:{...(id?{cookie:'agenda_session_v2='+id+purpose}:{}),...(options.origin?{origin:options.origin}:{})}}),{DB:{prepare}});
  assert.equal((await call(null)).status,401);
  for(const id of ['i1','p','a']){const res=await call(id);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');const data=await res.json();assert.deepEqual(Object.keys(data),['instructors']);assert.deepEqual(data.instructors,[{id:'i1',name:'ALFA'},{id:'i2',name:'ALFA'},{id:'z',name:'ZETA'}]);}
  for(const id of ['m','bad','invalid'])assert.equal((await call(id)).status,403);
  assert.equal((await call('b')).status,401);
  for(const id of ['i1','a','p','m'])assert.equal((await call(id,'PASSWORD_CHANGE')).status,403);
  assert.equal((await call('i1','NORMAL',{origin:'https://other.test'})).status,403);
  assert.equal((await call('i1','NORMAL',{query:'?role=ADMIN'})).status,400);
  assert.equal((await call('i1','NORMAL',{method:'POST',origin:'https://agenda.test'})).status,405);
  assert.deepEqual(statements,[],"anche il controllo di sessione dell’elenco è di sola lettura");
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,users.length);
 }finally{db.close()}
});
