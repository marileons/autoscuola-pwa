"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),http=require("node:http"),{spawn}=require("node:child_process");
const {fixture,event,root}=require("./shared-calendar-support.js");
test("calendario browser isolato: interfaccia reale, cache, ruoli, offline e responsive",{timeout:120000},async()=>{
 const f=await fixture();let actor="secretary";
 const long="ALLIEVO DIMOSTRATIVO CON NOME MOLTO LUNGO PER VERIFICARE LA LEGGIBILITÀ";
 const today=new Date().toISOString().slice(0,10);
 await f.call("secretary","events",event({student_name:long,starts_at:today+"T09:00:00Z",ends_at:today+"T10:00:00Z"}));
 await f.call("secretary","events",event({student_id:"colleague",student_name:"ALLIEVO COLLEGA",instructor_id:"i2",vehicle_id:null,starts_at:today+"T09:00:00Z",ends_at:today+"T10:00:00Z"}));
 assert.equal((await f.call("secretary","events",{event_type:"ESAME",site_id:"a",starts_at:today+"T12:00:00Z",ends_at:today+"T13:00:00Z",category:"auto",meeting_point:"RITROVO DIMOSTRATIVO CON DENOMINAZIONE LUNGA",instructors:["i1","i2"],vehicles:["v"],participants:[{id:"p1",name:"CONVOCATO UNO"},{id:"p2",name:"CONVOCATO DUE"}],status:"PROGRAMMATO"})).status,200);
 const original=fs.readFileSync(path.join(root,"index.html"),"utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,"");
 const html=original.replace("</body>",'<script>document.getElementById("loginScreen").classList.add("hidden");document.getElementById("appShell").classList.remove("hidden");document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.getElementById("secretaryHome").classList.add("active");window.user={id:"secretary",role:"SEGRETERIA",sharedCalendarEnabled:true};window.AgendaAuth={currentUser:()=>window.user};window.localStorage.setItem("sentinel","unchanged");</script><script src="/shared-calendar-store.js"></script><script src="/shared-calendar.js"></script><script>SharedCalendar.mount(user)</script></body>');
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
   await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width===390});await click("SETTIMANA");
   assert.equal(await evaluate('document.querySelector(".shared-calendar").scrollWidth<=document.querySelector(".shared-calendar").clientWidth'),true);
   assert.ok(await evaluate('[...document.querySelectorAll(".shared-calendar input,.shared-calendar select")].every(x=>parseFloat(getComputedStyle(x).fontSize)>=16)'));
   assert.equal(await evaluate('document.querySelectorAll(".sc-card").length'),3);
   assert.match(await evaluate('document.querySelector(".sc-exam").textContent'),/N. allievi: 2/);
   if(process.env.SHARED_CALENDAR_RENDER_DIR){const dir=path.resolve(process.env.SHARED_CALENDAR_RENDER_DIR);assert.ok(!dir.toLowerCase().startsWith(root.toLowerCase()));fs.mkdirSync(dir,{recursive:true});const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(dir,"calendar-"+width+".png"),Buffer.from(shot.data,"base64"));await evaluate('document.querySelector(".sc-exam").scrollIntoView({block:"center"})');const detail=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(dir,"exam-"+width+".png"),Buffer.from(detail.data,"base64"))}
  }
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
  actor="i1";await evaluate('SharedCalendar.dispose();window.user={id:"i1",role:"ISTRUTTORE",sharedCalendarEnabled:true};SharedCalendar.mount(user)');await click("AGENDA CONDIVISA");await wait('document.querySelector(".shared-calendar [role=status]").textContent.startsWith("SINCRONIZZATO")');
  assert.equal(await evaluate('[...document.querySelectorAll(".shared-calendar button")].some(b=>b.textContent==="NUOVO APPUNTAMENTO")'),false);
  assert.equal(await evaluate('[...document.querySelectorAll(".sc-card")].find(r=>r.textContent.includes("COLLEGA")).querySelectorAll("button").length'),0);
  await click("APRI ALLIEVO");assert.match(await evaluate('document.querySelector(".shared-calendar [role=status]").textContent'),/Allievo non disponibile/);
  await evaluate('window.__opened=null;SharedCalendar.localStudent=()=>({id:"student-fiction"});SharedCalendar.openLocalStudent=(id,lesson)=>window.__opened={id,lesson}');await click("INIZIA GUIDA");assert.equal(await evaluate('window.__opened.lesson'),true);
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
