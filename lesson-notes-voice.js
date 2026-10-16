"use strict";
(function(root){
 const VERSION='2026-10-16-session-candidate-v5';
 if(root.LessonNotesVoice?.version===VERSION){if(typeof module!=='undefined')module.exports=root.LessonNotesVoice;return}
 root.LessonNotesVoice?.disposeAll?.();
 const owners=new WeakMap(),controllers=new Set();let active=null;
 const words=text=>Array.from(text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu),m=>({key:m[0].normalize('NFC').toLocaleLowerCase('it-IT').replaceAll('’',"'"),start:m.index,end:m.index+m[0].length}));
 const joined=(left,right)=>left+(left&&right&&!/\s$/.test(left)?' ':'')+right;
 // Reconcile one result with the only voice candidate for this user session.
 // Word comparison is confined to prefix/suffix boundaries, never inside a phrase.
 function overlap(left,right){const a=words(left),b=words(right);for(let n=Math.min(a.length,b.length);n>0;n--)if(b.slice(0,n).every((w,i)=>w.key===a[a.length-n+i].key))return{count:n,words:b};return{count:0,words:b}}
 function reconcile(candidate,incoming){
  if(!incoming)return candidate;if(!candidate)return incoming;
  const a=words(candidate),b=words(incoming);
  if(a.length&&b.length){
   const common=Math.min(a.length,b.length);
   if(a.slice(0,common).every((w,i)=>w.key===b[i].key))return b.length>a.length?incoming:candidate;
   const match=overlap(candidate,incoming);
   if(match.count)return match.count===b.length?candidate:joined(candidate,incoming.slice(b[match.count].start));
  }
  return candidate===incoming?candidate:joined(candidate,incoming);
 }
 function newTail(previous,candidate){
  const match=overlap(previous,candidate);
  if(!match.count)return candidate;
  return match.count===match.words.length?'':candidate.slice(match.words[match.count].start);
 }
 function create({Recognition,input,button,status,interim,isActive,context,persist=()=>{},document:doc=root.document,window:win=root}){
  owners.get(input)?.dispose();
  let wanted=false,session=null,epoch=0,cycleId=0,identity=null,disposed=false,phase='idle';
  let manualBase='',sessionCandidate='',stableLength=0,hasProvisional=false,boundary=false,rendered='',renderedSuffix='',lastSaved=input.value,lastStoppedValue=null;
  const say=(label,text='')=>{
   status.textContent=label+(text?' - '+text:'');
   button.textContent=phase==='listening'?'⏹ FERMA':phase==='paused'?'▶ RIPRENDI DETTATURA':'🎤 AVVIA DETTATURA';
   button.setAttribute('aria-pressed',String(wanted));button.setAttribute('data-voice-state',phase);button.classList?.add('notes-voice-control');
  };
  const valid=()=>wanted&&isActive()&&!doc.hidden&&context()===identity;
  const detach=recognition=>{recognition.onstart=null;recognition.onend=null;recognition.onresult=null;recognition.onerror=null;};
  function save(){if(context()===identity&&lastSaved!==input.value){lastSaved=input.value;persist()}}
  function stop(label='',text=''){
   // The visible snapshot is already in the field. Consolidate it once, without
   // copying either a provisional string or the last event into it again.
   if(wanted){save();lastStoppedValue=input.value;phase='paused'}wanted=false;epoch++;if(active===api)active=null;
   const old=session;session=null;if(old){detach(old);try{old.abort()}catch{}}
   sessionCandidate='';stableLength=0;hasProvisional=false;boundary=false;interim.textContent='';say(label||(phase==='paused'?'DETTATURA IN PAUSA':'MICROFONO NON ATTIVO'),text);
  }
  function manualChange(){
   if(!wanted){lastSaved=input.value;persist();return}
   if(context()!==identity){stop();return}
   const value=input.value;
   if(!renderedSuffix){manualBase=value;rendered=value;save();return}
   if(value.endsWith(renderedSuffix)){
    manualBase=value.slice(0,-renderedSuffix.length);rendered=value;save();return;
   }
   // An edit inside/replacing the voice portion is ambiguous. Keep the exact
   // user text and stop instead of trying to reconstruct and overwrite it.
   stop('DETTATURA IN PAUSA','Nota modificata manualmente. Testo conservato; premi RIPRENDI DETTATURA.');
  }
  function render(){
   if(input.value!==rendered){manualChange();if(!wanted)return}
   const tail=boundary?newTail(manualBase,sessionCandidate):sessionCandidate;
   const addition=tail?(manualBase&&!/\s$/.test(manualBase)?' ':'')+tail:'';
   const limit=Number.isInteger(input.maxLength)&&input.maxLength>=0?input.maxLength:Infinity;
   renderedSuffix=addition.slice(0,Math.max(0,limit-manualBase.length));
   rendered=manualBase+renderedSuffix;input.value=rendered;
   interim.textContent=hasProvisional?'Testo provvisorio: '+sessionCandidate:'';
   // Do not checkpoint provisional words as final. STOP/onend confirms the best
   // currently visible snapshot, including a remaining provisional result.
   if(!hasProvisional)save();
  }
  function listen(){
   if(!valid()){stop();return}if(session)return;
   const tag=epoch,id=++cycleId;let recognition;
   try{
    recognition=new Recognition();session=recognition;recognition.lang='it-IT';recognition.continuous=true;recognition.interimResults=true;
    const current=()=>tag===epoch&&id===cycleId&&session===recognition;
    recognition.onstart=()=>{if(current()&&valid())say('ASCOLTO ATTIVO')};
    recognition.onresult=event=>{
     if(!current())return;if(!valid()){stop();return}
     // Inspect every available result: resultIndex can reset or grow while
     // Android repeats earlier cumulative finals. isFinal affects stability only.
     const list=event.results||[];
     // Only a numeric boundary is retained for replacing a changed provisional
     // hypothesis; there is no second copy of the session transcript.
     if(hasProvisional)sessionCandidate=sessionCandidate.slice(0,stableLength);
     hasProvisional=false;
     for(let i=0;i<list.length;i++){
      const result=list[i],incoming=String(result?.[0]?.transcript||'').trim();
      sessionCandidate=reconcile(sessionCandidate,incoming);
      if(incoming&&!result.isFinal)hasProvisional=true;
      if(!hasProvisional)stableLength=sessionCandidate.length;
     }
     render();
    };
    recognition.onerror=event=>{
     if(!current())return;if(!valid()){stop();return}
     const error=event.error;
     if(['not-allowed','service-not-allowed'].includes(error)){stop('DETTATURA IN PAUSA','Permesso negato. Abilita il microfono nelle impostazioni del browser.');return}
     if(['audio-capture','language-not-supported','bad-grammar'].includes(error)){stop('DETTATURA IN PAUSA','Microfono non disponibile. Controlla il supporto del browser.');return}
     stop('DETTATURA IN PAUSA',error==='network'?'Servizio vocale interrotto. Premi RIPRENDI DETTATURA.':'Ascolto interrotto. Premi RIPRENDI DETTATURA.');
    };
    recognition.onend=()=>{if(current())stop('DETTATURA IN PAUSA')};
    recognition.start();if(current()&&valid())say('ASCOLTO ATTIVO');
   }catch{stop('DETTATURA IN PAUSA','Microfono non disponibile. Usa la dettatura della tastiera o premi RIPRENDI DETTATURA.');}
  }
  function start(){
   if(disposed||wanted)return;
   if(!Recognition){stop('MICROFONO NON ATTIVO','Il browser non supporta il riconoscimento vocale. Usa il microfono della tastiera.');return}
   if(!isActive()||doc.hidden){stop();return}
   active?.stop();active=api;
   boundary=phase==='paused'&&lastStoppedValue===input.value&&context()===identity;
   manualBase=input.value;sessionCandidate='';stableLength=0;hasProvisional=false;rendered=input.value;renderedSuffix='';lastSaved=input.value;
   wanted=true;phase='listening';identity=context();epoch++;listen();
  }
  const hidden=()=>{if(doc.hidden&&wanted)stop('DETTATURA IN PAUSA','Ascolto interrotto. Premi RIPRENDI DETTATURA.')},blur=()=>{if(wanted)stop('DETTATURA IN PAUSA','Ascolto interrotto. Premi RIPRENDI DETTATURA.')};
  doc.addEventListener('visibilitychange',hidden);win.addEventListener('pagehide',blur);win.addEventListener('blur',blur);input.addEventListener('input',manualChange);say('MICROFONO NON ATTIVO',Recognition?'':'Riconoscimento vocale non disponibile.');
  const api={version:VERSION,start,stop,toggle:()=>wanted?stop():start(),get active(){return wanted},get state(){return phase},dispose(){stop();disposed=true;doc.removeEventListener('visibilitychange',hidden);win.removeEventListener('pagehide',blur);win.removeEventListener('blur',blur);input.removeEventListener('input',manualChange);controllers.delete(api);if(owners.get(input)===api)owners.delete(input)}};
  owners.set(input,api);controllers.add(api);return api;
 }
 const api={version:VERSION,create,stopAll(){for(const controller of controllers)controller.stop()},disposeAll(){for(const controller of [...controllers])controller.dispose()}};
 if(typeof module!=='undefined')module.exports=api;root.LessonNotesVoice=api;
})(typeof window!=='undefined'?window:globalThis);
