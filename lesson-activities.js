"use strict";
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.LessonActivities=api;})(typeof window!=="undefined"?window:globalThis,function(){
  const states=Object.freeze(["none","repeat","orange","good"]);
  const labels=Object.freeze({none:"Non svolto",repeat:"Giallo — Da ripetere",orange:"Arancione — Rifatto 2 o più volte",good:"Verde — Acquisito"});
  function copy(items){if(!Array.isArray(items))throw Error("Attività non valide.");const ids=new Set();return items.map(item=>{if(!item||typeof item.id!=="string"||!item.id||ids.has(item.id)||!states.includes(item.status))throw Error("Identificativo o stato attività non valido.");ids.add(item.id);return {...item};});}
  function begin(previous){return {baseline:copy(previous),snapshot:copy(previous),touched:[]};}
  function select(draft,id,status){if(!states.includes(status))throw Error("Stato attività non valido.");const item=draft.snapshot.find(item=>item.id===id);if(!item)throw Error("Attività non disponibile.");item.status=status;if(!draft.touched.includes(id))draft.touched.push(id);return draft;}
  function finish(draft){const touched=new Set(draft.touched);return {activityBaseline:copy(draft.baseline),activitySnapshot:copy(draft.snapshot),lessonActivities:copy(draft.snapshot.filter(item=>touched.has(item.id)))};}
  function reopen(lesson){const modern=Array.isArray(lesson.activitySnapshot)&&Array.isArray(lesson.lessonActivities);return {baseline:copy(modern?(lesson.activityBaseline||lesson.activitySnapshot):lesson.checklist),snapshot:copy(modern?lesson.activitySnapshot:lesson.checklist),touched:modern?lesson.lessonActivities.map(item=>item.id):[],legacy:!modern};}
  function copyStudent(raw,idFactory){const s=JSON.parse(JSON.stringify(raw)),ids=new Map(),id=value=>{if(!value)return idFactory();if(!ids.has(value))ids.set(value,idFactory());return ids.get(value);};s.checklist=(s.checklist||[]).map(item=>({...item,id:id(item.id)}));s.lessons=(s.lessons||[]).map(lesson=>{const out={...lesson,id:id(lesson.id)};delete out.secretaryTransfer;delete out.instructorTransfer;for(const key of ["checklist","activityBaseline","activitySnapshot","lessonActivities"])if(Array.isArray(out[key]))out[key]=out[key].map(item=>({...item,id:id(item.id)}));return out;});if(s.pathChecklists)for(const key of Object.keys(s.pathChecklists))s.pathChecklists[key]=s.pathChecklists[key].map(item=>({...item,id:id(item.id)}));return s;}
  function validateLesson(lesson){if(lesson.lessonContext)validateContext(lesson.lessonContext);const keys=["activityBaseline","activitySnapshot","lessonActivities"];if(!keys.some(key=>Object.hasOwn(lesson,key)))return;for(const key of keys)copy(lesson[key]);const snapshot=new Map(lesson.activitySnapshot.map(item=>[item.id,item]));for(const item of lesson.lessonActivities){const saved=snapshot.get(item.id);if(!saved||saved.label!==item.label||saved.status!==item.status)throw Error("Attività della guida incoerenti con lo storico.");}}
  const pathCategories=['auto','guida-accompagnata','moto','quad-leggero','quad-pesante','corso-moto','perfezionamento','esame-revisione','esame-esperimento','da-classificare'];
  function validateContext(context){if(!context||context.version!==1||!pathCategories.includes(context.category)||!pathCategories.includes(context.activityType)||!Array.isArray(context.catalog)||context.catalog.length>2000||context.catalog.some(label=>typeof label!=='string'||label.length>500)||Object.keys(context).some(k=>!['version','category','activityType','catalog'].includes(k)))throw Error('Contesto del percorso non valido.');return JSON.parse(JSON.stringify(context));}
  function pathContext(category,activityType,catalog){return validateContext({version:1,category,activityType,catalog:[...new Set(catalog)]});}
  function changeStudentPath(student,destination,sourceContext,destinationChecklist){const next=JSON.parse(JSON.stringify(student));if(next.category===destination)return next;const context=validateContext(sourceContext);if(context.category!==next.category||!pathCategories.includes(destination)||destination==='da-classificare')throw Error('Percorso non valido.');next.pathChecklists={...(next.pathChecklists||{}),[next.category]:copy(next.checklist||[])};next.lessons=(next.lessons||[]).map(lesson=>({...lesson,lessonContext:lesson.lessonContext?validateContext(lesson.lessonContext):context}));next.category=destination;next.checklist=copy(next.pathChecklists[destination]||destinationChecklist);return next;}
  // Explicit legacy catalog identities; never infer achievements from partial text or GPS.
  const autoCatalog=Object.freeze([
    ["vehicle","Spiegazione auto"],["controls","CONTROLLI OBBLIGATORI"],["checklist","ILLUSTRAZIONE CHECK LIST COMPLETA"],["extraurban","Extraurbana"],["circulation:nervi-quinto-quarto","Nervi Quinto Quarto"],
    ...["Nervi","Recco","Rapallo","Chiavari","Est","Bolzaneto","Aeroporto","Ovest"].map(place=>["motorway:"+place,"Autostrada "+place]),
    ["maneuver:reverse","RETROMARCIA LUNGA GENZIANE"],["maneuver:reverse","RETROMARCIA VIA BOBBIO (PARK)"],
    ["maneuver:s","PARK A S GENZIANE"],["maneuver:l","PARK A L GENZIANE"],["maneuver:l","PARK A L VIA BOBBIO"],
    ["maneuver:turn","INVERSIONI DI MARCIA GENZIANE"],["maneuver:turn","INVERSIONE DI MARCIA VIA BOBBIO (PARK)"],
    ["maneuver:l","Park a L"],["maneuver:s","Park a S"],["maneuver:reverse","Retromarcia lunga"],["maneuver:turn","Inversioni di marcia"],["night","GUIDA NOTTURNA"]
  ].map(([key,label])=>Object.freeze({key:"auto:"+key,label})));
  const normalizeSearch=value=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("it-IT");
  const catalogByLabel=new Map(autoCatalog.map(x=>[normalizeSearch(x.label),x.key]));
  function autoKey(item){return item.activityKey||catalogByLabel.get(normalizeSearch(item.label))||null;}
  function enrichAuto(items){return items.map(item=>{const key=autoKey(item);return key?{...item,activityKey:key}:{...item}});}
  function ensureAuto(items,idFactory){const out=enrichAuto(items);if(!out.some(item=>autoKey(item)==="auto:night"))out.push({id:"auto:night",activityKey:"auto:night",label:"GUIDA NOTTURNA",status:"none"});return out;}
  const summaryLabels=["SPIEGAZIONE VEICOLO","CONTROLLI OBBLIGATORI","ILLUSTRAZIONE CHECK LIST","EXTRAURBANA","CIRCOLAZIONE","AUTOSTRADA","MANOVRE","GUIDA NOTTURNA"];
  // Runtime AUTO catalog only. Local storage catalog entries are labels, not global IDs.
  // Resolve those labels to the actual student activity IDs; count places, not rows/lessons.
  function circulationPoint(label){
    const value=normalizeSearch(label).replace(/\s+/g," ");
    if(value==="nervi quinto quarto")return value; // One aggregate, never three places.
    const match=value.match(/^(?:circolazione(?: urbana)?|percorso urbano|guida in citta)\s*(?::|[—–-]|\ba\b|\bin\b|\bpresso\b)?\s+(.+)$/);
    if(!match)return null;
    const place=match[1].replace(/^(?:localita|zona|punto)\s*[:—–-]?\s*/,"").trim();
    return place&&!/^(?:generale|urbana|in citta|varie|da definire)$/.test(place)?place:null;
  }
  function resolveAutoActivities(catalog,items){
    const entries=new Map();for(const value of catalog||[]){const label=typeof value==="string"?value:value?.label;if(typeof label!=="string")continue;const normalized=normalizeSearch(label),point=circulationPoint(label),motorway=typeof value==="string"?/autostrada/.test(normalized):normalizeSearch(value.section)==="autostrada";entries.set(normalized,{key:motorway?"auto:motorway:"+normalized:catalogByLabel.get(normalized)||null,point});}
    const ids=new Map();for(const item of items||[]){const entry=entries.get(normalizeSearch(item.label));if(entry&&item.id)ids.set(item.id,{...entry,key:entry.key||(autoCatalog.some(c=>c.key===item.activityKey)?item.activityKey:null)});}return ids;
  }
  function autoSummary(lessons,target,catalog=autoCatalog.map(x=>x.label),currentItems=[]){
    const ordered=[...lessons].sort((a,b)=>a.createdAt-b.createdAt||String(a.id).localeCompare(String(b.id))),end=ordered.findIndex(l=>l.id===target.id),done=new Set(),places=new Set();let legacy=false;
    const history=ordered.slice(0,end+1).filter(lesson=>!lesson.lessonContext||lesson.lessonContext.activityType==="auto"),identity=resolveAutoActivities(catalog,[...history.flatMap(l=>[...(l.checklist||[]),...(l.lessonActivities||[])]),...currentItems]);
    for(const lesson of history){
      const modern=Array.isArray(lesson.lessonActivities);legacy ||= !modern;
      // Modern snapshots include inherited/future-stale values: only actual lesson changes count.
      for(const item of (modern?lesson.lessonActivities:lesson.checklist)||[])if(["repeat","orange","good"].includes(item.status)){const entry=identity.get(item.id);if(!entry)continue;if(entry.key)done.add(entry.key);if(entry.point)places.add(entry.point);}
    }
    const values=[done.has("auto:vehicle"),done.has("auto:controls"),done.has("auto:checklist"),done.has("auto:extraurban"),places.size>=3,[...done].some(k=>k.startsWith("auto:motorway:")),["reverse","s","l","turn"].every(k=>done.has("auto:maneuver:"+k)),done.has("auto:night")];
    return {rows:summaryLabels.map((label,i)=>({label,done:values[i],unmapped:false})),legacy};
  }
  function filterActivities(entries,query){const key=normalizeSearch(query);return entries.filter(({item,context=""})=>normalizeSearch(context+" "+item.label).includes(key));}
  return {validateContext,pathContext,changeStudentPath,circulationPoint,resolveAutoActivities,autoCatalog,autoKey,enrichAuto,ensureAuto,autoSummary,normalizeSearch,filterActivities,states,labels,copy,begin,select,finish,reopen,copyStudent,validateLesson};
});
