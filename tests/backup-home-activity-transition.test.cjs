"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process"),assert=require("node:assert/strict");
const {chromium}=require("C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"),{fixture}=require("./shared-calendar-support.js");
const repo=path.resolve(__dirname,".."),stable="bcf7b1e5b94a19ef2ab312bf5f748c57afc78aea",leaf="C:/Users/HP/Documents/Codex/2026-10-11/referenced-chatgpt-conversation-this-is-an-2/outputs/gps-heading-preview-2026-11-04";
(async()=>{
 const f=await fixture(),browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true}),cache=new Map(),known=new Set(cp.execFileSync("git",["ls-tree","-r","--name-only",stable],{cwd:repo,encoding:"utf8"}).trim().split(/\r?\n/));let mode="stable",missingShortcut=false;
 function source(name){const old=mode==="stable"||mode==="old-loader"&&(name==="auth-client.js"||name==="index.html");if(old){if(!known.has(name))return null;if(!cache.has(name))cache.set(name,cp.execFileSync("git",["show",stable+":"+name],{cwd:repo,maxBuffer:32*1024*1024}));return cache.get(name)}if(missingShortcut&&name==="home-backup.js")return null;const file=path.join(repo,name);return fs.existsSync(file)&&fs.statSync(file).isFile()?fs.readFileSync(file):null}
 const type=name=>name.endsWith(".js")?"text/javascript":name.endsWith(".css")?"text/css":name.endsWith(".svg")?"image/svg+xml":name.endsWith(".png")?"image/png":name.endsWith(".webp")?"image/webp":"text/html";
 f.env.ASSETS={fetch:async req=>{const name=new URL(req.url).pathname.slice(1)||"index.html",data=source(name);return new Response(data||source("index.html"),{headers:{"content-type":type(data?name:"index.html"),"cache-control":"no-store"}})}};
 const context=await browser.newContext({viewport:{width:375,height:812},hasTouch:true,isMobile:true}),p=await context.newPage(),errors=[];
 p.setDefaultTimeout(45000);p.on("pageerror",e=>errors.push(e.message));
 await p.route("**/*",async route=>{const request=route.request(),u=new URL(request.url());
  if(u.hostname==="unpkg.com"){const file=u.pathname.endsWith("/leaflet.js")?"leaflet-1.9.4.js":u.pathname.endsWith("/leaflet.css")?"leaflet-1.9.4.css":null;return file?route.fulfill({path:path.join(leaf,file)}):route.abort()}
  if(u.hostname!=="agenda.local")return route.abort();
  const headers=new Headers(f.request("principal",u.pathname).headers);if(request.method()!=="GET")headers.set("origin","https://calendar.test");
  const response=await f.worker.fetch(new Request("https://calendar.test"+u.pathname+u.search,{method:request.method(),headers,...(request.postData()?{body:request.postData()}:{})}),f.env);
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 try{
  if(!process.argv.includes("--activities-only")&&!process.argv.includes("--saved-summary-only")){
  await p.goto("https://agenda.local");await p.locator("#home.active #prepareBackupVoice").waitFor();assert.equal(await p.evaluate(()=>AgendaAuth.currentUser().id),"principal");console.log("Sessione stabile: Home raggiunta.");
  mode="old-loader";await p.reload();
  if(process.argv.includes("--diagnose")){
   await p.locator("#connectionNotice").waitFor();console.log("Vecchio avvio con nuovi asset:",await p.locator("#connectionNotice").innerText());assert.equal(await p.locator("#appShell").isVisible(),false);return;
  }
  await p.locator("#home.active #homeFullBackup").waitFor();assert.equal(await p.locator("#connectionNotice").count(),0);assert.equal(await p.locator("#prepareBackupVoice").count(),0);console.log("Vecchio avvio compatibile con i nuovi asset: Home raggiunta senza voce.");
  mode="current";await p.reload();await p.locator("#home.active #homeFullBackup").waitFor();assert.equal(await p.evaluate(()=>AgendaAuth.currentUser().id),"principal");assert.equal(await p.locator("#connectionNotice").count(),0);console.log("Sessione già attiva: versione aggiornata fino alla Home.");
  }else{mode="current";await p.goto("https://agenda.local");try{await p.locator("#home.active #homeFullBackup").waitFor({timeout:120000})}catch(error){throw Error(error.message+"; avvio: "+await p.locator("#connectionNotice").textContent().catch(()=>"nessun avviso")+"; errori: "+JSON.stringify(errors))}}
  await p.evaluate(async()=>{
   LISTS.auto=[...new Set([...LISTS.auto,"CONTROLLI OBBLIGATORI","ILLUSTRAZIONE CHECK LIST COMPLETA","Circolazione Marassi","Circolazione Punto fittizio A","Circolazione Punto fittizio B"])];
   const items=normalizeItems([],"auto").map(x=>({...x,status:x.label==="Circolazione Marassi"?"orange":"good",...(LessonActivities.isChecklist(x)?{checklistDetails:Object.fromEntries(LessonActivities.checklistParts.map(p=>[p.id,"good"]))}:{})}));
   const lesson={id:"storica-marassi",createdAt:Date.now()-86400000,duration:"1 ora",notes:"Guida fittizia",route:[],errors:[],instructorId:"principal",instructorName:"ISTRUTTORE FITTIZIO",lessonContext:LessonActivities.pathContext("auto","auto",LISTS.auto),checklist:LessonActivities.copy(items),activityBaseline:[],activitySnapshot:LessonActivities.copy(items),lessonActivities:LessonActivities.copy(items)};
   state.students=[normalizeStudent({id:"fittizio-marassi",firstName:"Mario",lastName:"Prova",category:"auto",checklist:items,lessons:[lesson]})];await save();openStudent("fittizio-marassi");
  });
  assert.equal(await p.evaluate(()=>autoStudentPathComplete(student())),true);
  await p.locator("#newLesson").click();await p.waitForFunction(()=>lessonDraftReady);await p.locator("#toggleLessonActivity").click();await p.locator("#activitySearch").fill("Marassi");
  const row=p.locator(".activity-current-row").filter({hasText:"Circolazione Marassi"});assert.equal(await row.count(),1);
  assert.match(await row.locator(".activity-history-badge").innerText(),/GIÀ SVOLTA/);assert.equal(await row.locator(".activity-today-toggle").getAttribute("aria-pressed"),"false");
  assert.equal(await row.locator('[role="radio"][aria-checked="true"]').getAttribute("data-status"),"orange");assert.equal(await row.locator('[role="radio"][aria-checked="true"]').innerText(),"✓");assert.equal(await row.locator('[role="radio"][aria-checked="false"]').allTextContents().then(t=>t.every(s=>!s.includes("✓"))),true);
  await row.locator(".activity-today-toggle").click();await p.locator("#lessonDate").fill("2026-11-25");await p.locator("#lessonTime").selectOption("15:00");await p.locator("#saveLesson").click();await p.waitForFunction(()=>document.querySelector("#student.active")&&student().lessons.length===2);
  const result=await p.evaluate(()=>{const s=student(),l=[...s.lessons].sort((a,b)=>b.createdAt-a.createdAt)[0];return{status:l.lessonActivities.find(x=>x.label==="Circolazione Marassi")?.status,complete:autoStudentPathComplete(s)}});assert.deepEqual(result,{status:"orange",complete:true});assert.match(await p.locator("#lessons .lesson-card").first().innerText(),/Circolazione Marassi.*Rifatto/);
  if(process.argv.includes("--saved-summary-only")){
   const savedId=await p.evaluate(()=>[...student().lessons].sort((a,b)=>b.createdAt-a.createdAt)[0].id);
   await p.locator("#lessons .lesson-card").first().click();await p.waitForFunction(()=>lessonDraftReady);
   assert.equal(await p.evaluate(()=>state.lessonId),savedId);
   assert.equal(await row.locator(".activity-today-toggle").getAttribute("aria-pressed"),"true");
   assert.equal(await row.locator('[role="radio"][aria-checked="true"]').getAttribute("data-status"),"orange");
   await p.evaluate(()=>openStudent("fittizio-marassi"));
   const card=p.locator("#lessons .lesson-card").first(),dot=card.locator(".activity-recorded-orange");
   assert.match(await card.innerText(),/Circolazione Marassi.*Rifatto/);assert.equal(await dot.innerText(),"✓");assert.equal(await dot.count(),1);
   const visual=await dot.evaluate(node=>{const c=getComputedStyle(node),r=node.getBoundingClientRect();return{background:c.backgroundColor,color:c.color,align:c.alignItems,justify:c.justifyContent,radius:c.borderRadius,width:r.width,height:r.height}});
   assert.equal(visual.background,"rgb(212, 103, 36)");assert.equal(visual.color,"rgb(255, 255, 255)");assert.equal(visual.align,"center");assert.equal(visual.justify,"center");assert.equal(visual.radius,"50%");assert.equal(visual.width,visual.height);
   const output=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"agenda-marassi-riepilogo-"));
   await card.screenshot({path:path.join(output,"riepilogo.png")});
   fs.writeFileSync(path.join(output,"allievo-fittizio.json"),JSON.stringify(await p.evaluate(async()=>await AgendaStudentArchiveStore.snapshotForBackup())));
   assert.deepEqual(errors,[]);console.log(JSON.stringify({esito:"Guida salvata senza cambiare colore, riaperta per ID: Marassi arancione con spunta bianca centrata e Rifatto nel riepilogo",savedId,visual,output}));return;
  }
  await p.locator("#newLesson").click();await p.waitForFunction(()=>lessonDraftReady);await p.locator("#toggleLessonActivity").click();await p.locator("#activitySearch").fill("Marassi");assert.equal(await row.locator(".activity-today-toggle").getAttribute("aria-pressed"),"false");assert.equal(await row.locator('[role="radio"][aria-checked="true"]').getAttribute("data-status"),"orange");assert.match(await row.innerText(),/GIÀ SVOLTA/);
  const box=await row.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=376);console.log("Marassi: un tocco, stato Rifatto conservato, guida salvata, cumulativo 8/8 e nuova casella vuota; tre pallini leggibili a 375 px.");
  await p.evaluate(()=>show("home"));await p.locator("#homeFullBackup").click();await p.getByRole("heading",{name:"Backup completo pronto",exact:true}).waitFor();const download=p.waitForEvent("download");await p.getByRole("button",{name:"SALVA BACKUP",exact:true}).click();assert.equal(await(await download).failure(),null);console.log("Pulsante Home: preparazione e download al tocco su SALVA BACKUP.");
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();f.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
