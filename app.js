"use strict";

const STORAGE_KEY = "autoscuola_students_v2";
const OLD_STORAGE_KEY = "autoscuola_students_v1";
const CHECKLIST = [
  "Bolzaneto","Ge Ovest","Nervi, Quinto, Quarto","Retromarcia lunga",
  "Park di punta","Rapallo","Ge Nervi","Chiavari","Aeroporto","Check list",
  "Ge Est","Park in linea","Park a L","Recco","Inversioni di marcia",
  "Extraurbana","Partenze in salita","Uso cambio","Uso volante",
  "Spiegazione auto","Uso frizione"
];

let students = loadStudents();
let currentStudentId = null;
let currentTab = "active";
let gpsWatchId = null;
let gpsActive = false;
let gpsPoints = [];
let lessonStartedAt = null;
let map = null, routeLayer = null, startMarker = null, endMarker = null;

const $ = id => document.getElementById(id);

function id() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now()+"_"+Math.random().toString(36).slice(2);
}

function loadStudents() {
  const currentRaw = localStorage.getItem(STORAGE_KEY);
  const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
  const raw = currentRaw || oldRaw || "[]";

  try {
    const parsed = JSON.parse(raw);
    const cleaned = Array.isArray(parsed)
      ? parsed.map(normalizeStudent).filter(student => student.name.trim() !== "")
      : [];

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return [];
  }
}

function normalizeStudent(s) {
  const oldChecklist = Array.isArray(s.checklist) ? s.checklist : [];
  const doneByName = new Map(oldChecklist.map(x => [x.text || x.label, Boolean(x.done)]));
  let lessons = Array.isArray(s.lessons) ? s.lessons : [];
  if (!lessons.length && (s.notes || (Array.isArray(s.route) && s.route.length))) {
    lessons = [{id:id(),createdAt:Date.now(),notes:s.notes||"",route:s.route||[]}];
  }
  return {
    id: typeof s.id === "string" ? s.id : id(),
    name: (s.name || [s.firstName,s.lastName].filter(Boolean).join(" ")).trim(),
    archived: Boolean(s.archived),
    checklist: CHECKLIST.map(label => ({label,done:doneByName.get(label)||false})),
    lessons: lessons.map(l => ({
      id: l.id || id(),
      createdAt: Number(l.createdAt || l.timestamp || Date.now()),
      notes: String(l.notes || ""),
      route: Array.isArray(l.route) ? l.route.filter(p => Number.isFinite(p.lat)&&Number.isFinite(p.lng)) : []
    }))
  };
}

function save() {
  students = students.filter(student => student.name.trim() !== "");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
}

function show(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  $(name+"View").classList.add("active");
  window.scrollTo(0,0);
}

function currentStudent() {
  return students.find(s => s.id === currentStudentId);
}

