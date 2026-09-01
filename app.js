"use strict";
const KEY="autoscuola_v3_completa";
const LIST_KEY="autoscuola_v3_checklists_v2";
const EXAMINERS_KEY="autoscuola_v3_examiners";
const APP_NAME="Agenda Istruttore";
const APP_VERSION="1.21.0";
const LABELS={auto:"Auto","guida-accompagnata":"Guida Accompagnata",moto:"Moto","quad-leggero":"Quadriciclo leggero AM","quad-pesante":"Quadriciclo pesante B1","corso-moto":"Corso moto ad accesso graduale A2 e A",perfezionamento:"Perfezionamento","esame-revisione":"Revisioni","esame-esperimento":"Esperimenti","da-classificare":"Da classificare"};
const UNCLASSIFIED_CATEGORY="da-classificare";
const DEFAULT_LISTS={
 auto:["Spiegazione auto","Posizione mani sul volante","Uso cambio","Uso frizione","Uso volante","Partenza in salita","Extraurbana","Nervi Quinto Quarto","Autostrada Nervi","Autostrada Recco","Autostrada Rapallo","Autostrada Chiavari","Autostrada Est","Autostrada Bolzaneto","Autostrada Aeroporto","Autostrada Ovest","Park a L","Park a S","Park di punta","Retromarcia lunga","Inversioni di marcia"],
 "guida-accompagnata":["Spiegazione auto","Posizione mani sul volante","Uso cambio","Uso frizione","Uso volante","Partenza in salita","Extraurbana","Nervi Quinto Quarto","Autostrada Nervi","Autostrada Recco","Autostrada Rapallo","Autostrada Chiavari","Autostrada Est","Autostrada Bolzaneto","Autostrada Aeroporto","Autostrada Ovest","Park a L","Park a S","Park di punta","Retromarcia lunga","Inversioni di marcia"],
 moto:["Piazzale Marassi","Via Dodecaneso","Albaro","Villa Bombrini birilli lento","Villa Bombrini birilli veloce","Inversione IKEA","Inversione Villa Bombrini","Inversione Borzoli","Inversione Ponte Morandi","Cornigliano Budello","Cornigliano Via","Sampierdarena Anania","Corso Perrone","Ponte Morandi","Borzoli ingresso parcheggio","Borzoli strada chiusa","Borzoli Sestri","IKEA","Fiumara","Guido Rossa"],
 "quad-leggero":["Villa Bombrini percorso birilli"],
 "quad-pesante":["Villa Bombrini percorso birilli"],
 "corso-moto":["3 ore teoria + Villa Bombrini","2 ore Guido Rossa","2 ore Bargagli"],
 "esame-revisione":[],
 "esame-esperimento":[]
};
const STATES=["none","repeat","good"];
function loadLists(){const merged=JSON.parse(JSON.stringify(DEFAULT_LISTS));try{const x=JSON.parse(localStorage.getItem(LIST_KEY));if(x&&typeof x==="object")Object.keys(merged).forEach(k=>{if(Array.isArray(x[k]))merged[k]=x[k]})}catch{}return merged}
let LISTS=loadLists();
function saveLists(){localStorage.setItem(LIST_KEY,JSON.stringify(LISTS))}
const $=id=>document.getElementById(id),uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+"_"+Math.random();
let state={students:load(),examiners:loadExaminers(),studentId:null,lessonId:null,editingStudent:null,examinerId:null,editingExaminer:null,habitDraft:[],filter:null,studentListMode:"hidden",managerType:null,multiStudentAction:null,lessonsExpanded:false,watch:null,tempRoute:[],gpsNeedsBreak:false,liveMap:null,liveLine:null,liveMarker:null,savedMap:null,savedLine:null,recognition:null,recognizing:false};
function typeOf(c){return c==="perfezionamento"?"auto":(LISTS[c]?c:"auto")}
function loadExaminers(){try{const a=JSON.parse(localStorage.getItem(EXAMINERS_KEY)||"[]");return Array.isArray(a)?a.map(x=>({id:String(x.id||uid()),firstName:String(x.firstName||""),lastName:String(x.lastName||""),notes:String(x.notes||""),habits:Array.isArray(x.habits)?x.habits.map(String):[]})):[]}catch{return []}}
function saveExaminers(){localStorage.setItem(EXAMINERS_KEY,JSON.stringify(state.examiners))}
function oldStatus(x){if(x?.status&&STATES.includes(x.status))return x.status;return x?.done?"good":"none"}
function normalizeItems(items,type){const byLabel=new Map((items||[]).map(x=>[x.label,oldStatus(x)]));return LISTS[type].map(label=>({id:uid(),label,status:byLabel.get(label)||"none"}))}
function normalizeStudent(s){const c=LABELS[s.category]?s.category:UNCLASSIFIED_CATEGORY,t=typeOf(c),normalized={id:String(s.id||uid()),category:c,firstName:String(s.firstName||""),lastName:String(s.lastName||""),phone:String(s.phone||""),license:String(s.license||""),pinkSlipIssueDate:String(s.pinkSlipIssueDate||""),notes:String(s.notes||s.studentNotes||""),archived:s.archived===true,checklist:normalizeItems(s.checklist,t),lessons:Array.isArray(s.lessons)?s.lessons.map(l=>normalizeLesson(l,t)):[]};if(typeof s.photo==="string"&&/^data:image\/(?:jpeg|png|webp);base64,/i.test(s.photo))normalized.photo=s.photo;return normalized}
function normalizeLesson(l,t){const normalized={id:String(l.id||uid()),createdAt:Number(l.createdAt||Date.now()),notes:String(l.notes||""),route:Array.isArray(l.route)?l.route.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)).map(p=>({...p,breakBefore:!!p.breakBefore})):[],checklist:normalizeItems(l.checklist,t)};if(typeof l.duration==="string"&&l.duration.trim())normalized.duration=l.duration.trim();return normalized}
function load(){try{const a=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(a)?a.map(normalizeStudent):[]}catch{return []}}
function save(){state.students=state.students.map(normalizeStudent);localStorage.setItem(KEY,JSON.stringify(state.students))}
function setNeutralHome(){state.filter=null;state.studentListMode="hidden";document.querySelectorAll(".categories button[data-f]").forEach(button=>button.classList.remove("active"))}
const CATEGORY_CONTEXT_VIEWS=["studentForm","student","lesson","savedMapView"];
const NAV_SECTION_LABELS={auto:"Auto",moto:"Moto","guida-accompagnata":"Guida accompagnata","quad-leggero":"Quadriciclo leggero AM","quad-pesante":"Quadriciclo pesante B1","corso-moto":"Corso Moto A2/A",perfezionamento:"Guide di perfezionamento","esame-revisione":"Esami di revisione","esame-esperimento":"Esperimento di guida","da-classificare":"Da classificare"};
function navigationSectionLabel(category){return NAV_SECTION_LABELS[category]||sectionLabel(category)}
function categoryForView(id){if(id==="studentForm"){if(state.editingStudent)return state.students.find(item=>item.id===state.editingStudent)?.category||state.filter;return state.filter}return student()?.category||state.filter}
function contextualSubpage(id){if(id==="student")return"Scheda allievo";if(id==="savedMapView")return"Mappa / percorso salvato";return""}
function updatePageTitle(id){const view=$(id),title=view&&view.querySelector(":scope > .page-context-title");if(!title)return;const section=document.createElement("strong");section.className="page-context-section";section.textContent=navigationSectionLabel(categoryForView(id));title.replaceChildren(section);const subpage=contextualSubpage(id);if(subpage){const detail=document.createElement("span");detail.className="page-context-subpage";detail.textContent=subpage;title.appendChild(detail)}}
function installPageTitles(){CATEGORY_CONTEXT_VIEWS.forEach(id=>{const view=$(id);if(!view||view.querySelector(":scope > .page-context-title"))return;const title=document.createElement("div");title.className="page-context-title";title.setAttribute("aria-label","Posizione corrente");view.prepend(title);updatePageTitle(id)})}
function show(id){const previous=document.querySelector(".view.active")?.id;if(previous==="registerView"&&id!=="registerView")window.RegisterUI?.leave?.();document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));updatePageTitle(id);$(id).classList.add("active");if(id==="home")setNeutralHome();scrollTo(0,0)}
function showLogin(){stopGps();$("appShell").classList.add("hidden");$("loginScreen").classList.remove("hidden");$("loginForm").reset();$("loginError").classList.add("hidden");setTimeout(()=>$("loginPassword").focus(),0)}
function showApp(){$("loginScreen").classList.add("hidden");$("appShell").classList.remove("hidden");renderStudents();show("home")}
function login(event){return window.AgendaAuth.login(event,showApp)}
function logout(){return window.AgendaAuth.logout(showLogin)}
function student(){return state.students.find(s=>s.id===state.studentId)}function lesson(){return student()?.lessons.find(l=>l.id===state.lessonId)}
function compactPersonPart(value){return String(value||"").trim().replace(/\s+/g," ")}
function normalizedPersonPart(value){return compactPersonPart(value).toLocaleLowerCase("it")}
function nameOf(s){return[compactPersonPart(s.lastName),compactPersonPart(s.firstName)].filter(Boolean).join(" ")}
function enteredName(first,last){return[compactPersonPart(first),compactPersonPart(last)].filter(Boolean).join(" ")}
function compareStudents(a,b){return compactPersonPart(a.lastName).localeCompare(compactPersonPart(b.lastName),"it",{sensitivity:"base"})||compactPersonPart(a.firstName).localeCompare(compactPersonPart(b.firstName),"it",{sensitivity:"base"})}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function stateIcon(v){return v==="repeat"?"🟡":v==="good"?"✅":"⬜"}function nextState(v){return STATES[(STATES.indexOf(v)+1)%STATES.length]}
function renderStateItems(items,box,onchange){box.innerHTML="";items.forEach((it,i)=>{const r=document.createElement("div");r.className="state-row";const b=document.createElement("button");b.type="button";b.className=`state-btn ${it.status}`;b.textContent=stateIcon(it.status);b.onclick=()=>{it.status=nextState(it.status);b.textContent=stateIcon(it.status);b.className=`state-btn ${it.status}`;onchange(i,it.status)};const s=document.createElement("span");s.textContent=it.label;r.append(b,s);box.appendChild(r)})}
function sectionLabel(category){return LABELS[category]||(category===UNCLASSIFIED_CATEGORY?"Da classificare":"Sezione non indicata")}
function renderStudents(){const q=normalizedPersonPart($("search").value),visible=state.studentListMode!=="hidden",a=state.students.filter(s=>!s.archived&&s.category===state.filter).filter(s=>(`${s.lastName} ${s.firstName} ${s.phone} ${s.license}`).toLocaleLowerCase("it").includes(q)).sort(compareStudents);$("currentSectionTitle").textContent=navigationSectionLabel(state.filter);$("students").replaceChildren();$("studentResults").classList.toggle("hidden",!visible);$("emptyStudents").classList.toggle("hidden",!visible||a.length>0);if(visible)a.forEach(s=>{const b=document.createElement("button");b.className="student-card";b.innerHTML=`<strong>${esc(nameOf(s)||"Senza nome")}</strong><span class="meta">${sectionLabel(s.category)} · ${esc(s.license||"Patente non indicata")} · ${s.lessons.length} guide</span>`;b.onclick=()=>openStudent(s.id);$("students").appendChild(b)});const needsClassification=state.students.some(s=>!s.archived&&s.category===UNCLASSIFIED_CATEGORY);$("unclassifiedStudents").classList.toggle("hidden",!needsClassification)}
function renderArchivedStudents(){const q=normalizedPersonPart($("archiveSearch").value),items=state.students.filter(s=>s.archived).filter(s=>(`${s.lastName} ${s.firstName} ${s.phone} ${s.license} ${sectionLabel(s.category)}`).toLocaleLowerCase("it").includes(q)).sort(compareStudents);$("archivedStudents").replaceChildren();$("emptyArchive").classList.toggle("hidden",items.length>0);items.forEach(s=>{const b=document.createElement("button");b.className="student-card archived-student";b.innerHTML=`<strong>${esc(nameOf(s)||"Senza nome")}</strong><span class="meta">${sectionLabel(s.category)} · ${esc(s.license||"Patente non indicata")} · ${s.lessons.length} guide</span>`;b.onclick=()=>openStudent(s.id);$("archivedStudents").appendChild(b)})}
function selectStudentSection(category,mode="hidden",backView="home"){state.filter=category;state.studentListMode=mode;$("search").value="";$("studentSearchPanel").classList.add("hidden");$("toggleStudentSearch").setAttribute("aria-expanded","false");$("toggleStudentSearch").textContent="CERCA ALLIEVO";$("newStudent").disabled=category===UNCLASSIFIED_CATEGORY;$("categoryBack").onclick=()=>show(backView);renderStudents();show("categoryHub")}
function toggleStudentSearch(){const opening=$("studentSearchPanel").classList.contains("hidden");$("studentSearchPanel").classList.toggle("hidden",!opening);$("toggleStudentSearch").setAttribute("aria-expanded",String(opening));$("toggleStudentSearch").textContent=opening?"NASCONDI RICERCA":"CERCA ALLIEVO";state.studentListMode=opening?"search":"hidden";if(!opening)$("search").value="";renderStudents();if(opening)setTimeout(()=>$("search").focus(),0)}
function showAllStudents(){state.studentListMode="all";$("search").value="";$("studentSearchPanel").classList.add("hidden");$("toggleStudentSearch").setAttribute("aria-expanded","false");$("toggleStudentSearch").textContent="CERCA ALLIEVO";renderStudents();$("studentResults").scrollIntoView({behavior:"smooth",block:"start"})}
function pinkSlipExpiryDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||""))return"";const [year,month,day]=value.split("-").map(Number),lastDay=new Date(year+1,month,0).getDate();return`${year+1}-${String(month).padStart(2,"0")}-${String(Math.min(day,lastDay)).padStart(2,"0")}`}
function formatStoredDate(value){if(!value)return"-";const [year,month,day]=value.split("-").map(Number);return new Date(year,month-1,day).toLocaleDateString("it-IT")}
function lessonDurationMilliseconds(value){if(typeof value!=="string"||!value.trim())return 0;const text=value.toLowerCase().replace(",","."),hours=text.match(/(\d+(?:\.\d+)?)\s*(?:h|ora|ore)\b/),minutes=text.match(/(\d+)\s*(?:m|min|minuto|minuti)\b/);return Math.round(((hours?Number(hours[1]):0)*60+(minutes?Number(minutes[1]):0))*60000)}
function lessonGpsDurationMilliseconds(route){if(!Array.isArray(route)||route.length<2)return 0;const timed=route.filter(point=>Number.isFinite(point.time));if(timed.length<2)return 0;const elapsed=timed.at(-1).time-timed[0].time;return Number.isFinite(elapsed)&&elapsed>0?elapsed:0}
function lessonTiming(item){const start=new Date(item.createdAt),saved=lessonDurationMilliseconds(item.duration),gps=saved?0:lessonGpsDurationMilliseconds(item.route),elapsed=saved||gps,end=elapsed?new Date(start.getTime()+elapsed):null;return{start,end,elapsed,source:saved?"saved":gps?"gps":null}}
function formatLessonClock(value){return`${String(value.getHours()).padStart(2,"0")}:${String(value.getMinutes()).padStart(2,"0")}`}
function formatLessonDate(value){return value.toLocaleDateString("it-IT")}
function lessonTimeRange(item){const timing=lessonTiming(item),start=formatLessonClock(timing.start);return timing.end?`${start} – ${formatLessonClock(timing.end)}`:start}
function updatePinkSlipExpiry(){const value=$("pinkSlipIssueDate").value,expiry=pinkSlipExpiryDate(value);$("pinkSlipExpiry").textContent=`Scadenza foglio rosa: ${expiry?formatStoredDate(expiry):"—"}`}
function openStudent(id){state.studentId=id;state.lessonsExpanded=false;const s=student(),expiry=pinkSlipExpiryDate(s.pinkSlipIssueDate),pinkSlip=s.category==="perfezionamento"?"":`<div class="detail-row"><span class="detail-label">Rilascio foglio rosa:</span> ${formatStoredDate(s.pinkSlipIssueDate)}</div><div class="detail-row"><span class="detail-label">Scadenza foglio rosa:</span> ${formatStoredDate(expiry)}</div>`;$("studentName").textContent=nameOf(s)||"Allievo";$("studentDetails").innerHTML=`<div class="detail-row"><span class="detail-label">Stato:</span> ${s.archived?"Archiviato":"Attivo"}</div><div class="detail-row"><span class="detail-label">Nome:</span> ${esc(s.firstName||"-")}</div><div class="detail-row"><span class="detail-label">Cognome:</span> ${esc(s.lastName||"-")}</div><div class="detail-row"><span class="detail-label">Categoria:</span> ${LABELS[s.category]}</div><div class="detail-row"><span class="detail-label">Telefono:</span> ${esc(s.phone||"-")}</div><div class="detail-row"><span class="detail-label">Patente:</span> ${esc(s.license||"-")}</div>${pinkSlip}<div class="detail-row"><span class="detail-label">Note:</span> ${esc(s.notes||"-")}</div>`;if(typeof window.renderStudentProfilePhoto==="function")window.renderStudentProfilePhoto(s);$("archiveStudent").classList.toggle("hidden",s.archived);$("restoreStudent").classList.toggle("hidden",!s.archived);$("newLesson").classList.toggle("hidden",s.archived);renderLessons();show("student")}
function renderLessons(){const s=student(),all=[...s.lessons].sort((a,b)=>b.createdAt-a.createdAt),visible=state.lessonsExpanded?all:all.slice(0,1);$("lessons").innerHTML="";$("emptyLessons").classList.toggle("hidden",all.length>0);$("toggleLessons").classList.toggle("hidden",all.length<2);$("toggleLessons").textContent=state.lessonsExpanded?"MOSTRA SOLO L’ULTIMA GUIDA":"VEDI TUTTE LE GUIDE";$("toggleLessons").setAttribute("aria-expanded",String(state.lessonsExpanded));visible.forEach((l,index)=>{const b=document.createElement("button"),date=new Date(l.createdAt);b.className="lesson-card";const selected=l.checklist.filter(x=>x.status!=="none").map(x=>`${stateIcon(x.status)} ${esc(x.label)}`).join("<br>")||"Nessuna voce selezionata";b.innerHTML=`${!state.lessonsExpanded&&index===0?'<span class="latest-badge">ULTIMA GUIDA</span>':""}<strong>${formatLessonDate(date)}<br>${lessonTimeRange(l)}</strong><span>${esc(l.notes||"Nessuna nota")}</span><span class="meta lesson-items">${selected}</span><span class="meta">${l.route.length>1?"GPS presente":"GPS non usato"} · Tocca per aprire</span>`;b.onclick=()=>openLesson(l.id);$("lessons").appendChild(b)})}
function updatePinkSlipVisibility(){const hidden=$("category").value==="perfezionamento";$("pinkSlipIssueField").classList.toggle("hidden",hidden);$("pinkSlipExpiry").classList.toggle("hidden",hidden)}
function newStudent(){state.editingStudent=null;$("studentFormTitle").textContent="Nuovo allievo";$("category").value=state.filter||"auto";try{$("category").closest("label").style.display="none"}catch(e){}["firstName","lastName","phone","license","pinkSlipIssueDate","studentNotes"].forEach(id=>$(id).value="");if(typeof window.prepareStudentPhoto==="function")window.prepareStudentPhoto("");updatePinkSlipExpiry();updatePinkSlipVisibility();show("studentForm")}
function editStudent(){const s=student();state.editingStudent=s.id;try{$("category").closest("label").style.display=""}catch(e){}$("studentFormTitle").textContent="Modifica allievo";$("category").value=s.category;$("firstName").value=s.firstName;$("lastName").value=s.lastName;$("phone").value=s.phone;$("license").value=s.license;$("pinkSlipIssueDate").value=s.pinkSlipIssueDate;$("studentNotes").value=s.notes;if(typeof window.prepareStudentPhoto==="function")window.prepareStudentPhoto(s.photo||"");updatePinkSlipExpiry();updatePinkSlipVisibility();show("studentForm")}
function saveStudent(){const c=$("category").value,first=compactPersonPart($("firstName").value),last=compactPersonPart($("lastName").value),pinkSlipIssueDate=$("pinkSlipIssueDate").value,photo=typeof window.studentPhotoValue==="function"?window.studentPhotoValue():"";if(!first&&!last)return alert("Inserisci nome o cognome.");if(!state.editingStudent){const duplicate=state.students.find(item=>normalizedPersonPart(item.firstName)===normalizedPersonPart(first)&&normalizedPersonPart(item.lastName)===normalizedPersonPart(last));if(duplicate&&!confirm(`Esiste già un allievo con nome e cognome ${enteredName(first,last)} nella categoria ${sectionLabel(duplicate.category)}${duplicate.archived?" (archiviato)":""}.\n\nPotrebbero essere persone diverse. Vuoi salvare comunque il nuovo allievo?`))return}if(state.editingStudent){const s=state.students.find(x=>x.id===state.editingStudent),oldType=typeOf(s.category),newType=typeOf(c);Object.assign(s,{category:c,firstName:first,lastName:last,phone:$("phone").value.trim(),license:$("license").value.trim(),pinkSlipIssueDate,notes:$("studentNotes").value.trim()});if(photo)s.photo=photo;else delete s.photo;if(oldType!==newType){s.checklist=normalizeItems([],newType);s.lessons=s.lessons.map(l=>({...l,checklist:normalizeItems([],newType)}))}}else state.students.push(normalizeStudent({id:uid(),category:c,firstName:first,lastName:last,phone:$("phone").value.trim(),license:$("license").value.trim(),pinkSlipIssueDate,notes:$("studentNotes").value.trim(),photo,checklist:[],lessons:[]}));save();state.editingStudent=null;selectStudentSection(c,"all")}
function removeStudentRecord(s){if(!s)return false;const before=state.students.length;state.students=state.students.filter(x=>x.id!==s.id);return state.students.length<before}
function markStudentArchived(s){if(!s||s.archived)return false;s.archived=true;return true}
function deleteStudent(){const s=student();if(s&&confirm(`Eliminare definitivamente ${nameOf(s)}?`)){removeStudentRecord(s);save();renderStudents();show("home")}}
function archiveStudent(){const s=student();if(!s||s.archived)return;if(confirm(`Archiviare ${nameOf(s)||"questo allievo"}? Tutti i dati saranno conservati.`)){markStudentArchived(s);save();renderStudents();show("home")}}
function restoreStudent(){const s=student();if(!s||!s.archived)return;if(confirm(`Ripristinare ${nameOf(s)||"questo allievo"} tra gli allievi attivi?`)){s.archived=false;save();selectStudentSection(s.category);show("home")}}
function renderLessonChecklist(items){$("lessonChecklist").dataset.items=JSON.stringify(items);renderStateItems(items,$("lessonChecklist"),(i,v)=>{const a=JSON.parse($("lessonChecklist").dataset.items);a[i].status=v;$("lessonChecklist").dataset.items=JSON.stringify(a)})}
function setLessonActivityExpanded(expanded){$("lessonChecklist").classList.toggle("hidden",!expanded);$("toggleLessonActivity").textContent=expanded?"NASCONDI ATTIVITÀ DIDATTICA":"VISUALIZZA ATTIVITÀ DIDATTICA";$("toggleLessonActivity").setAttribute("aria-expanded",String(expanded))}
function newLesson(){state.lessonId=null;const s=student(),now=new Date(),previous=[...s.lessons].sort((a,b)=>b.createdAt-a.createdAt)[0],base=previous?.checklist?.length?previous.checklist:normalizeItems([],typeOf(s.category)),items=base.map(x=>({...x}));$("lessonTitle").textContent="Nuova guida";$("lessonDate").value=now.toISOString().slice(0,10);$("lessonTime").value=now.toTimeString().slice(0,5);$("lessonDuration").selectedIndex=0;$("lessonNotes").value="";$("deleteLesson").classList.add("hidden");$("openSavedRoute").classList.add("hidden");state.tempRoute=[];renderLessonChecklist(items);setLessonActivityExpanded(false);resetGps();show("lesson")}
function openLesson(id){state.lessonId=id;const l=lesson(),d=new Date(l.createdAt);$("lessonTitle").textContent="Modifica guida";$("lessonDate").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;$("lessonTime").value=`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;$("lessonDuration").value=l.duration||$("lessonDuration").options[0].value;$("lessonNotes").value=l.notes;$("deleteLesson").classList.remove("hidden");$("openSavedRoute").classList.toggle("hidden",l.route.length<2);state.tempRoute=[...l.route];renderLessonChecklist(l.checklist.map(x=>({...x})));setLessonActivityExpanded(false);resetGps();show("lesson")}
function saveLesson(){stopGps();const stamp=new Date(`${$("lessonDate").value}T${$("lessonTime").value||"00:00"}:00`).getTime(),data={createdAt:stamp,notes:$("lessonNotes").value.trim(),route:[...state.tempRoute],checklist:JSON.parse($("lessonChecklist").dataset.items||"[]")};if(state.lessonId){const current=lesson();if(Object.prototype.hasOwnProperty.call(current,"duration"))data.duration=$("lessonDuration").value;Object.assign(current,data)}else student().lessons.push({id:uid(),duration:$("lessonDuration").value,...data});save();openStudent(state.studentId)}
function deleteLesson(){if(confirm("Eliminare questa guida?")){student().lessons=student().lessons.filter(x=>x.id!==state.lessonId);save();openStudent(state.studentId)}}
function initLiveMap(){if(!state.liveMap){state.liveMap=L.map("liveMap").setView([44.4056,8.9463],13);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(state.liveMap)}setTimeout(()=>state.liveMap.invalidateSize(),80)}
function routeSegments(route){const segments=[];let current=[];route.forEach((point,index)=>{if(index>0&&point.breakBefore&&current.length){segments.push(current);current=[]}current.push([point.lat,point.lng])});if(current.length)segments.push(current);return segments}
function drawLive(){initLiveMap();if(state.liveLine)state.liveMap.removeLayer(state.liveLine);if(state.liveMarker)state.liveMap.removeLayer(state.liveMarker);state.liveLine=null;state.liveMarker=null;if(!state.tempRoute.length)return;const segments=routeSegments(state.tempRoute),layers=segments.filter(x=>x.length>1).map(x=>L.polyline(x,{weight:5,color:"#d70015",opacity:.9}));state.liveLine=L.featureGroup(layers).addTo(state.liveMap);const last=state.tempRoute.at(-1);state.liveMarker=L.marker([last.lat,last.lng]).addTo(state.liveMap);if(state.tempRoute.length===1)state.liveMap.setView([last.lat,last.lng],17);else{const bounds=state.liveLine.getBounds();if(bounds.isValid())state.liveMap.fitBounds(bounds,{padding:[20,20]});else state.liveMap.setView([last.lat,last.lng],17)}}
function updateGpsUi(message){const active=state.watch!==null,button=$("startGps");button.classList.toggle("gps-active",active);button.textContent=active?"FERMA GPS":"AVVIA GPS";button.setAttribute("aria-pressed",String(active));$("gpsIndicator").classList.toggle("active",active);$("gpsIndicator").textContent=active?"● GPS ATTIVO — registrazione percorso":"GPS non attivo";if(message)$("gpsStatus").textContent=message}
function gpsErrorMessage(error){if(error.code===1)return"Permesso GPS negato. Abilita la posizione nelle impostazioni del dispositivo.";if(error.code===2)return"Posizione temporaneamente non disponibile. Verifica il segnale GPS.";if(error.code===3)return"Tempo di acquisizione GPS scaduto. La registrazione resta in attesa.";return"Il GPS si è interrotto per un errore imprevisto."}
function bearing(a,b){const p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180,y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return(Math.atan2(y,x)*180/Math.PI+360)%360}
function bearingDelta(a,b){const delta=Math.abs(a-b)%360;return delta>180?360-delta:delta}
function evaluateGpsPoint(prev,p,pendingBreak=false,prevPrev=null){if(!prev)return{accept:true,breakBefore:false,reason:"first"};const metres=distance(prev,p),seconds=Number.isFinite(prev.time)?(p.time-prev.time)/1000:null;if(seconds!==null&&seconds<=0)return{accept:false,breakBefore:false,reason:"stale",metres,seconds};const speed=seconds&&seconds>0?metres/seconds:null;if(speed!==null&&speed>65)return{accept:false,breakBefore:false,reason:"impossible",metres,seconds,speed};const baseMinMove=Math.max(1.8,Math.min(6,(prev.accuracy+p.accuracy)*.06)),previousMove=prevPrev?distance(prevPrev,prev):0,turnDegrees=prevPrev&&previousMove>=2.5&&Math.max(prevPrev.accuracy||0,prev.accuracy||0,p.accuracy||0)<=35?bearingDelta(bearing(prevPrev,prev),bearing(prev,p)):0,turning=turnDegrees>=8,minMove=turning?Math.max(1.5,baseMinMove*.6):seconds!==null&&seconds>=4?Math.max(1.8,baseMinMove*.7):baseMinMove;if(seconds!==null&&seconds<.75&&metres<20)return{accept:false,breakBefore:false,reason:"rapid",metres,seconds,speed,minMove,turnDegrees};if(metres<minMove)return{accept:false,breakBefore:false,reason:"duplicate",metres,seconds,speed,minMove,turnDegrees};const uncertain=Math.max(150,(prev.accuracy+p.accuracy)*2),longGap=seconds!==null&&seconds>60&&metres>uncertain,wideGap=seconds!==null&&seconds>30&&metres>1000,poorRecovery=pendingBreak&&seconds!==null&&seconds>20&&metres>Math.max(200,uncertain);return{accept:true,breakBefore:longGap||wideGap||poorRecovery,reason:longGap||wideGap||poorRecovery?"gap":turning?"turn":"track",metres,seconds,speed,minMove,turnDegrees}}
function startGps(){if(state.watch!==null){stopGps();return}if(!navigator.geolocation){updateGpsUi("Geolocalizzazione non supportata da questo dispositivo o browser.");return}state.gpsNeedsBreak=false;try{const watchId=navigator.geolocation.watchPosition(pos=>{const lat=Number(pos.coords.latitude),lng=Number(pos.coords.longitude),accuracy=Number(pos.coords.accuracy),time=Number(pos.timestamp)||Date.now();if(!Number.isFinite(lat)||!Number.isFinite(lng)||!Number.isFinite(accuracy)){state.gpsNeedsBreak=true;updateGpsUi("Posizione GPS ricevuta ma non valida.");return}if(accuracy>100){state.gpsNeedsBreak=true;updateGpsUi("GPS attivo · attendo un segnale più preciso");return}const p={lat,lng,accuracy,time,breakBefore:false},decision=evaluateGpsPoint(state.tempRoute.at(-1),p,state.gpsNeedsBreak,state.tempRoute.at(-2));if(decision.accept){p.breakBefore=decision.breakBefore;state.tempRoute.push(p);state.gpsNeedsBreak=false;drawLive()}else if(decision.reason==="impossible"){state.gpsNeedsBreak=true;updateGpsUi("GPS attivo · salto anomalo ignorato");return}updateGpsUi(`GPS attivo · ${state.tempRoute.length} punti registrati${p.breakBefore?" · nuovo segmento":""}`)},error=>{const message=gpsErrorMessage(error);if(error.code===1)stopGps(message);else{state.gpsNeedsBreak=true;updateGpsUi(`${message} Registrazione ancora attiva.`)}},{enableHighAccuracy:true,maximumAge:0,timeout:20000});state.watch=watchId;updateGpsUi("GPS attivo · acquisizione della posizione…");if(typeof window.requestGpsWakeLock==="function")window.requestGpsWakeLock()}catch(error){state.watch=null;updateGpsUi("Impossibile avviare il GPS su questo dispositivo.")}}
function stopGps(message){if(state.watch!==null&&navigator.geolocation)navigator.geolocation.clearWatch(state.watch);state.watch=null;if(typeof window.releaseGpsWakeLock==="function")window.releaseGpsWakeLock();updateGpsUi(message||"GPS non attivo.")}function toggleGps(){if(state.watch===null)startGps();else stopGps()}function resetGps(){stopGps(state.tempRoute.length?`Percorso presente · ${state.tempRoute.length} punti`:"GPS non attivo.");drawLive()}
function distance(a,b){const R=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))}
function showSavedRoute(){const l=lesson();if(!l||l.route.length<2)return;show("savedMapView");if(!state.savedMap){state.savedMap=L.map("savedMap");L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(state.savedMap)}if(state.savedLine)state.savedMap.removeLayer(state.savedLine);const layers=routeSegments(l.route).filter(x=>x.length>1).map(x=>L.polyline(x,{weight:6}));state.savedLine=L.featureGroup(layers).addTo(state.savedMap);const bounds=state.savedLine.getBounds();if(bounds.isValid())state.savedMap.fitBounds(bounds,{padding:[20,20]});setTimeout(()=>state.savedMap.invalidateSize(),80)}
function syncLists(type){state.students.forEach(s=>{if(typeOf(s.category)!==type)return;s.checklist=normalizeItems(s.checklist,type);s.lessons=s.lessons.map(l=>({...l,checklist:normalizeItems(l.checklist,type)}))});saveLists();save()}
function renderChecklistManager(){const selected=state.managerType&&Array.isArray(LISTS[state.managerType]);document.querySelectorAll(".check-tabs button").forEach(b=>{const active=!!selected&&b.dataset.list===state.managerType;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))});$("checklistManagerPrompt").classList.toggle("hidden",!!selected);$("checklistManagerTools").classList.toggle("hidden",!selected);const box=$("checklistManagerList");box.classList.toggle("hidden",!selected);box.innerHTML="";if(!selected)return;LISTS[state.managerType].forEach((label,i)=>{const r=document.createElement("div");r.className="manager-row";r.innerHTML=`<div class="manager-label">${esc(label)}</div><div class="manager-actions"><button class="secondary up" ${i===0?"disabled":""}>↑</button><button class="secondary down" ${i===LISTS[state.managerType].length-1?"disabled":""}>↓</button><button class="secondary rename">Rinomina</button><button class="danger remove">Elimina</button></div>`;r.querySelector(".up").onclick=()=>moveChecklist(i,-1);r.querySelector(".down").onclick=()=>moveChecklist(i,1);r.querySelector(".rename").onclick=()=>renameChecklist(i);r.querySelector(".remove").onclick=()=>removeChecklist(i);box.appendChild(r)})}
function openChecklistManager(){state.managerType=null;renderChecklistManager();show("checklistManager")}
function addChecklist(){const input=$("newChecklistLabel"),label=input.value.trim();if(!label)return;if(LISTS[state.managerType].some(x=>x.toLowerCase()===label.toLowerCase()))return alert("Questa voce esiste già.");LISTS[state.managerType].push(label);input.value="";syncLists(state.managerType);renderChecklistManager()}
function renameChecklist(i){const old=LISTS[state.managerType][i],next=prompt("Nuovo nome",old);if(next===null||!next.trim())return;LISTS[state.managerType][i]=next.trim();state.students.forEach(s=>{if(typeOf(s.category)!==state.managerType)return;(s.checklist||[]).forEach(x=>{if(x.label===old)x.label=next.trim()});(s.lessons||[]).forEach(l=>(l.checklist||[]).forEach(x=>{if(x.label===old)x.label=next.trim()}))});saveLists();save();renderChecklistManager()}
function removeChecklist(i){const label=LISTS[state.managerType][i];if(!confirm(`Eliminare "${label}" da tutte le schede?`))return;LISTS[state.managerType].splice(i,1);syncLists(state.managerType);renderChecklistManager()}function moveChecklist(i,d){const t=i+d;if(t<0||t>=LISTS[state.managerType].length)return;[LISTS[state.managerType][i],LISTS[state.managerType][t]]=[LISTS[state.managerType][t],LISTS[state.managerType][i]];syncLists(state.managerType);renderChecklistManager()}

// Mostra una scelta riutilizzabile senza modificare le viste esistenti.
function chooseAction(title,message,actions){
  return new Promise(resolve=>{
    const modal=$("choiceModal"),buttons=$("choiceButtons");
    $("choiceTitle").textContent=title;
    $("choiceMessage").textContent=message;
    buttons.innerHTML="";
    actions.forEach(action=>{
      const button=document.createElement("button");
      button.type="button";
      button.textContent=action.label;
      if(action.className)button.className=action.className;
      button.onclick=()=>{modal.classList.add("hidden");resolve(action.value)};
      buttons.appendChild(button);
    });
    modal.classList.remove("hidden");
  });
}

// Crea un file JSON e usa la condivisione nativa quando il dispositivo la supporta.
async function exportJsonFile(data,fileName,shareTitle,useShare){
  let url=null;
  try{
    const json=JSON.stringify(data,null,2);
    JSON.parse(json);
    const blob=new Blob([json],{type:"application/json;charset=utf-8"});

    if(useShare&&typeof navigator.share==="function"&&typeof navigator.canShare==="function"&&typeof File!=="undefined"){
      try{
        const file=new File([json],fileName,{type:"application/json",lastModified:Date.now()});
        if(navigator.canShare({files:[file]})){
          try{
            await navigator.share({files:[file]});
            return;
          }catch(error){
            if(error&&error.name==="AbortError")return;
          }
        }
      }catch(error){
        if(error&&error.name==="AbortError")return;
      }
    }

    url=URL.createObjectURL(blob);
    let downloadSupported=false,downloadFailed=false;
    try{
      const link=document.createElement("a");
      downloadSupported="download" in link;
      link.href=url;
      link.download=fileName;
      link.style.display="none";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }catch(error){
      downloadFailed=true;
    }

    const shareUnavailable=typeof navigator.share!=="function";
    if(shareUnavailable&&(!downloadSupported||downloadFailed)){
      try{
        const opened=window.open(url,"_blank");
        if(!opened)window.location.href=url;
      }catch(error){
        try{window.location.href=url}catch(ignore){}
      }
    }

    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(error){
    if(error&&error.name==="AbortError")return;
    if(url)setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
}

function safeFilePart(value,fallback){
  const cleaned=String(value||"").trim().replace(/[\\/:*?"<>|]+/g,"_").replace(/\s+/g,"_");
  return cleaned||fallback;
}

// Esporta l'oggetto allievo completo, comprese guide, checklist e punti GPS annidati.
async function shareCurrentStudent(){
  const current=student();
  if(!current)return;
  const data={app:APP_NAME,version:APP_VERSION,type:"student",exportDate:new Date().toISOString(),student:JSON.parse(JSON.stringify(current))};
  const fileName=`${safeFilePart(current.lastName,"Senza_cognome")}_${safeFilePart(current.firstName,"Senza_nome")}.json`;
  await exportJsonFile(data,fileName,`Allievo ${nameOf(current)}`,true);
}

function openStudentMultiShare(){
  const box=$("studentMultiShareList");box.replaceChildren();
  [...state.students].sort(compareStudents).forEach(item=>{const label=document.createElement("label"),input=document.createElement("input"),text=document.createElement("span");label.className="detail-row";input.type="checkbox";input.value=item.id;text.textContent=`${nameOf(item)||"Senza nome"} · ${sectionLabel(item.category)}`;label.append(input,text);box.appendChild(label)});
  $("exportSelectedStudents").disabled=!state.students.length;show("studentMultiShare");
}

function selectedMultiStudentIds(){return[...$("studentMultiActionList").querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value)}
function updateStudentMultiActionButton(){const count=selectedMultiStudentIds().length,archive=state.multiStudentAction==="archive";$("executeStudentMultiAction").textContent=`${archive?"🗃️ ARCHIVIA":"🗑️ ELIMINA"} ${count?count+" ":""}ALLIEV${count===1?"O":"I"}`}
function openStudentMultiAction(action){state.multiStudentAction=action;const archive=action==="archive",items=state.students.filter(item=>!archive||!item.archived).sort((a,b)=>nameOf(a).localeCompare(nameOf(b),"it")),box=$("studentMultiActionList");$("studentMultiActionTitle").textContent=archive?"Archivia più allievi":"Elimina più allievi";$("studentMultiActionPrompt").textContent=archive?"Seleziona gli allievi attivi da archiviare. Guide, attività didattiche e percorsi GPS saranno conservati.":"Seleziona gli allievi da eliminare definitivamente con tutti i dati associati.";box.replaceChildren();items.forEach(item=>{const label=document.createElement("label"),input=document.createElement("input"),text=document.createElement("span");label.className="detail-row multi-student-option";input.type="checkbox";input.value=item.id;input.addEventListener("change",updateStudentMultiActionButton);text.textContent=`${nameOf(item)||"Senza nome"} · ${sectionLabel(item.category)}${item.archived?" · Archiviato":""}`;label.append(input,text);box.appendChild(label)});$("studentMultiActionEmpty").textContent=archive?"Nessun allievo attivo da archiviare.":"Nessun allievo da eliminare.";$("studentMultiActionEmpty").classList.toggle("hidden",items.length>0);$("executeStudentMultiAction").classList.toggle("danger",!archive);$("executeStudentMultiAction").disabled=!items.length;updateStudentMultiActionButton();show("studentMultiAction")}
function executeStudentMultiAction(){const ids=selectedMultiStudentIds();if(!ids.length){alert("Seleziona almeno un allievo.");return}const archive=state.multiStudentAction==="archive",count=ids.length,message=archive?`Archiviare ${count} alliev${count===1?"o":"i"}? Tutti i dati associati saranno conservati.`:`Eliminare definitivamente ${count} alliev${count===1?"o":"i"} con tutti i dati associati?`;if(!confirm(message))return;const targets=state.students.filter(item=>ids.includes(item.id));targets.forEach(item=>archive?markStudentArchived(item):removeStudentRecord(item));save();renderStudents();show("home")}

async function shareSelectedStudents(){
  const ids=[...$("studentMultiShareList").querySelectorAll('input[type="checkbox"]:checked')].map(input=>input.value),students=state.students.filter(item=>ids.includes(item.id));
  if(!students.length){alert("Seleziona almeno un allievo.");return}
  const data={app:APP_NAME,version:APP_VERSION,type:"students",exportDate:new Date().toISOString(),students:JSON.parse(JSON.stringify(students))};
  await exportJsonFile(data,`Agenda_Istruttore_${students.length}_allievi.json`,`${students.length} allievi`,true);
}

async function readJsonFile(file){
  try{return JSON.parse(await file.text())}
  catch{return null}
}

// Conserva le eventuali voci checklist personalizzate presenti nel file importato.
function prepareImportedStudent(raw,forcedId){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const category=LABELS[raw.category]?raw.category:UNCLASSIFIED_CATEGORY,listType=typeOf(category);
  const labels=[];
  if(Array.isArray(raw.checklist))raw.checklist.forEach(item=>{if(item&&typeof item.label==="string")labels.push(item.label)});
  if(Array.isArray(raw.lessons))raw.lessons.forEach(item=>{if(Array.isArray(item&&item.checklist))item.checklist.forEach(entry=>{if(entry&&typeof entry.label==="string")labels.push(entry.label)})});
  labels.forEach(label=>{if(label&&!LISTS[listType].includes(label))LISTS[listType].push(label)});
  saveLists();
  return normalizeStudent({...raw,id:forcedId||raw.id||uid(),category});
}

// Importa un singolo allievo e gestisce esplicitamente gli omonimi.
async function importStudentFile(file){
  const data=await readJsonFile(file);
  if(!data||data.app!==APP_NAME||typeof data.version!=="string"){alert("File non valido");return}
  const raws=data.type==="student"&&data.student?[data.student]:data.type==="students"&&Array.isArray(data.students)?data.students:null;
  if(!raws||!raws.length){alert("File non valido");return}
  let importedCount=0,updatedCount=0;
  for(const raw of raws){
  const first=String(raw.firstName||"").trim().toLocaleLowerCase("it"),last=String(raw.lastName||"").trim().toLocaleLowerCase("it");
  const duplicate=state.students.find(item=>item.firstName.trim().toLocaleLowerCase("it")===first&&item.lastName.trim().toLocaleLowerCase("it")===last);
  let action="copy";
  if(duplicate)action=await chooseAction("Allievo già presente",`${nameOf(duplicate)||"Questo allievo"} esiste già nell'archivio.`,[
    {label:"Aggiorna",value:"update"},{label:"Crea copia",value:"copy",className:"secondary"},{label:"Annulla",value:"cancel",className:"secondary"}
  ]);
  if(action==="cancel")continue;
  const imported=prepareImportedStudent(raw,action==="update"?duplicate.id:uid());
  if(!imported)continue;
  if(action==="update"){state.students[state.students.indexOf(duplicate)]=imported;updatedCount++}else{state.students.push(imported);importedCount++}
  }
  save();renderStudents();alert(raws.length===1?(updatedCount?"Allievo aggiornato":importedCount?"Allievo importato":"Importazione annullata"):`Importazione completata: ${importedCount} nuovi, ${updatedCount} aggiornati.`);
}

