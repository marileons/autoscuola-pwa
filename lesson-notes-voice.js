"use strict";
(function(root){
 const VERSION='2026-10-16-manual-pause-v4';
 if(root.LessonNotesVoice?.version===VERSION){if(typeof module!=='undefined')module.exports=root.LessonNotesVoice;return}
 root.LessonNotesVoice?.disposeAll?.();
 const owners=new WeakMap(),controllers=new Set();let active=null;
 const words=text=>Array.from(text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’]*/gu),m=>({key:m[0].normalize('NFC').toLocaleLowerCase('it-IT').replaceAll('’',"'"),start:m.index,end:m.index+m[0].length}));
 const joined=(left,right)=>left+(left&&right&&!/\s$/.test(left)?' ':'')+right;
 function extendsPhrase(text,base){const a=words(base),b=words(text);return a.length>0&&b.length>a.length&&a.every((w,i)=>w.key===b[i].key)}
 // Rebuild this event's snapshot; do not append events to a textarea or retain
 // slot identities after Android replaces/reset its result list.
 function snapshot(list,resultIndex,previous=[]){
  const records=Array.from(list,(result,i)=>{const row={text:String(result?.[0]?.transcript||'').trim(),final:Boolean(result?.isFinal)};return i<resultIndex&&previous[i]?.text===row.text&&previous[i]?.final===row.final?previous[i]:row});
  const visible=[],finals=[];let provisional='';
  function add(parts,text){
   if(!text)return;
   const whole=parts.join(' '),last=parts.at(-1);
   if(whole&&extendsPhrase(text,whole))parts.splice(0,parts.length,text);
   else if(last&&extendsPhrase(text,last))parts[parts.length-1]=text;
   else parts.push(text);
  }
  for(const {text,final} of records){add(visible,text);if(final)add(finals,text);else provisional=joined(provisional,text)}
  return{visible:visible.join(' '),final:finals.join(' '),interim:provisional,records};
 }
 function create({Recognition,input,button,status,interim,isActive,context,persist=()=>{},document:doc=root.document,window:win=root}){
  owners.get(input)?.dispose();
  let wanted=false,session=null,epoch=0,cycleId=0,identity=null,disposed=false,phase='idle';
  let manualBase='',voiceFinal='',voiceInterim='',visibleVoice='',rendered='',renderedSuffix='',lastSaved=input.value;
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
   if(wanted){save();phase='paused'}wanted=false;epoch++;if(active===api)active=null;
   const old=session;session=null;if(old){detach(old);try{old.abort()}catch{}}
   voiceFinal='';voiceInterim='';visibleVoice='';interim.textContent='';say(label||(phase==='paused'?'DETTATURA IN PAUSA':'MICROFONO NON ATTIVO'),text);
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
   const addition=visibleVoice?(manualBase&&!/\s$/.test(manualBase)?' ':'')+visibleVoice:'';
   const limit=Number.isInteger(input.maxLength)&&input.maxLength>=0?input.maxLength:Infinity;
   renderedSuffix=addition.slice(0,Math.max(0,limit-manualBase.length));
   rendered=manualBase+renderedSuffix;input.value=rendered;
   interim.textContent=voiceInterim?'Testo provvisorio: '+voiceInterim:'';
   // Do not checkpoint provisional words as final. STOP/onend confirms the best
   // currently visible snapshot, including a remaining provisional result.
   if(voiceFinal===visibleVoice&&!voiceInterim)save();
  }
  function listen(){
   if(!valid()){stop();return}if(session)return;
   const tag=epoch,id=++cycleId;let recognition,records=[];
   try{
    recognition=new Recognition();session=recognition;recognition.lang='it-IT';recognition.continuous=true;recognition.interimResults=true;
    const current=()=>tag===epoch&&id===cycleId&&session===recognition;
    recognition.onstart=()=>{if(current()&&valid())say('ASCOLTO ATTIVO')};
    recognition.onresult=event=>{
     if(!current())return;if(!valid()){stop();return}
     // resultIndex is only a hint: Android can reset it while replacing the
     // entire cumulative list. Always rebuild all available results in order.
     const list=event.results||[],index=Number.isInteger(event.resultIndex)&&event.resultIndex>=0?event.resultIndex:0;
     const next=snapshot(list,index,records);records=next.records;
     voiceFinal=next.final;voiceInterim=next.interim;visibleVoice=next.visible;render();
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
   manualBase=input.value;voiceFinal='';voiceInterim='';visibleVoice='';rendered=input.value;renderedSuffix='';lastSaved=input.value;
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
