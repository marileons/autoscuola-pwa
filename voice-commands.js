/* Account-scoped on this device. Available by default; listening requires a tap. No recordings or transcripts stored. */
(()=>{
"use strict";
const $=id=>document.getElementById(id),user=()=>window.AgendaAuth?.currentUser?.(),allowed=()=>["ADMIN","ISTRUTTORE"].includes(user()?.role)&&!user()?.mustChangePassword;
let account=null,single=false,wake=false,listening=false,panelOpen=false,recognition=null,kind=null,epoch=0,dialog=null,timer=null,armedTimer=null,armed=false,status="Microfono spento.",toastTimer=null,bar=null,audio=null,pending=null,modalObserver=null,pageEntry=null,lastViewSignature="";
const key=suffix=>user()?.id?"agenda-voice-"+suffix+"-v1:"+user().id:null;
const Constructor=()=>window.SpeechRecognition||window.webkitSpeechRecognition;
const supported=()=>!!Constructor()&&window.isSecureContext;
const map=()=>document.querySelector(".gps-map-dialog #liveMap");

const ctx=()=>window.AgendaVoiceActions?.context?.()||{view:"",results:[]};
const at=(...views)=>views.includes(ctx().view)&&!ctx().overlay;
const outsideLesson=()=>!ctx().map&&ctx().view!=="lesson"&&!ctx().overlay;
const literal=s=>String(s).trim().replace(/[.!?]+$/,"").replace(/\s+/g," ").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("it-IT");

const COMMANDS=[
{id:"find",phrases:["Trova [nome o cognome]"],pattern:/^(?:trova|cerca)\s+([\p{L}\p{M}'’ -]{1,100})$/u,action:"Cerca gli allievi attivi e mostra i risultati.",available:()=>at("home","categoryHub")&&window.HomeSections?.isEnabled("auto")},
{id:"all",phrases:["Visualizza tutti gli allievi","Mostra tutti gli allievi"],action:"Apre l’elenco completo AUTO.",available:()=>at("home","categoryHub")&&window.HomeSections?.isEnabled("auto")},
{id:"new",phrases:["Nuova guida"],action:"Apre una guida per l’allievo corrente o per l’unico risultato attivo.",available:()=>at("student")&&ctx().canNew||at("categoryHub")&&ctx().results.length===1&&!ctx().results[0].archived},
{id:"lessons",phrases:["Vedi tutte le guide","Mostra tutte le guide"],action:"Mostra le guide salvate dell’allievo.",available:()=>at("student")&&ctx().lessons>0},
{id:"last",phrases:["Apri ultima guida","Apri l’ultima guida"],action:"Riapre l’ultima guida salvata.",available:()=>at("student")&&ctx().lessons>0},
{id:"path",phrases:["Apri percorso didattico"],action:"Mostra il riepilogo didattico cumulativo dell’allievo.",available:()=>at("student")&&ctx().hasPath},
{id:"activities",phrases:["Apri elenco attività","Fammi vedere le attività","Apri attività didattica"],action:"Apre il pannello attività esistente.",available:()=>at("lesson")&&!ctx().map},
{id:"activityFind",phrases:["Cerca attività [nome]"],pattern:/^cerca attivita\s+(.{1,100})$/u,action:"Filtra il catalogo di attività della guida.",available:()=>at("lesson")&&!ctx().map},
{id:"notes",phrases:["Apri note","Apri le note"],action:"Porta al campo note, senza modificarlo.",available:()=>at("lesson")&&!ctx().map},
{id:"reminder",phrases:["Apri prossima lezione"],action:"Apre il promemoria della prossima lezione.",available:()=>at("lesson")&&!ctx().map},
{id:"expand",phrases:["Espandi mappa","Apri mappa espansa"],action:"Espande la stessa mappa GPS.",available:()=>at("lesson")&&!ctx().map},
{id:"error",phrases:["Segnala errore"],action:"Apre la classificazione sopra la mappa; il GPS continua.",available:()=>ctx().map&&!ctx().overlay},
{id:"north",phrases:["Nord in alto","Metti nord in alto"],action:"Imposta Nord in alto.",available:()=>ctx().map&&!ctx().overlay&&ctx().orientation},
{id:"course",phrases:["Direzione di marcia"],action:"Imposta la direzione di marcia.",available:()=>ctx().map&&!ctx().overlay&&ctx().orientation},
{id:"reduce",phrases:["Riduci mappa","Chiudi mappa"],action:"Torna alla mappa normale senza fermare il GPS.",available:()=>ctx().map&&!ctx().overlay},
{id:"menu",phrases:["Apri altre funzioni","Apri tutte le voci"],action:"Mostra il menu Altre funzioni.",available:()=>outsideLesson()},
{id:"settings",phrases:["Vai in Impostazioni"],action:"Apre Impostazioni.",available:()=>outsideLesson()},
{id:"register",phrases:["Apri Registro ore"],action:"Apre il Registro con lo sblocco previsto.",available:()=>outsideLesson()},
{id:"backup",phrases:["Prepara backup"],action:"Prepara il backup completo; SALVA BACKUP resta manuale.",available:()=>outsideLesson()&&!$("exportFullBackup")?.disabled},
{id:"quick",phrases:["Backup rapido"],action:"Non disponibile in questa edizione.",available:()=>false},
{id:"home",phrases:["Home","Vai alla Home"],action:"Torna alla Home. Se c’è una guida aperta, chiede conferma.",available:()=>ctx().view!=="home"&&!ctx().overlay||$("otherFunctions")?.open},
{id:"back",phrases:["Torna indietro","Vai indietro"],action:"Usa il comando INDIETRO della schermata.",available:()=>ctx().canBack&&!ctx().overlay},
{id:"close",phrases:["Chiudi"],action:"Chiude la finestra corrente con il suo comando esistente.",available:()=>!!ctx().canClose},
{id:"save",phrases:["Salva guida"],action:"Chiede conferma, poi usa SALVA GUIDA.",confirm:true,available:()=>at("lesson")&&!ctx().map},
{id:"stopGps",phrases:["Ferma GPS"],action:"Chiede conferma prima di arrestare il GPS.",confirm:true,available:()=>ctx().view==="lesson"&&ctx().recording&&!ctx().overlay},
{id:"restore",phrases:["Ripristina backup"],action:"Chiede conferma, poi apre la selezione del file; restano le verifiche del ripristino.",confirm:true,touch:true,available:()=>at("settings")&&!$("restoreFullBackup")?.disabled},
{id:"help",phrases:["Cosa posso dire","Comandi disponibili"],action:"Mostra i comandi disponibili in questo momento.",available:()=>true}
];
function menuCommands(){
 const menuAllowed=outsideLesson();
 return [...document.querySelectorAll("#otherFunctions .home-pro-action")].filter(node=>!node.disabled&&!node.closest("[hidden],.hidden")&&getComputedStyle(node).display!=="none"&&getComputedStyle(node).visibility!=="hidden").map(node=>{
  const name=node.querySelector(".home-pro-label")?.textContent.trim();if(!name)return null;
  const logout=literal(name)==="esci",link=node.tagName==="A";
  return{id:"menu:"+(node.id||node.getAttribute("href")),phrases:logout?["Esci"]:["Apri "+name,"Vai a "+name],action:logout?"Chiede conferma prima di disconnettersi.":link?"Apre il link con conferma al tocco.":"Usa il pulsante "+name+(node.id==="openUserManagement"?" e lo sblocco previsto.":"."),confirm:logout||link,touch:link,node,available:()=>true};
 }).filter(command=>command&&(menuAllowed||command.id==="menu:logout"));
}
function availableCommands(){
 if(!allowed()||!wake||!window.AgendaAuth?.can?.("operate"))return[];
 if(pending)return[{id:"confirm",phrases:["Conferma"],action:pending.command.touch?"Conferma al tocco richiesta dal dispositivo.":"Conferma l’operazione richiesta."},{id:"cancel",phrases:["Annulla"],action:"Annulla l’operazione."}];
 if(dialog)return[{id:"closeHelp",phrases:["Chiudi"],action:"Chiude questa finestra."}];
 const commands=COMMANDS.filter(c=>c.available());
 if(at("categoryHub"))for(const s of ctx().results){commands.push({id:"student:"+s.id,studentId:s.id,phrases:[...new Set(["Apri "+s.name,"Apri "+s.alternateName])],action:"Apre "+s.name+" · "+s.hint,available:()=>true});if(!s.archived)commands.push({id:"newFor:"+s.id,studentId:s.id,phrases:[...new Set(["Nuova guida per "+s.name,"Nuova guida per "+s.alternateName])],action:"Nuova guida · "+s.name+" · "+s.hint,available:()=>true});}
 return [...commands,...menuCommands()];
}
function matches(text){const raw=String(text).trim().replace(/[.!?]+$/,"").replace(/\s+/g," "),s=literal(raw);return availableCommands().flatMap(c=>{const m=c.pattern?.exec(s);if(m)return[{...c,query:c.id==="find"?raw.replace(/^(?:trova|cerca)\s+/iu,""):m[1],label:raw}];return c.phrases.some(p=>literal(p)===s)?[{...c,label:text.trim()}]:[];});}
function parse(text){return matches(text)[0]||null;}
function showCommands(){
 panelOpen=false;closeDialog();dialog=document.createElement("dialog");dialog.className="voice-dialog";dialog.dataset.voiceUi="";dialog.setAttribute("aria-label","Comandi disponibili");
 const h=document.createElement("h2"),p=document.createElement("p"),list=document.createElement("dl"),close=document.createElement("button");
 h.textContent="COMANDI DISPONIBILI";p.textContent="Comando singolo: di’ direttamente la frase, senza «OK Agenda». Con OK Agenda: di’ «OK Agenda» e la frase, insieme oppure dopo il segnale.";
 // Build from the same current registry before marking this dialog as open.
 const own=dialog;dialog=null;const commands=availableCommands();dialog=own;
 for(const c of commands){const t=document.createElement("dt"),d=document.createElement("dd");t.textContent=c.phrases.join(" / ");d.textContent=c.action;list.append(t,d);}
 close.type="button";close.textContent="CHIUDI";close.onclick=()=>{closeDialog();idle();};dialog.append(h,p,list,close);dialog.addEventListener("cancel",e=>{e.preventDefault();closeDialog();idle();});document.body.append(dialog);dialog.showModal();update();
}
function helpButton(){const b=document.createElement("button");b.type="button";b.className="voice-help";b.dataset.voiceUi="";b.textContent="COMANDI DISPONIBILI";b.onclick=e=>{e.stopPropagation();showCommands();};return b;}
function clearArmed(){armed=false;clearTimeout(armedTimer);armedTimer=null;}
function closeDialog(){pending=null;if(dialog){dialog.close();dialog.remove();dialog=null;}}
function update(){
 const context=ctx(),view=document.getElementById(context.view),inMap=!!map(),signature=[context.view,inMap,!!context.overlay].join("|");
 if(signature!==lastViewSignature){panelOpen=false;lastViewSignature=signature;}
 const enabled=allowed()&&wake;
 if(pageEntry){pageEntry.hidden=!enabled||!view||context.view==="home"||inMap;if(!pageEntry.hidden&&pageEntry.parentNode!==view)view.prepend(pageEntry);}
 if(bar){
  bar.hidden=!enabled||!panelOpen;bar.querySelector("span").textContent=status;bar.querySelector(".voice-start").hidden=!!recognition;bar.querySelector(".voice-stop").disabled=!recognition;
  const parent=document.activeElement?.closest("dialog[open]")||document.querySelector(".map-driving-error-dialog[open]")||dialog||document.querySelector(".choice-modal:not(.hidden) > .choice-card")||document.querySelector(".gps-map-dialog")||view||document.body;
  const inline=(parent.tagName==="DIALOG"&&!parent.classList.contains("gps-map-dialog"))||parent.classList.contains("choice-card");
  bar.classList.toggle("voice-in-dialog",inline);bar.classList.toggle("voice-view-panel",parent===view);bar.querySelector(".voice-home-close").hidden=false;
  if(parent!==bar.parentNode){if(inline)parent.prepend(bar);else parent.append(bar);}
 }
 for(const button of document.querySelectorAll(".voice-microphone")){
  button.removeAttribute("aria-pressed");button.dataset.listening=String(listening);button.setAttribute("aria-expanded",String(panelOpen));
  button.setAttribute("aria-label",(panelOpen?"Chiudi":"Apri")+" comandi vocali · "+(listening?"ascolto attivo":"microfono non in ascolto"));
 }
}
function stop(message="Microfono spento."){
 listening=false;epoch++;clearTimeout(timer);timer=null;clearArmed();const r=recognition;recognition=null;kind=null;
 if(r){r.onresult=r.onerror=r.onend=r.onstart=null;try{r.abort()}catch{}}
 closeDialog();status=message;update();
}
function navigation(){panelOpen=false;update();}
function feedback(text){
 let box=$("voiceToast");if(!box){box=document.createElement("p");box.id="voiceToast";box.className="voice-toast";box.setAttribute("role","status");document.body.append(box);}
 box.textContent=text;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,8000);
}
function signal(){
 status="In ascolto · dimmi il comando.";update();
 try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;audio??=new C();if(audio.state!=="running")return;const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=660;g.gain.setValueAtTime(.04,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.14);o.start();o.stop(audio.currentTime+.15);}catch{}
}
function idle(){clearArmed();if(kind==="wake"&&recognition){status="In ascolto · in attesa di «OK Agenda».";update();}}

function contextStamp(){const x=ctx();return [x.view,x.studentId||"",x.map].join("|");}
function requestConfirmation(command,owner){
 panelOpen=false;closeDialog();pending={command,owner,stamp:contextStamp()};dialog=document.createElement("dialog");dialog.className="voice-dialog";dialog.setAttribute("aria-label","Conferma comando");
 const h=document.createElement("h2"),p=document.createElement("p"),yes=document.createElement("button"),no=document.createElement("button");
 h.textContent="CONFERMA";p.textContent="Confermi «"+command.label+"»? "+(command.touch?"Per questa operazione usa il pulsante CONFERMA.":"Puoi dire Conferma o Annulla, oppure usare i pulsanti.");
 yes.type=no.type="button";yes.textContent="CONFERMA";no.textContent="ANNULLA";
 yes.onclick=()=>finishConfirmation(true,true);no.onclick=()=>finishConfirmation(false);
 dialog.append(h,p,yes,no);dialog.addEventListener("cancel",e=>{e.preventDefault();finishConfirmation(false);});document.body.append(dialog);dialog.showModal();update();
}
function finishConfirmation(yes,touch=false){
 const saved=pending;if(!saved)return;
 if(yes&&saved.command.touch&&!touch){feedback("Conferma con il pulsante per aprire il selettore o il link.");return;}
 closeDialog();
 if(yes&&saved.owner===user()?.id&&saved.stamp===contextStamp())run(saved.command,saved.owner,true);
 else{feedback(yes?"Operazione annullata: contesto cambiato.":"Operazione annullata.");idle();}
}
function run(command,owner,confirmed=false){

 if(!allowed()||!wake||user()?.id!==owner){feedback("Comando annullato: account o impostazione cambiati.");return;}
 if(command.id==="confirm"){finishConfirmation(true);return;}if(command.id==="cancel"){finishConfirmation(false);return;}
 if(command.id==="closeHelp"){closeDialog();idle();return;}
 const canonical=availableCommands().find(c=>c.id===command.id);if(!canonical){feedback("Comando non disponibile in questa schermata o per questo profilo.");idle();return;}
 command={...canonical,...command};
 if(command.id==="help"){showCommands();idle();return;}
 const leaving=ctx().view==="lesson"&&["home","back"].includes(command.id);
 if(!confirmed&&(command.confirm||leaving)){requestConfirmation(command,owner);return;}
 const wasSingle=kind==="single";if(wasSingle)stop();else closeDialog();panelOpen=false;update();
 feedback("Ho capito: «"+command.label+"»");
 try{
  if(command.node){if(command.node.disabled||command.node.closest("[hidden],.hidden"))throw Error("Voce non più disponibile.");if(command.node.tagName!=="A"&&!$("otherFunctions").open)$("openOtherFunctions").click();command.node.click();}
  else Promise.resolve(window.AgendaVoiceActions.execute(command)).catch(e=>feedback(e.message||"Comando non disponibile."));
 }catch(e){feedback(e.message||"Comando non disponibile.");}
 idle();if(wasSingle){status="Comando singolo terminato. Premi ATTIVA ASCOLTO per OK Agenda.";update();}
}
function choose(result,owner,spoken){
 const options=Array.from(result).flatMap(x=>matches(x.transcript)).filter((x,i,a)=>a.findIndex(y=>y.id===x.id&&y.query===x.query)===i);
 if(!options.length){feedback("Ho capito: «"+spoken+"». Comando non riconosciuto.");idle();return;}
 if(options.length===1&&matches(result[0].transcript).some(c=>c.id===options[0].id)&&!(result[0].confidence>0&&result[0].confidence<.65)){run(options[0],owner);return;}
 panelOpen=false;closeDialog();dialog=document.createElement("dialog");dialog.className="voice-dialog";dialog.setAttribute("aria-label","Scegli comando vocale");
 const title=document.createElement("h2"),p=document.createElement("p"),close=document.createElement("button");
 title.textContent="SCEGLI IL COMANDO";p.textContent="Ho capito: «"+spoken+"». Quale intendevi?";dialog.append(title,p);
 for(const option of options){const b=document.createElement("button");b.type="button";b.textContent=option.label+" — "+option.action;b.onclick=()=>{closeDialog();if(owner===user()?.id)run(option,owner);else stop()};dialog.append(b);}
 close.textContent="ANNULLA";close.onclick=()=>{closeDialog();idle()};dialog.append(close);dialog.addEventListener("cancel",e=>{e.preventDefault();closeDialog();idle()});document.body.append(dialog);dialog.showModal();
}
function start(mode){
 if(!allowed()||mode==="wake"&&!wake||mode==="single"&&!(single||wake))return;
 stop();const owner=user().id,token=epoch;kind=mode;
 if(!supported()){kind=null;status="Microfono vocale non disponibile in questo browser o collegamento HTTPS.";feedback(status);update();return;}
 if(document.hidden){kind=null;status="Torna ad Agenda e premi ATTIVA ASCOLTO.";update();return;}
 const valid=()=>token===epoch&&user()?.id===owner&&allowed();
 try{
 const r=new (Constructor())();recognition=r;r.lang="it-IT";r.continuous=mode==="wake";r.interimResults=false;r.maxAlternatives=3;
 let handled=false;
 r.onstart=()=>{if(!valid())return;listening=true;status=mode==="wake"?"In ascolto · in attesa di «OK Agenda».":"In ascolto · un comando in italiano.";update();};
 r.onresult=e=>{
  if(!valid()||document.hidden)return;
  for(let i=e.resultIndex??0;i<e.results.length;i++){
   const result=e.results[i];if(!result.isFinal)continue;
   if(mode==="single"&&handled)return;
   const text=String(result[0]?.transcript||"").trim();if(!text)continue;
   const activation=text.match(/^\s*(?:ok|okay|okei|okey|o\s*key)\s+agenda\b[\s,:;.!?-]*(.*)$/iu);
   if(mode==="wake"&&!armed&&!pending&&!dialog&&!activation){idle();continue;}

   if(pending){const answer=literal(text).replace(/^(?:ok|okay|okei) agenda[ ,:]*/,"");if(answer==="conferma")finishConfirmation(true);else if(answer==="annulla")finishConfirmation(false);continue;}
   if(dialog){if(literal(text)==="chiudi"){closeDialog();idle();}continue;}
   if(mode==="single"){handled=true;clearTimeout(timer);choose(result,owner,text);return;}
   const match=activation;
   if(match){
    clearArmed();signal();
    if(match[1]){const c=parse(match[1]);if(c){feedback("Ho capito: «"+text+"»");choose(Array.from(result).map(a=>({transcript:a.transcript.replace(/^\s*(?:ok|okay|okei|okey|o\s*key)\s+agenda\b[\s,:;.!?-]*/iu,""),confidence:a.confidence})),owner,text);}else{feedback("Ho capito: «"+text+"». Comando non riconosciuto.");idle();}}
    else{armed=true;armedTimer=setTimeout(()=>{idle();feedback("Tempo del comando terminato: ripeti OK Agenda.");},6500);}
   }else if(armed){clearArmed();choose(result,owner,text);}else{idle();}
  }
 };
 const receiveResult=r.onresult;r.onresult=e=>{try{receiveResult(e)}catch(error){feedback("Non è stato possibile elaborare il comando. Riprova o usa il pulsante normale.");}};
 r.onerror=e=>{if(!valid())return;const reasons={"not-allowed":"Permesso microfono negato.","service-not-allowed":"Servizio vocale non consentito.","audio-capture":"Microfono assente o occupato.","no-speech":"Nessuna voce rilevata.",network:"Servizio vocale non raggiungibile.","language-not-supported":"Italiano non disponibile."};stop((reasons[e.error]||"Ascolto interrotto dal browser.")+" Premi ATTIVA ASCOLTO per riprovare.");feedback(status);};
 r.onend=()=>{if(!valid())return;listening=false;recognition=null;kind=null;clearTimeout(timer);clearArmed();status="Ascolto terminato dal browser. Premi ATTIVA ASCOLTO.";update();if(mode==="single"&&!handled)feedback("Nessun comando riconosciuto. Tocca il microfono per riprovare.");};
 status="Avvio microfono…";update();r.start();
 if(mode==="single")timer=setTimeout(()=>{if(valid())stop("Tempo di ascolto terminato. Tocca di nuovo il microfono.");},12000);
 }catch{stop("Il browser richiede un tocco o il permesso del microfono. Premi ATTIVA ASCOLTO.");feedback(status);}
}
function activate(){try{const C=window.AudioContext||window.webkitAudioContext;if(C){audio??=new C();void audio.resume().catch(()=>{});}}catch{}start("wake");}
function panelButton(id){const b=button();b.id=id;b.title="Comandi vocali";b.setAttribute("aria-controls","voiceWakeBar");b.setAttribute("aria-expanded","false");b.onclick=()=>{if(!allowed()||!wake)return;if(!recognition){panelOpen=false;activate();}else{panelOpen=!panelOpen;update()}};return b;}
function button(){const b=document.createElement("button");b.type="button";b.className="voice-microphone";b.dataset.voiceUi="";b.setAttribute("aria-label","Comando singolo in italiano");b.title="Comando singolo";b.setAttribute("aria-pressed","false");b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg>';b.onclick=()=>start("single");return b;}
function attachMap(container){if(container.id!=="liveMap"||!(single||wake)||!allowed())return;let b=container.querySelector(".voice-microphone");if(!b){b=panelButton("voiceMapMic");b.classList.add("voice-map-microphone");container.append(b);for(const event of ["click","dblclick","pointerdown"])b.addEventListener(event,e=>e.stopPropagation());}b.hidden=false;let help=container.querySelector(".voice-map-help");if(!help){help=helpButton();help.classList.add("voice-map-help");container.append(help);}help.hidden=false;if(bar)container.append(bar);}
function sync(){
 const next=user()?.id||null,changed=next!==account;
 if(changed){panelOpen=false;stop();account=next;if($("voiceToast"))$("voiceToast").hidden=true;}
 try{wake=allowed()&&localStorage.getItem(key("wake"))!=="off";single=wake;}catch{single=wake=allowed();}
 if($("voiceSettings"))$("voiceSettings").hidden=!allowed();
 if($("voiceEnabled"))$("voiceEnabled").checked=single;if($("voiceWakeEnabled"))$("voiceWakeEnabled").checked=wake;
 if($("voiceHome"))$("voiceHome").hidden=!(single||wake);
 const container=map();if(container)attachMap(container);
 if($("voiceHomeHelp"))$("voiceHomeHelp").hidden=!(single||wake);
 for(const b of document.querySelectorAll(".voice-map-microphone,.voice-map-help"))b.hidden=!allowed()||!(single||wake);
 if(!wake)panelOpen=false;
 if(!allowed()||!(single||wake)||kind==="wake"&&!wake)stop();
 if(wake&&!modalObserver){modalObserver=new MutationObserver(update);for(const node of document.querySelectorAll(".choice-modal,.view,dialog"))modalObserver.observe(node,{attributes:true,attributeFilter:["class","open"]});}else if(!wake&&modalObserver){modalObserver.disconnect();modalObserver=null;}
 update();
}
function detachMap(){const container=map();container?.querySelector(".voice-map-microphone")?.remove();container?.querySelector(".voice-map-help")?.remove();if(bar)document.body.append(bar);navigation();}
function mount(){
 if($("voiceSettings"))return sync();
 const card=document.createElement("div");card.id="voiceSettings";card.className="card voice-settings";card.dataset.voiceUi="";
 card.innerHTML='<h2>COMANDI VOCALI</h2><label><input id="voiceWakeEnabled" type="checkbox" role="switch"> Abilita OK Agenda e Comando singolo</label><p>Facoltativo: icona disponibile se non hai salvato una preferenza. Microfono sempre spento all\u2019accesso. Preferenza personale per questo account, su questo dispositivo. L’ascolto parte solo al primo tocco sul microfono. Un altro tocco apre i controlli; chiuderli non ferma l’ascolto.</p><p>Il browser può inviare l’audio al proprio servizio vocale e richiedere una connessione. Agenda non conserva audio o frasi. L’ascolto può interrompersi in background. Tutti i comandi manuali restano disponibili.</p><p id="voiceSettingStatus" role="status"></p>';
 $("settings").querySelector(".card").after(card);const b=panelButton("voiceHome");const help=helpButton();help.id="voiceHomeHelp";$("home").querySelector(".home-guide-intro").append(b);pageEntry=document.createElement("div");pageEntry.className="voice-page-entry";pageEntry.dataset.voiceUi="";pageEntry.hidden=true;pageEntry.append(panelButton("voicePageMic"));document.body.append(pageEntry);
 $("voiceWakeEnabled").onchange=()=>{try{if(!allowed())throw Error();const value=$("voiceWakeEnabled").checked;localStorage.setItem(key("wake"),value?"on":"off");$("voiceSettingStatus").textContent="Preferenza salvata su questo dispositivo.";sync();if(!value)stop();}catch{$("voiceSettingStatus").textContent="Preferenza non salvata. Riprova.";sync();}};
 bar=document.createElement("div");bar.id="voiceWakeBar";bar.className="voice-wake-bar";bar.dataset.voiceUi="";const label=document.createElement("span"),startButton=document.createElement("button"),stopButton=document.createElement("button"),once=document.createElement("button");label.setAttribute("role","status");startButton.type=stopButton.type=once.type="button";startButton.className="voice-start";stopButton.className="voice-stop";once.className="voice-once";startButton.textContent="ATTIVA ASCOLTO";stopButton.textContent="SPEGNI MICROFONO";once.textContent="COMANDO SINGOLO";startButton.onclick=activate;stopButton.onclick=()=>stop();once.onclick=()=>start("single");const panelClose=document.createElement("button");panelClose.type="button";panelClose.className="voice-home-close";panelClose.textContent="×";panelClose.setAttribute("aria-label","Chiudi riquadro comandi vocali");panelClose.onclick=()=>{panelOpen=false;update();(map()?.querySelector(".voice-microphone")||document.querySelector(".view.active .voice-microphone"))?.focus()};bar.append(label,startButton,stopButton,once,help,panelClose);document.body.append(bar);sync();
}
document.addEventListener("visibilitychange",()=>{if(document.hidden)stop("App in secondo piano. Premi ATTIVA ASCOLTO al ritorno.");});
window.VoiceCommands={mount,sync,attachMap,detachMap,cancel:navigation,stop,parse,availableCommands};
})();