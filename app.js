"use strict";

const STORAGE_KEY = "autoscuola_students_v2";
const OLD_STORAGE_KEY = "autoscuola_students_v1";
const CHECKLIST_STORAGE_KEY = "autoscuola_checklist_v1";

const DEFAULT_CHECKLIST = [
  "Bolzaneto","Ge Ovest","Nervi, Quinto, Quarto","Retromarcia lunga",
  "Park di punta","Rapallo","Ge Nervi","Chiavari","Aeroporto","Check list",
  "Ge Est","Park in linea","Park a L","Recco","Inversioni di marcia",
  "Extraurbana","Partenze in salita","Uso cambio","Uso volante",
  "Spiegazione auto","Uso frizione"
];

let checklistItems = loadChecklistItems();
let students = loadStudents();
let currentStudentId = null;
let currentTab = "active";
let gpsWatchId = null;
let gpsActive = false;
let gpsPoints = [];
let lessonStartedAt = null;
let map = null, routeLayer = null, startMarker = null, endMarker = null;
let recognition = null;
let recognizing = false;

const $ = id => document.getElementById(id);

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function loadChecklistItems() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length) {
      return saved.map(item => ({id:String(item.id||createId()),label:String(item.label||"").trim()})).filter(item=>item.label);
    }
  } catch {}
  const initial = DEFAULT_CHECKLIST.map(label=>({id:createId(),label}));
  localStorage.setItem(CHECKLIST_STORAGE_KEY,JSON.stringify(initial));
  return initial;
}

function saveChecklistItems(){localStorage.setItem(CHECKLIST_STORAGE_KEY,JSON.stringify(checklistItems));}

function loadStudents(){
  const current=localStorage.getItem(STORAGE_KEY);
  if(current){
    try{
      const parsed=JSON.parse(current);
      return Array.isArray(parsed)?parsed.map(normalizeStudent).filter(hasName):[];
    }catch{}
  }
  const old=localStorage.getItem(OLD_STORAGE_KEY);
  if(!old)return [];
  try{
    const parsed=JSON.parse(old);
    const migrated=Array.isArray(parsed)?parsed.map(migrateOldStudent).filter(hasName):[];
    localStorage.setItem(STORAGE_KEY,JSON.stringify(migrated));
    return migrated;
  }catch{return [];}
}

function hasName(student){return Boolean(student.name&&student.name.trim());}

function migrateOldStudent(student){
  const name=`${student.firstName||""} ${student.lastName||""}`.trim();
  const oldChecklist=Array.isArray(student.checklist)?student.checklist:[];
  const doneByText=new Map(oldChecklist.map(item=>[item.text,Boolean(item.done)]));
  const lessons=[];
  if((student.notes&&student.notes.trim())||(Array.isArray(student.route)&&student.route.length)){
    lessons.push({id:createId(),createdAt:Date.now(),notes:student.notes||"",route:normalizeRoute(student.route)});
  }
  return{
    id:typeof student.id==="string"?student.id:createId(),name,archived:false,
    checklist:checklistItems.map(item=>({itemId:item.id,label:item.label,done:doneByText.get(item.label)||false})),
    lessons
  };
}

function normalizeStudent(student){
  const checklist=Array.isArray(student.checklist)?student.checklist:[];
  const doneById=new Map(checklist.filter(item=>item.itemId).map(item=>[String(item.itemId),Boolean(item.done)]));
  const doneByLabel=new Map(checklist.map(item=>[item.label||item.text,Boolean(item.done)]));
  return{
    id:typeof student.id==="string"?student.id:createId(),
    name:String(student.name||"").trim(),
    archived:Boolean(student.archived),
    checklist:checklistItems.map(item=>({
      itemId:item.id,label:item.label,
      done:doneById.has(item.id)?doneById.get(item.id):(doneByLabel.get(item.label)||false)
    })),
    lessons:Array.isArray(student.lessons)?student.lessons.map(normalizeLesson):[]
  };
}

