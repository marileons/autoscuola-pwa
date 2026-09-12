(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;if(root)root.AgendaExams=api})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const EXAMS_KEY="autoscuola_v3_exam_sessions",LOCATIONS_KEY="autoscuola_v3_exam_locations";
const DEFAULT_LOCATIONS=["Via delle Genziane","Via Bobbio","Villa Bombrini"];
const OUTCOMES=new Set(["","I","R","A"]),clone=value=>JSON.parse(JSON.stringify(value));
function clean(value){return String(value||"").trim().replace(/\s+/g," ")}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||""))&&!Number.isNaN(new Date(`${value}T12:00:00`).getTime())}
function validTime(value){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value||""))}
function normalizeParticipant(raw){const outcome=OUTCOMES.has(String(raw?.outcome||""))?String(raw?.outcome||""):"";return{studentId:clean(raw?.studentId),outcome,rejectionNote:clean(raw?.rejectionNote)}}
function normalizeExam(raw,{strict=false,idFactory=()=>crypto.randomUUID()}={}){
 const participants=Array.isArray(raw?.participants)?raw.participants.map(normalizeParticipant):[],seen=new Set;
 if(strict&&(!raw||typeof raw!=="object"||!clean(raw.id)||!validDate(raw.date)||!validTime(raw.startTime)||!validTime(raw.endTime)||raw.endTime<=raw.startTime||!clean(raw.location)||!participants.length))throw Error("Sessione d’esame non valida.");
 for(const item of participants){if(!item.studentId||seen.has(item.studentId))throw Error("Partecipante duplicato o non valido nell’esame.");seen.add(item.studentId)}
 return{id:clean(raw?.id)||idFactory(),date:String(raw?.date||""),startTime:String(raw?.startTime||""),endTime:String(raw?.endTime||""),location:clean(raw?.location),participants,createdAt:Number(raw?.createdAt)||Date.now(),updatedAt:Number(raw?.updatedAt)||Date.now()};
}
function normalizeExams(raw,{strict=false,idFactory}={}){if(raw==null)return[];if(!Array.isArray(raw))throw Error("Archivio esami non valido.");const ids=new Set;return raw.map(item=>{const exam=normalizeExam(item,{strict,idFactory});if(ids.has(exam.id))throw Error("ID esame duplicato.");ids.add(exam.id);return exam})}
function normalizeLocations(raw){const values=Array.isArray(raw)&&raw.length?raw:DEFAULT_LOCATIONS,names=[],seenNames=new Set,seenIds=new Set;for(const value of values){const name=clean(typeof value==="string"?value:value?.name),key=name.toLocaleLowerCase("it-IT"),id=clean(value?.id)||`location-${key.replace(/[^a-z0-9]+/g,"-")}`;if(!name||seenNames.has(key)||seenIds.has(id))continue;seenNames.add(key);seenIds.add(id);names.push({id,name})}return names}
function read(storage,key,fallback){const raw=storage.getItem(key);if(raw===null)return clone(fallback);return JSON.parse(raw)}
function createStore(storage,{examsKey=EXAMS_KEY,locationsKey=LOCATIONS_KEY,idFactory=()=>crypto.randomUUID()}={}){
 let readable=true;
 function exams(){try{return normalizeExams(read(storage,examsKey,[]),{strict:true,idFactory})}catch(error){readable=false;throw Error("Archivio esami non leggibile. Nessun dato verrà sovrascritto.")}}
 function locations(){try{return normalizeLocations(read(storage,locationsKey,[]))}catch(error){readable=false;throw Error("Archivio località esami non leggibile. Nessun dato verrà sovrascritto.")}}
 function requireWritable(){if(!readable)throw Error("Archivio esami non scrivibile finché l’errore di lettura non viene risolto.")}
 function saveExam(raw){const current=exams(),exam=normalizeExam(raw,{strict:true,idFactory}),index=current.findIndex(item=>item.id===exam.id);requireWritable();if(index>=0)current[index]=exam;else current.push(exam);storage.setItem(examsKey,JSON.stringify(current));return clone(exam)}
 function deleteExam(id){const current=exams(),next=current.filter(item=>item.id!==id);requireWritable();storage.setItem(examsKey,JSON.stringify(next));return current.length!==next.length}
 function saveLocation(raw){const name=clean(raw?.name??raw);if(!name)throw Error("Inserisci la località.");const current=locations(),requestedId=clean(raw?.id),duplicate=current.find(item=>item.name.toLocaleLowerCase("it-IT")===name.toLocaleLowerCase("it-IT")&&item.id!==requestedId);if(duplicate)throw Error("Località già presente.");const item={id:requestedId||idFactory(),name},index=current.findIndex(value=>value.id===item.id);if(index>=0)current[index]=item;else current.push(item);requireWritable();storage.setItem(locationsKey,JSON.stringify(current));return clone(item)}
 return Object.freeze({exams,locations,saveExam,deleteExam,saveLocation,replaceAll(nextExams,nextLocations){const normalized=normalizeExams(nextExams||[],{strict:true,idFactory}),locationsNormalized=normalizeLocations(nextLocations||[]);requireWritable();storage.setItem(examsKey,JSON.stringify(normalized));storage.setItem(locationsKey,JSON.stringify(locationsNormalized))}})
}
function forStudents(exams,studentIds){const wanted=new Set(studentIds.map(String));return normalizeExams(exams||[],{strict:true}).map(exam=>({...exam,participants:exam.participants.filter(item=>wanted.has(item.studentId))})).filter(exam=>exam.participants.length)}
function outcomeLabel(value){return value==="I"?"Idoneo":value==="R"?"Respinto":value==="A"?"Assente":"Esito non inserito"}
return Object.freeze({EXAMS_KEY,LOCATIONS_KEY,DEFAULT_LOCATIONS,normalizeExam,normalizeExams,normalizeLocations,createStore,forStudents,outcomeLabel,validDate,validTime});
});
