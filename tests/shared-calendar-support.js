"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{DatabaseSync}=require("node:sqlite"),{pathToFileURL}=require("node:url");
const root=path.join(__dirname,"..");
async function fixture(){
 const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
 for(const f of fs.readdirSync(path.join(root,"migrations")).filter(f=>f.endsWith(".sql")).sort())db.exec(fs.readFileSync(path.join(root,"migrations",f),"utf8"));
 const users=[["principal","ADMIN","ADMIN",1,null,1],["admin","ADMIN","ADMIN",0,null,1],["secretary","ISTRUTTORE","ISTRUTTORE",0,"SEGRETERIA",1],["i1","ISTRUTTORE",null,0,null,1],["i2","ISTRUTTORE","ISTRUTTORE",0,null,1],["manager","ISTRUTTORE","USER_MANAGER",0,null,1],["blocked","ISTRUTTORE",null,0,null,0],["invalid","ADMIN","ISTRUTTORE",0,null,1]];
 for(const[id,role,authorization,primary,profile,active]of users){
  db.prepare("INSERT INTO users(id,username,name,role,authorization_role,is_primary_admin,access_profile,active,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(id,id,"FITTIZIO "+id,role,authorization,primary,profile,active,"hash-fittizio-non-una-credenziale","salt-fittizio","2026-01-01","2026-01-01");
  for(const purpose of ["NORMAL","PASSWORD_CHANGE"])db.prepare("INSERT INTO sessions(id_hash,user_id,expires_at,created_at,purpose,session_version) VALUES(?,?,?,?,?,1)").run(crypto.createHash("sha256").update(id+purpose).digest("base64"),id,"2099-01-01","2026-01-01",purpose);
 }
 db.exec("INSERT INTO calendar_sites VALUES('a','SEDE A FITTIZIA',1,1,'2026-01-01','2026-01-01'),('b','SEDE B FITTIZIA',1,1,'2026-01-01','2026-01-01'); INSERT INTO calendar_user_sites VALUES('i1','a'),('i2','a'),('i2','b'),('admin','a');");
 db.prepare("INSERT INTO calendar_vehicles(id,name,type,categories,site_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run("v","AUTO FITTIZIA","Auto",'["auto"]',"a","DISPONIBILE","2026-01-01","2026-01-01");
 const prepare=(sql,args=[])=>({bind:(...a)=>prepare(sql,a),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
 const env={SHARED_CALENDAR_ENABLED:"true",DB:{prepare,batch:async stmts=>{db.exec("BEGIN");try{const results=[];for(const s of stmts)results.push(await s.run());db.exec("COMMIT");return results}catch(e){db.exec("ROLLBACK");throw e}}},ASSETS:{fetch:async()=>new Response("asset")}};
 const worker=(await import(pathToFileURL(path.join(root,"worker.js")))).default;
 const request=(who,route,body,options={})=>new Request("https://calendar.test"+route,{method:body?"POST":"GET",headers:{...(who?{cookie:"agenda_session_v2="+who+(options.purpose||"NORMAL")}:{}),...((body||options.origin)?{origin:options.origin||"https://calendar.test"}:{}),"content-type":"application/json"},body:body?JSON.stringify(body):undefined});
 const call=(who,route,body,options={})=>worker.fetch(request(who,"/api/calendar/"+route,body,options),env);
 return{db,env,worker,request,call,close:()=>db.close()};
}
const event=(extra={})=>({site_id:"a",starts_at:"2090-01-10T09:00:00.000Z",ends_at:"2090-01-10T10:00:00.000Z",student_id:"student-fiction",student_name:"ALLIEVO FITTIZIO",category:"auto",instructor_id:"i1",vehicle_id:"v",note:"Organizzazione fittizia",status:"PROGRAMMATA",...extra});
module.exports={fixture,event,root};
