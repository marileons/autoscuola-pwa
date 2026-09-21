"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),http=require("node:http"),vm=require("node:vm"),{spawn}=require("node:child_process");
const root=path.join(__dirname,".."),printer=require("../student-report-print.js");
function reportFixture(){
 const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{classList:{add(){},remove(){},contains(){return false}},addEventListener(){},setAttribute(){},removeAttribute(){},replaceChildren(){}});return elements.get(id)};
 const win={StudentReportPrint:printer,StudentLicense:require("../student-license.js"),AgendaExams:require("../exams.js"),addEventListener(){}};
 const context={window:win,document:{addEventListener(){}},navigator:{},$:element,state:{exams:[{id:"exam-demo",date:"2026-09-14",startTime:"13:00",endTime:"",location:"LOCALITÀ DIMOSTRATIVA",examinerName:"ESAMINATORE FITTIZIO",participants:[{studentId:"demo",outcome:"R",rejectionNote:"Motivazione dimostrativa lunga. ".repeat(35)}]}]},nameOf:s=>s.firstName+" "+s.lastName,sectionLabel:()=>"AUTO",esc:s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])),formatStoredDate:s=>s||"Non indicata",setTimeout,clearTimeout,URL,Blob};
 vm.runInNewContext(fs.readFileSync(path.join(root,"r10-features.js"),"utf8"),context);
 const student={id:"demo",firstName:"ALLIEVO",lastName:"DIMOSTRATIVO",category:"auto",notes:"Nota sintetica. ".repeat(70),lessons:[],drivingLicense:null};
 return win.__agendaR10Test.studentReportHtml(student);
}
function appPreview(request,response){
 const pathname=new URL(request.url,"http://localhost").pathname;
 if(pathname.startsWith("/api/")){response.setHeader("content-type","application/json");if(pathname==="/api/auth/me")response.end(JSON.stringify({user:{id:"account-demo",name:"ISTRUTTORE DIMOSTRATIVO",role:"ISTRUTTORE",capabilities:{useApplication:true},employmentType:"PART_TIME"}}));else if(pathname==="/api/exams/instructors")response.end(JSON.stringify({instructors:[{id:"teacher-demo",name:"ISTRUTTORE FITTIZIO CON NOME MOLTO LUNGO PER IL COLLAUDO"}]}));else response.end(JSON.stringify({periods:[],enabled:false}));return true}
 if(pathname==="/app-preview"){
  const seed=`<script>if(!sessionStorage.getItem('demo-seeded')){localStorage.setItem('autoscuola_v3_completa',JSON.stringify([{id:'student-demo',firstName:'ALLIEVO',lastName:'FITTIZIO CON COGNOME LUNGO',category:'auto',lessons:[],checklist:[]},{id:'student-demo-2',firstName:'SECONDO',lastName:'DIMOSTRATIVO',category:'auto',lessons:[],checklist:[]}]));localStorage.setItem('autoscuola_v3_examiners',JSON.stringify([{id:'examiner-demo',firstName:'ESAMINATORE',lastName:'FITTIZIO',habits:[]}]));sessionStorage.setItem('demo-seeded','yes')}</script>`;
  response.setHeader("content-type","text/html; charset=utf-8");response.end(fs.readFileSync(path.join(root,"index.html"),"utf8").replace(/https:\/\/unpkg.com\/leaflet@1.9.4\/dist\/leaflet.css/g,"/test-leaflet.css").replace('<script src="auth-client.js?v=5"></script>',seed+'<script src="auth-client.js?v=5"></script>'));return true;
 }
 if(pathname==="/test-leaflet.js"||pathname==="/test-leaflet.css"){response.setHeader("content-type",pathname.endsWith("js")?"text/javascript":"text/css");response.end("");return true}
 const name=pathname.slice(1);if(!/^[a-z0-9._-]+$/i.test(name)||!fs.existsSync(path.join(root,name)))return false;
 response.setHeader("content-type",name.endsWith(".js")?"text/javascript":name.endsWith(".css")?"text/css":name.endsWith(".svg")?"image/svg+xml":name.endsWith(".png")?"image/png":"application/json");
 if(name==="auth-client.js")response.end(fs.readFileSync(path.join(root,name),"utf8").replace("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js","/test-leaflet.js"));else response.end(fs.readFileSync(path.join(root,name)));return true;
}
test("HTML finale collega il controller dopo i controlli e preserva esami e note",()=>{
 const html=reportFixture();assert.doesNotMatch(html,/\sonclick=/);assert.match(html,/HTML stampabile/);assert.match(html,/ESAMINATORE FITTIZIO/);assert.match(html,/Motivazione dimostrativa/);assert.match(html,/Ora fine non inserita/);assert.ok(html.indexOf('<script>')>html.indexOf('id="studentReportPrint"'));assert.match(html,/@page\{size:A4/);
});

test("browser locale: documento Blob, click desktop/mobile/tablet e fallback stampa",{timeout:120000},async()=>{
 const exe="C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
 assert.ok(fs.existsSync(exe),"Edge necessario al collaudo reale");
 const html=reportFixture(),server=http.createServer((req,res)=>{if(appPreview(req,res))return;res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<!doctype html><button id="open">APRI REPORT FITTIZIO</button><script>document.getElementById("open").addEventListener("click",()=>{location.href=URL.createObjectURL(new Blob(['+JSON.stringify(html).replace(/</g,"\\u003c")+'],{type:"text/html"}));});</script>')});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),"agenda-print-browser-"));
 const child=spawn(exe,["--headless=new","--disable-gpu","--disable-background-networking","--disable-component-update","--no-first-run","--no-default-browser-check","--remote-debugging-port=0",`--user-data-dir=${profile}`,"about:blank"],{windowsHide:true,stdio:"ignore"});
 const exited=new Promise(resolve=>child.once("exit",resolve));
 let ws;const pending=new Map(),browserErrors=[];let seq=0,sessionId;
 try{
  let portFile;for(let i=0;i<200;i++){try{portFile=fs.readFileSync(path.join(profile,"DevToolsActivePort"),"utf8");break}catch{}await new Promise(r=>setTimeout(r,100))}assert.ok(portFile,"Edge non ha avviato il protocollo locale");
  const [port,route]=portFile.trim().split(/\r?\n/);ws=new WebSocket(`ws://127.0.0.1:${port}${route}`);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
  ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.method==="Runtime.exceptionThrown")browserErrors.push(msg.params.exceptionDetails.text+":"+(msg.params.exceptionDetails.exception?.description||""));if(pending.has(msg.id)){const {resolve,reject,timer}=pending.get(msg.id);clearTimeout(timer);pending.delete(msg.id);msg.error?reject(new Error(msg.error.message)):resolve(msg.result)}};
  const send=(method,params={},sid=sessionId)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error("Timeout "+method))},10000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}))});
  const {targetId}=await send("Target.createTarget",{url:"about:blank"});sessionId=(await send("Target.attachToTarget",{targetId,flatten:true})).sessionId;
  await send("Page.enable");await send("Runtime.enable");
  const capture=async name=>{if(!process.env.AGENDA_TEST_RENDER_DIR)return;const dir=path.resolve(process.env.AGENDA_TEST_RENDER_DIR);assert.ok(!dir.toLowerCase().startsWith(root.toLowerCase()),"render solo fuori repository");fs.mkdirSync(dir,{recursive:true});const result=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(path.join(dir,name+".png"),Buffer.from(result.data,"base64"))};
  const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error("Eccezione nella fixture: "+r.exceptionDetails.exception?.description);return r.result.value};
  const click=async selector=>{await new Promise(r=>setTimeout(r,250));const rect=await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)});element.scrollIntoView({block:'center',behavior:'instant'});const r=element.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send("Input.dispatchMouseEvent",{type:"mousePressed",button:"left",clickCount:1,...rect});await send("Input.dispatchMouseEvent",{type:"mouseReleased",button:"left",clickCount:1,...rect})};
  for(const [width,height] of [[1280,900],[390,844],[768,1024]]){
   await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width===390});
   await send("Page.navigate",{url:`http://127.0.0.1:${server.address().port}/`});
   for(let i=0;i<100&&!await evaluate('!!document.getElementById("open")');i++)await new Promise(r=>setTimeout(r,30));
   await click("#open");
   for(let i=0;i<300&&!await evaluate('document.documentElement.dataset.printControls==="ready"');i++)await new Promise(r=>setTimeout(r,50));
   assert.equal(await evaluate('document.documentElement.dataset.printControls'),"ready",await evaluate('JSON.stringify({url:location.href,scripts:[...document.scripts].map(s=>s.textContent.slice(-250)),body:document.body.textContent.slice(-400)})'));assert.equal(await evaluate('location.protocol'),"blob:");
   await evaluate('window.printCalls=0;window.print=()=>{window.printCalls++}');
   await click("#studentReportPrint");await click("#studentReportPrint");
   assert.equal(await evaluate('window.printCalls'),1,"doppio gesto genera una sola stampa");
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`overflow ${width}`);
   await capture(`report-${width}`);
   assert.match(await evaluate('document.getElementById("studentReportPrintStatus").textContent'),/Se il pannello non compare/);
   await new Promise(r=>setTimeout(r,900));await evaluate('window.print=()=>{throw Error("simulato")}');await click("#studentReportPrint");
   assert.match(await evaluate('document.getElementById("studentReportPrintStatus").textContent'),/Impossibile aprire la stampa/);
   assert.equal(await evaluate('document.getElementById("studentReportOpenAgain").href.startsWith("blob:")'),true);
   await send("Emulation.setEmulatedMedia",{media:"print"});assert.equal(await evaluate('getComputedStyle(document.querySelector(".toolbar")).display'),"none");await send("Emulation.setEmulatedMedia",{media:"screen"});
  }
  for(const [width,height] of [[1280,900],[390,844],[768,1024]]){
   await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width===390});await evaluate('window.__testNavigatingAway=true');await send("Page.navigate",{url:`http://127.0.0.1:${server.address().port}/app-preview`});
   for(let i=0;i<300&&!await evaluate('!window.__testNavigatingAway && typeof state!=="undefined" && !!window.AgendaAuth?.currentUser() && !document.getElementById("appShell").classList.contains("hidden")');i++)await new Promise(r=>setTimeout(r,50));
   assert.equal(await evaluate('document.getElementById("appShell").classList.contains("hidden")'),false,"app reale autenticata fittizia disponibile");
   await evaluate('window.AgendaAppReady');assert.equal(await evaluate('state.students.length'),2);
   await click("#openOtherFunctions");await click("#openExams");await new Promise(r=>setTimeout(r,100));await click("#newExam");
   await click("#selectExamInstructor");for(let i=0;i<100&&!await evaluate('!!document.querySelector("#examInstructorChoices input")');i++)await new Promise(r=>setTimeout(r,50));
   await click("#examInstructorChoices label");await click("#confirmExamInstructor");assert.equal(await evaluate('state.examDraft.instructorId'),"teacher-demo");
   await click("#selectExamInstructor");await click("#cancelExamInstructor");assert.equal(await evaluate('state.examDraft.instructorId'),"teacher-demo");
   assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,`app overflow ${width}`);
   assert.equal(await evaluate('document.getElementById("examStartTimeOptions").lastElementChild.value'),"24:00");
   assert.equal(await evaluate('document.getElementById("examEndTime").required'),false);
   await capture(`esame-${width}`);
   await click("#selectExamExaminer");await click("#examExaminerPickerList label");await click("#confirmExamExaminer");
   await click("#addExamStudents");await click("#examStudentPickerList label:first-child");await click("#examStudentPickerList label:last-child");await click("#confirmExamStudents");
   await evaluate('document.getElementById("examStartTime").value="13.30";document.getElementById("examEndTime").value=""');
   await click('#examParticipants input[value="I"]');await click('#examParticipants article:last-child input[value="R"]');
   await evaluate('const note=document.querySelector("#examParticipants article:last-child textarea");note.value="Motivazione fittizia lunga. ".repeat(20);note.dispatchEvent(new Event("input",{bubbles:true}))');
   await click("#saveExam");for(let i=0;i<100&&!await evaluate('document.getElementById("exams").classList.contains("active")');i++)await new Promise(r=>setTimeout(r,30));
   assert.equal(await evaluate('document.getElementById("exams").classList.contains("active")'),true);
   assert.match(await evaluate('document.getElementById("examList").textContent'),/Idonei: 1 · Respinti: 1/);
   assert.match(await evaluate('document.getElementById("examList").textContent'),/ISTRUTTORE FITTIZIO/);
   assert.equal(await evaluate('(async()=> (await examStore.snapshot()).exams.every(e=>e.instructorId==="teacher-demo"&&e.startTime==="13:30"&&e.endTime===""))()'),true);
   await capture(`riepilogo-${width}`);
   await click("#examList button");assert.equal(await evaluate('state.examDraft.instructorId'),"teacher-demo");
   assert.equal(await evaluate('document.getElementById("examinerRouteZone").closest("section").id'),"examinerRouteView");
   const source=await evaluate('localStorage.getItem("autoscuola_v3_completa")');await evaluate('studentArchiveStore.replaceAll(state.students)');assert.equal(await evaluate('localStorage.getItem("autoscuola_v3_completa")'),source);
  }
  await evaluate('openStudent("student-demo");window.__savedOpen=window.open;window.open=()=>null');
  await click("#exportStudentPdf");
  const firstUrl=await evaluate('document.getElementById("openStudentPdfFallback").href');assert.ok(firstUrl.startsWith("blob:"));
  assert.equal(await evaluate('document.getElementById("openStudentPdfFallback").classList.contains("hidden")'),false);
  assert.match(await evaluate('document.getElementById("studentPdfFallbackMessage").textContent'),/Tocca APRI PDF/);
  await evaluate('window.open=()=>{throw Error("popup bloccato simulato")}');await click("#exportStudentPdf");
  assert.equal(await evaluate('state.studentId'),"student-demo");
  assert.notEqual(await evaluate('document.getElementById("openStudentPdfFallback").href'),firstUrl);
  assert.equal(await evaluate(`fetch(${JSON.stringify(firstUrl)}).then(r=>r.ok)`),true,"Blob precedente non revocato mentre potrebbe essere aperto");
  await evaluate('window.open=window.__savedOpen');
  assert.deepEqual(browserErrors,[],"nessuna eccezione JavaScript nel browser isolato");
  await send("Browser.close",{},null).catch(()=>{});
 }finally{
  ws?.close();
  if(child.exitCode===null)await Promise.race([exited,new Promise(r=>setTimeout(r,3000))]);
  if(child.exitCode===null)await new Promise(resolve=>{const stop=spawn("taskkill",["/PID",String(child.pid),"/T","/F"],{windowsHide:true,stdio:"ignore"});stop.once("exit",resolve)});
  for(const item of pending.values())clearTimeout(item.timer);
  server.closeAllConnections();await new Promise(r=>server.close(r));
  for(let i=0;i<50;i++){try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:2,retryDelay:100});break}catch(error){if(i===49)throw error;await new Promise(r=>setTimeout(r,300))}}
 }
});
