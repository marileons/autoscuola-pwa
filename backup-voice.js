/* One user-triggered phrase, only to prepare the existing local backup. */
(()=>{
"use strict";
const $=id=>document.getElementById(id),user=()=>window.AgendaAuth?.currentUser?.();
const allowed=()=>["ADMIN","ISTRUTTORE"].includes(user()?.role)&&!user()?.mustChangePassword&&window.AgendaAuth?.can?.("operate");
let recognizer=null,listening=false,owner=null,timeout=null,epoch=0;
function status(text){if($("prepareBackupVoiceStatus"))$("prepareBackupVoiceStatus").textContent=text}
function paint(){const b=$("prepareBackupVoice");if(b){b.dataset.listening=String(listening);b.setAttribute("aria-pressed",String(listening));b.setAttribute("aria-label",listening?"Prepara backup: ascolto in corso, tocca per fermare":"Prepara backup: tocca e pronuncia Prepara backup")}}
function stop(message=""){
 const r=recognizer;recognizer=null;listening=false;epoch++;clearTimeout(timeout);timeout=null;
 if(r){r.onstart=r.onresult=r.onerror=r.onend=null;try{r.abort()}catch{}}
 paint();if(message)status(message);
}
function home(){return $("home")?.classList.contains("active")}
function prepare(id){
 if(!allowed()||user()?.id!==id||!home())return;
 for(const target of ["openSettings","exportFullBackup"]){
  const b=$(target);if(!b||b.disabled||b.hidden||b.classList.contains("hidden"))throw Error("Backup non disponibile per questo profilo.");
  b.click();
 }
}
function start(){
 if(!allowed()||!home())return;
 if(recognizer){stop("Ascolto terminato.");return}
 const C=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!C||!window.isSecureContext){status("Voce non disponibile in questo browser. Usa BACKUP COMPLETO in Impostazioni.");return}
 const id=user().id;owner=id;const token=++epoch,valid=()=>token===epoch&&allowed()&&user()?.id===id&&home();
 try{
  const r=new C();recognizer=r;r.lang="it-IT";r.continuous=false;r.interimResults=false;r.maxAlternatives=1;
  r.onstart=()=>{if(!valid()){stop();return}listening=true;paint();status("Pronuncia: Prepara backup.");};
  r.onresult=e=>{
   if(!valid()){stop();return}
   const result=e.results[e.resultIndex||0];if(!result||result.isFinal===false)return;
   const phrase=String(result[0]?.transcript||"").trim().toLocaleLowerCase("it-IT").replace(/[.!?,]+$/,"").replace(/\s+/g," ");
   stop();
   if(phrase!=="prepara backup"){status("Questo pulsante accetta soltanto «Prepara backup». Usa gli altri comandi al tocco.");return}
   try{status("Preparazione del backup. Il salvataggio finale resta al tocco.");prepare(id)}catch(error){status(error.message||"Backup non preparato. Usa il pulsante manuale.")}
  };
  r.onerror=e=>{if(!valid())return;const messages={"not-allowed":"Permesso microfono non concesso.","audio-capture":"Microfono non disponibile.","no-speech":"Nessuna frase rilevata.",network:"Servizio vocale non raggiungibile."};stop((messages[e.error]||"Ascolto non disponibile.")+" Il backup manuale resta disponibile.");};
  r.onend=()=>{if(token!==epoch)return;recognizer=null;listening=false;clearTimeout(timeout);timeout=null;paint();status("Ascolto terminato. Tocca il microfono per riprovare.");};
  status("Avvio dell’ascolto…");paint();r.start();
  timeout=setTimeout(()=>{if(token===epoch)stop("Ascolto terminato senza comando. Tocca per riprovare.");},10000);
 }catch{stop("Il browser non ha consentito l’ascolto. Usa il backup manuale in Impostazioni.")}
}
function sync(){
 const id=user()?.id||null;if(owner!==id||!allowed())stop();owner=id;
 const b=$("prepareBackupVoice");if(b)b.hidden=!allowed();
 paint();
}
function viewChanged(id){if(id!=="home")stop();}
function mount(){
 if($("prepareBackupVoice")){sync();return}
 const intro=$("home")?.querySelector(".home-guide-intro");if(!intro)return;
 const b=document.createElement("button");b.type="button";b.id="prepareBackupVoice";b.className="backup-voice-button";
 b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/></svg><span class="backup-voice-caption">Prepara backup</span>';
 b.onclick=start;b.setAttribute("aria-describedby","prepareBackupVoiceStatus");intro.append(b);
 const note=document.createElement("p");note.id="prepareBackupVoiceStatus";note.className="backup-voice-status";note.setAttribute("role","status");intro.after(note);
 sync();
}
document.addEventListener("visibilitychange",()=>{if(document.hidden)stop()});
window.addEventListener("pagehide",()=>stop());
window.BackupVoice={mount,sync,viewChanged};
})();
