"use strict";
const STORAGE_KEY="autoscuola_students_v3";
const OLD_KEYS=["autoscuola_students_v2","autoscuola_students_v1"];
const CHECKLIST_KEY="autoscuola_checklist_v1";
const DEFAULT_CHECKLIST=["Bolzaneto","Ge Ovest","Nervi, Quinto, Quarto","Retromarcia lunga","Park di punta","Rapallo","Ge Nervi","Chiavari","Aeroporto","Check list","Ge Est","Park in linea","Park a L","Recco","Inversioni di marcia","Extraurbana","Partenze in salita","Uso cambio","Uso volante","Spiegazione auto","Uso frizione"];

let checklistItems=loadChecklist();
let students=loadStudents();
let currentStudentId=null,currentTab="active";
let gpsWatchId=null,gpsActive=false,gpsPoints=[],lessonStartedAt=null;
let liveMap=null,liveLine=null,liveMarker=null;
let map=null,routeLayer=null,startMarker=null,endMarker=null;
let recognition=null,recognizing=false;
const $=id=>document.getElementById(id);
const newId=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"_"+Math.random().toString(36).slice(2);

function loadChecklist(){try{const s=JSON.parse(localStorage.getItem(CHECKLIST_KEY));if(Array.isArray(s)&&s.length)return s;}catch{}const x=DEFAULT_CHECKLIST.map(label=>({id:newId(),label}));localStorage.setItem(CHECKLIST_KEY,JSON.stringify(x));return x}
function saveChecklist(){localStorage.setItem(CHECKLIST_KEY,JSON.stringify(checklistItems))}
function loadStudents(){
  let raw=localStorage.getItem(STORAGE_KEY);
  if(!raw)for(const key of OLD_KEYS){raw=localStorage.getItem(key);if(raw)break}
  try{return (JSON.parse(raw||"[]")||[]).map(normalizeStudent).filter(s=>s.firstName||s.lastName)}catch{return []}
}
function normalizeStudent(s){
  const full=String(s.name||"").trim().split(/\s+/);
  const firstName=String(s.firstName||full.shift()||"").trim();
  const lastName=String(s.lastName||full.join(" ")||"").trim();
  const old=Array.isArray(s.checklist)?s.checklist:[];
  const byId=new Map(old.filter(x=>x.itemId).map(x=>[String(x.itemId),!!x.done]));
  const byLabel=new Map(old.map(x=>[x.label||x.text,!!x.done]));
  return{
    id:String(s.id||newId()),firstName,lastName,phone:String(s.phone||""),
    license:String(s.license||s.patente||""),archived:!!s.archived,
    checklist:checklistItems.map(i=>({itemId:i.id,label:i.label,done:byId.has(i.id)?byId.get(i.id):(byLabel.get(i.label)||false)})),
    lessons:Array.isArray(s.lessons)?s.lessons.map(l=>({id:l.id||newId(),createdAt:Number(l.createdAt||Date.now()),notes:String(l.notes||""),route:Array.isArray(l.route)?l.route:[]})):[]
  }
}
function fullName(s){return [s.firstName,s.lastName].filter(Boolean).join(" ")}
function save(){students=students.map(normalizeStudent);localStorage.setItem(STORAGE_KEY,JSON.stringify(students))}
function show(name){document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));$(name+"View").classList.add("active");window.scrollTo(0,0)}
function current(){return students.find(s=>s.id===currentStudentId)}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}

