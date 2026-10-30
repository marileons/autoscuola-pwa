"use strict";
(function(root,factory){const api=factory(root);if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.LessonSummary=api;})(typeof window!=="undefined"?window:null,function(root){
  const VERSION="1.0.0",FILENAME="riepilogo-guida.pdf";
  const NOTICE="Controlla i contenuti e scegli il destinatario corretto. Il documento può contenere dati personali.";
  const PRIVACY="Anche senza nome il documento può essere riconducibile all’allievo. Non comprende la mappa o il percorso GPS completo.";
  const GOOGLE="Aprendo un link comunichi il punto al servizio Google. Street View mostra immagini d’archivio del luogo, non fotografie dell’errore; copertura e inquadratura non sono garantite.";
  const STATES={none:"NON SVOLTO",repeat:"GIALLO - DA RIPETERE",orange:"ARANCIONE - RIFATTO 2 O PIÙ VOLTE",good:"VERDE - ACQUISITO"};
  const PARTS={tyres:"PNEUMATICI",lights:"FARI E CATADIOTTRI",controls:"COMANDI E SPIE",bonnet:"APERTURA COFANO",levels:"LIVELLI",steering:"STERZO/VOLANTE",brakes:"FRENI",inspection:"REVISIONE"};
  const text=value=>typeof value==="string"?value.replace(/\r\n?/g,"\n").replace(/[\x00-\x08\x0b-\x1f\x7f]/g,"").trim():"";
  const finite=value=>typeof value==="number"&&Number.isFinite(value);
  // Read-only time provenance: normalized legacy defaults are never evidence of a signal.
  const stamp=value=>Number.isSafeInteger(value)&&value>0&&Number.isFinite(new Date(value).valueOf());
  function zoneFor(lesson){const saved=text(lesson.timeZone)||text(lesson.lessonContext?.timeZone);if(saved)try{new Intl.DateTimeFormat("it-IT",{timeZone:saved});return{zone:saved,notice:"Fuso orario: "+saved+" (registrato nella guida)."};}catch{}return{zone:"Europe/Rome",notice:"Fuso orario: Europe/Rome (convenzione del riepilogo"+(saved?"; fuso registrato non valido":"; fuso della guida non registrato")+")."};}
  function dayKey(value,zone){const parts=new Intl.DateTimeFormat("en",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(value),get=type=>parts.find(p=>p.type===type).value;return get("year")+"-"+get("month")+"-"+get("day");}
  const dateAt=(value,zone)=>new Intl.DateTimeFormat("it-IT",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).format(value);
  const plainClock=(value,zone)=>new Intl.DateTimeFormat("it-IT",{timeZone:zone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(value);
  const offsetAt=(value,zone)=>new Intl.DateTimeFormat("en",{timeZone:zone,timeZoneName:"longOffset"}).formatToParts(value).find(p=>p.type==="timeZoneName").value.replace("GMT","UTC");
  function repeatedClock(value,zone){return [1800000,3600000,7200000].some(delta=>[-delta,delta].some(d=>dayKey(value+d,zone)===dayKey(value,zone)&&plainClock(value+d,zone)===plainClock(value,zone)&&offsetAt(value+d,zone)!==offsetAt(value,zone)));}
  const clockAt=(value,zone,qualify=false)=>plainClock(value,zone)+((qualify||repeatedClock(value,zone))?" ("+offsetAt(value,zone)+")":"");
  function durationMs(value){if(typeof value!=="string")return null;const match=text(value).toLowerCase().match(/^(?:(\d+(?:[.,]\d+)?)\s*(?:h|ora|ore)(?:\s*(?:e\s*)?(\d+)\s*(?:minuti|minuto|min|m))?|(\d+)\s*(?:minuti|minuto|min|m))$/);if(!match)return null;const minutes=match[1]!==undefined?Number(match[1].replace(",","."))*60+Number(match[2]||0):Number(match[3]),ms=Math.round(minutes*60000);return Number.isSafeInteger(ms)&&ms>0?ms:null;}
  function lessonHours(lesson,zone){if(!stamp(lesson.createdAt))return"Orario non disponibile";const start=lesson.createdAt,duration=durationMs(lesson.duration),end=duration!==null&&stamp(start+duration)?start+duration:null;if(end===null)return"Orario lezione: "+clockAt(start,zone)+" - Fine non disponibile";const change=offsetAt(start,zone)!==offsetAt(end,zone),different=dayKey(start,zone)!==dayKey(end,zone),nextDay=different&&Math.round((Date.parse(dayKey(end,zone))-Date.parse(dayKey(start,zone)))/86400000)===1;return"Orario lezione: "+clockAt(start,zone,change)+"\u2013"+clockAt(end,zone,change)+(different?" ("+dateAt(end,zone)+(nextDay?", giorno successivo":"")+")":"");}
  function signalHour(error,lesson,zone){if(error.occurredAtSource!=="signal"||!stamp(error.occurredAt)||error.createdAt!==error.occurredAt)return"Ora della segnalazione: non disponibile";const value=error.occurredAt,different=!stamp(lesson.createdAt)||dayKey(value,zone)!==dayKey(lesson.createdAt,zone);return"Ora della segnalazione: "+clockAt(value,zone)+(different?" ("+dateAt(value,zone)+")":"");}
  function initial(value){return Array.from(text(value))[0]||"";}
  function defaults(person,lesson){return{includeName:false,firstName:text(person.firstName),surnameInitial:initial(person.lastName),selected:(Array.isArray(lesson.errors)?lesson.errors:[]).map((_,i)=>i),notes:[],links:false,places:false};}
  function displayName(options){if(!options.includeName)return null;const first=text(options.firstName),last=text(options.surnameInitial).replace(/\.$/,"");if(!first)throw Error("Inserisci il nome di battesimo per il solo riepilogo.");if(!/^\p{L}$/u.test(last))throw Error("Inserisci soltanto una lettera come iniziale del cognome.");return first+(last?" "+last.toLocaleUpperCase("it-IT")+".":"");}
  function position(error){
    const available=error.locationStatus==="available"&&finite(error.lat)&&Math.abs(error.lat)<=90&&finite(error.lng)&&Math.abs(error.lng)<=180&&finite(error.accuracy)&&error.accuracy>=0&&error.accuracy<=100;
    if(!available)return{label:"Posizione non disponibile",links:[]};
    const delta=finite(error.occurredAt)&&finite(error.routePointTime)?error.occurredAt-error.routePointTime:null;
    // No timestamp normalization here: legacy defaults do not establish provenance.
    const reliable=delta!==null&&delta>=0&&delta<=30000&&finite(error.createdAt)&&error.createdAt===error.occurredAt;
    const age=reliable?"Età calcolata dai timestamp disponibili: "+Math.round(delta/1000)+" s.":"Età della posizione non disponibile con sufficiente attendibilità.";
    const point=encodeURIComponent(String(error.lat)+","+String(error.lng));
    return{label:"Posizione approssimativa. Precisione dichiarata: "+Math.round(error.accuracy)+" m. "+age,links:[{label:"VEDI SU GOOGLE MAPS",url:"https://www.google.com/maps/search/?api=1&query="+point},{label:"APRI STREET VIEW",url:"https://www.google.com/maps/@?api=1&map_action=pano&viewpoint="+point}]};
  }
  function checklistEntry(item){
    if(root?.LessonActivities)return root.LessonActivities.isChecklist(item);
    return item?.activityKey==="auto:checklist"||["ILLUSTRAZIONE CHECK LIST COMPLETA","ILLUSTRAZIONE CHECK LIST","CHECK LIST COMPLETA","CHECK LIST"].includes(text(item?.label).toLocaleUpperCase("it-IT"));
  }
  function snapshot(lesson){
    return {legacyChecklist:!Array.isArray(lesson.lessonActivities)&&[...(lesson.checklist||[]),...(lesson.activitySnapshot||[])].some(checklistEntry),createdAt:lesson.createdAt,duration:lesson.duration,timeZone:lesson.timeZone,lessonContext:{category:lesson.lessonContext?.category,timeZone:lesson.lessonContext?.timeZone},
      ...(Array.isArray(lesson.lessonActivities)?{lessonActivities:lesson.lessonActivities.map(item=>({label:item.label,status:item.status,activityKey:item.activityKey,...(item.checklistDetails?{checklistDetails:{...item.checklistDetails}}:{})}))}:{}),
      errors:(Array.isArray(lesson.errors)?lesson.errors:[]).map(error=>({categoryLabelSnapshot:error.categoryLabelSnapshot,specificErrors:(error.specificErrors||[]).map(entry=>({label:entry.label})),note:error.note,...(text(error.instructorPlace)?{instructorPlace:text(error.instructorPlace).slice(0,200)}:{}),locationStatus:error.locationStatus,lat:error.lat,lng:error.lng,accuracy:error.accuracy,occurredAt:error.occurredAt,occurredAtSource:error.occurredAtSource,createdAt:error.createdAt,routePointTime:error.routePointTime}))};
  }
  function buildModel(person,lesson,options,labels={}){
    if(!person||!lesson)throw Error("Guida salvata non disponibile.");
    const timingZone=zoneFor(lesson),zone=timingZone.zone;
    const date=stamp(lesson.createdAt)?dateAt(lesson.createdAt,zone):"Data non disponibile";
    const activities=[],autoContext=lesson.lessonContext?.activityType==="auto"||(lesson.lessonContext?.category||person.category)==="auto";let activityNotice="";
    if(Array.isArray(lesson.lessonActivities)){
      for(const item of lesson.lessonActivities){if(!item||!text(item.label))continue;
        if(item.activityKey==="auto:checklist"||item.checklistDetails||(autoContext&&checklistEntry(item))){const details=item.checklistDetails;
          if(details&&typeof details==="object"){const selected=Object.entries(PARTS).filter(([key])=>["repeat","orange","good"].includes(details[key])).map(([,label])=>label);activities.push(selected.length?"CHECK LIST — VOCI SVOLTE: "+selected.join(", "):"CHECK LIST — NESSUNA SOTTOVOCE SVOLTA NELLA GUIDA");}
          else activities.push("CHECK LIST — DETTAGLI NON DISPONIBILI");
        }else if(Object.hasOwn(STATES,item.status))activities.push(text(item.label)+" - "+STATES[item.status]);
      }
      if(!activities.length)activityNotice="Nessuna attività documentata nella singola guida.";
    }else{activityNotice="Per questa guida storica il dettaglio delle attività della singola lezione non è disponibile. Gli stati cumulativi non sono attribuiti a questa guida.";if(autoContext&&(lesson.legacyChecklist||[...(lesson.checklist||[]),...(lesson.activitySnapshot||[])].some(checklistEntry)))activities.push("CHECK LIST — DETTAGLI NON DISPONIBILI");}
    const selected=new Set(options.selected),notes=new Set(options.notes),errors=[];
    for(const [i,error]of (Array.isArray(lesson.errors)?lesson.errors:[]).entries())if(selected.has(i)){
      const names=(Array.isArray(error.specificErrors)?error.specificErrors:[]).map(item=>text(item.label)).filter(Boolean);
      const loc=position(error);
      errors.push({title:"Errore "+(errors.length+1)+" - "+(names.length?names.join("; "):text(error.categoryLabelSnapshot)||"Da classificare"),signalTime:signalHour(error,lesson,zone),note:notes.has(i)?text(error.note):"",place:options.places?text(error.instructorPlace).slice(0,200):"",position:loc.label,links:options.links?loc.links:[]});
    }
    // This allowlist is the ONLY input for both preview and PDF. No raw records/IDs.
    return{title:"RIEPILOGO GUIDA",date,lessonHours:lessonHours(lesson,zone),timeZoneNotice:timingZone.notice,category:text(labels[lesson.lessonContext?.category||person.category])||"Percorso non disponibile",name:displayName(options),privacy:PRIVACY,activities,activityNotice,errors,google:errors.some(error=>error.links.length)?GOOGLE:""};
  }
  function wrap(value,font,size,width){
    const lines=[];
    for(const paragraph of text(value).split("\n")){
      if(!paragraph){lines.push("");continue;}let line="";
      for(const word of paragraph.split(/\s+/)){
        if(font.widthOfTextAtSize(line+(line?" ":"")+word,size)<=width){line+=(line?" ":"")+word;continue;}
        if(line){lines.push(line);line="";}
        for(const char of word){if(font.widthOfTextAtSize(line+char,size)>width&&line){lines.push(line);line="";}line+=char;}
      }
      if(line)lines.push(line);
    }return lines;
  }
  function layout(model,fonts){
    const pages=[[]],left=44,width=507,height=842;let y=48,blockIndex=0;
    const next=()=>{pages.push([]);y=48;};
    function add(value,{size=11,bold=false,gap=7,url=null}={}){
      const block=blockIndex++,font=bold?fonts.bold:fonts.regular;let lines;
      try{font.encodeText(value.replace(/[\r\n\t]/g," "));lines=wrap(value,font,size,width);}catch{throw Error("Il contenuto contiene un carattere non supportato dal font PDF. Escludi la voce o la nota interessata, oppure correggi il nome del solo riepilogo. Nessun testo è stato sostituito.");}
      for(const line of lines){if(y+size+5>height-45)next();y+=size;pages.at(-1).push({text:line,x:left,y,size,bold,block,...(url?{url}:{})});y+=4;}y+=gap;
    }
    add(model.title,{size:21,bold:true,gap:12});add(model.date+" | "+model.lessonHours+" | "+model.category,{bold:true});if(model.name)add("Allievo: "+model.name,{bold:true});add(model.timeZoneNotice,{size:9});
    add(model.privacy,{size:10,gap:15});add("ATTIVITÀ DELLA GUIDA",{size:13,bold:true});
    if(model.activityNotice)add(model.activityNotice);
    for(const activity of model.activities)add(activity);
    add("ERRORI SELEZIONATI",{size:13,bold:true});if(!model.errors.length)add("Nessun errore selezionato.");
    for(const error of model.errors){if(y>height-110)next();add(error.title,{bold:true});add(error.signalTime,{size:10});if(error.place)add("Luogo indicato dall’istruttore: "+error.place);add(error.position,{size:10});if(error.note)add("Nota sull’errore: "+error.note);for(const link of error.links)add(link.label,{size:10,bold:true,url:link.url});y+=5;}
    if(model.google)add(model.google,{size:10,gap:10});
    pages.forEach((page,i)=>page.push({text:"Pagina "+(i+1)+" / "+pages.length,x:left,y:818,size:9,bold:false}));
    return{width:595,height,pages};
  }
  async function fontsFor(lib){const doc=await lib.PDFDocument.create({updateMetadata:false});return{regular:await doc.embedFont(lib.StandardFonts.Helvetica),bold:await doc.embedFont(lib.StandardFonts.HelveticaBold)};}
  async function makePdf(plan,lib){
    const doc=await lib.PDFDocument.create({updateMetadata:false}),regular=await doc.embedFont(lib.StandardFonts.Helvetica),bold=await doc.embedFont(lib.StandardFonts.HelveticaBold);
    for(const atoms of plan.pages){const page=doc.addPage([plan.width,plan.height]);page.drawRectangle({x:0,y:plan.height-9,width:plan.width,height:9,color:lib.rgb(.03,.25,.29)});
      for(const atom of atoms){const font=atom.bold?bold:regular;page.drawText(atom.text,{x:atom.x,y:plan.height-atom.y,size:atom.size,font,color:atom.url?lib.rgb(.03,.34,.4):lib.rgb(.06,.17,.21)});
        if(atom.url){const annotation=doc.context.register(doc.context.obj({Type:"Annot",Subtype:"Link",Rect:[atom.x,plan.height-atom.y-2,atom.x+font.widthOfTextAtSize(atom.text,atom.size),plan.height-atom.y+atom.size],Border:[0,0,0],A:{Type:"Action",S:"URI",URI:lib.PDFString.of(atom.url)}}));page.node.addAnnot(annotation);}
      }
    }
    return doc.save();
  }
  async function deliver(file,nav){
    if(!nav||typeof nav.share!=="function"||typeof nav.canShare!=="function")return"unsupported";
    let supported=false;try{supported=nav.canShare({files:[file]});}catch{return"unsupported";}if(!supported)return"unsupported";
    try{await nav.share({files:[file]});return"completed";}catch(error){if(error?.name==="AbortError")return"cancelled";throw Error("Condivisione non completata. Puoi usare SCARICA PDF o APRI PDF.");}
  }
  let active=null,libraryPromise=null;
  function loadLibrary(){if(root.PDFLib)return Promise.resolve(root.PDFLib);if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{const script=root.document.createElement("script");script.src="assets/vendor/pdf-lib-1.17.1.min.js";script.onload=()=>resolve(root.PDFLib);script.onerror=()=>{libraryPromise=null;script.remove();reject(Error("Libreria PDF locale non disponibile. Riprova con l’app caricata."));};root.document.head.append(script);});return libraryPromise;}
  function close(){if(!active)return;const old=active;active=null;old.closed=true;old.observer?.disconnect();root.removeEventListener("pagehide",close);if(old.url)root.URL.revokeObjectURL(old.url);old.bytes=null;old.model=null;old.plan=null;old.dialog.close();old.dialog.remove();if(old.focus?.isConnected)old.focus.focus({preventScroll:true});}
  async function open({read,isCurrent}){
    close();if(!isCurrent())throw Error("Guida non autorizzata o sessione cambiata.");
    const source=read(),person={firstName:source.student.firstName,lastName:source.student.lastName,category:source.student.category},lesson=snapshot(source.lesson),labels=source.labels;
    const doc=root.document,view={closed:false,url:null,bytes:null,model:null,plan:null,busy:false,focus:doc.activeElement};active=view;
    const el=(tag,content,cls)=>{const node=doc.createElement(tag);if(content)node.textContent=content;if(cls)node.className=cls;return node;};
    const dialog=el("dialog",null,"lesson-summary-dialog");view.dialog=dialog;dialog.setAttribute("aria-label","CONDIVIDI RIEPILOGO GUIDA");
    const header=el("div",null,"lesson-summary-header"),title=el("h2","CONDIVIDI RIEPILOGO GUIDA"),closeButton=el("button","ANNULLA / CHIUDI","secondary");header.append(title,closeButton);closeButton.type="button";closeButton.onclick=close;dialog.addEventListener("cancel",event=>{event.preventDefault();close();});
    const step=el("p","1 · SCELTA CONTENUTI","lesson-summary-step"),privacy=el("p",PRIVACY),form=el("div",null,"lesson-summary-options"),status=el("p");status.setAttribute("role","status");status.setAttribute("aria-live","polite");
    const opts=defaults(person,lesson);
    function checked(label,value,onchange){const wrapper=el("label",null,"lesson-summary-check"),input=el("input");input.type="checkbox";input.checked=value;wrapper.append(input,doc.createTextNode(label));input.onchange=()=>onchange(input.checked);return{wrapper,input};}
    function invalidate(){if(view.url)root.URL.revokeObjectURL(view.url);view.url=null;view.bytes=null;view.plan=null;view.model=null;preview.replaceChildren();ready.hidden=true;generate.hidden=true;status.textContent="Contenuti modificati: premi ANTEPRIMA per controllare la nuova versione.";step.textContent="1 · SCELTA CONTENUTI";}
    const nameFields=el("div",null,"lesson-summary-name");nameFields.hidden=true;
    const nameLabel=el("label","Nome/i di battesimo (solo per questo PDF)"),nameInput=el("input"),initialLabel=el("label","Sola iniziale del cognome"),initialInput=el("input");nameInput.value=opts.firstName;nameInput.maxLength=150;initialInput.value=opts.surnameInitial;initialInput.maxLength=2;nameLabel.append(nameInput);initialLabel.append(initialInput);nameFields.append(nameLabel,initialLabel,el("p","Controlla il risultato nell’anteprima. Non deduciamo il nome dal nominativo; queste correzioni non cambiano la scheda allievo."));
    nameInput.oninput=()=>{opts.firstName=nameInput.value;invalidate();};initialInput.oninput=()=>{opts.surnameInitial=initialInput.value;invalidate();};
    const nameCheck=checked("Includi nome e sola iniziale del cognome",false,value=>{opts.includeName=value;nameFields.hidden=!value;invalidate();});form.append(nameCheck.wrapper,nameFields);
    const placesCheck=checked("INCLUDI VIE / LUOGHI",false,value=>{opts.places=value;invalidate();});form.append(placesCheck.wrapper,el("p","Solo testi compilati dall’istruttore, non verificati dal GPS. Nessuna ricerca di vie o luoghi.","lesson-summary-help"));
    const linksCheck=checked("Includi link ai luoghi su Google Maps e Street View",false,value=>{opts.links=value;invalidate();});form.append(linksCheck.wrapper,el("p",GOOGLE,"lesson-summary-help"));
    const toolbar=el("div",null,"lesson-summary-actions"),all=el("button","SELEZIONA TUTTI GLI ERRORI","secondary"),none=el("button","DESELEZIONA TUTTI","secondary");all.type=none.type="button";toolbar.append(all,none);form.append(toolbar);
    const rows=[];for(const [i,error]of (lesson.errors||[]).entries()){
      const row=el("section",null,"lesson-summary-error"),label=(error.specificErrors||[]).map(x=>text(x.label)).filter(Boolean).join("; ")||text(error.categoryLabelSnapshot)||"Da classificare";
      const selected=checked("Errore "+(i+1)+" · "+label,true,value=>{opts.selected=value?[...opts.selected,i]:opts.selected.filter(x=>x!==i);if(noteCheck)noteCheck.input.disabled=!value;invalidate();});row.append(selected.wrapper);if(text(error.instructorPlace))row.append(el("p","Luogo indicato dall’istruttore: "+text(error.instructorPlace),"lesson-summary-note"));let noteCheck=null;
      if(text(error.note)){noteCheck=checked("Includi la nota sull’errore",false,value=>{opts.notes=value?[...opts.notes,i]:opts.notes.filter(x=>x!==i);invalidate();});row.append(noteCheck.wrapper,el("p",text(error.note),"lesson-summary-note"));}rows.push({i,selected,noteCheck});form.append(row);
    }
    if(!rows.length)form.append(el("p","Nessun errore registrato in questa guida."));
    const selectAll=value=>{opts.selected=value?rows.map(r=>r.i):[];for(const row of rows){row.selected.input.checked=value;if(row.noteCheck)row.noteCheck.input.disabled=!value;}invalidate();};all.onclick=()=>selectAll(true);none.onclick=()=>selectAll(false);
    const actions=el("div",null,"lesson-summary-actions"),previewButton=el("button","ANTEPRIMA"),generate=el("button","GENERA PDF");previewButton.type=generate.type="button";generate.hidden=true;actions.append(previewButton,generate);
    const preview=el("div",null,"lesson-summary-preview"),ready=el("section",null,"lesson-summary-ready");ready.hidden=true;const warning=el("p",NOTICE),delivery=el("div",null,"lesson-summary-actions"),share=el("button","CONDIVIDI PDF"),download=el("button","SCARICA PDF","secondary"),openPdf=el("a","APRI PDF","secondary");share.type=download.type="button";openPdf.target="_blank";openPdf.rel="noopener";delivery.append(share,download,openPdf);ready.append(warning,delivery,el("p","Le copie scaricate o condivise possono restare fuori dall’app. Il browser non certifica la consegna o il salvataggio."));
    dialog.append(header,step,privacy,form,actions,status,preview,ready);doc.body.append(dialog);dialog.showModal();
    const ensure=()=>{if(active!==view||view.closed||!isCurrent()){if(active===view)close();throw Error("Sessione o guida cambiata. Riapri il riepilogo dalla guida salvata.");}read();};
    const run=async work=>{if(view.busy)return;view.busy=true;previewButton.disabled=generate.disabled=share.disabled=download.disabled=true;form.inert=true;try{ensure();await work();}catch(error){if(active===view)status.textContent=error.message||"Operazione non completata.";}finally{view.busy=false;if(active===view){previewButton.disabled=generate.disabled=share.disabled=download.disabled=false;form.inert=false;}}};
    previewButton.onclick=()=>run(async()=>{const lib=await loadLibrary();ensure();const model=buildModel(person,lesson,opts,labels),fonts=await fontsFor(lib),plan=layout(model,fonts);ensure();invalidate();view.model=model;view.plan=plan;
      for(const [i,atoms]of plan.pages.entries()){
        const page=el("article",null,"lesson-summary-page");page.setAttribute("aria-label","Anteprima pagina "+(i+1));
        let paragraph=null,previousBlock=null;
        for(const atom of atoms){
          if(atom.y!==818&&paragraph&&atom.block===previousBlock){paragraph.textContent+=(atom.text?" "+atom.text:"\n\n");continue;}
          const line=el(atom.url?"a":"p",atom.text,"lesson-summary-line"+(atom.y===818?" lesson-summary-footer":""));line.style.fontSize=Math.max(14,atom.size*1.333)+"px";line.style.fontWeight=atom.bold?"700":"400";if(atom.url){line.href=atom.url;line.target="_blank";line.rel="noopener noreferrer";}page.append(line);paragraph=line;previousBlock=atom.block;
        }
        preview.append(page);
      }generate.hidden=false;step.textContent="2 · ANTEPRIMA";status.textContent="Controlla tutte le pagine. Il testo va a capo sul telefono; APRI PDF mostrerà l’impaginazione A4. Puoi correggere nome e iniziale nei campi sopra; ogni modifica richiede una nuova anteprima.";preview.scrollIntoView({block:"start",behavior:"auto"});});
    generate.onclick=()=>run(async()=>{if(!view.plan)return;if(view.bytes&&view.url){status.textContent="PDF già pronto per questi contenuti. Usa CONDIVIDI PDF, SCARICA PDF o APRI PDF.";return;}const lib=await loadLibrary(),bytes=await makePdf(view.plan,lib);ensure();view.bytes=bytes;view.url=root.URL.createObjectURL(new root.Blob([bytes],{type:"application/pdf"}));openPdf.href=view.url;ready.hidden=false;step.textContent="3 · PDF PRONTO";status.textContent="PDF generato sul dispositivo. Nessun invio effettuato.";ready.scrollIntoView({block:"nearest"});});
    share.onclick=()=>run(async()=>{if(!view.bytes)return;const file=new root.File([view.bytes],FILENAME,{type:"application/pdf"}),result=await deliver(file,root.navigator);ensure();status.textContent=result==="cancelled"?"Condivisione annullata. Il PDF resta disponibile finché chiudi il riepilogo.":result==="unsupported"?"Condivisione di file non disponibile. Usa SCARICA PDF o APRI PDF.":"Menu di condivisione concluso. La consegna al destinatario non è verificata.";});
    download.onclick=()=>{if(view.busy||!view.url)return;try{ensure();view.busy=true;download.disabled=true;const a=el("a");a.href=view.url;a.download=FILENAME;doc.body.append(a);a.click();a.remove();status.textContent="Download richiesto. Il browser non conferma l’effettivo salvataggio.";root.setTimeout(()=>{view.busy=false;download.disabled=false;},700);}catch(error){status.textContent=error.message;view.busy=false;download.disabled=false;}};
    view.observer=new root.MutationObserver(()=>{if(!isCurrent())close();});view.observer.observe(doc.body,{subtree:true,attributes:true,attributeFilter:["class","hidden"]});root.addEventListener("pagehide",close);
    return view;
  }
  return{VERSION,FILENAME,NOTICE,PRIVACY,GOOGLE,defaults,displayName,position,snapshot,buildModel,wrap,layout,fontsFor,makePdf,deliver,open,close};
});