function escapeHtml(v) {
  return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function renderHome() {
  const archived = currentTab === "archive";
  $("activeTab").classList.toggle("active", !archived);
  $("archiveTab").classList.toggle("active", archived);
  const q = $("searchInput").value.trim().toLowerCase();
  const list = students.filter(s => s.archived === archived && s.name.toLowerCase().includes(q))
    .sort((a,b)=>a.name.localeCompare(b.name,"it"));
  $("studentList").innerHTML = "";
  list.forEach(s => {
    const b = document.createElement("button");
    b.className = "student-card";
    b.innerHTML = `<span><strong>${escapeHtml(s.name)}</strong><span class="muted">${s.lessons.length} guide</span></span><span class="chev">›</span>`;
    b.onclick = () => openStudent(s.id);
    $("studentList").appendChild(b);
  });
  $("emptyList").classList.toggle("hidden", list.length > 0);
}

function addStudent() {
  const name = $("newStudentInput").value.trim();
  if (!name) return;
  students.push({id:id(),name,archived:false,checklist:CHECKLIST.map(label=>({label,done:false})),lessons:[]});
  $("newStudentInput").value = "";
  currentTab = "active";
  save(); renderHome();
}

function openStudent(studentId) {
  currentStudentId = studentId;
  renderStudent(); show("student");
}

function renderStudent() {
  const s = currentStudent();
  if (!s) return show("home");
  $("studentName").textContent = s.name;
  $("archiveButton").classList.toggle("hidden", s.archived);
  $("restoreButton").classList.toggle("hidden", !s.archived);

  $("checklistContainer").innerHTML = "";
  s.checklist.forEach((item,i) => {
    const row = document.createElement("label");
    row.className = "check-row";
    row.innerHTML = `<input type="checkbox" ${item.done?"checked":""}><span>${escapeHtml(item.label)}</span>`;
    row.querySelector("input").onchange = e => { s.checklist[i].done=e.target.checked; save(); };
    $("checklistContainer").appendChild(row);
  });

  $("lessonList").innerHTML = "";
  [...s.lessons].sort((a,b)=>b.createdAt-a.createdAt).forEach(l => {
    const card = document.createElement("div");
    card.className = "lesson-card";
    const routeButton = l.route.length > 1 ? `<button class="route">Visualizza percorso</button>` : "";
    card.innerHTML = `<strong>${new Intl.DateTimeFormat("it-IT",{dateStyle:"medium",timeStyle:"short"}).format(new Date(l.createdAt))}</strong>${l.notes?`<div class="lesson-note">${escapeHtml(l.notes)}</div>`:""}${routeButton}`;
    if (l.route.length > 1) card.querySelector(".route").onclick = () => showRoute(l.route);
    $("lessonList").appendChild(card);
  });
  $("emptyLessons").classList.toggle("hidden", s.lessons.length > 0);
}

function moveStudent(archived) {
  const s=currentStudent(); if(!s)return;
  s.archived=archived; save(); currentTab=archived?"archive":"active"; renderHome(); show("home");
}

function deleteStudent() {
  const s=currentStudent(); if(!s)return;
  if(!confirm(`Cancellare definitivamente ${s.name}?`)) return;
  students=students.filter(x=>x.id!==s.id); save(); currentStudentId=null; renderHome(); show("home");
}

function newLesson() {
  lessonStartedAt=Date.now(); gpsPoints=[]; stopGps();
  $("lessonNotes").value=""; updateGps(); show("lesson");
}

function toggleGps() {
  if(gpsActive){ stopGps(); updateGps(); return; }
  if(!navigator.geolocation){ alert("GPS non disponibile."); return; }
  gpsActive=true; updateGps();
  gpsWatchId=navigator.geolocation.watchPosition(pos=>{
    const p={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,time:pos.timestamp};
    if(p.accuracy>80)return;
    const prev=gpsPoints[gpsPoints.length-1];
    if(!prev || distance(prev,p)>=8){ gpsPoints.push(p); updateGps(); }
  },err=>{
    stopGps(); updateGps();
    alert(err.code===1?"Permesso GPS non concesso.":"Impossibile leggere il GPS.");
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
}

function stopGps() {
  if(gpsWatchId!==null && navigator.geolocation) navigator.geolocation.clearWatch(gpsWatchId);
  gpsWatchId=null; gpsActive=false;
}

function updateGps() {
  $("gpsButton").textContent=gpsActive?"Ferma GPS":"Avvia GPS";
  $("gpsStatus").textContent=gpsActive?`GPS attivo · ${gpsPoints.length} punti`:gpsPoints.length>1?`Percorso registrato · ${gpsPoints.length} punti`:"GPS non attivo";
  $("gpsStatus").classList.toggle("recording",gpsActive);
}

function saveLesson() {
  const s=currentStudent(); if(!s)return;
  stopGps();
  s.lessons.unshift({id:id(),createdAt:lessonStartedAt||Date.now(),notes:$("lessonNotes").value.trim(),route:[...gpsPoints]});
  save(); gpsPoints=[]; lessonStartedAt=null; renderStudent(); show("student");
}

function distance(a,b) {
  const R=6371000, p1=a.lat*Math.PI/180, p2=b.lat*Math.PI/180;
  const dp=(b.lat-a.lat)*Math.PI/180, dl=(b.lng-a.lng)*Math.PI/180;
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

async function showRoute(points) {
  show("map"); $("mapNotice").classList.add("hidden"); initMap();
  clearLayers(); draw(points.map(p=>[p.lat,p.lng]));
  try {
    const road=await roadRoute(points);
    if(road.length>1){ clearLayers(); draw(road); }
  } catch {
    $("mapNotice").textContent="Percorso stradale non disponibile: visualizzo la traccia GPS.";
    $("mapNotice").classList.remove("hidden");
  }
}

function initMap() {
  if(map){setTimeout(()=>map.invalidateSize(),80);return;}
  map=L.map("map");
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
}

function clearLayers() {
  [routeLayer,startMarker,endMarker].forEach(x=>{if(x&&map)map.removeLayer(x)});
  routeLayer=startMarker=endMarker=null;
}

function draw(latlngs) {
  routeLayer=L.polyline(latlngs,{weight:6,opacity:.85}).addTo(map);
  startMarker=L.marker(latlngs[0]).addTo(map).bindPopup("Partenza");
  endMarker=L.marker(latlngs[latlngs.length-1]).addTo(map).bindPopup("Arrivo");
  map.fitBounds(routeLayer.getBounds(),{padding:[24,24]}); setTimeout(()=>map.invalidateSize(),80);
}

async function roadRoute(points) {
  const sampled=sample(points,45);
  const coords=sampled.map(p=>`${p.lng},${p.lat}`).join(";");
  const res=await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`);
  if(!res.ok)throw new Error();
  const data=await res.json();
  const c=data?.routes?.[0]?.geometry?.coordinates;
  if(!Array.isArray(c))throw new Error();
  return c.map(([lng,lat])=>[lat,lng]);
}

function sample(points,max) {
  if(points.length<=max)return points;
  const out=[],step=(points.length-1)/(max-1);
  for(let i=0;i<max;i++)out.push(points[Math.round(i*step)]);
  return out;
}

$("activeTab").onclick=()=>{currentTab="active";renderHome()};
$("archiveTab").onclick=()=>{currentTab="archive";renderHome()};
$("searchInput").oninput=renderHome;
$("newStudentButton").onclick=addStudent;
$("newStudentInput").onkeydown=e=>{if(e.key==="Enter")addStudent()};
$("backHome").onclick=()=>{renderHome();show("home")};
$("newLessonButton").onclick=newLesson;
$("archiveButton").onclick=()=>moveStudent(true);
$("restoreButton").onclick=()=>moveStudent(false);
$("deleteButton").onclick=deleteStudent;
$("backStudent").onclick=()=>{stopGps();renderStudent();show("student")};
$("gpsButton").onclick=toggleGps;
$("saveLessonButton").onclick=saveLesson;
$("backMap").onclick=()=>{renderStudent();show("student")};
window.addEventListener("pagehide",stopGps);

if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js").catch(()=>{}));

save(); renderHome();