function renderHome(){
  const archived=currentTab==="archive",q=$("searchInput").value.toLowerCase().trim();
  $("activeTab").classList.toggle("active",!archived);$("archiveTab").classList.toggle("active",archived);
  const list=students.filter(s=>s.archived===archived&&fullName(s).toLowerCase().includes(q)).sort((a,b)=>fullName(a).localeCompare(fullName(b),"it"));
  $("studentList").innerHTML="";
  list.forEach(s=>{const b=document.createElement("button");b.className="student-card";b.innerHTML=`<span><strong>${esc(fullName(s))}</strong><span class="muted">${s.lessons.length} guide</span></span><span class="chev">›</span>`;b.onclick=()=>{currentStudentId=s.id;renderStudent();show("student")};$("studentList").appendChild(b)});
  $("emptyList").classList.toggle("hidden",list.length>0)
}
function saveNewStudent(){
  const firstName=$("studentFirstName").value.trim(),lastName=$("studentLastName").value.trim();
  if(!firstName&&!lastName){alert("Inserisci nome o cognome.");return}
  students.push({id:newId(),firstName,lastName,phone:$("studentPhone").value.trim(),license:$("studentLicense").value.trim(),archived:false,checklist:checklistItems.map(i=>({itemId:i.id,label:i.label,done:false})),lessons:[]});
  ["studentFirstName","studentLastName","studentPhone","studentLicense"].forEach(id=>$(id).value="");
  save();renderHome();show("home")
}
function renderStudent(){
  const s=current();if(!s)return show("home");
  $("studentName").textContent=fullName(s);
  $("studentDetails").innerHTML=`<div class="detail-row"><span class="detail-label">Nome:</span> ${esc(s.firstName)}</div><div class="detail-row"><span class="detail-label">Cognome:</span> ${esc(s.lastName)}</div><div class="detail-row"><span class="detail-label">Telefono:</span> ${esc(s.phone||"-")}</div><div class="detail-row"><span class="detail-label">Patente:</span> ${esc(s.license||"-")}</div>`;
  $("archiveButton").classList.toggle("hidden",s.archived);$("restoreButton").classList.toggle("hidden",!s.archived);
  $("checklistContainer").innerHTML="";
  s.checklist.forEach((i,n)=>{const r=document.createElement("label");r.className="check-row";r.innerHTML=`<input type="checkbox" ${i.done?"checked":""}><span>${esc(i.label)}</span>`;r.querySelector("input").onchange=e=>{s.checklist[n].done=e.target.checked;save()};$("checklistContainer").appendChild(r)});
  $("lessonList").innerHTML="";
  [...s.lessons].sort((a,b)=>b.createdAt-a.createdAt).forEach(l=>{const c=document.createElement("div");c.className="lesson-card";c.innerHTML=`<strong>${new Intl.DateTimeFormat("it-IT",{dateStyle:"medium",timeStyle:"short"}).format(new Date(l.createdAt))}</strong>${l.notes?`<div class="lesson-note">${esc(l.notes)}</div>`:""}${l.route.length>1?'<button class="route">Visualizza percorso</button>':""}`;if(l.route.length>1)c.querySelector(".route").onclick=()=>showRoute(l.route);$("lessonList").appendChild(c)});
  $("emptyLessons").classList.toggle("hidden",s.lessons.length>0)
}
function moveStudent(a){const s=current();s.archived=a;save();currentTab=a?"archive":"active";renderHome();show("home")}
function deleteStudent(){const s=current();if(confirm(`Cancellare definitivamente ${fullName(s)}?`)){students=students.filter(x=>x.id!==s.id);save();renderHome();show("home")}}

