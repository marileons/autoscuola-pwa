"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto"),{execFileSync}=require("node:child_process");
const stream=require("../full-backup-stream.js"),root=path.join(__dirname,"..");
const source=name=>fs.readFileSync(path.join(root,name),"utf8");
function fn(text,name){let start=text.indexOf("  async function "+name+"(");if(start<0)start=text.indexOf("  function "+name+"(");assert.ok(start>=0,name);return text.slice(start,text.indexOf("\n  }",start)+4);}
test("formato 4 progressivo conserva contenuto, checksum, unicode e conteggi",async()=>{
 const bytes=Uint8Array.from({length:100003},(_,i)=>i%251),record={id:"doc-demo",blob:new Blob([bytes]),originalName:"fittizio.bin",createdAt:1};
 const header={format:"AgendaIstruttoriFullBackup",formatVersion:4,metadata:{students:1},appData:{students:[{id:"s-demo",notes:"😀\\\"\n".repeat(9000)}]},documents:[]};
 const before=JSON.stringify(header),out=await stream.createLegacyFile(header,["doc-demo"],async()=>record,"sintetico.agendabackup");
 assert.ok(out.maxBufferBytes<=24576);assert.equal(JSON.stringify(header),before);
 const restored=[];const result=await stream.parseLegacyBackup(out.file,{onDocumentChunk:(m,b)=>restored.push(Buffer.from(b))});
 assert.equal(result.count,1);assert.deepEqual(Buffer.concat(restored),Buffer.from(bytes));assert.deepEqual(result.header.appData,header.appData);assert.equal(result.header.metadata.approximateBytes,out.file.size);
});
test("generazione fallita o annullata non scrive né altera la sorgente",async()=>{
 const record={id:"d",blob:new Blob(["fittizio"]),createdAt:1};let read=0;
 await assert.rejects(stream.createLegacyFile({metadata:{}},["d","missing"],async()=>++read===1?record:null,"x"),/non leggibile/);
 assert.equal(await record.blob.text(),"fittizio");const controller=new AbortController();controller.abort();
 await assert.rejects(stream.createLegacyFile({metadata:{}},["d"],async()=>record,"x",{signal:controller.signal}),{name:"AbortError"});
});
function authHarness(response){
 const notices=[],events=[],timers=[],c=vm.createContext({AbortController,fetch:response,setTimeout:(f,delay)=>{timers.push({f,delay});return timers.length},clearTimeout(){},document:{getElementById:()=>({remove(){}})},applyUser:u=>{c.currentUser=u},loseAccess:()=>{c.currentUser=null;c.denied++},connectionNotice:()=>notices.push(true),recordEvent:code=>events.push(code),routeAfterAuthentication:async()=>{c.routed++}});
 vm.runInContext('var currentUser={id:"demo",role:"ISTRUTTORE"},authEpoch=0,sessionChecking=false,sessionRetry=null,sessionFailures=0,applicationLoaded=true,denied=0,routed=0;'+fn(source("auth-client.js"),"api")+fn(source("auth-client.js"),"checkSession"),c);
 return {c,notices,events,timers};
}
test("rete timeout e 5xx non disconnettono; sessione recuperata senza perdere UI",async()=>{
 for(const response of [async()=>{throw TypeError("offline")},async()=>{throw new DOMException("timeout","AbortError")},async()=>({ok:false,status:503,json:async()=>({error:"temporary"})}),async()=>({ok:false,status:401,json:async()=>{throw Error("html")}}),async()=>({ok:true,status:200,json:async()=>({})})]){
  const {c,notices,timers}=authHarness(response);assert.equal(await c.checkSession(),false);assert.equal(c.currentUser.id,"demo");assert.equal(c.denied,0);assert.equal(notices.length,1);assert.ok(timers.some(t=>t.delay===1000));
  c.fetch=async()=>({ok:true,status:200,json:async()=>({user:{id:"demo",role:"ISTRUTTORE"}})});assert.equal(await c.checkSession(),true);assert.equal(c.routed,0);assert.equal(c.sessionFailures,0);
 }
});
test("solo 401/403 JSON espliciti revocano la sessione e retry limitati",async()=>{
 for(const status of [401,403]){const {c}=authHarness(async()=>({ok:false,status,json:async()=>({error:"Non autorizzato"})}));await c.checkSession();assert.equal(c.denied,1);assert.equal(c.currentUser,null);}
 const {c,timers}=authHarness(async()=>{throw Error("offline")});for(let i=0;i<5;i++)await c.checkSession();assert.deepEqual(timers.filter(t=>t.delay!==10000||timers.indexOf(t)%2===1).slice(0,2).map(t=>t.delay),[1000,3000]);assert.equal(c.sessionFailures,3);
});
test("logout salva la bozza prima di rimuovere l'identità; nessun dato nella diagnostica",()=>{
 const calls=[],c=vm.createContext({clearTimeout(){},applyUser:u=>calls.push(["user",u]),onShowLogin:()=>calls.push(["draft","demo-account"]),showPublicLogin(){},document:{getElementById:()=>null}});
 vm.runInContext('let sessionRetry=null;'+fn(source("auth-client.js"),"loseAccess"),c);c.loseAccess("Sessione scaduta");assert.deepEqual(calls,[["draft","demo-account"],["user",null]]);
 assert.match(source("auth-client.js"),/diagnosticEvents.length>24/);assert.doesNotMatch(source("auth-client.js").match(/function recordEvent[^\n]+/)[0],/localStorage|fetch|console/);
});
test("snapshot backup unico, separato dall'archivio e senza scritture",async()=>{
 const S=require('../student-archive-store.js'),backend=S.createMemoryBackend();let reads=0,writes=0;
 const io={snapshot:()=>{reads++;return backend.snapshot()},write:(...args)=>{writes++;return backend.write(...args)}};
 const store=S.createStore({backend:io,legacyStorage:{getItem:()=>JSON.stringify([{id:'demo',photo:'A'.repeat(100000),lessons:[]}])}});
 await store.initialize();reads=0;writes=0;const out=await store.snapshotForBackup();assert.equal(reads,1);assert.equal(writes,0);
 out.students[0].photo='changed';assert.equal((await store.snapshot())[0].photo.length,100000);
 io.snapshot=async()=>{throw Error('lettura fallita')};await assert.rejects(store.snapshotForBackup(),/lettura fallita/);assert.equal(writes,0);
});
test("bozza completa resta dopo rete assente, sospensione e riavvio; rimozione mirata",async()=>{
 const D=require('../lesson-drafts.js'),backend=D.memoryBackend(),first=D.createStore({backend});
 const draft={id:'draft-demo',accountId:'demo',studentId:'student-demo',lessonId:null,startedAt:Date.now()-5000,date:'2026-10-06',time:'10:00',duration:'30',notes:'Nota fittizia',route:[{lat:44.4,lng:8.9,time:1},{lat:44.401,lng:8.9,time:2,breakBefore:true}],errors:[{id:'error-demo'}],checklist:[],activityDraft:{snapshot:[],elapsedMs:5000},gpsNeedsBreak:true,gpsState:'inactive'};
 await first.save(draft);await first.save({...draft,studentId:'other-demo'});
 const {c}=authHarness(async()=>{throw Error('offline')});await c.checkSession();assert.equal(c.currentUser.id,'demo');
 const reopened=D.createStore({backend}),saved=await reopened.load('demo','student-demo',null);
 for(const k of Object.keys(draft))assert.deepEqual(saved[k],draft[k]);assert.ok(saved.elapsedMs>=5000);
 assert.equal(await reopened.load('other-account','student-demo',null),undefined);
 await reopened.remove('demo','student-demo',null);assert.equal(await reopened.load('demo','student-demo',null),undefined);assert.ok(await reopened.load('demo','other-demo',null));
 assert.match(source('app.js'),/state.gpsState="inactive";lessonStartedAt=saved.startedAt/);
});
test("condivisione: capacità, annullamento, errore, doppio tocco e download dello stesso Blob",async()=>{
 const element=()=>({children:[],classList:{add(){},remove(){}},replaceChildren(...v){this.children=v},appendChild(v){this.children.push(v)},append(...v){this.children.push(...v)}});
 const nodes=new Map(),revoked=[],events=[],timers=new Map();let clock=10000,next=0,shares=0,finish;
 const byId=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const context=vm.createContext({byId,document:{createElement:element},navigator:{},URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL:u=>revoked.push(u)},Date:{now:()=>clock},clearTimeout:id=>timers.delete(id),showMessage(){},window:{setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next},AgendaAuth:{recordEvent:e=>events.push(e)}}});
 vm.runInContext('let releasePreparedBackup=null;'+fn(source('full-backup.js'),'presentPreparedBackup'),context);
 const file=new File(['synthetic'],'test.json');context.presentPreparedBackup(file);
 const [close,share,download]=byId('fullBackupModalButtons').children;
 assert.equal(download.href,'blob:synthetic');await share.onclick();assert.equal(events.at(-1),'share_unsupported');
 clock+=1201;context.navigator.canShare=()=>false;context.navigator.share=async()=>shares++;await share.onclick();assert.equal(shares,0);
 clock+=1201;context.navigator.canShare=({files})=>files[0]===file;context.navigator.share=async({files})=>{assert.equal(files[0],file);shares++;throw new DOMException('cancel','AbortError')};await share.onclick();assert.equal(events.at(-1),'share_cancelled');assert.equal(revoked.length,0);
 clock+=1201;context.navigator.share=async()=>{throw Error('failed')};await share.onclick();assert.equal(events.at(-1),'share_failed');
 clock+=1201;let prevented=false;download.onclick({preventDefault(){prevented=true}});assert.equal(prevented,false);assert.equal(events.at(-1),'download_requested');assert.equal(revoked.length,0);
 clock+=1201;context.navigator.share=({files})=>{assert.equal(files[0],file);shares++;return new Promise(r=>finish=r)};const pending=share.onclick();await share.onclick();assert.equal(shares,2);finish();await pending;assert.equal(events.at(-1),'share_completed');
 close.onclick();assert.equal(revoked.length,0);const delayed=[...timers.values()].find(t=>t.ms===60000);assert.ok(delayed);delayed.fn();assert.deepEqual(revoked,['blob:synthetic']);assert.equal(byId('fullBackupModalButtons').children.length,0);
 context.presentPreparedBackup(file);const expiry=[...timers.values()].find(t=>t.ms===1200000);assert.ok(expiry);expiry.fn();assert.equal(revoked.length,2);
});
test("backup grande sintetico: 35 allievi 23 documenti e documento 99 MiB con heap 96 MiB",{timeout:240000},()=>{
 const script=String.raw`
 const assert=require("node:assert/strict"),S=require(process.argv[1]);
 (async()=>{const mb=new Uint8Array(1024*1024),large=new Blob(Array(99).fill(mb)),small=new Blob(Array(7).fill(mb));const students=Array.from({length:35},(_,i)=>({id:"demo-"+i,photo:"data:image/png;base64,"+"A".repeat(80*1024),lessons:Array.from({length:20},(_,j)=>({id:"l-"+j,route:[],checklist:[],errors:[],notes:"solo test"})),checklist:[],drivingLicense:{number:"FITTIZIA"}}));const header={format:"AgendaIstruttoriFullBackup",formatVersion:4,metadata:{students:35},appData:{students,studentTrash:[],exams:[],examLocations:[],checklists:{},examiners:[]},examinerRoutes:{},drivingErrorCatalog:{}};students[0].lessons[0].activitySnapshot=[{id:"activity-demo",name:"Attività fittizia",checked:true}];students[0].photo="data:image/png;base64,"+"A".repeat(1024*1024);header.appData.exams=[{id:"exam-demo",date:"2026-10-06",startTime:"13:00",endTime:"",location:"LOCALITÀ FITTIZIA",participants:[{studentId:"demo-0",outcome:"I",rejectionNote:""}]}];header.appData.examLocations=[{id:"location-demo",name:"LOCALITÀ FITTIZIA"}];header.appData.studentTrash=[{id:"trash-demo",student:{id:"trash-demo",lessons:[],checklist:[]},deletedAt:"2026-10-01T00:00:00Z",purgeAfter:"2026-10-16T00:00:00Z"}];let heap=0;const result=await S.createLegacyFile(header,Array.from({length:23},(_,i)=>String(i)),async id=>({id,blob:id==="0"?large:small,originalName:"sintetico.bin",createdAt:1}),"test.agendabackup",{onProgress(){heap=Math.max(heap,process.memoryUsage().heapUsed)}});assert.ok(result.file.size>330*1024*1024);assert.ok(result.maxBufferBytes<=24576);let count=0;const restored=await S.parseLegacyBackup(result.file,{onDocumentEnd(){count++}});assert.deepEqual(restored.header.appData,header.appData);assert.equal(count,23);console.log(JSON.stringify({bytes:result.file.size,documents:count,students:35,maxBufferBytes:result.maxBufferBytes,heapPeakBytes:heap,maxRssKiB:process.resourceUsage().maxRSS}));})().catch(e=>{console.error(e.message);process.exitCode=1});
 `;
 const output=execFileSync(process.execPath,["--max-old-space-size=96","-e",script,path.join(root,"full-backup-stream.js")],{encoding:"utf8",timeout:225000,windowsHide:true,maxBuffer:1024*1024});console.log("Memoria sintetica:",output.trim());assert.equal(JSON.parse(output).documents,23);
});
