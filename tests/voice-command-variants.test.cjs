const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const root=path.join(__dirname,"..");
(async()=>{
 const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1024,height:768},isMobile:true,hasTouch:true});
  const menu=[["openGeneralStudentManagement","GESTIONE GENERALE ALLIEVI"],["openArchive","ALLIEVI ARCHIVIATI"],["manageChecklists","PERCORSO DIDATTICO"],["openExams","ESAMI"],["openExaminers","ESAMINATORI"],["openDocuments","DOCUMENTI"],["manageHomeSections","GESTIONE FUNZIONI"],["openSettings","IMPOSTAZIONI"],["openRegister","REGISTRO ORE E COMPENSI"],["openUserManagement","AREA RISERVATA"],["logout","ESCI"]];
  const html='<style>.hidden,[hidden]{display:none!important}.student-card{display:block;height:90px;width:100%}.view:not(.active){display:none}</style><section id="home" class="view active"><div class="home-guide-intro"></div></section><section id="categoryHub" class="view"><div style="height:800px">Intestazione fittizia</div><div id="studentSearchPanel" class="hidden"><input id="search"></div><button id="toggleStudentSearch">Ricerca</button><div id="students"></div><div style="height:1000px"></div></section><section id="student" class="view"></section><section id="lesson" class="view"></section><section id="settings" class="view"><div class="card"></div></section><button id="openOtherFunctions">Menu</button><button id="exportFullBackup">Backup</button><button id="restoreFullBackup">Ripristina</button><dialog id="otherFunctions">'+menu.map(([id,n])=>'<button id="'+id+'" class="home-pro-action"><span class="home-pro-label">'+n+'</span></button>').join("")+'<a class="home-pro-action" href="https://example.invalid/turni"><span class="home-pro-label">TURNI OPERATIVI ESAMINATORI</span></a><a class="home-pro-action" href="https://example.invalid/codice"><span class="home-pro-label">LINK AL CODICE DELLA STRADA</span></a></dialog>';
  await page.route("**/*",route=>route.request().url()==="https://agenda.local/"?route.fulfill({contentType:"text/html",body:html}):route.abort());
  await page.goto("https://agenda.local/");
  await page.evaluate(()=>{
   window.profile={id:"fittizio",role:"ADMIN"};window.AgendaAuth={currentUser:()=>profile,can:()=>true};window.HomeSections={isEnabled:()=>true,requirePath:()=>true};
   window.recognizers=[];window.actions=[];window.menuCalls=[];
   window.SpeechRecognition=class{constructor(){recognizers.push(this)}start(){queueMicrotask(()=>this.onstart?.())}abort(){}emit(text){this.onresult?.({resultIndex:0,results:[{0:{transcript:text,confidence:1},length:1,isFinal:true}]})}};
   window.context={view:"home",results:[],canNew:true,canBack:true,canClose:false,lessons:2,hasPath:true,map:false,orientation:true,recording:true,overlay:false};
   window.setView=(view,extra={})=>{Object.assign(context,{view,map:false,overlay:false,canClose:false},extra);document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===view));window.VoiceCommands?.cancel()};
   window.AgendaVoiceActions={context:()=>context,execute:c=>{actions.push({id:c.id,query:c.query,studentId:c.studentId});if(c.id==="find")return realFind(c)}};
   document.getElementById("openOtherFunctions").onclick=()=>document.getElementById("otherFunctions").showModal();
   document.querySelectorAll("#otherFunctions .home-pro-action").forEach(n=>n.onclick=e=>{e.preventDefault();menuCalls.push(n.id||n.href);document.getElementById("otherFunctions").close()});
  });
  const app=fs.readFileSync(path.join(root,"app.js"),"utf8"),toggle=app.match(/let studentSearchFocusTimer=null;[\s\S]*?\nfunction toggleStudentSearch[^\n]*/)[0],find=app.split("\n").find(l=>l.includes('if(c.id==="find")'));
  await page.addScriptTag({content:'window.$=id=>document.getElementById(id);window.state={filter:"auto",studentListMode:"hidden"};window.people=[{id:"m",name:"Mario Rossi",alternateName:"Rossi Mario",hint:"Sede A"},{id:"a",name:"Anna Rossi",alternateName:"Rossi Anna",hint:"Sede B"}];function renderStudents(){const q=$("search").value.toLowerCase();context.results=people.filter(s=>s.name.toLowerCase().includes(q));$("students").innerHTML=context.results.map(s=>"<button class=student-card>"+s.name+"</button>").join("")}function selectStudentSection(){setView("categoryHub");$("studentSearchPanel").classList.add("hidden");$("search").value=""}'+toggle+';$("search").oninput=renderStudents;window.realFind=async c=>{'+find+'};'});
  await page.addScriptTag({content:fs.readFileSync(path.join(root,"voice-commands.js"),"utf8")});
  await page.evaluate(()=>VoiceCommands.mount());
  async function view(v,x={}){await page.evaluate(([v,x])=>setView(v,x),[v,x])}
  async function expectPhrases(v,groups,extra={}){
   await view(v,extra);
   for(const [id,phrases] of groups)for(const phrase of phrases){
    const actual=await page.evaluate(t=>VoiceCommands.parse(t)?.id,phrase);
    assert.equal(actual,id,phrase);
   }
  }
  await expectPhrases("home",[
   ["find",["Trova Rossi","Cerca Rossi","Cerca l'allievo Rossi","Trova Mario","Trovami l'allieva Anna"]],
   ["all",["Visualizza tutti gli allievi","Fammi vedere tutti gli allievi"]],
   ["menu",["Apri altre funzioni","Apri tutte le voci","Fammi vedere tutte le voci"]],
   ["settings",["Apri le impostazioni","Vai alle impostazioni"]],
   ["register",["Apri Registro ore","Vai al registro","Apri ore e compensi"]],
   ["backup",["Prepara backup","Fai un backup","Crea il backup completo"]],
   ["menu:logout",["Esci","Disconnettimi","Termina la sessione"]],
   ["help",["Cosa posso dire?","Quali comandi posso usare"]]
  ]);
  await expectPhrases("student",[
   ["new",["Nuova guida","Apri una nuova lezione"]],
   ["lessons",["Vedi tutte le guide","Fammi vedere le guide"]],
   ["last",["Apri ultima guida","Mostra l'ultima guida"]],
   ["path",["Apri percorso didattico","Mostra il percorso dell'allievo"]],
   ["home",["Home","Vai alla Home","Torna alla schermata iniziale"]],
   ["back",["Torna indietro","Vai alla pagina precedente"]]
  ]);
  await expectPhrases("lesson",[
   ["activities",["Apri elenco attività","Fammi vedere le attività","Apri le attività didattiche"]],
   ["activityFind",["Cerca attività extraurbana","Trova attività extraurbana","Filtra le attività extraurbana"]],
   ["notes",["Apri note","Vai alle note"]],["reminder",["Apri prossima lezione","Apri il promemoria"]],
   ["expand",["Espandi mappa","Apri la mappa a tutto schermo"]],
   ["save",["Salva guida","Salva la lezione"]],["stopGps",["Ferma GPS","Arresta il gps"]]
  ]);
  await expectPhrases("lesson",[
   ["error",["Segnala errore","Registra un errore"]],
   ["north",["Nord in alto","Orienta la mappa a nord"]],
   ["course",["Direzione di marcia","Segui la direzione di marcia"]],
   ["reduce",["Riduci mappa","Torna alla mappa normale"]],
   ["close",["Chiudi","Chiudi questa finestra"]]
  ],{map:true,canClose:true});
  await expectPhrases("settings",[["restore",["Ripristina backup","Importa un backup completo"]]]);
  await view("home");
  for(const [id,label] of menu.filter(x=>x[0]!=="logout")){
   const expected=id==="openSettings"?"settings":id==="openRegister"?"register":"menu:"+id;
   assert.equal(await page.evaluate(t=>VoiceCommands.parse(t)?.id,"Mostrami "+label),expected);
  }
  assert.ok(await page.evaluate(()=>VoiceCommands.parse("Vai ai turni operativi")?.touch));
  assert.ok(await page.evaluate(()=>VoiceCommands.parse("Mostrami i turni degli esaminatori")?.touch));
  assert.ok(await page.evaluate(()=>VoiceCommands.parse("Mostrami il codice della strada")?.touch));
  const homeActions=await page.evaluate(()=>VoiceCommands.availableCommands().map(c=>c.id));
  assert.equal(homeActions.filter(id=>id==="settings").length,1);assert.equal(homeActions.filter(id=>id==="register").length,1);
  await page.evaluate(()=>{profile={id:"fittizio",role:"ISTRUTTORE"};document.getElementById("manageHomeSections").hidden=true;VoiceCommands.sync()});
  assert.equal(await page.evaluate(()=>VoiceCommands.parse("Mostrami gestione funzioni")),null);
  await page.evaluate(()=>{profile={id:"fittizio",role:"ADMIN"};document.getElementById("manageHomeSections").hidden=false;VoiceCommands.sync()});
  await view("lesson",{map:true});
  assert.equal(await page.evaluate(()=>VoiceCommands.parse("Fai un backup")),null);
  await view("home");
  async function mode(single){
   await view("home");await page.evaluate(()=>VoiceCommands.stop());await page.locator("#voiceHome").click();
   if(single){await page.locator("#voiceHome").click();await page.locator(".voice-once").click()}
  }
  async function say(text,single){await page.evaluate(t=>recognizers.at(-1).emit(t),(single?"":"OK Agenda, ")+text);await page.waitForTimeout(30)}
  for(const single of [false,true]){
   for(const phrase of ["Trova Rossi","Cerca Rossi","Cerca l'allievo Rossi","Cerca Mario"]){
    await mode(single);await say(phrase,single);
    const expected=phrase.endsWith("Mario")?"Mario":"Rossi";
    assert.equal(await page.locator("#search").inputValue(),expected);
    assert.notEqual(await page.evaluate(()=>document.activeElement.id),"search");
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const box=await page.locator(".student-card").first().boundingBox();assert.ok(box.y>=0&&box.y<120);
    assert.equal(await page.locator(".student-card").count(),expected==="Rossi"?2:1);
   }
   await mode(single);await say("Fai un backup",single);assert.equal(await page.evaluate(()=>actions.at(-1).id),"backup");
   await mode(single);await view("student");await say("Torna alla schermata iniziale",single);assert.equal(await page.evaluate(()=>actions.at(-1).id),"home");
   await mode(single);await say("Disconnettimi",single);
   assert.equal(await page.locator(".voice-dialog[open]").getAttribute("aria-label"),"Conferma comando");
   const count=await page.evaluate(()=>menuCalls.filter(id=>id==="logout").length);
   if(single){await page.locator(".voice-dialog button").filter({hasText:"ANNULLA"}).click()}
   else{await say("Annulla operazione",true)}
   assert.equal(await page.evaluate(()=>menuCalls.filter(id=>id==="logout").length),count);
  }
  await mode(false);await say("Disconnettimi",false);
  await say("Sì confermo",true);assert.equal(await page.evaluate(()=>menuCalls.filter(id=>id==="logout").length),1);
  await mode(false);await view("categoryHub",{results:[{id:"m",name:"Mario Rossi",alternateName:"Rossi Mario",hint:"Sede A"},{id:"a",name:"Anna Rossi",alternateName:"Rossi Anna",hint:"Sede B"}]});
  const before=await page.evaluate(()=>actions.length);await say("Apri Rossi",false);
  assert.equal(await page.locator(".voice-dialog[open]").getAttribute("aria-label"),"Scegli comando vocale");
  assert.equal(await page.locator(".voice-dialog button").count(),3);assert.equal(await page.evaluate(()=>actions.length),before);
  await page.locator(".voice-dialog button").last().click();
  await say("Apri una nuova lezione",false);assert.equal(await page.locator(".voice-dialog button").count(),3);
  await page.locator(".voice-dialog button").last().click();
  await view("student");await say("Apri percorso didattico",false);assert.equal(await page.locator(".voice-dialog button").count(),3);
  await page.locator(".voice-dialog button").last().click();
  await view("home");await say("Cosa posso dire?",false);
  const headings=await page.locator(".voice-dialog dt").allTextContents();assert.equal(headings.length,new Set(headings).size);
  assert.ok(await page.locator(".voice-dialog p").first().innerText().then(t=>t.includes("esempi")));
  assert.ok(headings.every(t=>!t.includes(" / ")));
  console.log("Controllo unico superato: varianti di tutte le azioni e del menu, schermate e permessi, OK Agenda e Comando singolo, ricerca con nome/cognome senza focus e con primo risultato visibile, backup, navigazione, conferma uscita, omonimi e azioni ambigue, un esempio per azione.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