function renderChecklistManager(){
  $("checklistManagerList").innerHTML="";
  checklistItems.forEach((i,n)=>{const r=document.createElement("div");r.className="manager-row";r.innerHTML=`<div>${esc(i.label)}</div><div class="manager-actions"><button class="small up">↑</button><button class="small down">↓</button><button class="small rename">Rinomina</button><button class="small danger remove">Elimina</button></div>`;r.querySelector(".up").onclick=()=>moveItem(n,-1);r.querySelector(".down").onclick=()=>moveItem(n,1);r.querySelector(".rename").onclick=()=>renameItem(i.id);r.querySelector(".remove").onclick=()=>removeItem(i.id);$("checklistManagerList").appendChild(r)})
}
function syncChecklist(){students=students.map(normalizeStudent);save()}
function addItem(){const label=$("newChecklistItemInput").value.trim();if(!label)return;checklistItems.push({id:newId(),label});$("newChecklistItemInput").value="";saveChecklist();syncChecklist();renderChecklistManager()}
function renameItem(id){const i=checklistItems.find(x=>x.id===id),v=prompt("Nuovo nome",i.label);if(v&&v.trim()){i.label=v.trim();saveChecklist();syncChecklist();renderChecklistManager()}}
function removeItem(id){const i=checklistItems.find(x=>x.id===id);if(confirm(`Eliminare "${i.label}"?`)){checklistItems=checklistItems.filter(x=>x.id!==id);saveChecklist();syncChecklist();renderChecklistManager()}}
function moveItem(n,d){const t=n+d;if(t<0||t>=checklistItems.length)return;[checklistItems[n],checklistItems[t]]=[checklistItems[t],checklistItems[n]];saveChecklist();syncChecklist();renderChecklistManager()}

function startLesson(){lessonStartedAt=Date.now();gpsPoints=[];stopGps();$("lessonNotes").value="";updateGps();resetLiveMap();show("lesson")}
function toggleGps(){
  if(gpsActive){stopGps();updateGps();return}
  if(!navigator.geolocation){alert("GPS non disponibile");return}
  gpsActive=true;updateGps();$("liveMap").classList.remove("hidden");initLiveMap();setTimeout(()=>liveMap.invalidateSize(),250);
  gpsWatchId=navigator.geolocation.watchPosition(p=>{
    const point={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,time:p.timestamp};
    const prev=gpsPoints.at(-1);
    if(!prev){gpsPoints.push(point);updateGps();updateLiveMap(point);return}
    if(point.accuracy>80)return;
    if(distance(prev,point)>=8){gpsPoints.push(point);updateGps();updateLiveMap(point)}
  },e=>{stopGps();updateGps();alert(e.code===1?"Permesso GPS non concesso":"Impossibile leggere il GPS")},{enableHighAccuracy:true,maximumAge:0,timeout:15000})
}
function stopGps(){if(gpsWatchId!==null)navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null;gpsActive=false}
function updateGps(){$("gpsButton").textContent=gpsActive?"Ferma GPS":"Avvia GPS";$("gpsStatus").textContent=gpsActive?`GPS attivo · ${gpsPoints.length} punti`:gpsPoints.length>1?`Percorso registrato · ${gpsPoints.length} punti`:"GPS non attivo";$("gpsStatus").classList.toggle("recording",gpsActive)}
function initLiveMap(){if(!liveMap){liveMap=L.map("liveMap").setView([44.4056,8.9463],13);L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(liveMap)}setTimeout(()=>liveMap.invalidateSize(),150)}
function resetLiveMap(){if(liveMap){if(liveLine)liveMap.removeLayer(liveLine);if(liveMarker)liveMap.removeLayer(liveMarker)}liveLine=liveMarker=null;$("liveMap").classList.add("hidden")}
function updateLiveMap(p){initLiveMap();const pts=gpsPoints.map(x=>[x.lat,x.lng]);if(liveLine)liveMap.removeLayer(liveLine);liveLine=L.polyline(pts,{weight:5}).addTo(liveMap);if(liveMarker)liveMap.removeLayer(liveMarker);liveMarker=L.marker([p.lat,p.lng]).addTo(liveMap);liveMap.setView([p.lat,p.lng],Math.max(liveMap.getZoom(),16))}
function saveLesson(){const s=current();stopGps();s.lessons.unshift({id:newId(),createdAt:lessonStartedAt||Date.now(),notes:$("lessonNotes").value.trim(),route:[...gpsPoints]});save();renderStudent();show("student")}
function distance(a,b){const R=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}

