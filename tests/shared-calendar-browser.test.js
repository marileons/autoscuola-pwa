"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),http=require("node:http"),{spawn}=require("node:child_process");
const {fixture,event,root}=require("./shared-calendar-support.js");
test("calendario browser isolato: interfaccia reale, cache, ruoli, offline e responsive",{timeout:120000},async()=>{
 const f=await fixture();let actor="secretary";
 for(const id of ["m1","m2"])f.db.prepare("INSERT INTO calendar_vehicles(id,name,type,categories,site_id,status,created_at,updated_at) VALUES(?,?,'Moto','[\"moto\"]','a','DISPONIBILE','2026-01-01','2026-01-01')").run(id,"MOTO FITTIZIA "+id);
 const long="ALLIEVO DIMOSTRATIVO CON NOME MOLTO LUNGO PER VERIFICARE LA LEGGIBILITÀ";
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 await f.call("secretary","events",event({student_name:long,starts_at:today+"T09:00:00Z",ends_at:today+"T10:00:00Z"}));
 await f.call("secretary","events",event({student_id:"colleague",student_name:"ALLIEVO COLLEGA",instructor_id:"i2",vehicle_id:null,starts_at:today+"T09:00:00Z",ends_at:today+"T10:00:00Z"}));
 assert.equal((await f.call("secretary","events",{event_type:"ESAME",site_id:"a",starts_at:today+"T12:00:00Z",ends_at:today+"T13:00:00Z",category:"auto",meeting_point:"RITROVO DIMOSTRATIVO CON DENOMINAZIONE LUNGA",instructors:["i1","i2"],vehicles:["v"],participants:[{id:"p1",name:"CONVOCATO UNO"},{id:"p2",name:"CONVOCATO DUE"}],status:"PROGRAMMATO"})).status,200);
 const original=fs.readFileSync(path.join(root,"index.html"),"utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
 const html=original.replace("</body>",'<script>document.getElementById("loginScreen").classList.add("hidden");document.getElementById("appShell").classList.remove("hidden");document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.getElementById("secretaryHome").classList.add("active");window.user={id:"secretary",role:"SEGRETERIA",sharedCalendarEnabled:true};window.AgendaAuth={currentUser:()=>window.user};window.localStorage.setItem("sentinel","unchanged");</script><script src="/student-report-print.js"></script><script src="/shared-calendar-store.js"></script><script src="/shared-calendar.js"></script><script>SharedCalendar.mount(user)</script></body>');
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,"http://local");if(url.pathname.startsWith("/api/calendar/")){let raw="";for await(const chunk of req)raw+=chunk;const r=await f.call(actor,url.pathname.slice(14)+url.search,raw?JSON.parse(raw):undefined);res.writeHead(r.status,{"content-type":"application/json"});res.end(await r.text());return}
  if(url.pathname==="/"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end(html);return}
  const name=path.basename(url.pathname);if(!/^[a-zA-Z0-9_.-]+\.(js|css|png|webp|svg|jpg)$/.test(name)){res.writeHead(404).end();return}
  const filename=path.join(root,name);if(!fs.existsSync(filename)){res.writeHead(404).end();return}res.setHeader("Content-Type",name.endsWith(".js")?"text/javascript; charset=utf-8":name.endsWith(".css")?"text/css; charset=utf-8":name.endsWith(".svg")?"image/svg+xml":"image/png");res.end(fs.readFileSync(filename));
 }catch{res.writeHead(500).end("Errore test sintetico")}});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),"agenda-calendar-browser-")),exe="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
 const child=spawn(exe,["--headless=new","--disable-gpu","--disable-background-networking","--disable-component-update","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{windowsHide:true,stdio:"ignore"});
 let ws,seq=0,sid,send,failure;const pending=new Map(),errors=[];
 try{
  let p;for(let i=0;i<200;i++){try{p=fs.readFileSync(path.join(profile,"DevToolsActivePort"),"utf8");break}catch{}await new Promise(r=>setTimeout(r,50))}assert.ok(p);
  const[port,route]=p.trim().split(/\r?\n/);ws=new WebSocket("ws://127.0.0.1:"+port+route);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);const item=pending.get(m.id);if(item){pending.delete(m.id);clearTimeout(item.timer);m.error?item.reject(Error(m.error.message)):item.resolve(m.result)}};
  send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error("Timeout "+method))},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}))});
  const target=await send("Target.createTarget",{url:"about:blank"});sid=(await send("Target.attachToTarget",{targetId:target.targetId,flatten:true})).sessionId;await send("Page.enable");await send("Runtime.enable");await send("Network.enable");await send("Network.setBlockedURLs",{urls:["https://*"]});
  const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||"Errore browser");return r.result.value};
  const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,30))}throw Error("Condizione non raggiunta: "+expression)};
  const click=async label=>{const rect=await evaluate('(()=>{const b=[...document.querySelectorAll("dialog[open] button,[data-shared-calendar]")].find(b=>b.textContent==='+JSON.stringify(label)+'&&!b.disabled&&b.getClientRects().length);if(!b)throw Error("Comando non disponibile");b.scrollIntoView({block:"center"});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()');await send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...rect});await send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...rect})};
  await send("Page.navigate",{url:"http://127.0.0.1:"+server.address().port+"/"});await wait('!!window.SharedCalendar && !!document.querySelector("[data-shared-calendar]")');await click("AGENDA CONDIVISA");await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');
  for(const [width,height]of [[1280,900],[390,844],[768,1024]]){
   await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width===390});await click("GIORNALIERA");await wait('document.querySelectorAll(".sc-grid-head").length===3');
   assert.equal(await evaluate('document.querySelectorAll(".sc-time").length'),34);
   assert.equal(await evaluate('getComputedStyle(document.querySelector(".sc-grid-head")).position'),"sticky");
   assert.equal(await evaluate('getComputedStyle(document.querySelector(".sc-time:not(.sc-grid-head)")).position'),"sticky");
   assert.equal(await evaluate('[...document.querySelectorAll(".sc-grid-event")].filter(r=>r.dataset.minutes==="60").length'),4);
   await wait('[...document.querySelectorAll(".sc-grid-event")].every(r=>r.scrollHeight<=r.clientHeight+2)');
   assert.equal(await evaluate('[...document.querySelectorAll(".sc-grid-event")].every(r=>r.scrollWidth<=r.clientWidth+2)'),true);
   assert.equal(await evaluate('(()=>{const a=[...document.querySelectorAll(".sc-grid-event")].map(r=>r.getBoundingClientRect());return a.every((r,i)=>a.every((s,j)=>i===j||r.right<=s.left||s.right<=r.left||r.bottom<=s.top||s.bottom<=r.top))})()'),true);
   assert.equal(await evaluate('document.querySelectorAll(".sc-totals").length'),2);
   assert.match(await evaluate('document.querySelector(".sc-totals").textContent'),/Auto: 1 h 00 min.*Esami: 1 sedute · 1 h 00 min/);
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
   if(process.env.SHARED_CALENDAR_RENDER_DIR){const dir=path.resolve(process.env.SHARED_CALENDAR_RENDER_DIR);assert.ok(!dir.toLowerCase().startsWith(root.toLowerCase()));fs.mkdirSync(dir,{recursive:true});await evaluate('document.querySelector(".sc-grid-scroll").scrollIntoView({block:"start"});document.querySelector(".sc-grid-scroll").scrollTop=document.querySelector(".sc-grid-event").offsetTop-100');const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(dir,"daily-"+width+".png"),Buffer.from(shot.data,"base64"))}
   await click("SETTIMANA");
   assert.equal(await evaluate('document.querySelector(".shared-calendar").scrollWidth<=document.querySelector(".shared-calendar").clientWidth'),true);
   assert.ok(await evaluate('[...document.querySelectorAll(".shared-calendar input,.shared-calendar select")].every(x=>parseFloat(getComputedStyle(x).fontSize)>=16)'));
   assert.equal(await evaluate('document.querySelectorAll(".sc-card").length'),3);
   assert.match(await evaluate('document.querySelector(".sc-exam").textContent'),/N. allievi: 2/);
   if(process.env.SHARED_CALENDAR_RENDER_DIR){const dir=path.resolve(process.env.SHARED_CALENDAR_RENDER_DIR);assert.ok(!dir.toLowerCase().startsWith(root.toLowerCase()));fs.mkdirSync(dir,{recursive:true});const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(dir,"calendar-"+width+".png"),Buffer.from(shot.data,"base64"));await evaluate('document.querySelector(".sc-exam").scrollIntoView({block:"center"})');const detail=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(dir,"exam-"+width+".png"),Buffer.from(detail.data,"base64"))}
  }

  // Real local Blob document: blocked popup fallback, controller click and multipage print.
  await evaluate('window.__originalOpen=window.open;window.__printOpenCalls=0;window.open=()=>{window.__printOpenCalls++;return null}');
  await click("STAMPA / SALVA PDF");
  await evaluate('[...document.querySelectorAll(".sc-main button")].find(b=>b.textContent==="STAMPA / SALVA PDF").click()');
  assert.equal(await evaluate('window.__printOpenCalls'),1);
  assert.match(await evaluate('document.querySelector(".sc-print-output").textContent'),/APRI DOCUMENTO STAMPABILE/);
  const blobUrl=await evaluate('document.querySelector(".sc-print-output a").href');
  const appSession=sid,printTarget=await send("Target.createTarget",{url:blobUrl});
  sid=(await send("Target.attachToTarget",{targetId:printTarget.targetId,flatten:true})).sessionId;
  await send("Page.enable");await send("Runtime.enable");
  await wait('document.documentElement.dataset.printControls==="ready"');
  assert.match(await evaluate('document.body.textContent'),/Agenda condivisa/);
  assert.equal(await evaluate('document.querySelectorAll("input,select,[onclick]").length'),0);
  await evaluate('window.__prints=0;window.print=()=>window.__prints++;document.getElementById("studentReportPrint").click();document.getElementById("studentReportPrint").click()');
  assert.equal(await evaluate('window.__prints'),1);
  await new Promise(r=>setTimeout(r,1300));
  await evaluate('document.getElementById("studentReportPrint").click()');
  assert.equal(await evaluate('window.__prints'),2);
  await send("Emulation.setEmulatedMedia",{media:"print"});
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".report-controls")).display'),"none");
  const pdf=await send("Page.printToPDF",{preferCSSPageSize:true,printBackground:true});
  assert.ok(Buffer.from(pdf.data,"base64").subarray(0,5).toString()==="%PDF-");
  await send("Target.closeTarget",{targetId:printTarget.targetId});sid=appSession;
  // Many synthetic rows: verify Chromium paginates rather than clipping a fixed-height sheet.
  const longUrl=await evaluate('(async()=>{const cache=SharedCalendarStore.create(),s=await cache.load("secretary");await cache.close();const base=s.events[0],events=Array.from({length:80},(_,i)=>({...base,id:"print-"+i,note:"NOTA DIMOSTRATIVA "+i}));const html=SharedCalendar.weeklyDocument({date:'+JSON.stringify(today)+',site:s.sites[0],events,syncedAt:s.syncedAt},StudentReportPrint);return URL.createObjectURL(new Blob([html],{type:"text/html"}))})()');
  const longTarget=await send("Target.createTarget",{url:longUrl});sid=(await send("Target.attachToTarget",{targetId:longTarget.targetId,flatten:true})).sessionId;await send("Page.enable");await send("Runtime.enable");await wait('document.documentElement.dataset.printControls==="ready"');
  const longPdf=Buffer.from((await send("Page.printToPDF",{preferCSSPageSize:true})).data,"base64").toString("latin1");
  assert.ok((longPdf.match(/\/Type\s*\/Page\b/g)||[]).length>2);
  assert.match(await evaluate('document.body.textContent'),/NOTA DIMOSTRATIVA 79/);
  await send("Target.closeTarget",{targetId:longTarget.targetId});sid=appSession;
  await evaluate('URL.revokeObjectURL('+JSON.stringify(longUrl)+');window.open=window.__originalOpen');

  await click("GESTIONE AGENDA");
  await click("NUOVO APPUNTAMENTO");await wait('!!document.querySelector(".sc-editor[open]")');
  const field=(label,value)=>evaluate('(()=>{const l=[...document.querySelectorAll(".sc-editor label")].find(l=>l.firstChild.textContent==='+JSON.stringify(label)+');const i=l.querySelector("input,select");i.value='+JSON.stringify(value)+';i.dispatchEvent(new Event("change"))})()');
  await field("Nome allievo","NUOVO FITTIZIO");await field("ID allievo (facoltativo)","new-fiction");await field("Inizio (Europe/Rome)",today+"T16:00");await field("Fine (Europe/Rome)",today+"T17:00");await new Promise(r=>setTimeout(r,300));await click("SALVA");await wait('!document.querySelector(".sc-editor")');assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,4);await wait('document.querySelectorAll(".sc-card").length===4 && document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');
  await evaluate('window.__savedFetch=window.fetch;window.fetch=()=>Promise.reject(new TypeError("offline sintetico"))');await click("AGGIORNA");await wait('document.querySelector(".shared-calendar [role=status]").textContent.includes("ERRORE")');assert.equal(await evaluate('document.querySelectorAll(".sc-card").length'),4);await evaluate('window.fetch=window.__savedFetch');
  await click("NUOVO ESAME");await wait('!!document.querySelector(".sc-editor[open]")');
  await field("Inizio (Europe/Rome)",today+"T18:00");await field("Fine (Europe/Rome)",today+"T19:00");await field("Località / punto di ritrovo","RITROVO FITTIZIO");
  await wait('document.querySelectorAll(".sc-editor .sc-choice").length===3');
  await evaluate('document.querySelectorAll(".sc-editor .sc-choice input").forEach(i=>i.click())');
  await field("Nome allievo","ESAME NUOVO UNO");await click("AGGIUNGI ALLIEVO");
  await evaluate('document.querySelectorAll(".sc-participant input")[2].value="ESAME NUOVO DUE"');
  await click("SALVA");await wait('!document.querySelector(".sc-editor") && document.querySelectorAll(".sc-card").length===5');
  assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_event_participants p JOIN calendar_events e ON e.id=p.event_id WHERE e.event_type='ESAME'").get().n,4);
  await click("ALLIEVI CONVOCATI");await wait('!!document.querySelector(".sc-editor[open] ol")');assert.match(await evaluate('document.querySelector(".sc-editor").textContent'),/CONVOCATO DUE/);await click("CHIUDI");
  await evaluate('Object.defineProperty(navigator,"onLine",{configurable:true,get:()=>false});window.dispatchEvent(new Event("offline"))');
  await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("OFFLINE")');
  assert.equal(await evaluate('[...document.querySelectorAll(".sc-controls button")].find(b=>b.textContent==="NUOVO ESAME").disabled'),true);
  assert.equal(await evaluate('document.querySelectorAll(".sc-card").length'),5);
  await evaluate('delete navigator.onLine;window.dispatchEvent(new Event("online"))');await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await click("NUOVA GUIDA MOTO");await wait('document.querySelector(".sc-editor h2")?.textContent==="Nuova GUIDA MOTO"');
  await field("Inizio (Europe/Rome)",today+"T20:00");await field("Fine (Europe/Rome)",today+"T21:00");
  await wait('document.querySelectorAll(".sc-editor input[type=radio]").length===2');
  await evaluate('document.querySelector(".sc-editor input[type=radio]").click()');
  await field("Nome allievo","MOTO ALLIEVO UNO");await field("ID stabile (se disponibile)","moto-p1");await field("Sigla moto (facoltativa)","moto-code-sh");
  await wait('[...document.querySelectorAll(".sc-participant select option")].some(o=>o.value==="m1")');
  await field("Veicolo fisico individuale (facoltativo)","m1");await click("AGGIUNGI ALLIEVO");
  await evaluate('(()=>{const row=document.querySelectorAll(".sc-participant")[1],inputs=row.querySelectorAll("input"),selects=row.querySelectorAll("select");inputs[0].value="MOTO ALLIEVO DUE";inputs[1].value="moto-p2";selects[0].value="moto-code-k2";selects[1].value="m2";selects[1].dispatchEvent(new Event("change"))})()');
  assert.equal(await evaluate('document.querySelector(".sc-editor").scrollWidth<=document.querySelector(".sc-editor").clientWidth'),true);
  assert.ok(await evaluate('[...document.querySelectorAll(".sc-editor input,.sc-editor select")].every(i=>parseFloat(getComputedStyle(i).fontSize)>=16)'));
  await click("SALVA");await wait('!document.querySelector(".sc-editor") && document.querySelectorAll(".sc-card").length===6');
  assert.match(await evaluate('document.querySelector(".sc-motorcycle").textContent'),/MOTO ALLIEVO UNO — SH/);assert.match(await evaluate('document.querySelector(".sc-motorcycle").textContent'),/MOTO ALLIEVO DUE — K2/);
  const motoId=f.db.prepare("SELECT id FROM calendar_events WHERE category='moto'").get().id;
  await click("SIGLE MOTO");await wait('[...document.querySelectorAll("dialog[open] button")].some(b=>b.textContent==="SH · ordine 50 · attiva"&&!b.disabled&&b.getClientRects().length)');await click("SH · ordine 50 · attiva");await field("Sigla","SH NUOVA");await field("Stato","0");await click("SALVA");await wait('!document.querySelector(".sc-editor") && document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');
  assert.match(await evaluate('document.querySelector(".sc-motorcycle").textContent'),/MOTO ALLIEVO UNO — SH/);
  await click("NUOVA GUIDA MOTO");await wait('!!document.querySelector(".sc-participant select")');assert.equal(await evaluate('[...document.querySelectorAll(".sc-participant select option")].some(o=>o.value==="moto-code-sh")'),false);await click("ANNULLA");
  await evaluate('document.querySelector(".sc-motorcycle button:last-child").click()');await wait('document.querySelector(".sc-editor h2")?.textContent==="Modifica GUIDA MOTO"');
  assert.equal(await evaluate('document.querySelector(".sc-participant select").value'),"moto-code-sh");assert.match(await evaluate('document.querySelector(".sc-participant select").selectedOptions[0].textContent'),/SH.*storica/);
  await evaluate('document.querySelectorAll(".sc-participant")[1].querySelector("button").click()');await click("SALVA");await wait('!document.querySelector(".sc-editor") && document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');
  assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events WHERE category='moto'").get().n,1);assert.equal(f.db.prepare("SELECT version FROM calendar_events WHERE id=?").get(motoId).version,2);
  await evaluate('Object.defineProperty(navigator,"onLine",{configurable:true,get:()=>false});window.dispatchEvent(new Event("offline"))');await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("OFFLINE")');
  assert.match(await evaluate('document.querySelector(".sc-motorcycle").textContent'),/MOTO ALLIEVO UNO — SH/);assert.equal(await evaluate('document.querySelector(".sc-motorcycle button:last-child").disabled'),true);
  await evaluate('delete navigator.onLine;window.dispatchEvent(new Event("online"))');await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');
  await click("GIORNALIERA");await wait('!![...document.querySelectorAll(".sc-slot")].find(r=>r.dataset.minute==="360"&&r.dataset.instructor==="i1")');
  await evaluate('[...document.querySelectorAll(".sc-slot")].find(r=>r.dataset.minute==="360"&&r.dataset.instructor==="i1").click()');await wait('document.querySelector(".sc-editor h2")?.textContent==="Inserimento rapido"');
  await field("Nome allievo","RAPIDO MOTO UNO");await field("Tipo","moto");await field("Durata (minuti)","30");await click("CONTINUA");await wait('document.querySelector(".sc-editor h2")?.textContent==="Nuova GUIDA MOTO"');
  assert.equal(await evaluate('document.querySelector(".sc-editor input[type=datetime-local]").value'),today+"T06:00");
  await wait('document.querySelector(".sc-editor input[type=radio]:checked")?.value==="i1"');
  await field("Sigla moto (facoltativa)","moto-code-k2");await click("AGGIUNGI ALLIEVO");await evaluate('document.querySelectorAll(".sc-participant input")[2].value="RAPIDO MOTO DUE"');
  await click("SALVA");await wait('!document.querySelector(".sc-editor") && [...document.querySelectorAll(".sc-grid-event")].some(e=>e.textContent.includes("RAPIDO MOTO DUE"))');
  assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_events").get().n,7);
  const quick=f.db.prepare("SELECT e.id,e.instructor_id,e.starts_at,e.ends_at FROM calendar_events e JOIN calendar_event_participants p ON p.event_id=e.id WHERE p.name=?").get("RAPIDO MOTO UNO");
  assert.equal(quick.instructor_id,"i1");assert.equal(Date.parse(quick.ends_at)-Date.parse(quick.starts_at),1800000);
  assert.equal(f.db.prepare("SELECT count(*) n FROM calendar_event_participants WHERE event_id=?").get(quick.id).n,2);
  assert.match(await evaluate('document.querySelector(".sc-totals").textContent'),/Moto: 1 h 30 min/);
  const savedDay=await evaluate('document.querySelector("input[aria-label=Giorno]").value');await click("SETTIMANA");assert.match(await evaluate('document.querySelector(".sc-week-totals").textContent'),/Totale impegni/);await click("GIORNALIERA");assert.equal(await evaluate('document.querySelector("input[aria-label=Giorno]").value'),savedDay);
  await click("GIORNO SUCCESSIVO");assert.notEqual(await evaluate('document.querySelector("input[aria-label=Giorno]").value'),savedDay);await click("GIORNO PRECEDENTE");assert.equal(await evaluate('document.querySelector("input[aria-label=Giorno]").value'),savedDay);
  actor="i1";await evaluate('SharedCalendar.dispose();window.user={id:"i1",role:"ISTRUTTORE",sharedCalendarEnabled:true};SharedCalendar.mount(user)');await click("AGENDA CONDIVISA");await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');
  assert.equal(await evaluate('[...document.querySelectorAll(".shared-calendar button")].some(b=>b.textContent==="NUOVO APPUNTAMENTO")'),false);
  assert.equal(await evaluate('document.querySelectorAll("button.sc-slot").length'),0);
  assert.ok(await evaluate('document.querySelector(".sc-notifications summary").textContent.includes("modifiche")'));
  const alertsBefore=await evaluate('document.querySelectorAll(".sc-notifications article").length');await evaluate('document.querySelector(".sc-notifications details").open=true');await click("CONFERMA / CHIUDI");await wait('document.querySelectorAll(".sc-notifications article").length==='+String(alertsBefore-1));await click("GESTIONE AGENDA");await click("AGGIORNA");await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');assert.equal(await evaluate('document.querySelectorAll(".sc-notifications article").length'),alertsBefore-1);

  assert.equal(await evaluate('[...document.querySelectorAll(".sc-card")].find(r=>r.textContent.includes("COLLEGA")).querySelectorAll("button").length'),0);
  await click("APRI ALLIEVO");assert.match(await evaluate('document.querySelector(".shared-calendar [role=status]").textContent'),/Allievo non disponibile/);
  await evaluate('window.__opened=null;SharedCalendar.localStudent=()=>({id:"student-fiction"});SharedCalendar.openLocalStudent=(id,lesson)=>window.__opened={id,lesson}');await click("INIZIA GUIDA");assert.equal(await evaluate('window.__opened.lesson'),true);
  actor="admin";await evaluate('SharedCalendar.dispose();window.user={id:"admin",role:"ADMIN",sharedCalendarEnabled:true};SharedCalendar.mount(user)');await click("AGENDA CONDIVISA");await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');
  assert.equal(await evaluate('document.querySelectorAll("button.sc-slot").length'),0);assert.equal(await evaluate('document.querySelectorAll(".sc-notifications article").length'),0);
  await evaluate('Object.defineProperty(navigator,"onLine",{configurable:true,get:()=>false});window.dispatchEvent(new Event("offline"))');await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("OFFLINE")');assert.match(await evaluate('document.querySelector(".sc-totals").textContent'),/Ultimo dato sincronizzato/);
  assert.equal(await evaluate('localStorage.getItem("sentinel")'),"unchanged");
  await evaluate('SharedCalendar.dispose()');assert.equal(await evaluate('document.querySelectorAll("[data-shared-calendar]").length'),0);
  assert.deepEqual(errors,[]);
  await send("Browser.close").catch(()=>{});
 }catch(error){failure=error;throw error}finally{
  if(send&&ws?.readyState===1)await send("Browser.close").catch(()=>{});
  ws?.close();for(const x of pending.values())clearTimeout(x.timer);
  if(child.exitCode===null){child.kill();await new Promise(r=>{child.once("exit",r);setTimeout(r,2000)})}
  server.closeAllConnections();await new Promise(r=>server.close(r));f.close();
  try{if(process.platform==="win32")require("node:child_process").execFileSync("attrib",["-R",profile]);fs.rmSync(profile,{recursive:true,force:true,maxRetries:40,retryDelay:100})}catch(cleanup){if(!failure)throw cleanup;console.error("Pulizia profilo non riuscita:",profile)}
 }
});