function normalizeLesson(lesson){
  return{id:lesson.id||createId(),createdAt:Number(lesson.createdAt||Date.now()),notes:String(lesson.notes||""),route:normalizeRoute(lesson.route)};
}

function normalizeRoute(route){
  return Array.isArray(route)?route.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>({
    lat:p.lat,lng:p.lng,accuracy:Number.isFinite(p.accuracy)?p.accuracy:null,time:Number(p.time||p.timestamp||Date.now())
  })):[];
}

function saveStudents(){
  students=students.map(normalizeStudent).filter(hasName);
  localStorage.setItem(STORAGE_KEY,JSON.stringify(students));
}

function syncChecklistAcrossStudents(){students=students.map(normalizeStudent);saveStudents();}

function show(viewName){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $(`${viewName}View`).classList.add("active");
  window.scrollTo(0,0);
}

function currentStudent(){return students.find(s=>s.id===currentStudentId)||null;}

function escapeHtml(value){
  return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function renderHome(){
  const archived=currentTab==="archive";
  $("activeTab").classList.toggle("active",!archived);
  $("archiveTab").classList.toggle("active",archived);
  const query=$("searchInput").value.trim().toLowerCase();
  const visible=students.filter(s=>s.archived===archived).filter(s=>s.name.toLowerCase().includes(query)).sort((a,b)=>a.name.localeCompare(b.name,"it"));
  $("studentList").innerHTML="";
  visible.forEach(student=>{
    const button=document.createElement("button");
    button.className="student-card";button.type="button";
    button.innerHTML=`<span><strong>${escapeHtml(student.name)}</strong><span class="muted">${student.lessons.length} guide</span></span><span class="chev">›</span>`;
    button.addEventListener("click",()=>openStudent(student.id));
    $("studentList").appendChild(button);
  });
  $("emptyList").classList.toggle("hidden",visible.length>0);
}

function addStudent(){
  const input=$("newStudentInput"),name=input.value.trim();
  if(!name)return;
  students.push({id:createId(),name,archived:false,checklist:checklistItems.map(item=>({itemId:item.id,label:item.label,done:false})),lessons:[]});
  input.value="";currentTab="active";saveStudents();renderHome();
}

function openStudent(studentId){currentStudentId=studentId;renderStudent();show("student");}

function renderStudent(){
  const student=currentStudent();if(!student){show("home");return;}
  $("studentName").textContent=student.name;
  $("archiveButton").classList.toggle("hidden",student.archived);
  $("restoreButton").classList.toggle("hidden",!student.archived);

  $("checklistContainer").innerHTML="";
  student.checklist.forEach((item,index)=>{
    const row=document.createElement("label");
    row.className="check-row";
    row.innerHTML=`<input type="checkbox" ${item.done?"checked":""}><span>${escapeHtml(item.label)}</span>`;
    row.querySelector("input").addEventListener("change",e=>{student.checklist[index].done=e.target.checked;saveStudents();});
    $("checklistContainer").appendChild(row);
  });

  $("lessonList").innerHTML="";
  [...student.lessons].sort((a,b)=>b.createdAt-a.createdAt).forEach(lesson=>{
    const card=document.createElement("div");
    card.className="lesson-card";
    card.innerHTML=`<strong>${new Intl.DateTimeFormat("it-IT",{dateStyle:"medium",timeStyle:"short"}).format(new Date(lesson.createdAt))}</strong>${lesson.notes?`<div class="lesson-note">${escapeHtml(lesson.notes)}</div>`:""}${lesson.route.length>1?'<button class="route" type="button">Visualizza percorso</button>':""}`;
    if(lesson.route.length>1)card.querySelector(".route").addEventListener("click",()=>showRoute(lesson.route));
    $("lessonList").appendChild(card);
  });
  $("emptyLessons").classList.toggle("hidden",student.lessons.length>0);
}

function moveStudent(archived){
  const student=currentStudent();if(!student)return;
  student.archived=archived;saveStudents();currentTab=archived?"archive":"active";renderHome();show("home");
}

function deleteStudent(){
  const student=currentStudent();if(!student)return;
  if(!confirm(`Cancellare definitivamente ${student.name}?`))return;
  students=students.filter(item=>item.id!==student.id);saveStudents();currentStudentId=null;renderHome();show("home");
}

function renderChecklistManager(){
  const list=$("checklistManagerList");list.innerHTML="";
  checklistItems.forEach((item,index)=>{
    const row=document.createElement("div");
    row.className="manager-row";
    row.innerHTML=`<div class="manager-name">${escapeHtml(item.label)}</div><div class="manager-actions"><button class="small up" type="button" ${index===0?"disabled":""}>↑</button><button class="small down" type="button" ${index===checklistItems.length-1?"disabled":""}>↓</button><button class="small rename" type="button">Rinomina</button><button class="small danger remove" type="button">Elimina</button></div>`;
    row.querySelector(".up").addEventListener("click",()=>moveChecklistItem(index,-1));
    row.querySelector(".down").addEventListener("click",()=>moveChecklistItem(index,1));
    row.querySelector(".rename").addEventListener("click",()=>renameChecklistItem(item.id));
    row.querySelector(".remove").addEventListener("click",()=>removeChecklistItem(item.id));
    list.appendChild(row);
  });
  $("emptyChecklistManager").classList.toggle("hidden",checklistItems.length>0);
}

function addChecklistItem(){
  const input=$("newChecklistItemInput"),label=input.value.trim();
  if(!label)return;
  if(checklistItems.some(item=>item.label.toLowerCase()===label.toLowerCase())){alert("Questa voce esiste già.");return;}
  checklistItems.push({id:createId(),label});input.value="";saveChecklistItems();syncChecklistAcrossStudents();renderChecklistManager();
}

function renameChecklistItem(itemId){
  const item=checklistItems.find(entry=>entry.id===itemId);if(!item)return;
  const newLabel=prompt("Nuovo nome",item.label);if(newLabel===null)return;
  const label=newLabel.trim();if(!label)return;
  if(checklistItems.some(entry=>entry.id!==itemId&&entry.label.toLowerCase()===label.toLowerCase())){alert("Questa voce esiste già.");return;}
  item.label=label;saveChecklistItems();syncChecklistAcrossStudents();renderChecklistManager();
}

function removeChecklistItem(itemId){
  const item=checklistItems.find(entry=>entry.id===itemId);if(!item)return;
  if(!confirm(`Eliminare "${item.label}" da tutte le checklist?`))return;
  checklistItems=checklistItems.filter(entry=>entry.id!==itemId);saveChecklistItems();syncChecklistAcrossStudents();renderChecklistManager();
}

function moveChecklistItem(index,direction){
  const target=index+direction;if(target<0||target>=checklistItems.length)return;
  [checklistItems[index],checklistItems[target]]=[checklistItems[target],checklistItems[index]];
  saveChecklistItems();syncChecklistAcrossStudents();renderChecklistManager();
}

function startNewLesson(){
  lessonStartedAt=Date.now();gpsPoints=[];stopGps();stopRecognition();
  $("lessonNotes").value="";updateGpsUi();updateVoiceUi();show("lesson");
}

function initSpeechRecognition(){
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SpeechRecognition)return null;
  const rec=new SpeechRecognition();
  rec.lang="it-IT";rec.continuous=true;rec.interimResults=false;
  rec.onresult=event=>{
    let text="";
    for(let i=event.resultIndex;i<event.results.length;i++){if(event.results[i].isFinal)text+=event.results[i][0].transcript+" ";}
    if(text.trim()){
      const area=$("lessonNotes");
      area.value=(area.value.trim()?area.value.trim()+" ":"")+text.trim();
    }
  };
  rec.onerror=()=>{recognizing=false;updateVoiceUi();};
  rec.onend=()=>{recognizing=false;updateVoiceUi();};
  return rec;
}

