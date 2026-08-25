"use strict";
(()=>{
  if(new URLSearchParams(location.search).get("road-report-diagnostic")!=="1")return;
  const KEY="agenda_road_report_diagnostics_v1",MAX=80;
  const activeView=()=>document.querySelector(".view.active")?.id||"none";
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch{return[]}};
  const record=(event,details={})=>{
    const rows=read();rows.push({at:new Date().toISOString(),event,view:activeView(),studentSelected:!!state.studentId,lessonSelected:!!state.lessonId,routePoints:Array.isArray(lesson()?.route)?lesson().route.length:0,...details});
    localStorage.setItem(KEY,JSON.stringify(rows.slice(-MAX)));render();
  };
  let panel;
  function render(){if(!panel)return;const rows=read();panel.querySelector("pre").textContent=JSON.stringify(rows,null,2)}
  function installPanel(){
    panel=document.createElement("details");panel.className="card road-diagnostic-panel";panel.innerHTML='<summary>DIAGNOSTICA REPORT STRADE</summary><p class="muted">Non registra coordinate GPS.</p><pre></pre><div class="toolbar"><button type="button" class="secondary copy-diagnostic">COPIA DIAGNOSTICA</button><button type="button" class="secondary clear-diagnostic">AZZERA</button></div>';
    $("savedMapView").appendChild(panel);panel.querySelector(".copy-diagnostic").onclick=async()=>{try{await navigator.clipboard.writeText(panel.querySelector("pre").textContent)}catch{}};panel.querySelector(".clear-diagnostic").onclick=()=>{localStorage.removeItem(KEY);record("diagnostics-cleared")};render();
  }
  document.addEventListener("click",event=>{if(event.target.closest("#generateRoadReport"))record("generate-click",{buttonType:event.target.closest("button")?.type||""})},true);
  window.addEventListener("error",event=>record("window-error",{message:String(event.message||"Errore sconosciuto")}));
  window.addEventListener("unhandledrejection",event=>record("unhandled-rejection",{message:String(event.reason&&event.reason.message||event.reason||"Errore sconosciuto")}));
  window.addEventListener("pagehide",()=>record("pagehide"));window.addEventListener("pageshow",event=>record("pageshow",{persisted:!!event.persisted,navigation:performance.getEntriesByType("navigation")[0]?.type||"unknown"}));
  document.addEventListener("visibilitychange",()=>record("visibilitychange",{visibility:document.visibilityState}));
  new MutationObserver(()=>record("view-change")).observe(document.querySelector("main"),{subtree:true,attributes:true,attributeFilter:["class"]});
  installPanel();record("diagnostics-started",{cache:"agenda-istruttori-v1-21-premium-r10-photo-auth-prep-diagnostic"});
})();
