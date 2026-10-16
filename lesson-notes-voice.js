"use strict";
(function(root){
 const owners=new WeakMap();
 function create({Recognition,input,button,status,interim,isActive,context,persist=()=>{},document:doc=root.document,window:win=root,setTimer=root.setTimeout.bind(root),clearTimer=root.clearTimeout.bind(root),now=Date.now}){
  owners.get(input)?.dispose();
  let wanted=false,session=null,timer=null,epoch=0,identity=null,failures=0,fastEnds=0,carry=null,rebase=null,disposed=false;
  const say=(label,text='')=>{status.textContent=label+(text?' - '+text:'');button.textContent=wanted?'STOP MICROFONO':'ATTIVA ASCOLTO CONTINUO';button.setAttribute('aria-pressed',String(wanted));};
  const valid=()=>wanted&&isActive()&&!doc.hidden&&context()===identity;
  const detach=recognition=>{recognition.onstart=null;recognition.onend=null;recognition.onresult=null;recognition.onerror=null;};
  function stop(label='MICROFONO DISATTIVATO',text=''){
   wanted=false;epoch++;carry=null;rebase=null;
   if(timer!==null)clearTimer(timer);timer=null;
   const old=session;session=null;if(old){detach(old);try{old.abort()}catch{}}
   interim.textContent='';say(label,text);
  }
  function restart(normal){
   if(!valid()){stop();return}
   if(!normal&&++failures>3){stop('MICROFONO NON DISPONIBILE','Servizio interrotto. Premi il microfono per riprovare.');return}
   say('RIPRESA DELL’ASCOLTO');const tag=epoch;
   timer=setTimer(()=>{timer=null;if(tag===epoch&&valid())listen();else stop()},normal?500:Math.min(4000,500*2**failures));
  }
  function listen(){
   if(!valid()){stop();return}if(session)return;
   const tag=epoch,boundary=carry;carry=null;
   let recognition,started=now(),recoverable=false,first=true,heardInterim=false;
   // Indices belong to this recognition session only. Never deduplicate the saved note.
   const results=new Map(),chunks=[];
   let canonical='',baseline=input.value,baselineTranscript='',lastWritten=input.value;
   const extendsText=(text,previous)=>previous&&text.length>previous.length&&text.startsWith(previous)&&/^\s/.test(text.slice(previous.length));
   const join=()=>chunks.map(chunk=>chunk.text).join(' ');
   const anchor=()=>{baseline=input.value;baselineTranscript=canonical;lastWritten=input.value;};
   rebase=anchor;
   function render(next){
    // Manual edits become the new protected baseline, including edits to dictated words.
    if(input.value!==lastWritten)anchor();
    canonical=next;
    const suffix=!baselineTranscript?canonical:canonical===baselineTranscript?'':extendsText(canonical,baselineTranscript)?canonical.slice(baselineTranscript.length).trimStart():'';
    const addition=suffix?(baseline&&!/\s$/.test(baseline)?' ':'')+suffix:'';
    const limit=Number.isInteger(input.maxLength)&&input.maxLength>=0?input.maxLength:Infinity;
    const value=baseline+addition.slice(0,Math.max(0,limit-baseline.length));
    if(input.value!==value){input.value=value;lastWritten=value;persist()}
   }
   function final(index,text){
    const previous=results.get(index);
    if(previous?.final){
     if(!extendsText(text,previous.text))return;
     // Some Android engines extend a final slot rather than creating a new one.
     if(previous.chunk&&extendsText(text,previous.chunk.text))previous.chunk.text=text;
     previous.text=text;return;
    }
    const replay=first&&!heardInterim&&boundary&&boundary.value===input.value&&text===boundary.text;
    first=false;
    let chunk;
    const last=chunks.at(-1),whole=join();
    if(last&&!previous?.separate&&extendsText(text,whole)){
     chunk={text};chunks.splice(0,chunks.length,chunk);
     for(const entry of results.values())if(entry.final)entry.chunk=chunk;
    }else if(last&&!previous?.separate&&extendsText(text,last.text)){
     chunk=last;chunk.text=text;
    }else{chunk={text};chunks.push(chunk)}
    results.set(index,{final:true,text,chunk});
    // A replay is eligible only at the automatic restart boundary, without fresh
    // interim speech. An intentional repetition in a new slot remains untouched.
    if(replay)baselineTranscript=text;
   }
   try{
    recognition=new Recognition();session=recognition;recognition.lang='it-IT';recognition.continuous=true;recognition.interimResults=true;
    const current=()=>tag===epoch&&session===recognition;
    recognition.onstart=()=>{if(current()&&valid())say('ASCOLTO ATTIVO')};
    recognition.onresult=event=>{
     if(!current())return;if(!valid()){stop();return}
     const list=event.results;
     const start=Number.isInteger(event.resultIndex)&&event.resultIndex>=0?event.resultIndex:0;
     for(const [index,entry] of results)if(index>=list.length&&!entry.final)results.delete(index);
     for(let i=start;i<list.length;i++){
      const result=list[i],text=String(result[0]?.transcript||'').trim();
      if(result.isFinal){if(text){final(i,text);failures=0;fastEnds=0}}
      else if(!results.get(i)?.final){
       const previous=results.get(i),last=chunks.at(-1);
       // A new interim segment starting afresh marks intentional new speech,
       // even when its final words overlap the preceding dictated phrase.
       const separate=previous?.separate??Boolean(text&&last&&!extendsText(text,last.text)&&!extendsText(text,join()));
       results.set(i,{final:false,text,separate});if(text)heardInterim=true;
      }
     }
     render(join());
     const temporary=[...results].sort(([a],[b])=>a-b).filter(([,entry])=>!entry.final&&entry.text).map(([,entry])=>entry.text).join(' ');
     interim.textContent=temporary?'Testo provvisorio: '+temporary:'';
    };
    recognition.onerror=event=>{
     if(!current())return;if(!valid()){stop();return}
     const error=event.error;
     if(['not-allowed','service-not-allowed'].includes(error)){stop('PERMESSO NEGATO','Abilita il microfono nelle impostazioni del browser.');return}
     if(['audio-capture','language-not-supported','bad-grammar'].includes(error)){stop('MICROFONO NON DISPONIBILE','Controlla microfono e supporto del browser.');return}
     if(['no-speech','network'].includes(error)){recoverable=true;return}
     stop('MICROFONO DISATTIVATO','Ascolto interrotto. Per riprendere premi il microfono.');
    };
    recognition.onend=()=>{
     if(!current())return;
     detach(recognition);session=null;rebase=null;interim.textContent='';
     if(!valid()){stop();return}
     const last=chunks.at(-1);carry=last?{text:last.text,value:input.value}:boundary;
     fastEnds=now()-started<1000?fastEnds+1:0;
     if(fastEnds>4){stop('MICROFONO NON DISPONIBILE','Il browser non mantiene l’ascolto. Puoi usare la dettatura della tastiera.');return}
     restart(!recoverable);
    };
    recognition.start();say('ASCOLTO ATTIVO');
   }catch{stop('MICROFONO NON DISPONIBILE','Usa la dettatura della tastiera oppure premi il microfono per riprovare.');}
  }
  function start(){
   if(disposed||wanted)return;
   if(!Recognition){stop('MICROFONO NON DISPONIBILE','Il browser non supporta il riconoscimento vocale. Usa il microfono della tastiera.');return}
   if(!isActive()||doc.hidden){stop();return}
   wanted=true;identity=context();failures=0;fastEnds=0;carry=null;epoch++;listen();
  }
  const hidden=()=>{if(doc.hidden)stop('MICROFONO DISATTIVATO','Ascolto interrotto. Premi il microfono per riprendere.')},blur=()=>stop('MICROFONO DISATTIVATO','Ascolto interrotto. Premi il microfono per riprendere.'),manual=()=>{rebase?.();interim.textContent='';persist()};
  doc.addEventListener('visibilitychange',hidden);win.addEventListener('pagehide',blur);win.addEventListener('blur',blur);input.addEventListener('input',manual);say(Recognition?'MICROFONO DISATTIVATO':'MICROFONO NON DISPONIBILE');
  const api={start,stop,toggle:()=>wanted?stop():start(),get active(){return wanted},dispose(){stop();disposed=true;doc.removeEventListener('visibilitychange',hidden);win.removeEventListener('pagehide',blur);win.removeEventListener('blur',blur);input.removeEventListener('input',manual);if(owners.get(input)===api)owners.delete(input)}};
  owners.set(input,api);return api;
 }
 const api={create};if(typeof module!=='undefined')module.exports=api;root.LessonNotesVoice=api;
})(typeof window!=='undefined'?window:globalThis);
