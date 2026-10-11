"use strict";
(function(root){
 let instance=null;
 const motorcycleCategory=value=>["moto","corso-moto","am","a1","a2","a"].includes(String(value).toLowerCase());
 const participantLabel=(p,e)=>p.name+(p.motorcycle_code_snapshot?" — "+p.motorcycle_code_snapshot:"")+(p.vehicle_id?" · "+(e.vehicles.find(v=>v.id===p.vehicle_id)?.name||p.vehicle_id):"");
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n};
 const button=(label,fn)=>{const b=el("button",label);b.type="button";b.onclick=fn;return b};
 const rome=value=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Rome",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value)).replace(" ","T");
 function utc(value){
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value))throw Error("Inserisci data e ora valide.");
  const base=Date.parse(value+"Z"),matches=[];
  for(const offset of [60,120]){const n=new Date(base-offset*60000).toISOString();if(rome(n)===value)matches.push(n)}
  if(matches.length!==1)throw Error(matches.length?"Ora ambigua per il cambio dell'ora: scegli un orario non ambiguo.":"Ora non valida, anche per il cambio dell'ora legale.");
  return matches[0];
 }

 const addDays=(date,n)=>new Date(Date.parse(date+"T12:00:00Z")+n*86400000).toISOString().slice(0,10);
 function isoWeek(date){
  const d=new Date(date+"T12:00:00Z"),dow=d.getUTCDay()||7,monday=addDays(date,1-dow),thursday=new Date(addDays(date,4-dow)+"T12:00Z"),year=thursday.getUTCFullYear(),jan4=year+"-01-04",first=addDays(jan4,1-(new Date(jan4+"T12:00Z").getUTCDay()||7)),number=1+Math.round((Date.parse(monday+"T12:00Z")-Date.parse(first+"T12:00Z"))/604800000);
  return{year,number,monday,sunday:addDays(monday,6),value:year+"-W"+String(number).padStart(2,"0")};
 }
 function weekDate(value){const m=/^(\d{4})-W(\d{2})$/.exec(value);if(!m)throw Error("Settimana non valida.");const jan4=m[1]+"-01-04",date=addDays(jan4,1-(new Date(jan4+"T12:00Z").getUTCDay()||7)+(Number(m[2])-1)*7);if(isoWeek(date).value!==value)throw Error("Settimana non valida.");return date}
 function weekLabel(date){const w=isoWeek(date),a=new Date(w.monday+"T12:00Z"),b=new Date(w.sunday+"T12:00Z"),month=d=>d.toLocaleString("it-IT",{month:"long",timeZone:"UTC"}),same=a.getUTCMonth()===b.getUTCMonth()&&a.getUTCFullYear()===b.getUTCFullYear();return "Settimana "+w.number+" · "+a.getUTCDate()+(same?"":" "+month(a)+(a.getUTCFullYear()!==b.getUTCFullYear()?" "+a.getUTCFullYear():""))+"–"+b.getUTCDate()+" "+month(b)+" "+b.getUTCFullYear()}
 const slots=()=>Array.from({length:32},(_,i)=>({minute:360+i*30,label:String(6+Math.floor(i/2)).padStart(2,"0")+":"+(i%2?"30":"00")}));
 function placement(e,date){const a=rome(e.starts_at),b=rome(e.ends_at),minute=s=>Number(s.slice(11,13))*60+Number(s.slice(14,16)),start=a.slice(0,10)<date?0:minute(a),end=b.slice(0,10)>date?1440:minute(b);return{start,end,row:Math.max(360,start)-360+2,span:Math.min(1320,end)-Math.max(360,start)}}
 const onDate=(e,date)=>rome(e.starts_at).slice(0,10)<=date&&rome(e.ends_at)>date+"T00:00";
 function quickSeed(date,minute,instructor,site,duration=60){if(!Number.isInteger(duration)||duration<1||duration>960||minute+duration>1440)throw Error("Durata non valida per la giornata.");const time=n=>String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");return{site_id:site,instructor_id:instructor,starts_at:date+"T"+time(minute),ends_at:minute+duration===1440?addDays(date,1)+"T00:00":date+"T"+time(minute+duration)}}


 const cancelled=e=>e.deleted||["ANNULLATA","ANNULLATO"].includes(e.status);
 function totals(events,instructor,from,to){
  const start=Date.parse(utc(from+"T00:00")),end=Date.parse(utc(to+"T00:00")),result={auto:0,moto:0,exam:0,exams:0},seen=new Set();
  for(const e of events){if(seen.has(e.id)||cancelled(e)||!(e.instructors||[{id:e.instructor_id}]).some(p=>p.id===instructor))continue;seen.add(e.id);const minutes=Math.max(0,Math.min(end,Date.parse(e.ends_at))-Math.max(start,Date.parse(e.starts_at)))/60000;if(!minutes)continue;if(e.event_type==="ESAME"){result.exam+=minutes;result.exams++}else result[motorcycleCategory(e.category)?"moto":"auto"]+=minutes}return result;
 }
 const durationLabel=value=>{const n=Math.round(value);return Math.floor(n/60)+" h "+String(n%60).padStart(2,"0")+" min"};


 const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const eventPeople=e=>e.instructors?.length?e.instructors:[{id:e.instructor_id,name:e.instructor_name}];
 const eventKind=e=>e.event_type==="ESAME"?"ESAME":motorcycleCategory(e.category)?"MOTO":"AUTO";
 const compareText=(a,b)=>String(a??"").localeCompare(String(b??""),"it");
 function compareCalendarEvents(a,b){const startA=rome(a.starts_at),startB=rome(b.starts_at),name=e=>eventPeople(e).map(p=>p.name||"").sort(compareText).join(" · ");return compareText(startA.slice(0,10),startB.slice(0,10))||compareText(startA.slice(11),startB.slice(11))||compareText(name(a),name(b))||compareText(eventKind(a),eventKind(b))||compareText(a.id,b.id)}
 function orderedEvents(events){const seen=new Set();return [...events].sort(compareCalendarEvents).filter(e=>{if(seen.has(e.id))return false;seen.add(e.id);return true})}
 function calendarPeople(instructors,events){const people=new Map(instructors.map(p=>[p.id,{...p,current:true}]));for(const e of orderedEvents(events))for(const p of eventPeople(e))if(p.id&&!people.has(p.id))people.set(p.id,{...p,current:false});return [...people.values()].sort((a,b)=>compareText(a.name,b.name)||compareText(a.id,b.id))}
 function dayGridModel(events,instructors,date){const items=orderedEvents(events).filter(e=>onDate(e,date)),people=calendarPeople(instructors,items);return people.map(person=>{const ends=[],placed=[];for(const e of items.filter(e=>eventPeople(e).some(p=>p.id===person.id))){const a=rome(e.starts_at),b=rome(e.ends_at),minute=s=>Number(s.slice(11,13))*60+Number(s.slice(14,16)),start=a.slice(0,10)<date?0:minute(a),end=b.slice(0,10)>date?1440:minute(b);let lane=ends.findIndex(n=>n<=start);if(lane<0)lane=ends.length;ends[lane]=end;placed.push({event:e,start,end,lane})}return{person,width:Math.max(1,ends.length),placed}})}
 function canPrintCalendar(user,state){return user?.sharedCalendarEnabled===true&&["ADMIN","ISTRUTTORE","SEGRETERIA"].includes(user.role)&&user.active!==false&&user.active!==0&&!user.blocked&&(!user.purpose||user.purpose==="NORMAL")&&(!user.authorization_role||user.authorization_role===user.role||(user.role==="SEGRETERIA"&&user.authorization_role==="ISTRUTTORE"))&&!state.denied&&!!state.config&&!!state.snapshot&&(state.verified===true||state.config.assign===true)&&state.config.sites?.includes(state.site)&&state.snapshot.scope?.includes(state.site)}
 const calendarLegendHTML=()=>'<div class="sc-legend"><span><i class="sc-swatch sc-auto"></i>AUTO</span><span><i class="sc-swatch sc-motorcycle"></i>MOTO</span><span><i class="sc-swatch sc-exam"></i>ESAME</span><span><i class="sc-swatch sc-cancelled"></i>ANNULLATO</span></div>';
 const diagonalHTML=()=>'<svg class="sc-cancel-diagonal" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="2" y1="98" x2="98" y2="2" vector-effect="non-scaling-stroke"/></svg>';
 function weeklyDocument({date,site,events,instructors=[],includeCancelled=false,offline=false,syncedAt,generatedAt=Date.now()},printer){
  if(!printer?.prepareExaminerDocument)throw Error("Controller di stampa non disponibile. Riapri l’Agenda e riprova.");
  const w=isoWeek(date),end=addDays(w.monday,7),items=orderedEvents(events).filter(e=>e.site_id===site.id&&!e.deleted&&(includeCancelled||!cancelled(e))&&rome(e.ends_at)>w.monday+"T00:00"&&rome(e.starts_at).slice(0,10)<end),persons=calendarPeople(instructors,items),h=escapeHtml,clock=n=>String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0"),stamp=n=>new Date(n).toLocaleString("it-IT",{timeZone:"Europe/Rome"}),pages=[];
  const meta=(title,group="")=>'<h1>Agenda condivisa · '+h(site.name)+'</h1><h2>'+h(title)+'</h2><p>'+h(weekLabel(date))+' · Periodo: '+h(w.monday)+' – '+h(w.sunday)+(group?' · '+h(group):'')+'</p>'+calendarLegendHTML();
  for(let d=0;d<7;d++){
   const day=addDays(w.monday,d),label=new Date(day+"T12:00Z").toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}),columns=dayGridModel(items,persons,day),tracks=columns.flatMap(c=>Array.from({length:c.width},(_,lane)=>({person:c.person,lane,placed:c.placed.filter(p=>p.lane===lane)}))),groups=[];
   for(let i=0;i<tracks.length;i+=3)groups.push(tracks.slice(i,i+3));if(!groups.length)groups.push([]);
   for(const [g,group]of groups.entries()){
    const placed=group.flatMap(c=>c.placed),from=Math.min(360,...placed.map(p=>p.start)),to=Math.max(1320,...placed.map(p=>p.end)),boundaries=new Set([from,to]);for(let n=Math.ceil(from/30)*30;n<to;n+=30)boundaries.add(n);for(const p of placed){boundaries.add(p.start);boundaries.add(p.end)}const times=[...boundaries].sort((a,b)=>a-b);let rows="";
    for(let n=0;n<times.length-1;n++){const at=times[n];rows+='<tr data-minute="'+at+'" style="height:'+((times[n+1]-at)*.13)+'mm"><th class="sc-print-time">'+clock(at)+'</th>';for(const c of group){const p=c.placed.find(p=>p.start===at);if(p){const e=p.event,span=times.indexOf(p.end)-n,parts=e.participants?.length?e.participants:[{name:e.student_name||"Non indicato"}],kind=eventKind(e),cls=kind==="MOTO"?"sc-motorcycle":kind==="ESAME"?"sc-exam":"sc-auto";rows+='<td rowspan="'+span+'" class="sc-print-event '+cls+(cancelled(e)?' sc-cancelled':'')+'" data-event-id="'+h(e.id)+'" data-instructor="'+h(c.person.id)+'"><div class="sc-print-content">'+(cancelled(e)?diagonalHTML():'')+'<strong>'+kind+(cancelled(e)?' · ANNULLATO':'')+'</strong><div>'+clock(p.start)+'–'+clock(p.end)+'</div>'+parts.map(p=>'<div>'+h(participantLabel(p,{...e,vehicles:e.vehicles||[]}))+'</div>').join('')+'<div>'+h((e.vehicles||[]).map(v=>v.name).join(', ')||'Veicolo non assegnato')+'</div>'+(e.meeting_point?'<div>'+h(e.meeting_point)+'</div>':'')+(e.note?'<div>'+h(e.note)+'</div>':'')+'</div></td>'}else if(!c.placed.some(p=>p.start<at&&p.end>at))rows+='<td></td>'}if(!group.length)rows+='<td>Nessun istruttore assegnato</td>';rows+='</tr>'}
    pages.push('<section class="sc-print-page" data-day="'+day+'" data-group="'+g+'"><table class="sc-print-grid"><colgroup><col style="width:18mm">'+group.map(()=>'<col>').join('')+'</colgroup><thead><tr><th colspan="'+Math.max(2,group.length+1)+'">'+meta(label,'Gruppo '+(g+1)+' di '+groups.length)+'</th></tr><tr><th>Orario</th>'+group.map(c=>'<th>'+h(c.person.name)+(c.lane?' · corsia '+(c.lane+1):'')+'</th>').join('')+(!group.length?'<th>Istruttori</th>':'')+'</tr></thead><tbody>'+rows+'</tbody><tfoot><tr><td colspan="'+Math.max(2,group.length+1)+'">'+clock(to)+' · '+(placed.length?'':'Nessun appuntamento · ')+'Generato: '+h(stamp(generatedAt))+' · '+(offline?'Dati aggiornati all’ultima sincronizzazione: ':'Ultima sincronizzazione: ')+h(syncedAt?stamp(syncedAt):'non disponibile')+'</td></tr></tfoot></table></section>');
   }
  }
  const sums=persons.map(p=>{const t=totals(items,p.id,w.monday,end);return '<tr><th>'+h(p.name)+'</th><td>'+durationLabel(t.auto)+'</td><td>'+durationLabel(t.moto)+'</td><td>'+durationLabel(t.auto+t.moto)+'</td><td>'+t.exams+' sedute · '+durationLabel(t.exam)+'</td><td>'+durationLabel(t.auto+t.moto+t.exam)+'</td></tr>'}).join('');
  pages.push('<section class="sc-print-page sc-print-summary"><table><thead><tr><th colspan="6">'+meta('Riepilogo settimanale per istruttore')+'</th></tr><tr><th>Istruttore</th><th>Auto</th><th>Moto</th><th>Totale guide</th><th>Esami</th><th>Totale impegni</th></tr></thead><tbody>'+sums+'</tbody></table><p>Eventi annullati esclusi dai totali. Gli impegni con più istruttori contano per ciascuno.</p></section>');
  const css='@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font:10pt Arial,sans-serif;color:#172537;background:#fff;margin:0}h1{font-size:16pt;margin:2mm 0}h2{font-size:13pt;margin:2mm 0}p{margin:2mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #64748B;padding:1mm;vertical-align:top;overflow-wrap:anywhere;white-space:normal}thead{display:table-header-group}tfoot{display:table-footer-group;font-size:8pt}.sc-print-time{font-size:9pt;font-weight:normal;background:#fff}.sc-print-content{position:relative;isolation:isolate}.sc-print-content>div{margin-top:.5mm}.sc-print-page{break-after:page}.sc-print-page:last-child{break-after:auto}.sc-print-summary tr{break-inside:avoid}.sc-print-event{border:1px solid #64748B;background:#FFFFFF}.sc-motorcycle{background:#FFE082}.sc-exam{background:#A5D6A7}.sc-cancelled{background:#D1D5DB}.sc-cancel-diagonal{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}.sc-cancel-diagonal line{stroke:#172537;stroke-width:1.5;opacity:.45}.sc-legend{display:flex;flex-wrap:wrap;gap:4mm;font-size:9pt;font-weight:normal;margin:2mm 0}.sc-legend span{display:flex;align-items:center;gap:1mm}.sc-swatch{display:inline-block;width:4mm;height:3mm;border:1px solid #64748B;background:#FFFFFF}.sc-swatch.sc-motorcycle{background:#FFE082}.sc-swatch.sc-exam{background:#A5D6A7}.sc-swatch.sc-cancelled{background:#D1D5DB}@media screen{body{padding:20px;max-width:1100px;margin:auto}.sc-print-page{margin-bottom:32px}}@media print{nav,button,input,select,.report-controls{display:none!important}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}';
  const html='<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Agenda condivisa</title><style>'+css+'</style></head><body><button onclick="window.print()">STAMPA / SALVA PDF</button>'+pages.join('')+'</body></html>';
  return printer.prepareExaminerDocument(html).replace('>APRI REPORT</a>','>APRI DOCUMENTO STAMPABILE (APRI REPORT)</a>').replace('report-esaminatore.html','agenda-settimanale.html');
 }

 function printOpener(win,show){
  let blockedUntil=0;const documents=[];
  const cleanup=()=>{for(let i=documents.length-1;i>=0;i--)if(documents[i].window?.closed){win.URL.revokeObjectURL(documents[i].url);documents.splice(i,1)}};
  const release=event=>{if(event.persisted)return;for(const d of documents)win.URL.revokeObjectURL(d.url);documents.length=0};
  win.addEventListener("pagehide",release);
  return{open(html){if(Date.now()<blockedUntil)return false;blockedUntil=Date.now()+1200;cleanup();const url=win.URL.createObjectURL(new win.Blob([html],{type:"text/html;charset=utf-8"}));let opened=null;try{opened=win.open(url,"_blank")}catch{}documents.push({url,window:opened});show(url,opened?"Documento HTML stampabile pronto. Usa STAMPA / SALVA PDF nel documento.":"Apertura automatica non disponibile. Premi APRI DOCUMENTO STAMPABILE.");return true},cleanup};
 }


 function compactStudentName(surname,initial=""){
  const last=String(surname??"").normalize("NFC").trim().replace(/\s+/g," "),first=String(initial??"").normalize("NFC").trim();
  if(!last||last.length>100||!/^\p{L}[\p{L}\p{M}]*(?:[ '’\-][\p{L}\p{M}]+)*$/u.test(last))throw Error("Inserisci un cognome valido, senza numeri.");
  if(first&&!/^\p{L}\p{M}*\.?$/u.test(first))throw Error("Inserisci una sola iniziale del nome, con o senza punto.");
  return last.toLocaleUpperCase("it-IT")+(first?" "+first.replace(/\.$/,"").toLocaleUpperCase("it-IT")+".":"");
 }
 function sameSurname(name,surname){const value=String(name||"").normalize("NFC").trim().replace(/\s+/g," ").toLocaleUpperCase("it-IT").replace(/ \p{L}\p{M}*\.$/u,""),last=compactStudentName(surname);return value===last||(" "+value+" ").includes(" "+last+" ")}
 function surnameWarning(events,date,surname,initial="",additional=[]){if(initial.trim())return "";const names=[...additional,...events.filter(e=>!cancelled(e)&&onDate(e,date)).flatMap(e=>(e.participants||[{name:e.student_name}]).map(p=>p.name))];return names.some(n=>sameSurname(n,surname))?"Esiste già un allievo con questo cognome. Inserisci l’iniziale del nome per distinguerlo.":""}

 function mount(user){
  if(user?.sharedCalendarEnabled!==true)return;
  if(instance?.account===user.id)return;
  dispose();
  const cache=root.SharedCalendarStore.create(),state={account:user.id,alive:true,active:false,busy:false,saving:false,config:null,snapshot:null,mode:1,site:"",filter:{},requests:new Set(),instructors:{},advanced:false};
  instance=state;
  if(!document.getElementById("sharedCalendarStyle")){const link=el("link");link.id="sharedCalendarStyle";link.rel="stylesheet";link.href="shared-calendar.css?v=1";document.head.append(link)}
  const dialog=el("dialog",null,"shared-calendar sc-main"),heading=el("h2","AGENDA CONDIVISA"),notice=el("p","AGGIORNAMENTO IN CORSO"),controls=el("div",null,"sc-controls"),list=el("div",null,"sc-list"),tools=el("div",null,"sc-controls");
  const alerts=el("section",null,"sc-notifications");alerts.setAttribute("aria-label","Modifiche ai tuoi appuntamenti");notice.setAttribute("role","status");dialog.append(heading,notice,alerts,controls,tools,list);document.body.append(dialog);state.dialog=dialog;
  const selector=el("select"),day=el("input");day.type="date";day.value=rome(Date.now()).slice(0,10);selector.setAttribute("aria-label","Sede");day.setAttribute("aria-label","Giorno");
  const week=el("input");week.type="week";week.setAttribute("aria-label","Settimana ISO");const weekHeading=el("h3",null,"sc-week-heading");controls.before(weekHeading);
  const shift=n=>{day.value=addDays(day.value,n);render()};
  controls.append(button("INDIETRO",close),selector,day,button("GIORNO PRECEDENTE",()=>shift(-1)),button("OGGI",()=>{day.value=rome(Date.now()).slice(0,10);state.mode=1;render()}),button("GIORNO SUCCESSIVO",()=>shift(1)),button("SETTIMANA PRECEDENTE",()=>shift(-7)),week,button("SETTIMANA SUCCESSIVA",()=>shift(7)),button("GIORNALIERA",()=>{state.mode=1;render()}),button("SETTIMANA",()=>{state.mode=7;render()}));
  week.onchange=()=>{try{const offset=(new Date(day.value+"T12:00Z").getUTCDay()+6)%7;day.value=addDays(weekDate(week.value),offset);render()}catch(e){notice.textContent=e.message}};
  const printOutput=el("div",null,"sc-print-output");tools.after(printOutput);const opener=printOpener(root,(url,message)=>{printOutput.replaceChildren(el("p",message));const link=el("a","APRI DOCUMENTO STAMPABILE");link.href=url;link.target="_blank";link.rel="noopener";printOutput.append(link)});
  function printWeek(){try{if(!canPrintCalendar(user,state))throw Error("Agenda non disponibile per la stampa.");const site=state.snapshot.sites.find(s=>s.id===state.site);opener.open(weeklyDocument({date:day.value,site,events:state.snapshot.events,instructors:state.instructors[state.site]||[],includeCancelled:state.printCancelled===true,offline:!navigator.onLine,syncedAt:state.snapshot.syncedAt},root.StudentReportPrint))}catch(e){notice.textContent=e.message}}
  const inputs={};for(const [key,label]of [["instructor_name","Istruttore"],["category","Categoria"],["vehicles","Veicolo"]]){const l=el("label",label),i=el("input");i.type="search";i.oninput=()=>{state.filter[key]=i.value.trim().toLocaleLowerCase("it");render()};l.append(i);controls.append(l);inputs[key]=i;}
  selector.onchange=()=>{state.site=selector.value;render()};day.onchange=render;
  async function api(path,body){
   const controller=new AbortController();state.requests.add(controller);const timer=setTimeout(()=>controller.abort(),15000);
   try{
    const r=await fetch("/api/calendar/"+path,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal,credentials:"same-origin"});
    const data=await r.json();if(!r.ok){if([401,403,404].includes(r.status)){state.suspended=data.code==="CALENDAR_SUSPENDED";state.verified=false;state.config=null;state.denied=true;clock.stop();render()}throw Object.assign(Error(data.error||"Calendario non disponibile."),{status:r.status,data})}return data;
   }finally{clearTimeout(timer);state.requests.delete(controller)}
  }
  async function sync(){
   if(!state.alive||!state.active||state.busy||state.acknowledging||document.hidden)return;
   if(!navigator.onLine){if(!state.config?.assign)state.verified=false;notice.textContent="OFFLINE - ultima sincronizzazione "+(state.snapshot?.syncedAt?new Date(state.snapshot.syncedAt).toLocaleTimeString("it-IT"):"non disponibile");render();return}
   state.busy=true;notice.textContent="AGGIORNAMENTO IN CORSO";
   try{
    const cfg=await api("config");if(!state.alive)return;state.config=cfg;state.denied=false;state.suspended=false;
    let previous=state.snapshot||await cache.load(user.id);
    if(JSON.stringify([...previous.scope].sort())!==JSON.stringify([...cfg.sites].sort()))previous={...previous,events:[],scope:cfg.sites,cursor:0};
    const pages=[];let cursor=previous.cursor,more=true;
    while(more){const page=await api("sync?cursor="+cursor);if(!state.alive)return;if(page.more&&page.cursor<=cursor)throw Error("Cursore non avanzato.");pages.push(page);cursor=page.cursor;more=page.more}
    const next=root.SharedCalendarStore.changes(previous,pages,root.SharedCalendarStore.merge(previous,pages,user.id),user.role);const instructors={};for(const site of next.scope){const data=await api("instructors?site="+encodeURIComponent(site));instructors[site]=data.instructors}next.instructors=instructors;next.operationalSuspended=false;if(!state.alive)return;await cache.save(next);if(!state.alive)return;state.snapshot=next;state.instructors=next.instructors;state.verified=true;clock.update();notice.textContent="SINCRONIZZATO - "+new Date(next.syncedAt).toLocaleTimeString("it-IT");
   }catch(e){if(!state.alive)return;if(!state.config?.assign)state.verified=false;if(state.suspended){clock.stop();if(state.snapshot){const held={...state.snapshot,operationalSuspended:true};try{await cache.save(held);state.snapshot=held}catch{}}}notice.textContent=(navigator.onLine?"ERRORE DI SINCRONIZZAZIONE: ":"OFFLINE - ")+e.message+" Ultima copia valida conservata."}
   finally{state.busy=false;if(state.alive)render()}
  }
  const clock=root.SharedCalendarStore.scheduler({active:()=>state.alive&&state.active&&!state.suspended,visible:()=>!document.hidden,run:sync});state.clock=clock;
  const visibility=()=>{clock.update();if(!document.hidden&&state.active&&!state.suspended)void sync()};document.addEventListener("visibilitychange",visibility);state.visibility=visibility;
  const online=()=>{if(state.active)void sync()};root.addEventListener("online",online);root.addEventListener("offline",online);state.online=online;
  async function open(){state.active=true;state.verified=false;day.value=rome(Date.now()).slice(0,10);state.mode=1;dialog.showModal();try{state.snapshot=await cache.load(user.id);if(!state.alive)return;state.instructors=state.snapshot.instructors||{};state.suspended=state.snapshot.operationalSuspended===true;render()}catch{notice.textContent="Copia locale non leggibile. Nessun archivio esistente è stato modificato."}clock.update();void sync()}
  function close(){state.active=false;clock.stop();for(const c of state.requests)c.abort();dialog.close()}
  dialog.addEventListener("cancel",e=>{e.preventDefault();close()});
  state.buttons=[];for(const id of ["home","secretaryHome"]){const home=document.getElementById(id);if(home){const b=button("AGENDA CONDIVISA",open);b.className="full";b.dataset.sharedCalendar="";home.append(b);state.buttons.push(b)}}
  function render(){
   state.gridObserver?.disconnect();for(const o of state.weekObservers||[])o.disconnect();state.weekObservers=[];alerts.replaceChildren();
   controls.hidden=false;weekHeading.hidden=false;if(state.denied||(!state.verified&&!state.config?.assign)||(!navigator.onLine&&!state.config?.assign)){printOutput.replaceChildren();list.replaceChildren();controls.hidden=true;weekHeading.hidden=true;tools.replaceChildren(button("INDIETRO",close),button("VERIFICA ACCESSO",()=>sync()));for(const d of dialog.querySelectorAll(".sc-editor[open]"))d.close();notice.textContent=state.suspended?"Agenda condivisa temporaneamente sospesa dall’amministratore":(!navigator.onLine?"OFFLINE — ":"")+"Accesso non verificato: connettiti e premi VERIFICA ACCESSO. La copia locale è conservata, non è un archivio vuoto.";return}if(!state.snapshot)return;
   renderNotifications();const snapshot=state.snapshot,selected=state.site||selector.value;
   selector.replaceChildren();for(const s of snapshot.sites){const o=el("option",s.name+(s.active?"":" (disattivata)"));o.value=s.id;selector.append(o)}selector.value=snapshot.scope.includes(selected)?selected:(snapshot.scope[0]||"");state.site=selector.value;
   tools.replaceChildren();if(state.config?.assign&&state.config.operational){const op=state.config.operational,b=button(op.enabled?"AGENDA UTENTI ATTIVA":"AGENDA UTENTI SOSPESA",async()=>{if(state.saving||!navigator.onLine||!confirm(op.enabled?"Sospendere l’Agenda per tutti gli utenti tranne il principale?":"Riattivare l’Agenda per gli utenti autorizzati?"))return;state.saving=true;b.disabled=true;try{await api("config",{enabled:!op.enabled,version:op.version});await sync()}catch(err){notice.textContent=err.message}finally{state.saving=false;b.disabled=false}});b.disabled=!navigator.onLine;tools.append(b,el("p",op.updated_at?"Ultima modifica: "+rome(op.updated_at).replace("T"," ")+" · "+op.administrator:"Agenda utenti attiva: impostazione iniziale."))}tools.append(button("GESTIONE AGENDA",()=>{state.advanced=!state.advanced;render()}));const advanced=el("div",null,"sc-controls sc-management");advanced.hidden=!state.advanced;tools.append(advanced);advanced.append(button("AGGIORNA",()=>sync()));if(state.config?.manage){for(const [label,fn]of [["NUOVO APPUNTAMENTO",()=>edit()],["NUOVA GUIDA MOTO",()=>editExam(null,true)],["NUOVO ESAME",()=>editExam()],["SIGLE MOTO",motorcycleCodes],["SEDI",sites],["VEICOLI",vehicles],["APPUNTAMENTI ELIMINATI",deletedEvents]]){if(["SIGLE MOTO","SEDI"].includes(label)&&state.config.manageCatalog===false)continue;const b=button(label,fn);b.disabled=!navigator.onLine;advanced.append(b)}}if(state.config?.assign){const b=button("ASSEGNAZIONI SEDI",memberships);b.disabled=!navigator.onLine;advanced.append(b)}
   printOutput.hidden=state.mode!==7;if(state.mode===7&&canPrintCalendar(user,state)){const option=el("label","Includi eventi annullati nella stampa ","sc-print-option"),check=el("input");check.type="checkbox";check.checked=state.printCancelled===true;check.onchange=()=>{state.printCancelled=check.checked};option.append(check);tools.append(option,button("STAMPA / SALVA PDF",printWeek));}
   if(!day.value)return;week.value=isoWeek(day.value).value;weekHeading.textContent=weekLabel(day.value);list.classList.toggle("sc-daily",state.mode===1);list.classList.toggle("sc-week",state.mode===7);list.replaceChildren();const from=state.mode===7?isoWeek(day.value).monday:day.value,to=addDays(from,state.mode);
   const entries=snapshot.events.filter(e=>e.site_id===state.site&&rome(e.ends_at)>from+"T00:00"&&rome(e.starts_at).slice(0,10)<to&&Object.entries(state.filter).every(([k,v])=>(k==="vehicles"?(e.vehicles||[]).map(x=>x.name).join(" "):k==="instructor_name"?(e.instructors||[]).map(x=>x.name).join(" "):String(e[k]||"")).toLocaleLowerCase("it").includes(v))).sort(compareCalendarEvents);
   if(state.mode===1){renderGrid(entries);return}renderWeek(entries,from,to);
  }

  function renderWeek(entries,from,to){
   const legend=el("div",null,"sc-legend");legend.innerHTML=calendarLegendHTML();list.append(legend);
   for(let n=0;n<7;n++){const date=addDays(from,n),section=el("section",null,"sc-week-day");section.dataset.day=date;section.append(el("h3",new Date(date+"T12:00Z").toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"})));list.append(section);const items=orderedEvents(entries).filter(e=>onDate(e,date));if(!items.length)section.append(el("p","Nessun appuntamento per i filtri selezionati."));renderGrid(items,section,date,true,instructorsFor(entries))}
   const sums=el("div",null,"sc-week-totals");for(const person of instructorsFor(entries))sums.append(totalsCard(person,entries,from,to));list.append(sums);
  }
  function card(e){
    const exam=e.event_type==="ESAME",row=el("article",null,"sc-card"+(exam?" sc-exam":motorcycleCategory(e.category)?" sc-motorcycle":""));
    row.dataset.eventId=e.id;row.tabIndex=-1;if(cancelled(e)){row.classList.add("sc-cancelled");const diagonal=el("span",null,"sc-cancel-mark");diagonal.innerHTML=diagonalHTML();row.append(diagonal,el("strong","ANNULLATO"))}
    row.append(el("h3",exam?"ESAME · "+e.category:motorcycleCategory(e.category)?"GUIDA MOTO":"GUIDA AUTO · "+e.student_name),el("p",rome(e.starts_at).replace("T"," ")+" – "+rome(e.ends_at).slice(11)),el("p",e.category+" · "+e.status));
    if(exam)row.append(el("p","Località: "+e.meeting_point));
    row.append(el("p","Istruttori: "+(e.instructors||[]).map(x=>x.name).join(", ")),el("p","Veicoli: "+((e.vehicles||[]).map(x=>x.name).join(", ")||"non assegnato")));
    if(exam||motorcycleCategory(e.category)){row.append(el("p","N. allievi: "+e.participants.length));for(const p of e.participants)row.append(el("p",participantLabel(p,e)));row.append(button(exam?"ALLIEVI CONVOCATI":"DETTAGLIO ALLIEVI",()=>examDetails(e)));}
    row.append(el("p",e.note));
    if(state.config?.manage){const b=button("APRI / MODIFICA",()=>exam?editExam(e):edit(e));b.disabled=!navigator.onLine;row.append(b)}
    else if(!exam&&e.instructor_id===user.id){for(const p of e.participants){const local={...e,student_id:p.id},suffix=e.participants.length>1?" · "+p.name:"";row.append(button("APRI ALLIEVO"+suffix,()=>openLocal(local,false)),button("INIZIA GUIDA"+suffix,()=>openLocal(local,true)))}}
    return row;
  }


  function renderNotifications(){
   if(user.role!=="ISTRUTTORE"||!state.snapshot?.notifications?.length)return;
   const details=el("details"),summary=el("summary",state.snapshot.notifications.length+" modifiche ai tuoi appuntamenti");details.append(summary);alerts.append(details);
   if(!navigator.onLine)details.append(el("p","Ultimo dato sincronizzato"));
   for(const item of state.snapshot.notifications){
    const row=el("article");row.append(el("strong",item.title),el("p",rome(item.starts_at).replace("T"," ")+" – "+rome(item.ends_at).slice(11)),el("p",item.description));
    row.append(button("VEDI MODIFICA",()=>{state.site=item.site_id;day.value=rome(item.starts_at).slice(0,10);state.mode=1;render();const found=[...list.querySelectorAll("[data-event-id]")].find(n=>n.dataset.eventId===item.id);if(found){found.scrollIntoView({block:"center"});found.focus();examDetails(state.snapshot.events.find(e=>e.id===item.id))}else notice.textContent=item.description+" Riferimento precedente: "+rome(item.starts_at).replace("T"," ");}));
    const dismiss=button("CONFERMA / CHIUDI",async()=>{if(state.busy||state.acknowledging){notice.textContent="Attendi la fine della sincronizzazione prima di confermare.";return}state.acknowledging=true;dismiss.disabled=true;try{const next={...state.snapshot,notifications:state.snapshot.notifications.filter(n=>n.id!==item.id||n.revision!==item.revision)};await cache.save(next);state.snapshot=next;render()}catch{notice.textContent="Conferma non salvata. L'avviso resta disponibile."}finally{state.acknowledging=false;dismiss.disabled=false}});
    row.append(dismiss);details.append(row);
   }
  }
  function instructorsFor(entries){
   const people=new Map((state.instructors[state.site]||[]).map(p=>[p.id,{...p,current:true}]));
   for(const e of entries)for(const p of e.instructors||[{id:e.instructor_id,name:e.instructor_name}])if(!people.has(p.id))people.set(p.id,{...p,current:false});
   return [...people.values()].filter(p=>p.name.toLocaleLowerCase("it").includes(state.filter.instructor_name||"")).sort((a,b)=>a.name.localeCompare(b.name,"it")||a.id.localeCompare(b.id));
  }
  function totalsCard(person,entries,from,to){
   const t=totals(entries,person.id,from,to),box=el("section",null,"sc-totals");
   box.append(el("h3",person.name),el("p",state.mode===7?weekLabel(day.value):new Date(day.value+"T12:00Z").toLocaleDateString("it-IT",{timeZone:"UTC"})),el("p","Auto: "+durationLabel(t.auto)),el("p","Moto: "+durationLabel(t.moto)),el("p","Totale guide: "+durationLabel(t.auto+t.moto)),el("p","Esami: "+t.exams+" sedute · "+durationLabel(t.exam)),el("p","Totale impegni: "+durationLabel(t.auto+t.moto+t.exam)));
   if(!navigator.onLine)box.append(el("p","Ultimo dato sincronizzato"));return box;
  }
  function renderGrid(entries,target=list,gridDate=day.value,weekly=false,weekPeople=null){
   const people=weekPeople||instructorsFor(entries),scroll=el("div",null,"sc-grid-scroll"),grid=el("div",null,"sc-grid");scroll.tabIndex=0;scroll.setAttribute("aria-label","Giornata "+gridDate+"; colonne istruttori, orari 06:00–22:00");target.append(scroll);scroll.append(grid);
   if(!people.length){target.append(el("p","Nessun istruttore disponibile per questa sede. In assenza di rete sono mostrati soltanto i dati già sincronizzati."));return}
   const columns=[],items=[];let column=2;
   for(const person of people){
    const own=orderedEvents(entries).filter(e=>(e.instructors||[{id:e.instructor_id}]).some(p=>p.id===person.id)),lanes=[],placed=[];
    for(const e of own){const p=placement(e,gridDate);if(p.span<=0)continue;let lane=lanes.findIndex(end=>end<=p.start);if(lane<0)lane=lanes.length;lanes[lane]=p.end;placed.push({e,p,lane})}
    const width=Math.max(1,lanes.length);columns.push({person,column,width,own});for(const item of placed)items.push({...item,column:column+item.lane});column+=width;
   }
   grid.style.width="max(100%, "+(72+(column-2)*300)+"px)";grid.style.gridTemplateColumns="72px repeat("+(column-2)+",minmax(260px,1fr))";grid.style.setProperty("--sc-minute","3px");
   const corner=el("div","ORA","sc-grid-head sc-time");corner.style.gridArea="1 / 1";grid.append(corner);
   for(const c of columns){const h=el("div",c.person.name+(c.person.current?"":" · storico"),"sc-grid-head");h.style.gridArea="1 / "+c.column+" / 2 / span "+c.width;grid.append(h)}
   for(const slot of slots()){
    const time=el("div",slot.label,"sc-time");time.style.gridArea=(slot.minute-360+2)+" / 1 / span 30";grid.append(time);
    for(const c of columns){const busy=c.own.some(e=>!cancelled(e)&&placement(e,gridDate).start<slot.minute+30&&placement(e,gridDate).end>slot.minute),can=!weekly&&state.config?.manage&&navigator.onLine&&c.person.current&&!busy;
     const cell=can?button("+",()=>quick(c.person,slot.minute)):el("div");cell.className="sc-slot";cell.style.gridArea=(slot.minute-360+2)+" / "+c.column+" / span 30 / span "+c.width;
     if(can){cell.dataset.minute=slot.minute;cell.dataset.instructor=c.person.id;cell.setAttribute("aria-label","Nuovo appuntamento "+gridDate+" "+slot.label+" · "+c.person.name)}grid.append(cell);
    }
   }
   const end=el("div","22:00","sc-time");end.style.gridArea="962 / 1";grid.append(end);
   for(const {e,p,column}of items){const row=card(e);row.classList.add("sc-grid-event");row.dataset.minutes=p.span;row.style.gridArea=p.row+" / "+column+" / span "+p.span;grid.append(row)}
   const now=rome(Date.now());if(now.slice(0,10)===gridDate){const m=Number(now.slice(11,13))*60+Number(now.slice(14,16));if(m>=360&&m<1320){const line=el("div",null,"sc-now");line.setAttribute("aria-label","Ora corrente "+now.slice(11));line.style.gridArea=(m-360+2)+" / 2 / span 1 / "+column;grid.append(line)}}
   if(!weekly)for(const c of columns){const sum=totalsCard(c.person,entries,gridDate,addDays(gridDate,1));sum.style.gridArea="963 / "+c.column+" / auto / span "+c.width;grid.append(sum)}
   const outside=entries.filter(e=>{const p=placement(e,gridDate);return p.start<360||p.end>1320});if(outside.length){target.append(el("h3","Eventi anche fuori fascia 06:00–22:00"));for(const e of outside)target.append(card(e))}
   // A uniform minute scale keeps duration exact; enlarge it if long names need space.
   const fit=()=>{if(!grid.isConnected)return;let unit=3;for(const row of grid.querySelectorAll(".sc-grid-event"))unit=Math.max(unit,((row.lastElementChild?.getBoundingClientRect().bottom||row.getBoundingClientRect().top)-row.getBoundingClientRect().top+12)/Number(row.dataset.minutes));grid.style.setProperty("--sc-minute",Math.ceil(unit*10)/10+"px")};
   requestAnimationFrame(fit);if(root.ResizeObserver){if(weekly){const observer=new ResizeObserver(fit);observer.observe(scroll);(state.weekObservers||=[]).push(observer)}else{state.gridObserver?.disconnect();state.gridObserver=new ResizeObserver(fit);state.gridObserver.observe(scroll)}}
  }
  function quick(person,minute){
   if(!state.config?.manage||!navigator.onLine||state.opening)return;
   state.opening=true;const f=form("Inserimento rapido"),date=day.value,site=state.site;
   f.f.append(el("p",date+" · "+String(Math.floor(minute/60)).padStart(2,"0")+":"+(minute%60?"30":"00")+" · "+person.name));
   const local=root.SharedCalendar.localStudents?.()||[];
   f.field("surname","Cognome");f.field("initial","Iniziale nome (facoltativa)");
   const selection=f.field("local_id","Allievo locale (facoltativo)","",[["","Inserimento manuale"],...local.map(s=>[s.id,[s.lastName,s.firstName].filter(Boolean).join(" ")])]);
   selection.onchange=()=>{const s=local.find(s=>s.id===selection.value);if(s){f.fields.surname.value=s.lastName||"";f.fields.initial.value=Array.from((s.firstName||"").normalize("NFC").trim())[0]||""}warn()};
   const warn=()=>{try{f.err.textContent=surnameWarning(state.snapshot.events,date,f.fields.surname.value,f.fields.initial.value)}catch{f.err.textContent=""}};
   f.fields.surname.oninput=()=>{selection.value="";warn()};f.fields.initial.oninput=warn;
   f.field("student_name","Nominativo completo per esame");f.fields.student_name.parentElement.hidden=true;
   f.field("type","Tipo","auto",[["auto","Auto"],["moto","Moto"],["exam","Esame"]]);f.fields.type.onchange=()=>{const exam=f.fields.type.value==="exam";f.fields.student_name.parentElement.hidden=!exam;f.fields.surname.parentElement.hidden=exam;f.fields.initial.parentElement.hidden=exam;selection.parentElement.hidden=exam};
   f.field("duration","Durata (minuti)","60",[["30","30 minuti"],["60","1 ora"],["90","1 ora 30 minuti"],["120","2 ore"],["180","3 ore"],["240","4 ore"]]);
   const next=el("button","CONTINUA");next.type="submit";const closeQuick=()=>{state.opening=false;f.d.remove()};f.f.append(f.err,next,button("ANNULLA",closeQuick));f.d.addEventListener("cancel",closeQuick);f.f.onsubmit=event=>{event.preventDefault();if(!navigator.onLine||!state.config?.manage)return;try{const type=f.fields.type.value,seed={...quickSeed(date,minute,person.id,site,Number(f.fields.duration.value)),student_name:type==="exam"?f.fields.student_name.value.trim():compactStudentName(f.fields.surname.value,f.fields.initial.value),student_id:selection.value||null,compact:type!=="exam",surname:f.fields.surname.value,initial:f.fields.initial.value};if(!seed.student_name)throw Error("Inserisci il nominativo dell’allievo.");const warning=type==="exam"?"":surnameWarning(state.snapshot.events,date,f.fields.surname.value,f.fields.initial.value);if(warning&&!confirm(warning+"\nContinuare comunque?"))return;closeQuick();type==="auto"?edit(null,seed):editExam(null,type==="moto",seed)}catch(e){f.err.textContent=e.message}};f.d.showModal();
  }
  function simplify(f,visible,seed){
   const hidden=[];for(const [key,input]of Object.entries(f.fields))if(!visible.includes(key)){input.parentElement.hidden=true;hidden.push(input.parentElement)}
   const summary=el("p",seed.starts_at.replace("T"," ")+" – "+seed.ends_at.slice(11)+" · "+(state.instructors[seed.site_id]?.find(p=>p.id===seed.instructor_id)?.name||"Istruttore selezionato"));
   const toggle=button("DETTAGLI COMPLETI",()=>{for(const node of hidden)node.hidden=!node.hidden;toggle.textContent=hidden[0]?.hidden?"DETTAGLI COMPLETI":"NASCONDI DETTAGLI"});
   f.f.querySelector("h2").after(summary,toggle);
  }

  function openLocal(e,lesson){
   if(e.instructor_id!==user.id||root.AgendaAuth?.currentUser()?.id!==user.id)return;
   // The bridge reads the application's existing in-memory archive, never storage.
   const found=root.SharedCalendar.localStudent?.(e.student_id);
   if(!found){notice.textContent="Allievo non disponibile su questo dispositivo. Richiedere il file alla segreteria o all'istruttore competente.";return}
   close();root.SharedCalendar.openLocalStudent(e.student_id,lesson);
  }
  function form(title){
   const d=el("dialog",null,"shared-calendar sc-editor"),f=el("form"),err=el("p");err.setAttribute("role","alert");f.append(el("h2",title));d.append(f);dialog.append(d);
   const fields={};
   function field(key,label,value="",options=null,type="text"){
    const wrap=el("label",label),input=el(options?"select":"input");if(options){for(const [v,t]of options){const o=el("option",t);o.value=v;input.append(o)}}else input.type=type;input.value=value??"";fields[key]=input;wrap.append(input);f.append(wrap);return input;
   }
   const cancel=button("ANNULLA",()=>d.remove()),submit=el("button","SALVA");submit.type="submit";
   function finish(save){f.append(err,submit,cancel);f.onsubmit=async event=>{event.preventDefault();if(state.saving||!navigator.onLine)return;state.saving=true;submit.disabled=true;try{await save();d.remove();await sync()}catch(e){err.textContent=e.message;if(e.data?.conflicts)err.textContent+=" Appuntamenti: "+e.data.conflicts.map(x=>rome(x.starts_at)).join(", ")}finally{state.saving=false;submit.disabled=false}};d.addEventListener("cancel",()=>d.remove());d.showModal();}
   return{d,f,fields,field,finish,err};
  }
  async function edit(e=null,seed=null){
   if(e&&motorcycleCategory(e.category))return editExam(e,true);
   try{
    const id=e?.site_id||seed?.site_id||state.site;if(!id)throw Error("Crea prima una sede e assegna un istruttore.");
    const [people,v]=await Promise.all([api("instructors?site="+encodeURIComponent(id)),api("vehicles?site="+encodeURIComponent(id))]);
    const f=form("Appuntamento"),x=f.field;
    x("site_id","Sede",id,state.snapshot.sites.filter(s=>s.active||s.id===id).map(s=>[s.id,s.name]));
    x("starts_at","Inizio (Europe/Rome)",e?rome(e.starts_at):seed?.starts_at||day.value+"T09:00",null,"datetime-local");
    x("ends_at","Fine (Europe/Rome)",e?rome(e.ends_at):seed?.ends_at||day.value+"T10:00",null,"datetime-local");
    x("student_name","Nome allievo",e?.student_name||seed?.student_name);x("student_id","ID allievo (facoltativo)",e?.student_id||seed?.student_id);
    x("category","Categoria/percorso",e?.category||"auto");
    x("instructor_id","Istruttore",e?.instructor_id||seed?.instructor_id,people.instructors.map(p=>[p.id,p.name]));
    x("vehicle_id","Veicolo facoltativo",e?.vehicle_id,[["","Nessuno"],...v.vehicles.filter(z=>["DISPONIBILE","TRASFERIMENTO_PROGRAMMATO"].includes(z.status)).map(z=>[z.id,z.name])]);
    x("note","Nota organizzativa (massimo 200 caratteri)",e?.note).maxLength=200;
    x("status","Stato",e?.status||"PROGRAMMATA",["PROGRAMMATA","CONFERMATA","ANNULLATA","ASSENTE","SVOLTA"].map(s=>[s,s]));
    let optionsEpoch=0;
    async function refreshOptions(){const epoch=++optionsEpoch;try{const site=f.fields.site_id.value,at=utc(f.fields.starts_at.value),until=utc(f.fields.ends_at.value),category=f.fields.category.value;
     const [people,available]=await Promise.all([api("instructors?site="+encodeURIComponent(site)),api("vehicles?site="+encodeURIComponent(site)+"&at="+encodeURIComponent(at)+"&until="+encodeURIComponent(until)+"&category="+encodeURIComponent(category)+(e?"&event="+encodeURIComponent(e.id):""))]);
     if(epoch!==optionsEpoch||!f.d.isConnected)return;
     for(const [key,items]of [["instructor_id",people.instructors],["vehicle_id",[{id:"",name:"Nessuno"},...available.vehicles]]]){const input=f.fields[key],value=input.value;input.replaceChildren();for(const item of items){const o=el("option",item.name);o.value=item.id;input.append(o)}if(items.some(x=>x.id===value))input.value=value;}
    }catch(err){f.err.textContent=err.message}}
    for(const key of ["site_id","starts_at","ends_at","category"])f.fields[key].onchange=refreshOptions;
    void refreshOptions();
    if(e&&!e.deleted)f.f.append(button("ELIMINA APPUNTAMENTO",async()=>{if(!navigator.onLine||state.saving||!confirm("Eliminare logicamente questo appuntamento? Lo storico rimane."))return;state.saving=true;try{await api("events",payload(e,true));f.d.remove();await sync()}catch(err){f.err.textContent=err.message}finally{state.saving=false}}));
    function payload(old,deleted=false){const b=Object.fromEntries(Object.entries(f.fields).map(([k,i])=>[k,i.value]));b.starts_at=utc(b.starts_at);b.ends_at=utc(b.ends_at);if(old){b.id=old.id;b.version=old.version}b.deleted=deleted;return b}
    if(seed?.compact)f.fields.student_name.readOnly=true;f.finish(()=>api("events",payload(e)));if(seed)simplify(f,["student_name","vehicle_id"],seed);
   }catch(e){notice.textContent=e.message}
  }
  function examDetails(e){
   const f=form((e.event_type==="ESAME"?"ESAME":motorcycleCategory(e.category)?"GUIDA MOTO":"GUIDA AUTO")+" · "+e.category);
   f.f.append(el("p",rome(e.starts_at).replace("T"," ")+" – "+rome(e.ends_at).slice(11)),el("p","Località: "+e.meeting_point),el("p","Istruttori: "+e.instructors.map(x=>x.name).join(", ")),el("p","Veicoli: "+e.vehicles.map(x=>x.name).join(", ")),el("p","Esaminatore: "+(e.examiner||"non inserito")));
   const names=el("ol");for(const p of e.participants)names.append(el("li",participantLabel(p,e)));f.f.append(names,el("p",e.note),el("p","Solo organizzazione: gli esiti restano negli ESAMI locali."),button("CHIUDI",()=>f.d.remove()));f.d.showModal();
  }
  async function editExam(e=null,motorcycle=false,seed=null){
   try{
    const id=e?.site_id||seed?.site_id||state.site;if(!id)throw Error("Crea prima una sede.");
    const catalog=await api("motorcycle-codes");
    const f=form(motorcycle?(e?"Modifica GUIDA MOTO":"Nuova GUIDA MOTO"):(e?"Modifica seduta ESAME":"Nuova seduta ESAME")),x=f.field;
    x("site_id","Sede",id,state.snapshot.sites.filter(s=>s.active||s.id===id).map(s=>[s.id,s.name]));
    x("starts_at","Inizio (Europe/Rome)",e?rome(e.starts_at):seed?.starts_at||day.value+"T09:00",null,"datetime-local");
    x("ends_at","Fine (Europe/Rome)",e?rome(e.ends_at):seed?.ends_at||day.value+"T10:00",null,"datetime-local");
    x("category","Categoria/percorso",e?.category||(motorcycle?"moto":"auto"),motorcycle?["moto","corso-moto","am","a1","a2","a"].map(c=>[c,c]):null);
    if(!motorcycle){x("meeting_point","Località / punto di ritrovo",e?.meeting_point).maxLength=160;
    x("examiner","Esaminatore (informazione facoltativa)",e?.examiner).maxLength=120;}
    const chosen={instructors:new Set(e?e.instructors.map(x=>x.id):seed?[seed.instructor_id]:[]),vehicles:new Set((e?.vehicles||[]).map(x=>x.id))},boxes={};
    for(const [key,label]of (motorcycle?[["instructors","Istruttore"]]:[["instructors","Istruttori"],["vehicles","Veicoli"]])){const box=el("fieldset");box.append(el("legend",label));const body=el("div");box.append(body);f.f.append(box);boxes[key]=body}
    let epoch=0,availableVehicles=[];
    async function resources(){
     const n=++epoch;try{
      const site=encodeURIComponent(f.fields.site_id.value),at=encodeURIComponent(utc(f.fields.starts_at.value)),until=encodeURIComponent(utc(f.fields.ends_at.value)),category=encodeURIComponent(f.fields.category.value);
      const [people,cars]=await Promise.all([api("instructors?site="+site),api("vehicles?site="+site+"&at="+at+"&until="+until+"&category="+category+(e?"&event="+encodeURIComponent(e.id):""))]);
      if(n!==epoch||!f.d.isConnected)return;
      availableVehicles=cars.vehicles;for(const p of rows)fillVehicle(p);
      for(const [key,items]of [["instructors",people.instructors],...(!motorcycle?[["vehicles",cars.vehicles]]:[])]){
       const body=boxes[key];body.replaceChildren();
       for(const item of items){const label=el("label",null,"sc-choice"),input=el("input");input.type=motorcycle?"radio":"checkbox";input.name="sc-resource-"+key;input.value=item.id;input.checked=chosen[key].has(item.id);input.onchange=()=>{if(motorcycle)chosen[key].clear();input.checked?chosen[key].add(item.id):chosen[key].delete(item.id)};label.append(input,el("span",item.name));body.append(label)}
       for(const selected of chosen[key])if(!items.some(x=>x.id===selected)){const label=el("label",null,"sc-choice"),input=el("input");input.type="checkbox";input.checked=true;input.onchange=()=>{chosen[key].delete(selected);label.remove()};label.append(input,el("span",(e?.[key]?.find(x=>x.id===selected)?.name||selected)+" — non disponibile: rimuovi o cambia orario"));body.append(label)}
       if(!items.length)body.append(el("p","Nessuna risorsa disponibile per sede, orario e categoria."));
      }
     }catch(err){f.err.textContent=err.message}
    }
    for(const key of ["site_id","starts_at","ends_at","category"])f.fields[key].onchange=resources;
    const participants=el("fieldset"),rows=[];participants.append(el("legend",motorcycle?"Allievi della guida moto":"Allievi convocati"));f.f.append(participants);
    function fillVehicle(data){
     const selected=data.vehicle.value||data.initialVehicle||"",options=[{id:"",name:"Nessun veicolo fisico"},...availableVehicles];
     if(selected&&!options.some(v=>v.id===selected))options.push({id:selected,name:(e?.vehicles.find(v=>v.id===selected)?.name||selected)+" — non disponibile"});
     data.vehicle.replaceChildren();for(const v of options){const o=el("option",v.name);o.value=v.id;data.vehicle.append(o)}data.vehicle.value=selected;
    }
    function participant(p={}){
     const row=el("div",null,"sc-participant"),name=el("input"),id=el("input"),n=el("label","Nome allievo"),i=el("label","ID stabile (se disponibile)");
     const code=el("select"),vehicle=el("select"),c=el("label","Sigla moto (facoltativa)"),v=el("label","Veicolo fisico individuale (facoltativo)");
     const codeOptions=[{id:"",code:"Nessuna sigla"},...catalog.codes.filter(c=>c.active)];
     if(p.motorcycle_code_id&&!codeOptions.some(c=>c.id===p.motorcycle_code_id))codeOptions.push({id:p.motorcycle_code_id,code:p.motorcycle_code_snapshot+" (storica, disattivata)"});
     for(const item of codeOptions){const historical=item.id===p.motorcycle_code_id&&p.motorcycle_code_snapshot;const option=el("option",historical?historical+(catalog.codes.find(c=>c.id===item.id)?.active?" (storica)":" (storica, disattivata)"):item.code);option.value=item.id;code.append(option)}code.value=p.motorcycle_code_id||"";
     name.value=p.name||"";id.value=p.id||"";name.maxLength=120;id.maxLength=120;n.append(name);i.append(id);c.append(code);v.append(vehicle);
     const data={row,name,id,code,vehicle,initialVehicle:p.vehicle_id||null};vehicle.onchange=()=>data.initialVehicle=vehicle.value;rows.push(data);fillVehicle(data);
     if(motorcycle&&seed?.compact){
      const surname=el("input"),initial=el("input"),sl=el("label","Cognome"),il=el("label","Iniziale nome (facoltativa)"),warning=el("p");surname.value=p.surname||"";initial.value=p.initial||"";sl.append(surname);il.append(initial);row.append(sl,il,warning);n.hidden=true;i.hidden=true;
      const local=root.SharedCalendar.localStudents?.()||[],pick=el("select"),pl=el("label","Allievo locale (facoltativo)");for(const s of [{id:"",lastName:"Inserimento manuale"},...local]){const o=el("option",[s.lastName,s.firstName].filter(Boolean).join(" "));o.value=s.id;pick.append(o)}pick.value=p.id||"";pl.append(pick);row.append(pl);
      const warn=()=>{try{warning.textContent=surnameWarning(state.snapshot.events,f.fields.starts_at.value.slice(0,10),surname.value,initial.value,rows.filter(r=>r!==data).map(r=>r.readName?r.readName():r.name.value))}catch{warning.textContent=""}};
      pick.onchange=()=>{const s=local.find(s=>s.id===pick.value);id.value=s?.id||"";if(s){surname.value=s.lastName||"";initial.value=Array.from((s.firstName||"").normalize("NFC").trim())[0]||""}warn()};surname.oninput=()=>{id.value="";pick.value="";warn()};initial.oninput=warn;data.readName=()=>compactStudentName(surname.value,initial.value);data.warning=()=>surnameWarning(state.snapshot.events,f.fields.starts_at.value.slice(0,10),surname.value,initial.value,rows.filter(r=>r!==data).map(r=>r.readName?r.readName():r.name.value));
     }
     row.append(n,i,c,v,button("RIMUOVI ALLIEVO",()=>{rows.splice(rows.indexOf(data),1);row.remove()}));participants.append(row);
    }
    for(const p of e?.participants||[{name:seed?.student_name,id:seed?.student_id,surname:seed?.surname,initial:seed?.initial}])participant(motorcycle&&e?.participants.length===1&&p.vehicle_id===undefined?{...p,vehicle_id:e.vehicle_id}:p);
    f.f.append(button("AGGIUNGI ALLIEVO",()=>participant()));
    x("note","Nota organizzativa (massimo 200 caratteri)",e?.note).maxLength=200;
    x("status","Stato",e?.status||(motorcycle?"PROGRAMMATA":"PROGRAMMATO"),(motorcycle?["PROGRAMMATA","CONFERMATA","ANNULLATA","ASSENTE","SVOLTA"]:["PROGRAMMATO","CONFERMATO","ANNULLATO","CONCLUSO"]).map(s=>[s,s]));
    f.f.append(el("p",motorcycle?"Un unico evento con un solo istruttore. Le guide svolte sul dispositivo restano individuali.":"Un solo evento per tutta la seduta. Nessun esito viene sincronizzato con gli ESAMI locali."));
    const payload=(deleted=false)=>({...Object.fromEntries(Object.entries(f.fields).map(([k,i])=>[k,i.value])),event_type:motorcycle?"GUIDA":"ESAME",starts_at:utc(f.fields.starts_at.value),ends_at:utc(f.fields.ends_at.value),...(motorcycle?{instructor_id:[...chosen.instructors][0]||""}:{instructors:[...chosen.instructors],vehicles:[...chosen.vehicles]}),participants:rows.map(p=>({id:p.id.value||null,name:p.readName?p.readName():p.name.value,motorcycle_code_id:p.code.value||null,vehicle_id:p.vehicle.value||null})),deleted,...(e?{id:e.id,version:e.version}:{})});
    if(e&&!e.deleted)f.f.append(button("ELIMINA APPUNTAMENTO",async()=>{if(state.saving||!navigator.onLine||!confirm("Eliminare logicamente questa seduta?"))return;state.saving=true;try{await api("events",payload(true));f.d.remove();await sync()}catch(err){f.err.textContent=err.message}finally{state.saving=false}}));
    f.finish(()=>{for(const row of rows)if(row.warning?.()&&!confirm(row.warning()+"\nContinuare comunque?"))throw Error("Salvataggio annullato: verifica l’iniziale.");return api("events",payload())});if(seed)simplify(f,[],seed);void resources();
   }catch(err){notice.textContent=err.message}
  }
  async function motorcycleCodes(){
   try{
    const data=await api("motorcycle-codes"),menu=form("Catalogo SIGLE MOTO");
    menu.f.append(el("p","La sigla è un tipo operativo, non un veicolo fisico. Le modifiche non cambiano gli appuntamenti già salvati."));
    for(const c of data.codes)menu.f.append(button(c.code+" · ordine "+c.sort_order+" · "+(c.active?"attiva":"disattivata"),()=>{menu.d.remove();codeEditor(c)}));
    menu.f.append(button("NUOVA SIGLA",()=>{menu.d.remove();codeEditor()}),button("CHIUDI",()=>menu.d.remove()));menu.d.showModal();
   }catch(e){notice.textContent=e.message}
  }
  function codeEditor(c){
   const f=form(c?"Modifica sigla moto":"Nuova sigla moto");
   f.field("code","Sigla",c?.code).maxLength=80;const order=f.field("sort_order","Ordine",c?.sort_order??0,null,"number");order.min=0;order.max=100000;order.step=1;
   f.field("active","Stato",c?.active===0?"0":"1",[["1","Attiva"],["0","Disattivata"]]);
   f.finish(()=>api("motorcycle-codes",{...(c?{id:c.id,version:c.version}:{}),code:f.fields.code.value,sort_order:Number(f.fields.sort_order.value),active:f.fields.active.value==="1"}));
  }
  async function deletedEvents(){
   try{const from=utc(day.value+"T00:00"),to=new Date(Date.parse(from)+31*86400000).toISOString(),data=await api("events?site="+encodeURIComponent(state.site)+"&from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to)+"&deleted=1"),f=form("Eliminati nei prossimi 31 giorni");for(const e of data.events)f.f.append(button("RIPRISTINA "+e.student_name+" "+rome(e.starts_at),()=>{f.d.remove();e.event_type==="ESAME"?editExam(e):edit(e)}));if(!data.events.length)f.f.append(el("p","Nessun appuntamento eliminato in questo intervallo."));f.f.append(button("CHIUDI",()=>f.d.remove()));f.d.showModal()}catch(e){notice.textContent=e.message}
  }
  function sites(){
   const menu=form("Sedi");for(const s of state.snapshot.sites)menu.f.append(button(s.name,()=>{menu.d.remove();siteEditor(s)}));menu.f.append(button("NUOVA SEDE",()=>{menu.d.remove();siteEditor()}));menu.f.append(button("CHIUDI",()=>menu.d.remove()));menu.d.showModal();
  }
  function siteEditor(s){const f=form("Sede");f.field("name","Nome",s?.name);f.field("active","Stato",s?.active===0?"0":"1",[["1","Attiva"],["0","Disattivata"]]);f.finish(()=>api("sites",{...(s?{id:s.id,version:s.version}:{}),name:f.fields.name.value,active:f.fields.active.value==="1"}))}
  async function vehicles(){
   try{if(!state.site)throw Error("Seleziona una sede.");const data=await api("vehicles?site="+encodeURIComponent(state.site)),m=form("Veicoli");for(const v of data.vehicles){m.f.append(el("p",v.name+" · "+v.status),button("MODIFICA "+v.name,()=>{m.d.remove();vehicleEditor(v)}),button("SPOSTA "+v.name,()=>{m.d.remove();move(v)}))}m.f.append(button("STORICO TRASFERIMENTI",async()=>{try{for(const v of data.vehicles){const h=await api("movements?vehicle="+encodeURIComponent(v.id));for(const item of h.movements)m.f.append(el("p",v.name+" · "+rome(item.effective_at)+" · "+item.from_site_id+" → "+item.to_site_id))}}catch(e){m.err.textContent=e.message}}),button("NUOVO VEICOLO",()=>{m.d.remove();vehicleEditor()}),button("CHIUDI",()=>m.d.remove()));m.d.showModal()}catch(e){notice.textContent=e.message}
  }
  function vehicleEditor(v){
   const f=form("Veicolo");for(const [key,label]of [["name","Nome"],["plate","Targa facoltativa"],["categories","Categorie separate da virgola"],["mileage","Chilometraggio facoltativo"]])f.field(key,label,key==="categories"?(v?.categories||["auto"]).join(","):v?.[key]);
   f.field("type","Tipo",v?.type||"Auto",[["Auto","Auto"],["Moto","Moto"]]);f.field("transmission","Cambio",v?.transmission||"",[["","Non indicato"],["manuale","Manuale"],["automatico","Automatico"]]);
   f.field("usual_site_id","Sede abituale facoltativa",v?.usual_site_id||"",[["","Non indicata"],...state.snapshot.sites.map(s=>[s.id,s.name])]);
   f.field("status","Stato",v?.status||"DISPONIBILE",["DISPONIBILE","TRASFERIMENTO_PROGRAMMATO","IN_TRASFERIMENTO","MANUTENZIONE","NON_UTILIZZABILE","DISMESSO"].map(x=>[x,x]));
   f.finish(()=>{const b=Object.fromEntries(Object.entries(f.fields).map(([k,i])=>[k,i.value]));b.categories=b.categories.split(",").map(x=>x.trim());b.mileage=b.mileage===""?null:Number(b.mileage);b.site_id=v?.site_id||state.site;if(v){b.id=v.id;b.version=v.version}return api("vehicles",b)});
  }
  function move(v){const f=form("SPOSTA VEICOLO");f.field("to_site_id","Nuova sede","",state.snapshot.sites.filter(s=>s.active).map(s=>[s.id,s.name]));f.field("effective_at","Data e ora di efficacia (Europe/Rome)",rome(Date.now()+3600000),null,"datetime-local");f.field("reason","Motivazione facoltativa");f.field("mileage","Chilometraggio facoltativo");f.finish(async()=>{const b={vehicle_id:v.id,version:v.version,to_site_id:f.fields.to_site_id.value,effective_at:utc(f.fields.effective_at.value),reason:f.fields.reason.value,mileage:f.fields.mileage.value?Number(f.fields.mileage.value):null};try{return await api("movements",b)}catch(e){if(e.data?.conflicts&&confirm(e.message+"\n"+e.data.conflicts.map(x=>rome(x.starts_at)).join("\n")+"\nConfermi? Gli appuntamenti NON verranno modificati."))return api("movements",{...b,confirm_conflicts:true});throw e}})}
  async function memberships(){try{const data=await api("memberships"),f=form("Assegna o revoca sede");f.field("user_id","Utente","",data.users.map(u=>[u.id,u.name]));f.field("site_id","Sede",state.site,state.snapshot.sites.map(s=>[s.id,s.name]));f.field("assigned","Operazione","1",[["1","Assegna"],["0","Revoca"]]);f.finish(()=>api("memberships",{user_id:f.fields.user_id.value,site_id:f.fields.site_id.value,assigned:f.fields.assigned.value==="1"}))}catch(e){notice.textContent=e.message}}
  state.cache=cache;
 }
 function dispose(){if(!instance)return;const s=instance;s.alive=false;s.active=false;s.clock?.stop();s.gridObserver?.disconnect();for(const o of s.weekObservers||[])o.disconnect();for(const c of s.requests)c.abort();document.removeEventListener("visibilitychange",s.visibility);root.removeEventListener("online",s.online);root.removeEventListener("offline",s.online);s.dialog?.remove();s.buttons?.forEach(b=>b.remove());void s.cache?.close();instance=null}
 root.SharedCalendar={mount,dispose,compareCalendarEvents,orderedEvents,dayGridModel,canPrintCalendar,utc,rome,addDays,isoWeek,weekDate,weekLabel,slots,placement,quickSeed,totals,durationLabel,weeklyDocument,printOpener,compactStudentName,sameSurname,surnameWarning,
  localStudents:()=>typeof state!=="undefined"?state.students.map(s=>({id:s.id,firstName:s.firstName,lastName:s.lastName})):[],
  localStudent:id=>typeof state!=="undefined"&&id?state.students.find(s=>s.id===id):null,
  openLocalStudent:(id,lesson)=>{if(typeof openStudent==="function"){openStudent(id);if(lesson&&typeof newLesson==="function")newLesson()}}
 };
})(window);