// Esporta l'archivio usando direttamente l'array allievi esistente.
function backupArchive(){
  const data={app:APP_NAME,version:APP_VERSION,type:"backup",exportDate:new Date().toISOString(),students:JSON.parse(JSON.stringify(state.students))};
  const date=new Date().toISOString().slice(0,10);
  exportJsonFile(data,`Agenda_Istruttore_Backup_${date}.json`,`Backup ${APP_NAME}`,false);
}

// Ripristina o unisce un backup senza cambiare chiavi o struttura del database.
async function restoreArchiveFile(file){
  const data=await readJsonFile(file);
  if(!data||data.app!==APP_NAME||typeof data.version!=="string"||data.type!=="backup"||!Array.isArray(data.students)){alert("File non valido");return}
  let action="replace";
  if(state.students.length)action=await chooseAction("Ripristina archivio","Sono già presenti dati nell'archivio.",[
    {label:"Sostituisci archivio",value:"replace",className:"danger"},{label:"Unisci archivi",value:"merge"},{label:"Annulla",value:"cancel",className:"secondary"}
  ]);
  if(action==="cancel")return;
  const usedIds=new Set(action==="merge"?state.students.map(item=>item.id):[]);
  const imported=data.students.map(raw=>{
    const requestedId=String(raw&&raw.id||""),importId=!requestedId||usedIds.has(requestedId)?uid():requestedId;
    usedIds.add(importId);
    return prepareImportedStudent(raw,importId);
  }).filter(Boolean);
  state.students=action==="merge"?[...state.students,...imported]:imported;
  save();renderStudents();alert("Archivio ripristinato");
}

