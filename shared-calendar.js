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
 function mount(user){
  if(user?.sharedCalendarEnabled!==true)return;
  if(instance?.account===user.id)return;
  dispose();
  const cache=root.SharedCalendarStore.create(),state={account:user.id,alive:true,active:false,busy:false,saving:false,config:null,snapshot:null,mode:1,site:"",filter:{},requests:new Set()};
  instance=state;
  if(!document.getElementById("sharedCalendarStyle")){const link=el("link");link.id="sharedCalendarStyle";link.rel="stylesheet";link.href="shared-calendar.css?v=1";document.head.append(link)}
  const dialog=el("dialog",null,"shared-calendar"),heading=el("h2","AGENDA CONDIVISA"),notice=el("p","AGGIORNAMENTO IN CORSO"),controls=el("div",null,"sc-controls"),list=el("div",null,"sc-list"),tools=el("div",null,"sc-controls");
  notice.setAttribute("role","status");dialog.append(heading,notice,controls,tools,list);document.body.append(dialog);state.dialog=dialog;
  const selector=el("select"),day=el("input");day.type="date";day.value=rome(Date.now()).slice(0,10);selector.setAttribute("aria-label","Sede");day.setAttribute("aria-label","Giorno");
  controls.append(button("INDIETRO",close),selector,day,button("OGGI",()=>{day.value=rome(Date.now()).slice(0,10);state.mode=1;render()}),button("SETTIMANA",()=>{state.mode=7;render()}),button("AGGIORNA",()=>sync()));
  const inputs={};for(const [key,label]of [["instructor_name","Istruttore"],["category","Categoria"],["vehicles","Veicolo"]]){const l=el("label",label),i=el("input");i.type="search";i.oninput=()=>{state.filter[key]=i.value.trim().toLocaleLowerCase("it");render()};l.append(i);controls.append(l);inputs[key]=i;}
  selector.onchange=()=>{state.site=selector.value;render()};day.onchange=render;
  async function api(path,body){
   const controller=new AbortController();state.requests.add(controller);const timer=setTimeout(()=>controller.abort(),15000);
   try{
    const r=await fetch("/api/calendar/"+path,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:{},body:body?JSON.stringify(body):undefined,signal:controller.signal,credentials:"same-origin"});
    const data=await r.json();if(!r.ok){if([401,403,404].includes(r.status)){state.config=null;state.denied=true;list.replaceChildren();tools.replaceChildren()}throw Object.assign(Error(data.error||"Calendario non disponibile."),{status:r.status,data})}return data;
   }finally{clearTimeout(timer);state.requests.delete(controller)}
  }
  async function sync(){
   if(!state.alive||!state.active||state.busy||document.hidden)return;
   if(!navigator.onLine){notice.textContent="OFFLINE - ultima sincronizzazione "+(state.snapshot?.syncedAt?new Date(state.snapshot.syncedAt).toLocaleTimeString("it-IT"):"non disponibile");render();return}
   state.busy=true;notice.textContent="AGGIORNAMENTO IN CORSO";
   try{
    const cfg=await api("config");if(!state.alive)return;state.config=cfg;state.denied=false;
    let previous=state.snapshot||await cache.load(user.id);
    if(JSON.stringify([...previous.scope].sort())!==JSON.stringify([...cfg.sites].sort()))previous={...previous,events:[],scope:cfg.sites,cursor:0};
    const pages=[];let cursor=previous.cursor,more=true;
    while(more){const page=await api("sync?cursor="+cursor);if(!state.alive)return;if(page.more&&page.cursor<=cursor)throw Error("Cursore non avanzato.");pages.push(page);cursor=page.cursor;more=page.more}
    const next=root.SharedCalendarStore.merge(previous,pages,user.id);if(!state.alive)return;await cache.save(next);if(!state.alive)return;state.snapshot=next;notice.textContent="SINCRONIZZATO - "+new Date(next.syncedAt).toLocaleTimeString("it-IT");
   }catch(e){if(!state.alive)return;notice.textContent=(navigator.onLine?"ERRORE DI SINCRONIZZAZIONE: ":"OFFLINE - ")+e.message+" Ultima copia valida conservata."}
   finally{state.busy=false;if(state.alive)render()}
  }
  const clock=root.SharedCalendarStore.scheduler({active:()=>state.alive&&state.active,visible:()=>!document.hidden,run:sync});state.clock=clock;
  const visibility=()=>{clock.update();if(!document.hidden&&state.active)void sync()};document.addEventListener("visibilitychange",visibility);state.visibility=visibility;
  const online=()=>{if(state.active)void sync()};root.addEventListener("online",online);root.addEventListener("offline",online);state.online=online;
  async function open(){state.active=true;dialog.showModal();try{state.snapshot=await cache.load(user.id);if(!state.alive)return;render()}catch{notice.textContent="Copia locale non leggibile. Nessun archivio esistente è stato modificato."}clock.update();void sync()}
  function close(){state.active=false;clock.stop();for(const c of state.requests)c.abort();dialog.close()}
  dialog.addEventListener("cancel",e=>{e.preventDefault();close()});
  state.buttons=[];for(const id of ["home","secretaryHome"]){const home=document.getElementById(id);if(home){const b=button("AGENDA CONDIVISA",open);b.className="full";b.dataset.sharedCalendar="";home.append(b);state.buttons.push(b)}}
  function render(){
   if(state.denied){list.replaceChildren();tools.replaceChildren();notice.textContent="Accesso al calendario non disponibile. I dati locali non vengono mostrati.";return}if(!state.snapshot)return;
   const snapshot=state.snapshot,selected=state.site||selector.value;
   selector.replaceChildren();for(const s of snapshot.sites){const o=el("option",s.name+(s.active?"":" (disattivata)"));o.value=s.id;selector.append(o)}selector.value=snapshot.scope.includes(selected)?selected:(snapshot.scope[0]||"");state.site=selector.value;
   tools.replaceChildren();if(state.config?.manage){for(const [label,fn]of [["NUOVO APPUNTAMENTO",()=>edit()],["NUOVA GUIDA MOTO",()=>editExam(null,true)],["NUOVO ESAME",()=>editExam()],["SIGLE MOTO",motorcycleCodes],["SEDI",sites],["VEICOLI",vehicles],["APPUNTAMENTI ELIMINATI",deletedEvents]]){const b=button(label,fn);b.disabled=!navigator.onLine;tools.append(b)}}if(state.config?.assign){const b=button("ASSEGNAZIONI SEDI",memberships);b.disabled=!navigator.onLine;tools.append(b)}
   list.replaceChildren();const from=day.value,to=new Date(Date.parse(from+"T12:00Z")+state.mode*86400000).toISOString().slice(0,10);
   const entries=snapshot.events.filter(e=>e.site_id===state.site&&rome(e.starts_at).slice(0,10)>=from&&rome(e.starts_at).slice(0,10)<to&&Object.entries(state.filter).every(([k,v])=>(k==="vehicles"?(e.vehicles||[]).map(x=>x.name).join(" "):k==="instructor_name"?(e.instructors||[]).map(x=>x.name).join(" "):String(e[k]||"")).toLocaleLowerCase("it").includes(v))).sort((a,b)=>a.starts_at.localeCompare(b.starts_at)||a.id.localeCompare(b.id));
   if(!entries.length)list.append(el("p","Nessun appuntamento per i filtri selezionati."));
   for(const e of entries){
    const exam=e.event_type==="ESAME",row=el("article",null,"sc-card"+(exam?" sc-exam":motorcycleCategory(e.category)?" sc-motorcycle":""));
    row.append(el("h3",exam?"ESAME · "+e.category:motorcycleCategory(e.category)?"GUIDA MOTO":"GUIDA · "+e.student_name),el("p",rome(e.starts_at).replace("T"," ")+" – "+rome(e.ends_at).slice(11)),el("p",e.category+" · "+e.status));
    if(exam)row.append(el("p","Località: "+e.meeting_point));
    row.append(el("p","Istruttori: "+(e.instructors||[]).map(x=>x.name).join(", ")),el("p","Veicoli: "+((e.vehicles||[]).map(x=>x.name).join(", ")||"non assegnato")));
    if(exam||motorcycleCategory(e.category)){row.append(el("p","N. allievi: "+e.participants.length));for(const p of e.participants)row.append(el("p",participantLabel(p,e)));row.append(button(exam?"ALLIEVI CONVOCATI":"DETTAGLIO ALLIEVI",()=>examDetails(e)));}
    row.append(el("p",e.note));
    if(state.config?.manage){const b=button("APRI / MODIFICA",()=>exam?editExam(e):edit(e));b.disabled=!navigator.onLine;row.append(b)}
    else if(!exam&&e.instructor_id===user.id){for(const p of e.participants){const local={...e,student_id:p.id},suffix=e.participants.length>1?" · "+p.name:"";row.append(button("APRI ALLIEVO"+suffix,()=>openLocal(local,false)),button("INIZIA GUIDA"+suffix,()=>openLocal(local,true)))}}
    list.append(row)
   }
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
  async function edit(e=null){
   if(e&&motorcycleCategory(e.category))return editExam(e,true);
   try{
    const id=e?.site_id||state.site;if(!id)throw Error("Crea prima una sede e assegna un istruttore.");
    const [people,v]=await Promise.all([api("instructors?site="+encodeURIComponent(id)),api("vehicles?site="+encodeURIComponent(id))]);
    const f=form("Appuntamento"),x=f.field;
    x("site_id","Sede",id,state.snapshot.sites.filter(s=>s.active||s.id===id).map(s=>[s.id,s.name]));
    x("starts_at","Inizio (Europe/Rome)",e?rome(e.starts_at):day.value+"T09:00",null,"datetime-local");
    x("ends_at","Fine (Europe/Rome)",e?rome(e.ends_at):day.value+"T10:00",null,"datetime-local");
    x("student_name","Nome allievo",e?.student_name);x("student_id","ID allievo (facoltativo)",e?.student_id);
    x("category","Categoria/percorso",e?.category||"auto");
    x("instructor_id","Istruttore",e?.instructor_id,people.instructors.map(p=>[p.id,p.name]));
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
    f.finish(()=>api("events",payload(e)));
   }catch(e){notice.textContent=e.message}
  }
  function examDetails(e){
   const f=form((e.event_type==="ESAME"?"ESAME":"GUIDA MOTO")+" · "+e.category);
   f.f.append(el("p",rome(e.starts_at).replace("T"," ")+" – "+rome(e.ends_at).slice(11)),el("p","Località: "+e.meeting_point),el("p","Istruttori: "+e.instructors.map(x=>x.name).join(", ")),el("p","Veicoli: "+e.vehicles.map(x=>x.name).join(", ")),el("p","Esaminatore: "+(e.examiner||"non inserito")));
   const names=el("ol");for(const p of e.participants)names.append(el("li",participantLabel(p,e)));f.f.append(names,el("p",e.note),el("p","Solo organizzazione: gli esiti restano negli ESAMI locali."),button("CHIUDI",()=>f.d.remove()));f.d.showModal();
  }
  async function editExam(e=null,motorcycle=false){
   try{
    const id=e?.site_id||state.site;if(!id)throw Error("Crea prima una sede.");
    const catalog=await api("motorcycle-codes");
    const f=form(motorcycle?(e?"Modifica GUIDA MOTO":"Nuova GUIDA MOTO"):(e?"Modifica seduta ESAME":"Nuova seduta ESAME")),x=f.field;
    x("site_id","Sede",id,state.snapshot.sites.filter(s=>s.active||s.id===id).map(s=>[s.id,s.name]));
    x("starts_at","Inizio (Europe/Rome)",e?rome(e.starts_at):day.value+"T09:00",null,"datetime-local");
    x("ends_at","Fine (Europe/Rome)",e?rome(e.ends_at):day.value+"T10:00",null,"datetime-local");
    x("category","Categoria/percorso",e?.category||(motorcycle?"moto":"auto"),motorcycle?["moto","corso-moto","am","a1","a2","a"].map(c=>[c,c]):null);
    if(!motorcycle){x("meeting_point","Località / punto di ritrovo",e?.meeting_point).maxLength=160;
    x("examiner","Esaminatore (informazione facoltativa)",e?.examiner).maxLength=120;}
    const chosen={instructors:new Set((e?.instructors||[]).map(x=>x.id)),vehicles:new Set((e?.vehicles||[]).map(x=>x.id))},boxes={};
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
     row.append(n,i,c,v,button("RIMUOVI ALLIEVO",()=>{rows.splice(rows.indexOf(data),1);row.remove()}));participants.append(row);
    }
    for(const p of e?.participants||[{}])participant(motorcycle&&e?.participants.length===1&&p.vehicle_id===undefined?{...p,vehicle_id:e.vehicle_id}:p);
    f.f.append(button("AGGIUNGI ALLIEVO",()=>participant()));
    x("note","Nota organizzativa (massimo 200 caratteri)",e?.note).maxLength=200;
    x("status","Stato",e?.status||(motorcycle?"PROGRAMMATA":"PROGRAMMATO"),(motorcycle?["PROGRAMMATA","CONFERMATA","ANNULLATA","ASSENTE","SVOLTA"]:["PROGRAMMATO","CONFERMATO","ANNULLATO","CONCLUSO"]).map(s=>[s,s]));
    f.f.append(el("p",motorcycle?"Un unico evento con un solo istruttore. Le guide svolte sul dispositivo restano individuali.":"Un solo evento per tutta la seduta. Nessun esito viene sincronizzato con gli ESAMI locali."));
    const payload=(deleted=false)=>({...Object.fromEntries(Object.entries(f.fields).map(([k,i])=>[k,i.value])),event_type:motorcycle?"GUIDA":"ESAME",starts_at:utc(f.fields.starts_at.value),ends_at:utc(f.fields.ends_at.value),...(motorcycle?{instructor_id:[...chosen.instructors][0]||""}:{instructors:[...chosen.instructors],vehicles:[...chosen.vehicles]}),participants:rows.map(p=>({id:p.id.value||null,name:p.name.value,motorcycle_code_id:p.code.value||null,vehicle_id:p.vehicle.value||null})),deleted,...(e?{id:e.id,version:e.version}:{})});
    if(e&&!e.deleted)f.f.append(button("ELIMINA APPUNTAMENTO",async()=>{if(state.saving||!navigator.onLine||!confirm("Eliminare logicamente questa seduta?"))return;state.saving=true;try{await api("events",payload(true));f.d.remove();await sync()}catch(err){f.err.textContent=err.message}finally{state.saving=false}}));
    f.finish(()=>api("events",payload()));void resources();
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
 function dispose(){if(!instance)return;const s=instance;s.alive=false;s.active=false;s.clock?.stop();for(const c of s.requests)c.abort();document.removeEventListener("visibilitychange",s.visibility);root.removeEventListener("online",s.online);root.removeEventListener("offline",s.online);s.dialog?.remove();s.buttons?.forEach(b=>b.remove());void s.cache?.close();instance=null}
 root.SharedCalendar={mount,dispose,utc,rome,
  localStudent:id=>typeof state!=="undefined"&&id?state.students.find(s=>s.id===id):null,
  openLocalStudent:(id,lesson)=>{if(typeof openStudent==="function"){openStudent(id);if(lesson&&typeof newLesson==="function")newLesson()}}
 };
})(window);