async function showRoute(points){show("map");initMap();draw(points.map(p=>[p.lat,p.lng]));try{const road=await roadRoute(points);if(road.length>1)draw(road)}catch{$("mapNotice").textContent="Mostro la traccia GPS registrata.";$("mapNotice").classList.remove("hidden")}}
function initMap(){if(!map){map=L.map("map");L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map)}setTimeout(()=>map.invalidateSize(),100)}
function draw(pts){[routeLayer,startMarker,endMarker].forEach(x=>{if(x)map.removeLayer(x)});routeLayer=L.polyline(pts,{weight:6}).addTo(map);startMarker=L.marker(pts[0]).addTo(map).bindPopup("Partenza");endMarker=L.marker(pts.at(-1)).addTo(map).bindPopup("Arrivo");map.fitBounds(routeLayer.getBounds(),{padding:[20,20]})}
async function roadRoute(points){const sample=points.length<=40?points:Array.from({length:40},(_,i)=>points[Math.round(i*(points.length-1)/39)]);const coords=sample.map(p=>`${p.lng},${p.lat}`).join(";");const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);const d=await r.json();return d.routes[0].geometry.coordinates.map(([lng,lat])=>[lat,lng])}

function initSpeech(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return null;const r=new SR();r.lang="it-IT";r.continuous=true;r.onresult=e=>{let t="";for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)t+=e.results[i][0].transcript+" ";$("lessonNotes").value+=t};r.onend=()=>{recognizing=false;$("voiceButton").textContent="🎤 Detta"};return r}
function toggleVoice(){if(recognizing){recognition.stop();return}if(!recognition)recognition=initSpeech();if(!recognition){alert("Usa il microfono della tastiera.");return}recognition.start();recognizing=true;$("voiceButton").textContent="⏹ Ferma"}

async function shareStudent(){const s=current(),blob=new Blob([JSON.stringify({type:"autoscuola-student",student:s},null,2)],{type:"application/json"}),file=new File([blob],fullName(s).replace(/[\\\\/:*?"<>|]/g,"_")+".json",{type:"application/json"});if(navigator.canShare?.({files:[file]}))try{return await navigator.share({files:[file],title:fullName(s)})}catch{}const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=file.name;a.click()}
function importFile(file){if(!file)return;const r=new FileReader();r.onload=()=>{try{const p=JSON.parse(r.result);const s=normalizeStudent(p.student);s.id=newId();students.push(s);save();renderHome();alert("Allievo importato")}catch{alert("File non valido")}};r.readAsText(file)}

$("activeTab").onclick=()=>{currentTab="active";renderHome()};$("archiveTab").onclick=()=>{currentTab="archive";renderHome()};
$("openNewStudentButton").onclick=()=>show("newStudent");$("backNewStudent").onclick=()=>show("home");$("saveStudentButton").onclick=saveNewStudent;
$("manageChecklistButton").onclick=()=>{renderChecklistManager();show("checklistManager")};$("backChecklistManager").onclick=()=>show("home");$("addChecklistItemButton").onclick=addItem;
$("importStudentButton").onclick=()=>$("importStudentInput").click();$("importStudentInput").onchange=e=>importFile(e.target.files[0]);
$("searchInput").oninput=renderHome;$("backHome").onclick=()=>show("home");$("newLessonButton").onclick=startLesson;$("shareStudentButton").onclick=shareStudent;
$("archiveButton").onclick=()=>moveStudent(true);$("restoreButton").onclick=()=>moveStudent(false);$("deleteButton").onclick=deleteStudent;
$("backStudent").onclick=()=>{stopGps();show("student")};$("gpsButton").onclick=toggleGps;$("voiceButton").onclick=toggleVoice;$("saveLessonButton").onclick=saveLesson;$("backMap").onclick=()=>show("student");
if("serviceWorker"in navigator)navigator.serviceWorker.register("service-worker.js").catch(()=>{});
saveChecklist();save();renderHome();
