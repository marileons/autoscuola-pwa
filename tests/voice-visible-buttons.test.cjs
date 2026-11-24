const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {chromium}=require("C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
(async()=>{
 const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
 try{
  const p=await browser.newPage();
  await p.route("**/*",r=>r.request().url()==="https://agenda.local/"?r.fulfill({contentType:"text/html",body:'<style>.view:not(.active),[hidden],.hidden{display:none!important}</style><section id="home" class="view active"><div class="home-guide-intro"></div></section><section id="details" class="view"><h2>Dettaglio fittizio</h2><button id="goBack">INDIETRO</button><button id="goHome">HOME</button><button id="longLabel"><svg aria-hidden="true"><text>decorazione</text></svg>MOSTRA IL RIEPILOGO COMPLETO DELLE GUIDE SALVATE</button><button id="logoutHome">ESCI</button><button id="hiddenButton" hidden>NON VISIBILE</button><button disabled>NON DISPONIBILE</button><button aria-disabled="true">BLOCCATO</button><button>⛶</button><div id="duplicates" hidden><article><h3>Prima scheda</h3><button id="a">APRI DETTAGLIO</button></article><article><h3>Seconda scheda</h3><button id="b">APRI DETTAGLIO</button></article></div></section><section id="settings" class="view"><div class="card"></div></section><button id="openOtherFunctions" hidden>ALTRE FUNZIONI</button><dialog id="otherFunctions"><button id="logout" class="home-pro-action"><span class="home-pro-label">ESCI</span></button></dialog><dialog id="testDialog"><h2>Conferma fittizia</h2><button id="appConfirm">CONFERMA</button><button id="appCancel">ANNULLA</button></dialog>'}):r.abort());
  await p.goto("https://agenda.local/");
  await p.evaluate(()=>{
   window.profile={id:"istruttore-fittizio",role:"ISTRUTTORE"};window.operable=true;
   window.AgendaAuth={currentUser:()=>profile,can:()=>operable};window.HomeSections={isEnabled:()=>true};
   window.context={view:"home",results:[],canBack:true,canClose:false,lessons:0,hasPath:false,map:false,overlay:false};
   window.calls={back:0,home:0,long:0,logout:0,confirm:0,cancel:0,a:0,b:0,adapter:0};window.recognizers=[];
   window.SpeechRecognition=class{constructor(){recognizers.push(this)}start(){queueMicrotask(()=>this.onstart?.())}abort(){}emit(text){this.onresult?.({resultIndex:0,results:[{0:{transcript:text,confidence:1},length:1,isFinal:true}]})}};
   window.AgendaVoiceActions={context:()=>context,execute:()=>{calls.adapter++}};
   window.view=id=>{context.view=id;document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));window.VoiceCommands?.cancel()};
   document.getElementById("goBack").onclick=()=>{calls.back++;view("home")};
   document.getElementById("goHome").onclick=()=>{calls.home++;view("home")};
   document.getElementById("longLabel").onclick=()=>calls.long++;
   document.getElementById("logoutHome").onclick=()=>calls.logout++;
   for(const id of ["a","b"])document.getElementById(id).onclick=()=>calls[id]++;
   document.getElementById("appConfirm").onclick=()=>{calls.confirm++;document.getElementById("testDialog").close()};
   document.getElementById("appCancel").onclick=()=>{calls.cancel++;document.getElementById("testDialog").close()};
  });
  await p.addScriptTag({content:fs.readFileSync(path.join(__dirname,"..","voice-commands.js"),"utf8")});
  await p.evaluate(()=>VoiceCommands.mount());
  async function start(single){
   await p.evaluate(()=>{view("home");VoiceCommands.stop()});await p.locator("#voiceHome").click();
   if(single){await p.locator("#voiceHome").click();await p.locator(".voice-once").click()}
   await p.evaluate(()=>view("details"));
  }
  async function say(text,single=false){await p.evaluate(t=>recognizers.at(-1).emit(t),(single?"":"OK Agenda, ")+text);await p.waitForTimeout(20)}
  for(const single of [false,true]){
   const before=await p.evaluate(()=>({...calls}));
   await start(single);await say("Indietro",single);assert.equal(await p.evaluate(()=>calls.back),before.back+1);
   await start(single);await say("Home",single);assert.equal(await p.evaluate(()=>calls.home),before.home+1);
   await start(single);await say("Mostra il riepilogo completo delle guide salvate",single);assert.equal(await p.evaluate(()=>calls.long),before.long+1);
   await start(single);
   assert.ok(await p.evaluate(()=>VoiceCommands.parse("Disconnettimi")?.node===document.getElementById("logoutHome")));
   await say("Esci",single);assert.equal(await p.evaluate(()=>calls.logout),before.logout);
   assert.equal(await p.locator(".voice-dialog[open]").getAttribute("aria-label"),"Conferma comando");
   await say("Conferma",true);assert.equal(await p.evaluate(()=>calls.logout),before.logout+1);
  }
  await start(false);
  for(const phrase of ["NON VISIBILE","NON DISPONIBILE","BLOCCATO","⛶"])assert.equal(await p.evaluate(t=>VoiceCommands.parse(t),phrase),null);
  await p.evaluate(()=>document.getElementById("goHome").disabled=true);
  assert.equal(await p.evaluate(()=>VoiceCommands.parse("Home")),null);
  assert.equal(await p.evaluate(()=>VoiceCommands.parse("Vai alla Home")),null);
  await p.evaluate(()=>document.getElementById("goHome").disabled=false);
  await p.evaluate(()=>document.getElementById("testDialog").showModal());
  assert.equal(await p.evaluate(()=>VoiceCommands.parse("Home")),null);
  await say("Conferma");assert.equal(await p.evaluate(()=>calls.confirm),1);
  await p.evaluate(()=>document.getElementById("testDialog").showModal());
  await say("Annulla");assert.equal(await p.evaluate(()=>calls.cancel),1);
  await p.evaluate(()=>document.getElementById("duplicates").hidden=false);
  const before=await p.evaluate(()=>calls.a+calls.b);
  await say("Apri dettaglio");
  assert.equal(await p.locator(".voice-dialog[open]").getAttribute("aria-label"),"Scegli comando vocale");
  assert.equal(await p.evaluate(()=>calls.a+calls.b),before);
  const option=await p.locator(".voice-dialog>button").first().innerText();
  await say(option);
  assert.equal(await p.evaluate(()=>calls.a),1);assert.equal(await p.evaluate(()=>calls.b),0);
  await p.evaluate(()=>document.getElementById("duplicates").hidden=true);
  await say("Cosa posso dire?");
  const labels=await p.locator(".voice-dialog dt").allTextContents();
  for(const name of ["INDIETRO","HOME","MOSTRA IL RIEPILOGO COMPLETO DELLE GUIDE SALVATE","ESCI"])assert.ok(labels.includes(name),name);
  assert.ok(!labels.includes("NON DISPONIBILE"));
  await say("Chiudi");
  assert.equal(await p.locator(".voice-dialog[open]").count(),0);
  await p.evaluate(()=>operable=false);
  assert.equal(await p.evaluate(()=>VoiceCommands.availableCommands().length),0);
  assert.equal(await p.evaluate(()=>calls.adapter),0);
  console.log("Controllo unico superato: etichette Indietro, Home, comando lungo ed Esci con conferma in entrambe le modalità; stessa azione del tocco, finestre Conferma/Annulla, nomi duplicati con scelta, pulsanti nascosti/disabilitati esclusi, permessi ed elenco aggiornato.");
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
