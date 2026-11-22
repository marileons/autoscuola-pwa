const fs=require("fs"),path=require("path"),a=require("node:assert/strict"),{chromium}=require("C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"),{fixture}=require("./shared-calendar-support.js");
const out=process.env.AGENDA_VOICE_OUTPUT||path.join(require("os").tmpdir(),"agenda-voice-local-test");fs.mkdirSync(out,{recursive:true});const repo="C:/agenda_zena/Agenda-Istruttori-v1-21-LAVORO",leaf="C:/Users/HP/Documents/Codex/2026-10-11/referenced-chatgpt-conversation-this-is-an-2/outputs/gps-heading-preview-2026-11-04";
(async()=>{const f=await fixture(),browser=await chromium.launch({executablePath:fs.existsSync(chromium.executablePath())?chromium.executablePath():"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true}),offline=new Set(),counts={i1:{me:0,public:0}},errors=[];let failSaves=false;
try{
 async function session(who,legacy){
 const context=await browser.newContext({viewport:{width:768,height:1024}}),page=await context.newPage();
 await page.addInitScript(()=>{window.voiceRecognizers=[];window.voiceWatches=0;class Recognition{constructor(){window.voiceRecognizers.push(this)}start(){queueMicrotask(()=>this.onstart?.())}stop(){}abort(){this.aborted=true}emit(text){const result={0:{transcript:text,confidence:.99},length:1,isFinal:true};this.onresult?.({resultIndex:0,results:[result]})}}window.SpeechRecognition=Recognition;Object.defineProperty(navigator,"geolocation",{value:{watchPosition(fn){window.voiceGps=fn;window.voiceWatches++;return window.voiceWatches},clearWatch(){}}});});
 await page.clock.install({time:new Date("2026-11-21T12:00:00Z")});
 await page.addInitScript(value=>localStorage.setItem("agenda-mr-christmas-theme-v1",value),legacy);
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/*",async route=>{
 const request=route.request(),u=new URL(request.url()),p=u.pathname;
 if(u.hostname==="unpkg.com"){if(p.endsWith("/leaflet.js"))return route.fulfill({path:path.join(leaf,"leaflet-1.9.4.js")});if(p.endsWith("/leaflet.css"))return route.fulfill({path:path.join(leaf,"leaflet-1.9.4.css")});return route.abort()}
 if(u.hostname!=="agenda.local")return route.abort();
 if(p.startsWith("/api/")){
 if(who==="i1"){if(p==="/api/auth/me")counts.i1.me++;if(p==="/api/public-config/christmas-theme")counts.i1.public++}
 if(offline.has(who))return route.abort("internetdisconnected");
 if(failSaves&&p==="/api/home-sections"&&request.method()==="POST")return route.fulfill({status:503,json:{error:"Salvataggio fittizio non riuscito."}});
 const h=new Headers(f.request(who,p).headers);if(request.method()!=="GET")h.set("origin","https://calendar.test");
 const response=await f.worker.fetch(new Request("https://calendar.test"+p+u.search,{method:request.method(),headers:h,...(request.postData()?{body:request.postData()}:{})}),f.env);
 return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 }
 const file=path.resolve(repo,"."+(p==="/"?"/index.html":p));if(!fs.existsSync(file))return route.abort();return route.fulfill({path:file});
 });
 await page.goto("https://agenda.local");await page.locator("#home.active #openOtherFunctions").waitFor({timeout:45000});
 return {context,page};
 }

 const A=await session("principal","off");const p=A.page;

 await p.evaluate(()=>{state.students=[normalizeStudent({id:"voice-fake-1",firstName:"Mario",lastName:"Parodi",category:"auto",siteName:"Sede fittizia",lessons:[]})];});
 a.equal(await p.locator("#voiceHome").isVisible(),false);
 a.equal(await p.evaluate(()=>window.voiceRecognizers.length),0);
 await p.locator("#home [data-f=auto]").click();await p.locator("#toggleStudentSearch").click();await p.locator("#search").fill("Parodi");await p.locator("#students .student-card").first().click();await p.locator("#newLesson").click();
 await p.locator("#lesson.active").waitFor();
 await p.locator("#startGps").click();
 const fix=async n=>{await p.clock.fastForward(1000);await p.evaluate(n=>window.voiceGps({coords:{latitude:44.4056+n*.00005,longitude:8.9463,accuracy:5,speed:5,heading:0},timestamp:Date.now()}),n);};
 await fix(0);await fix(1);await fix(2);
 await p.locator("#signalDrivingError").click();a.equal(await p.evaluate(()=>state.tempErrors.length),1);
 a.equal(await p.evaluate(()=>window.voiceRecognizers.length),0);
 await p.evaluate(async()=>{await persistLessonSession();stopGps();await lessonDraftStore.remove(drivingErrorAccountId(),state.studentId,state.lessonId);show("home")});
 await p.locator("#openOtherFunctions").click();await p.locator("#openSettings").click();await p.locator("#exportFullBackup").click();await p.clock.fastForward(150);
 await p.getByText("Backup completo pronto",{exact:true}).waitFor();
 a.equal(await p.locator("#fullBackupModal button").filter({hasText:"SALVA BACKUP"}).isVisible(),true);
 await p.locator("#fullBackupModal button").filter({hasText:"CHIUDI"}).click();
 await p.locator("#voiceWakeEnabled").check();
 a.equal(await p.evaluate(()=>window.voiceRecognizers.length),0);await p.evaluate(()=>show("home"));await p.locator("#voiceHome").click();
 a.equal(await p.evaluate(()=>window.voiceRecognizers.at(-1).continuous),true);
 const emit=async text=>{await p.evaluate(text=>window.voiceRecognizers.at(-1).emit(text),text);await p.waitForTimeout(30);};
 await emit("OK Agenda, home");
 await emit("OK Agenda, trova Parodi");await p.locator("#categoryHub.active").waitFor();a.equal(await p.locator("#students .student-card").count(),1);
 await emit("OK Agenda, nuova guida");await p.locator("#lesson.active").waitFor();
 await emit("OK Agenda, apri elenco attività");a.equal(await p.locator("#toggleLessonActivity").getAttribute("aria-expanded"),"true");
 await emit("OK Agenda, cerca attività extraurbana");a.equal(await p.locator("#activitySearch").inputValue(),"extraurbana");
 await emit("OK Agenda, espandi mappa");await p.locator(".gps-map-dialog[open]").waitFor();
 await p.evaluate(()=>{if(state.watch===null)startGps()});await fix(3);await fix(4);await fix(5);
 const before=await p.evaluate(()=>({watch:state.watch,points:state.tempRoute.length,errors:state.tempErrors.length,watches:window.voiceWatches}));
 await emit("OK Agenda");a.match(await p.locator("#voiceWakeBar span").innerText(),/dimmi il comando/i);
 await emit("segnala errore");await p.locator(".map-driving-error-dialog[open]").waitFor();
 await fix(6);
 a.equal(await p.evaluate(()=>state.watch),before.watch);a.equal(await p.evaluate(()=>window.voiceWatches),before.watches);
 a.ok(await p.evaluate(()=>state.tempRoute.length)>before.points);
 a.equal(await p.evaluate(()=>state.tempErrors.length),before.errors+1);
 await emit("OK Agenda, chiudi");await p.locator(".map-driving-error-dialog").waitFor({state:"detached"});
 await emit("OK Agenda, nord in alto");a.equal(await p.evaluate(()=>state.liveOrientation.getMode()),"north");
 await emit("OK Agenda, direzione di marcia");a.equal(await p.evaluate(()=>state.liveOrientation.getMode()),"course");
 await p.setViewportSize({width:375,height:812});
 await p.screenshot({path:path.join(out,"voce-mappa-375.png")});
 await emit("OK Agenda, riduci mappa");
 await p.evaluate(()=>{stopGps();show("home");state.students.push(normalizeStudent({id:"voice-fake-2",firstName:"Mario",lastName:"Parodi",category:"auto",siteName:"Altra sede fittizia",lessons:[]}));});
 await emit("OK Agenda, trova Parodi");a.equal(await p.locator("#students .student-card").count(),2);
 await emit("OK Agenda, apri Mario Parodi");await p.locator(".voice-dialog[open]").waitFor();a.equal(await p.evaluate(()=>document.querySelector(".view.active").id),"categoryHub");
 a.equal(await p.locator(".voice-dialog button").filter({hasText:"apri Mario Parodi"}).count(),2);
 await p.screenshot({path:path.join(out,"voce-omonimi-375.png")});
 await p.locator(".voice-dialog > button").first().click();await p.locator("#student.active").waitFor();
 await emit("OK Agenda, home");
 await emit("OK Agenda, cosa posso dire");await p.locator(".voice-dialog[open]").waitFor();
 a.match(await p.locator(".voice-dialog").innerText(),/GESTIONE FUNZIONI/i);
 await p.screenshot({path:path.join(out,"voce-comandi-375.png")});
 await emit("chiudi");
 await emit("OK Agenda, prepara backup");await p.clock.fastForward(150);await p.getByText("Backup completo pronto",{exact:true}).waitFor();
 await p.locator("#fullBackupModal button").filter({hasText:"CHIUDI"}).click();
 await emit("OK Agenda, esci");await p.locator(".voice-dialog[open]").waitFor();
 a.ok(await p.evaluate(()=>AgendaAuth.currentUser()));
 await emit("Annulla");a.ok(await p.evaluate(()=>AgendaAuth.currentUser()));
 await emit("OK Agenda, vai in impostazioni");
 await p.locator("#voiceWakeEnabled").uncheck();a.equal(await p.evaluate(()=>window.voiceRecognizers.at(-1).aborted),true);
 a.equal(await p.locator("#voiceWakeBar").isVisible(),false);a.equal(await p.locator("#voiceHome").isVisible(),false);
 console.log("ENABLE"); await p.locator("#voiceWakeEnabled").check();
 await p.reload();await p.locator("#home.active").waitFor({timeout:45000});a.equal(await p.evaluate(()=>window.voiceRecognizers.length),0);await p.locator("#voiceHome").click();a.equal(await p.evaluate(()=>window.voiceRecognizers.length),1);
 await p.evaluate(()=>window.voiceRecognizers.at(-1).onend());a.equal(await p.locator("#voiceWakeBar").isVisible(),false);a.equal(await p.locator("#voiceHome").getAttribute("data-listening"),"false");
 const count=await p.evaluate(()=>window.voiceRecognizers.length);await p.clock.fastForward(30000);a.equal(await p.evaluate(()=>window.voiceRecognizers.length),count);
 await p.evaluate(()=>{window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});await p.locator("#voiceHome").click();a.match(await p.locator("#voiceWakeBar span").innerText(),/non disponibile/i);
 const B=await session("i1","off");await B.page.evaluate(()=>{localStorage.setItem("agenda-voice-wake-v1:i1","on");VoiceCommands.sync()});
 const names=await B.page.evaluate(()=>VoiceCommands.availableCommands().flatMap(c=>c.phrases));a.ok(!names.some(n=>/gestione funzioni/i.test(n)));a.ok(names.some(n=>/impostazioni/i.test(n)));
 await B.page.evaluate(()=>VoiceCommands.stop());await B.context.close();
 a.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,"risultato.json"),JSON.stringify({engine:"Chromium desktop; viewport telefono/tablet, riconoscitore e GPS simulati",passed:["opzione spenta: ricerca, nuova guida, errore, backup manuali","due comandi consecutivi e flusso trova/nuova guida/attività","omonimi: scelta esplicita","mappa: errore e orientamento senza nuovo watcher o stop GPS","backup: SALVA BACKUP esistente","esci: conferma e annullamento","spento, riaccesso, interruzione browser e microfono assente","menu principale/istruttore filtrato"],deviceSpeechRecognition:"NON verificato su dispositivi reali"},null,2));
 console.log("OK integrazione locale; voce e GPS simulati. Risultati in "+out);
 await A.context.close();
}finally{await browser.close();f.close()}})().catch(e=>{console.error(e);process.exitCode=1});