function examinerName(x){return[compactPersonPart(x.lastName),compactPersonPart(x.firstName)].filter(Boolean).join(" ")}
function compareExaminers(a,b){return compactPersonPart(a.lastName).localeCompare(compactPersonPart(b.lastName),"it",{sensitivity:"base"})||compactPersonPart(a.firstName).localeCompare(compactPersonPart(b.firstName),"it",{sensitivity:"base"})}
function renderExaminers(){const box=$("examinerList");box.innerHTML="";$("emptyExaminers").classList.toggle("hidden",state.examiners.length>0);[...state.examiners].sort(compareExaminers).forEach(x=>{const b=document.createElement("button");b.className="student-card";b.innerHTML=`<strong>${esc(examinerName(x)||"Senza nome")}</strong><span class="meta">${x.habits.length} abitudini</span>`;b.onclick=()=>openExaminer(x.id);box.appendChild(b)})}
function renderHabits(){const box=$("habitList");box.innerHTML="";state.habitDraft.forEach((habit,index)=>{const row=document.createElement("div");row.className="manager-row";row.innerHTML=`<div class="manager-label">${esc(habit)}</div><div class="manager-actions"><button class="secondary rename-habit">Modifica</button><button class="danger remove-habit">Elimina</button></div>`;row.querySelector(".rename-habit").onclick=()=>{const next=prompt("Modifica abitudine",habit);if(next!==null&&next.trim()){state.habitDraft[index]=next.trim();renderHabits()}};row.querySelector(".remove-habit").onclick=()=>{state.habitDraft.splice(index,1);renderHabits()};box.appendChild(row)})}
function newExaminer(){state.examinerId=null;state.editingExaminer=null;state.habitDraft=[];$("examinerFormTitle").textContent="Nuovo esaminatore";$("examinerFirstName").value="";$("examinerLastName").value="";$("newHabit").value="";$("examinerNotes").value="";$("deleteExaminer").classList.add("hidden");renderHabits();show("examinerForm")}
function openExaminer(id){const x=state.examiners.find(e=>e.id===id);if(!x)return;state.examinerId=id;state.editingExaminer=id;state.habitDraft=[...x.habits];$("examinerFormTitle").textContent="Modifica esaminatore";$("examinerFirstName").value=x.firstName;$("examinerLastName").value=x.lastName;$("newHabit").value="";$("examinerNotes").value=x.notes||"";$("deleteExaminer").classList.remove("hidden");renderHabits();show("examinerForm")}
function addHabit(){const input=$("newHabit"),value=input.value.trim();if(!value)return;state.habitDraft.push(value);input.value="";renderHabits()}
function saveExaminer(){const firstName=$("examinerFirstName").value.trim(),lastName=$("examinerLastName").value.trim(),notes=$("examinerNotes").value;if(!firstName&&!lastName)return alert("Inserisci nome o cognome.");if(state.editingExaminer){const x=state.examiners.find(e=>e.id===state.editingExaminer);Object.assign(x,{firstName,lastName,notes,habits:[...state.habitDraft]})}else state.examiners.push({id:uid(),firstName,lastName,notes,habits:[...state.habitDraft]});saveExaminers();renderExaminers();show("examiners")}
function deleteExaminer(){if(!state.editingExaminer||!confirm("Eliminare questo esaminatore?"))return;state.examiners=state.examiners.filter(e=>e.id!==state.editingExaminer);saveExaminers();renderExaminers();show("examiners")}
function moveBackButtonsToBottom(){[["studentForm","backStudentForm"],["student","backHome"],["lesson","backLesson"],["savedMapView","backSavedMap"]].forEach(([viewId,buttonId])=>{const view=$(viewId),button=$(buttonId);if(view&&button){button.classList.add("full");view.appendChild(button)}})}
$("openSettings").onclick=()=>{window.AgendaAuth.updateAccountSummary();show("settings")};$("backSettings").onclick=()=>{renderStudents();show("home")};$("logout").onclick=logout;$("logoutHome").onclick=logout;
installPageTitles();
moveBackButtonsToBottom();
$("pinkSlipIssueDate").addEventListener("input",updatePinkSlipExpiry);
$("category").addEventListener("change",updatePinkSlipVisibility);
$("toggleLessonActivity").onclick=()=>setLessonActivityExpanded($("lessonChecklist").classList.contains("hidden"));
$("shareStudent").onclick=shareCurrentStudent;
$("importStudent").onclick=()=>$("studentFile").click();
$("studentFile").onchange=async event=>{const file=event.target.files[0];event.target.value="";if(file)await importStudentFile(file)};
$("shareStudents").onclick=openStudentMultiShare;$("exportSelectedStudents").onclick=shareSelectedStudents;$("backStudentMultiShare").onclick=()=>show("home");$("archiveStudents").onclick=()=>openStudentMultiAction("archive");$("deleteStudents").onclick=()=>openStudentMultiAction("delete");$("executeStudentMultiAction").onclick=executeStudentMultiAction;$("backStudentMultiAction").onclick=()=>show("home");
function toggleVoice(){const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return alert("Usa il microfono della tastiera del telefono.");if(!state.recognition){state.recognition=new SR();state.recognition.lang="it-IT";state.recognition.continuous=true;state.recognition.onresult=e=>{let t="";for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)t+=e.results[i][0].transcript+" ";(document.activeElement&&document.activeElement.id==="examinerNotes"?$("examinerNotes"):$("lessonNotes")).value+=t};state.recognition.onend=()=>{state.recognizing=false;$("voice").textContent="🎤 Detta"}}if(state.recognizing)state.recognition.stop();else{state.recognition.start();state.recognizing=true;$("voice").textContent="⏹ Ferma dettatura"}}
$("search").oninput=renderStudents;$("newStudent").onclick=newStudent;$("openExaminers").onclick=()=>{renderExaminers();show("examiners")};$("backExaminers").onclick=()=>{renderStudents();show("home")};$("newExaminer").onclick=newExaminer;$("backExaminerForm").onclick=()=>{renderExaminers();show("examiners")};$("saveExaminer").onclick=saveExaminer;$("deleteExaminer").onclick=deleteExaminer;$("addHabit").onclick=addHabit;$("newHabit").onkeydown=e=>{if(e.key==="Enter")addHabit()};document.querySelectorAll(".categories button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".categories button").forEach(x=>x.classList.remove("active"));b.classList.add("active");state.filter=b.dataset.f;renderStudents()});$("backStudentForm").onclick=()=>state.editingStudent?openStudent(state.editingStudent):show("home");$("saveStudent").onclick=saveStudent;$("backHome").onclick=()=>{renderStudents();show("home")};$("editStudent").onclick=editStudent;$("deleteStudent").onclick=deleteStudent;$("newLesson").onclick=newLesson;$("backLesson").onclick=()=>{stopGps();openStudent(state.studentId)};$("saveLesson").onclick=saveLesson;$("deleteLesson").onclick=deleteLesson;$("startGps").onclick=startGps;$("stopGps").onclick=stopGps;$("voice").onclick=toggleVoice;$("openSavedRoute").onclick=showSavedRoute;$("backSavedMap").onclick=()=>show("lesson");$("manageChecklists").onclick=openChecklistManager;$("backChecklistManager").onclick=()=>{renderStudents();show("home")};document.querySelectorAll(".check-tabs button").forEach(b=>b.onclick=()=>{state.managerType=b.dataset.list;renderChecklistManager()});$("addChecklistItem").onclick=addChecklist;$("newChecklistLabel").onkeydown=e=>{if(e.key==="Enter")addChecklist()};
document.querySelectorAll(".categories button[data-f]").forEach(button=>button.onclick=()=>selectStudentSection(button.dataset.f));
$("unclassifiedStudents").onclick=()=>selectStudentSection(UNCLASSIFIED_CATEGORY,"hidden","otherFunctions");
$("archiveSearch").oninput=renderArchivedStudents;
$("categoryHome").onclick=()=>show("home");
$("categoryBack").onclick=()=>show("home");
$("toggleStudentSearch").onclick=toggleStudentSearch;
$("showAllStudents").onclick=showAllStudents;
$("openOtherFunctions").onclick=()=>show("otherFunctions");
$("openRegister").onclick=()=>window.RegisterUI.open();
$("otherFunctionsHome").onclick=()=>show("home");
$("examinerFormHome").onclick=()=>show("home");
document.querySelectorAll("[data-other-functions-back]").forEach(button=>button.onclick=()=>show("otherFunctions"));
window.RegisterUI?.bind?.({show});
$("openArchive").onclick=()=>{renderArchivedStudents();show("studentArchive")};
$("backArchive").onclick=()=>{renderStudents();show("home")};
$("archiveStudent").onclick=archiveStudent;
$("restoreStudent").onclick=restoreStudent;
$("toggleLessons").onclick=()=>{state.lessonsExpanded=!state.lessonsExpanded;renderLessons()};
saveLists();save();if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js").catch(()=>{}));window.AgendaAuth.applicationReady(showApp,showLogin);

$("voiceExaminer")&&($("voiceExaminer").onclick=()=>{$("examinerNotes").focus();toggleVoice()});
$("openExaminers").onclick=()=>{renderExaminers();show("examiners")};
