"use strict";
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite'),{execFileSync}=require('node:child_process');
const {fixture,root}=require('./shared-calendar-support.js');
const read=f=>fs.readFileSync(path.join(root,f),'utf8'),migration='0023_user_gps_marker_initials.sql';
function unlock(f,id){f.db.prepare("INSERT INTO reserved_area_pins(user_id,pin_hash,pin_salt,pin_iterations,generation,updated_at) VALUES(?,?,?,?,?,?)").run(id,'synthetic-pin-hash','synthetic-pin-salt',100000,'synthetic-generation','2026-01-01');f.db.prepare("UPDATE sessions SET reserved_area_until='2099-01-01',reserved_area_generation='synthetic-generation' WHERE user_id=?").run(id)}
function request(f,who,url,body,method='PATCH',origin='https://calendar.test'){const headers=f.request(who,url).headers;headers.set('origin',origin);return new Request('https://calendar.test'+url,{method,headers,body:JSON.stringify(body)})}
const patch=(f,who,id,body,origin)=>f.worker.fetch(request(f,who,'/api/users/'+id,body,'PATCH',origin),f.env);
const get=(f,who)=>f.worker.fetch(f.request(who,'/api/auth/me'),f.env);
const row=(f,id)=>({...f.db.prepare('SELECT * FROM users WHERE id=?').get(id)});
const other=row=>{const{gps_marker_initials,updated_at,...rest}=row;return rest};
test('0023 isolated migration: existing records, nullable default, constraints and duplicate initials',()=>{
 const db=new DatabaseSync(':memory:');try{db.exec('PRAGMA foreign_keys=ON');for(const name of fs.readdirSync(path.join(root,'migrations')).filter(x=>x.endsWith('.sql')&&x<migration).sort())db.exec(read('migrations/'+name));
 for(const id of ['synthetic-a','synthetic-b'])db.prepare("INSERT INTO users(id,username,name,role,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,'ISTRUTTORE','synthetic-hash','synthetic-salt','2026-01-01','2026-01-01')").run(id,id,'FITTIZIO');
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name),before=Object.fromEntries(tables.map(t=>[t,db.prepare('SELECT * FROM '+t+' ORDER BY 1').all().map(x=>({...x}))]));
 db.exec(read('migrations/'+migration));for(const t of tables){const after=db.prepare('SELECT * FROM '+t+' ORDER BY 1').all().map(x=>{const v={...x};if(t==='users'){a.equal(v.gps_marker_initials,null);delete v.gps_marker_initials}return v});a.deepEqual(after,before[t])}
 db.prepare("UPDATE users SET gps_marker_initials='PG'").run();a.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE gps_marker_initials='PG'").get().n,2);
 for(const value of ['','P','PGG','pg','P1','ÉN'])a.throws(()=>db.prepare('UPDATE users SET gps_marker_initials=?').run(value));db.prepare('UPDATE users SET gps_marker_initials=NULL').run();
 a.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');a.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});
test('only principal saves/removes; other roles, manual own requests, locked area and foreign origin rejected',async()=>{
 const f=await fixture();try{for(const id of ['principal','admin','manager'])unlock(f,id);const before=other(row(f,'i1'));
 let response=await patch(f,'principal','i1',{gpsMarkerInitials:' pg '});a.equal(response.status,200,await response.clone().text());a.equal((await response.json()).user.gpsMarkerInitials,'PG');a.deepEqual(other(row(f,'i1')),before);
 for(const who of ['admin','i1','i2','secretary','manager',null]){const id=who==='i1'?'i1':'i2';response=await patch(f,who,id,{gpsMarkerInitials:'MR'});a.ok([401,403].includes(response.status));}
 a.equal((await patch(f,'principal','i1',{gpsMarkerInitials:'MR'},'https://foreign.test')).status,403);
 f.db.prepare("UPDATE sessions SET reserved_area_until=NULL WHERE user_id='principal'").run();a.equal((await patch(f,'principal','i1',{gpsMarkerInitials:'MR'})).status,403);
 f.db.prepare("UPDATE sessions SET reserved_area_until='2099-01-01' WHERE user_id='principal'").run();response=await patch(f,'principal','i1',{gpsMarkerInitials:''});a.equal(response.status,200);a.equal((await response.json()).user.gpsMarkerInitials,null);a.deepEqual(other(row(f,'i1')),before);
 }finally{f.close()}
});
test('validation rejects non A-Z pairs and unrelated fields before writes, permits shared initials and empty removal',async()=>{
 const f=await fixture();try{unlock(f,'principal');const before=row(f,'i1');
 for(const value of ['A','ABC','A1','ÉN','ß','A B',null,12,{},['PG']]){const response=await patch(f,'principal','i1',{gpsMarkerInitials:value});a.equal(response.status,400,JSON.stringify(value));a.deepEqual(row(f,'i1'),before)}
 for(const body of [{gpsMarkerInitials:'PG',role:'ADMIN'},{gpsMarkerInitials:'PG',password:'not-a-real-password'}]){a.equal((await patch(f,'principal','i1',body)).status,400);a.deepEqual(row(f,'i1'),before)}
 for(const id of ['i1','i2'])a.equal((await patch(f,'principal',id,{gpsMarkerInitials:'mr'})).status,200);a.equal(row(f,'i1').gps_marker_initials,'MR');a.equal(row(f,'i2').gps_marker_initials,'MR');a.deepEqual(other(row(f,'i1')),other(before));
 a.equal((await patch(f,'principal','i1',{gpsMarkerInitials:'  '})).status,200);a.equal(row(f,'i1').gps_marker_initials,null);
 }finally{f.close()}
});
test('login and existing session refresh return the account setting, including empty historical profiles',async()=>{
 const f=await fixture();try{unlock(f,'principal');a.equal((await patch(f,'principal','i1',{gpsMarkerInitials:'CR'})).status,200);
 a.equal((await(await get(f,'i1')).json()).user.gpsMarkerInitials,'CR');a.equal((await(await get(f,'i2')).json()).user.gpsMarkerInitials,null);
 const password='Fittizia-solo-test-2026!',salt=Buffer.from('local-synthetic-only').toString('base64'),hash=crypto.pbkdf2Sync(password,Buffer.from(salt,'base64'),100000,32,'sha256').toString('base64');
 f.db.prepare('UPDATE users SET password_hash=?,password_salt=? WHERE id=?').run(hash,salt,'i1');
 const response=await f.worker.fetch(request(f,null,'/api/auth/login',{username:'i1',password},'POST'),f.env);a.equal(response.status,200,await response.clone().text());const data=await response.json();a.equal(data.user.id,'i1');a.equal(data.user.gpsMarkerInitials,'CR');a.equal('password_hash' in data.user,false);
 a.equal((await patch(f,'principal','i1',{gpsMarkerInitials:'GL'})).status,200);a.equal((await(await get(f,'i1')).json()).user.gpsMarkerInitials,'GL');
 }finally{f.close()}
});
test('missing column is explicit on save; previous Worker ignores the additive setting without altering it',async()=>{
 const f=await fixture();try{unlock(f,'principal');await patch(f,'principal','i1',{gpsMarkerInitials:'EN'});
 const oldSource=execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'-C',root,'show','7ffd6899fac7b5126033eb5b2413f8db613c6521:worker.js'],{encoding:'utf8'}),old=(await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'))).default;
 a.equal((await old.fetch(f.request('i1','/api/auth/me'),f.env)).status,200);a.equal(row(f,'i1').gps_marker_initials,'EN');a.equal((await old.fetch(request(f,'principal','/api/users/i1',{gpsMarkerInitials:'MR'}),f.env)).status,400);a.equal(row(f,'i1').gps_marker_initials,'EN');
 // This is a disposable in-memory database, never a user's local database.
 f.db.exec('ALTER TABLE users DROP COLUMN gps_marker_initials');const before=row(f,'i1');
 a.equal((await(await get(f,'i1')).json()).user.gpsMarkerInitials,null);const response=await patch(f,'principal','i1',{gpsMarkerInitials:'PG'});a.equal(response.status,503);a.equal((await response.json()).code,'GPS_MARKER_SCHEMA_UNAVAILABLE');a.deepEqual(row(f,'i1'),before);
 }finally{f.close()}
});