function toggleRecognition(){
  if(recognizing){stopRecognition();return;}
  if(!recognition)recognition=initSpeechRecognition();
  if(!recognition){
    alert("La dettatura integrata non è disponibile. Usa il microfono della tastiera del telefono.");
    return;
  }
  try{recognition.start();recognizing=true;updateVoiceUi();}catch{}
}

function stopRecognition(){
  if(recognition&&recognizing){try{recognition.stop();}catch{}}
  recognizing=false;updateVoiceUi();
}

function updateVoiceUi(){
  $("voiceButton").textContent=recognizing?"⏹ Ferma dettatura":"🎤 Detta";
  $("voiceStatus").textContent=recognizing?"Dettatura in corso...":"";
  $("voiceStatus").classList.toggle("hidden",!recognizing);
}

function toggleGps(){
  if(gpsActive){stopGps();updateGpsUi();return;}
  if(!navigator.geolocation){alert("GPS non disponibile.");return;}
  gpsActive=true;updateGpsUi();
  gpsWatchId=navigator.geolocation.watchPosition(position=>{
    const point={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy,time:position.timestamp};
    if(point.accuracy>80)return;
    const previous=gpsPoints[gpsPoints.length-1];
    if(!previous||distanceMeters(previous,point)>=8){gpsPoints.push(point);updateGpsUi();}
  },error=>{
    stopGps();updateGpsUi();
    alert(error.code===1?"Permesso GPS non concesso.":"Impossibile leggere il GPS.");
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}

function stopGps(){
  if(gpsWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(gpsWatchId);
  gpsWatchId=null;gpsActive=false;
}

function updateGpsUi(){
  $("gpsButton").textContent=gpsActive?"Ferma GPS":"Avvia GPS";
  $("gpsStatus").textContent=gpsActive?`GPS attivo · ${gpsPoints.length} punti`:gpsPoints.length>1?`Percorso registrato · ${gpsPoints.length} punti`:"GPS non attivo";
  $("gpsStatus").classList.toggle("recording",gpsActive);
}

function saveLesson(){
  const student=currentStudent();if(!student)return;
  stopGps();stopRecognition();
  student.lessons.unshift({id:createId(),createdAt:lessonStartedAt||Date.now(),notes:$("lessonNotes").value.trim(),route:[...gpsPoints]});
  saveStudents();gpsPoints=[];lessonStartedAt=null;renderStudent();show("student");
}

async function shareStudent(){
  const student=currentStudent();if(!student)return;
  const payload={type:"autoscuola-student",version:1,exportedAt:new Date().toISOString(),student:normalizeStudent(student)};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const fileName=`${safeFileName(student.name)}.json`;
  const file=new File([blob],fileName,{type:"application/json"});

  if(navigator.canShare&&navigator.canShare({files:[file]})&&navigator.share){
    try{await navigator.share({title:`Allievo ${student.name}`,files:[file]});return;}catch(error){if(error.name==="AbortError")return;}
  }
  downloadBlob(blob,fileName);
}

function safeFileName(name){return name.replace(/[\\\\/:*?"<>|]+/g,"_").trim()||"allievo";}

function downloadBlob(blob,fileName){
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function importStudentFile(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const payload=JSON.parse(reader.result);
      if(payload?.type!=="autoscuola-student"||!payload.student)throw new Error();
      const imported=normalizeStudent(payload.student);
      if(!hasName(imported))throw new Error();
      imported.id=createId();
      imported.name=uniqueStudentName(imported.name);
      students.push(imported);saveStudents();currentTab="active";renderHome();
      alert(`Allievo importato: ${imported.name}`);
    }catch{alert("File allievo non valido.");}
    $("importStudentInput").value="";
  };
  reader.readAsText(file);
}

function uniqueStudentName(name){
  if(!students.some(s=>s.name.toLowerCase()===name.toLowerCase()))return name;
  let n=2;
  while(students.some(s=>s.name.toLowerCase()===`${name} (${n})`.toLowerCase()))n++;
  return `${name} (${n})`;
}

function distanceMeters(a,b){
  const radius=6371000,phi1=a.lat*Math.PI/180,phi2=b.lat*Math.PI/180;
  const deltaPhi=(b.lat-a.lat)*Math.PI/180,deltaLambda=(b.lng-a.lng)*Math.PI/180;
  const value=Math.sin(deltaPhi/2)**2+Math.cos(phi1)*Math.cos(phi2)*Math.sin(deltaLambda/2)**2;
  return 2*radius*Math.atan2(Math.sqrt(value),Math.sqrt(1-value));
}

async function showRoute(points){
  show("map");$("mapNotice").classList.add("hidden");initializeMap();clearMapLayers();drawRoute(points.map(p=>[p.lat,p.lng]));
  try{
    const roadRoute=await getRoadRoute(points);
    if(roadRoute.length>1){clearMapLayers();drawRoute(roadRoute);}
  }catch{
    $("mapNotice").textContent="Percorso stradale non disponibile: visualizzo la traccia GPS.";
    $("mapNotice").classList.remove("hidden");
  }
}

function initializeMap(){
  if(map){setTimeout(()=>map.invalidateSize(),80);return;}
  map=L.map("map");
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
}

function clearMapLayers(){
  [routeLayer,startMarker,endMarker].forEach(layer=>{if(layer&&map)map.removeLayer(layer);});
  routeLayer=startMarker=endMarker=null;
}

function drawRoute(latLngs){
  routeLayer=L.polyline(latLngs,{weight:6,opacity:.85}).addTo(map);
  startMarker=L.marker(latLngs[0]).addTo(map).bindPopup("Partenza");
  endMarker=L.marker(latLngs[latLngs.length-1]).addTo(map).bindPopup("Arrivo");
  map.fitBounds(routeLayer.getBounds(),{padding:[24,24]});setTimeout(()=>map.invalidateSize(),80);
}

async function getRoadRoute(points){
  const sampled=samplePoints(points,45);
  const coordinates=sampled.map(p=>`${p.lng},${p.lat}`).join(";");
  const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`);
  if(!response.ok)throw new Error("Routing error");
  const data=await response.json();
  const route=data?.routes?.[0]?.geometry?.coordinates;
  if(!Array.isArray(route))throw new Error("No route");
  return route.map(([lng,lat])=>[lat,lng]);
}

function samplePoints(points,maxPoints){
  if(points.length<=maxPoints)return points;
  const sampled=[],step=(points.length-1)/(maxPoints-1);
  for(let index=0;index<maxPoints;index++)sampled.push(points[Math.round(index*step)]);
  return sampled;
}

$("activeTab").onclick=()=>{currentTab="active";renderHome();};
$("archiveTab").onclick=()=>{currentTab="archive";renderHome();};
$("manageChecklistButton").onclick=()=>{renderChecklistManager();show("checklistManager");};
$("backChecklistManager").onclick=()=>{renderHome();show("home");};
$("addChecklistItemButton").onclick=addChecklistItem;
$("newChecklistItemInput").onkeydown=e=>{if(e.key==="Enter")addChecklistItem();};
$("importStudentButton").onclick=()=>$("importStudentInput").click();
$("importStudentInput").onchange=e=>importStudentFile(e.target.files[0]);
$("searchInput").oninput=renderHome;
$("newStudentButton").onclick=addStudent;
$("newStudentInput").onkeydown=e=>{if(e.key==="Enter")addStudent();};
$("backHome").onclick=()=>{renderHome();show("home");};
$("newLessonButton").onclick=startNewLesson;
$("shareStudentButton").onclick=shareStudent;
$("archiveButton").onclick=()=>moveStudent(true);
$("restoreButton").onclick=()=>moveStudent(false);
$("deleteButton").onclick=deleteStudent;
$("backStudent").onclick=()=>{stopGps();stopRecognition();renderStudent();show("student");};
$("voiceButton").onclick=toggleRecognition;
$("gpsButton").onclick=toggleGps;
$("saveLessonButton").onclick=saveLesson;
$("backMap").onclick=()=>{renderStudent();show("student");};
window.addEventListener("pagehide",()=>{stopGps();stopRecognition();});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js").catch(()=>{}));
}

saveChecklistItems();
syncChecklistAcrossStudents();
renderHome();
