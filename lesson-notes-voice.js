"use strict";
(function(root){
 function create({Recognition,input,button,status,interim,isActive,context,persist=()=>{},document:doc=root.document,window:win=root,setTimer=root.setTimeout.bind(root),clearTimer=root.clearTimeout.bind(root),now=Date.now}){
  let wanted=false,session=null,timer=null,epoch=0,identity=null,failures=0,fastEnds=0,lastFinal='',lastFinalAt=0;
  const say=(label,text='')=>{status.textContent=label+(text?' · '+text:'');button.textContent=wanted?'STOP MICROFONO':'ATTIVA ASCOLTO CONTINUO';button.setAttribute('aria-pressed',String(wanted));};
  const valid=()=>wanted&&isActive()&&!doc.hidden&&context()===identity;
  function stop(label='MICROFONO DISATTIVATO',text=''){wanted=false;epoch++;if(timer!==null)clearTimer(timer);timer=null;const old=session;session=null;if(old){old.onend=null;old.onresult=null;old.onerror=null;try{old.abort()}catch{}}interim.textContent='';say(label,text)}
  function restart(normal){if(!valid()){stop();return}if(!normal&&++failures>3){stop('MICROFONO NON DISPONIBILE','Servizio interrotto. Premi il microfono per riprovare.');return}say('RIPRESA DELL’ASCOLTO');const tag=epoch;timer=setTimer(()=>{timer=null;if(tag===epoch&&valid())listen();else stop()},normal?500:Math.min(4000,500*2**failures));}
  function listen(){if(!valid()){stop();return}const tag=epoch;let recognition,started=now(),recoverable=false,delivered=new Set(),first=true;
   try{recognition=new Recognition();session=recognition;recognition.lang='it-IT';recognition.continuous=true;recognition.interimResults=true;
    recognition.onstart=()=>{if(tag===epoch&&valid())say('ASCOLTO ATTIVO')};
    recognition.onresult=event=>{if(tag!==epoch||!valid()){stop();return}let temporary='';for(let i=0;i<event.results.length;i++){const result=event.results[i],text=String(result[0]?.transcript||'').trim();if(!result.isFinal){temporary+=text+' ';continue}if(delivered.has(i))continue;delivered.add(i);const replay=first&&text===lastFinal&&now()-lastFinalAt<2000;first=false;if(text&&!replay){input.value+=(input.value&&!/\s$/.test(input.value)?' ':'')+text;lastFinal=text;lastFinalAt=now();persist();}failures=0;fastEnds=0;}interim.textContent=temporary?'Testo provvisorio: '+temporary.trim():'';};
    recognition.onerror=event=>{if(tag!==epoch)return;const error=event.error;if(['not-allowed','service-not-allowed'].includes(error)){stop('PERMESSO NEGATO','Abilita il microfono nelle impostazioni del browser.');return}if(['audio-capture','language-not-supported','bad-grammar'].includes(error)){stop('MICROFONO NON DISPONIBILE','Controlla microfono e supporto del browser.');return}if(['no-speech','network'].includes(error)){recoverable=true;return}stop('MICROFONO DISATTIVATO','Ascolto interrotto. Per riprendere premi il microfono.');};
    recognition.onend=()=>{if(tag!==epoch)return;session=null;interim.textContent='';if(!valid()){stop();return}fastEnds=now()-started<1000?fastEnds+1:0;if(fastEnds>4){stop('MICROFONO NON DISPONIBILE','Il browser non mantiene l’ascolto. Puoi usare la dettatura della tastiera.');return}restart(!recoverable)};
    recognition.start();say('ASCOLTO ATTIVO');
   }catch{stop('MICROFONO NON DISPONIBILE','Usa la dettatura della tastiera oppure premi il microfono per riprovare.');}
  }
  function start(){if(!Recognition){stop('MICROFONO NON DISPONIBILE','Il browser non supporta il riconoscimento vocale. Usa il microfono della tastiera.');return}if(!isActive()||doc.hidden){stop();return}wanted=true;identity=context();failures=0;fastEnds=0;epoch++;listen()}
  const hidden=()=>{if(doc.hidden)stop('MICROFONO DISATTIVATO','Ascolto interrotto. Premi il microfono per riprendere.')},blur=()=>stop('MICROFONO DISATTIVATO','Ascolto interrotto. Premi il microfono per riprendere.'),manual=()=>{interim.textContent='';persist()};
  doc.addEventListener('visibilitychange',hidden);win.addEventListener('pagehide',blur);win.addEventListener('blur',blur);input.addEventListener('input',manual);say(Recognition?'MICROFONO DISATTIVATO':'MICROFONO NON DISPONIBILE');
  return{start,stop,toggle:()=>wanted?stop():start(),get active(){return wanted},dispose(){stop();doc.removeEventListener('visibilitychange',hidden);win.removeEventListener('pagehide',blur);win.removeEventListener('blur',blur);input.removeEventListener('input',manual)}};
 }
 const api={create};if(typeof module!=='undefined')module.exports=api;root.LessonNotesVoice=api;
})(typeof window!=='undefined'?window:globalThis);
