"use strict";
(()=>{
  const LOG_KEY="agenda_road_report_diagnostics_v2";
  const ACTIVE_KEY="agenda_road_report_diagnostics_active_v2";
  const MAX_ROWS=120;
  let panel=null;
  let lastView="";
  let fetchObserved=false;

  const active=()=>localStorage.getItem(ACTIVE_KEY)==="1";
  const activeView=()=>document.querySelector(".view.active")?.id||"none";
  const currentLesson=()=>{try{return typeof lesson==="function"?lesson():null}catch{return null}};
  const read=()=>{try{const value=JSON.parse(localStorage.getItem(LOG_KEY)||"[]");return Array.isArray(value)?value:[]}catch{return[]}};
  const routeState=()=>{
    const item=currentLesson(),route=Array.isArray(item?.route)?item.route:[];
    return{
      studentId:typeof state!=="undefined"&&state.studentId?String(state.studentId):null,
      lessonId:item?.id?String(item.id):(typeof state!=="undefined"&&state.lessonId?String(state.lessonId):null),
      lessonFound:!!item,
      routeAvailable:route.length>=2,
      routePoints:route.length,
      savedMapReady:!!(typeof state!=="undefined"&&state.savedMap),
      savedLineReady:!!(typeof state!=="undefined"&&state.savedLine)
    };
  };
  function record(event,details={}){
    if(!active())return;
    try{
      const rows=read();
      rows.push({timestamp:new Date().toISOString(),event,view:activeView(),...routeState(),...details});
      localStorage.setItem(LOG_KEY,JSON.stringify(rows.slice(-MAX_ROWS)));
    }catch{}
    renderPanel();
    updateHomeButton();
  }
  function readableLog(){
    return read().map((row,index)=>{
      const details=Object.entries(row).filter(([key])=>!["timestamp","event"].includes(key)).map(([key,value])=>`${key}: ${typeof value==="object"?JSON.stringify(value):value}`).join("\n");
      return `${index+1}. ${row.timestamp}\nEVENTO: ${row.event}${details?`\n${details}`:""}`;
    }).join("\n\n");
  }
  function ensurePanel(){
    if(panel)return panel;
    panel=document.createElement("div");
    panel.className="card road-diagnostic-panel hidden";
    panel.innerHTML='<strong>DIAGNOSTICA ATTIVA</strong><p class="muted">Il log non contiene coordinate GPS.</p><pre class="road-diagnostic-log"></pre><div class="toolbar"><button type="button" class="secondary copy-road-diagnostic">COPIA DIAGNOSTICA</button><button type="button" class="secondary clear-road-diagnostic">AZZERA DIAGNOSTICA</button></div>';
    panel.querySelector(".copy-road-diagnostic").addEventListener("click",async()=>{
      const text=readableLog();
      try{await navigator.clipboard.writeText(text);record("diagnostic-copied")}
      catch(error){record("diagnostic-copy-failed",{message:String(error?.message||error)})}
    });
    panel.querySelector(".clear-road-diagnostic").addEventListener("click",()=>{
      localStorage.removeItem(LOG_KEY);
      localStorage.removeItem(ACTIVE_KEY);
      panel.classList.add("hidden");
      updateHomeButton();
    });
    return panel;
  }
  function renderPanel(){
    if(!panel)return;
    panel.querySelector(".road-diagnostic-log").textContent=readableLog()||"Nessun evento registrato.";
  }
  function showPanel(parent){
    const element=ensurePanel();
    parent.appendChild(element);
    element.classList.remove("hidden");
    renderPanel();
  }
  function ensureSavedButton(){
    const actions=document.querySelector("#savedMapView .saved-route-actions");
    if(!actions||$("enableRoadDiagnostics"))return;
    const button=document.createElement("button");
    button.id="enableRoadDiagnostics";
    button.type="button";
    button.className="secondary full";
    button.textContent="DIAGNOSTICA REPORT";
    button.addEventListener("click",()=>{
      localStorage.setItem(ACTIVE_KEY,"1");
      observeFetch();
      showPanel($("savedMapView"));
      record("diagnostics-activated",{navigation:performance.getEntriesByType("navigation")[0]?.type||"unknown"});
    });
    actions.appendChild(button);
  }
  function updateHomeButton(){
    const home=$("home");
    if(!home)return;
    let button=$("showRoadDiagnostics");
    if(!read().length){button?.remove();return}
    if(!button){
      button=document.createElement("button");
      button.id="showRoadDiagnostics";
      button.type="button";
      button.className="secondary full";
      button.textContent="MOSTRA DIAGNOSTICA REPORT";
      button.addEventListener("click",()=>showPanel(home));
      const intro=home.querySelector(".dashboard-intro");
      intro?.insertAdjacentElement("afterend",button);
    }
  }
  function observeFetch(){
    if(fetchObserved)return;
    fetchObserved=true;
    const originalFetch=window.fetch;
    window.fetch=async function(input,options){
      let isNominatim=false;
      try{const url=new URL(typeof input==="string"?input:input.url,location.href);isNominatim=url.hostname==="nominatim.openstreetmap.org"&&url.pathname.includes("/reverse")}catch{}
      if(!isNominatim)return originalFetch.apply(this,arguments);
      record("nominatim-request",{method:String(options?.method||"GET")});
      try{
        const response=await originalFetch.apply(this,arguments);
        record("nominatim-response",{ok:response.ok,status:response.status});
        return response;
      }catch(error){record("nominatim-failure",{name:String(error?.name||"Error"),message:String(error?.message||error)});throw error}
    };
  }

  ensureSavedButton();
  updateHomeButton();
  if(active()){
    observeFetch();
    record("diagnostics-resumed",{navigation:performance.getEntriesByType("navigation")[0]?.type||"unknown"});
  }
  document.addEventListener("click",event=>{
    if(!active())return;
    const button=event.target.closest("#generateRoadReport");
    if(!button)return;
    record("generate-click-received",{buttonType:button.type||"",defaultPrevented:event.defaultPrevented});
    record("report-generation-start",{online:navigator.onLine!==false});
  },true);
  window.addEventListener("error",event=>record("javascript-error",{message:String(event.message||"Errore sconosciuto"),source:String(event.filename||"").split("/").pop()||"unknown",line:Number(event.lineno||0)}));
  window.addEventListener("unhandledrejection",event=>record("unhandled-rejection",{message:String(event.reason?.message||event.reason||"Errore sconosciuto")}));
  window.addEventListener("pagehide",event=>record("pagehide",{persisted:!!event.persisted}));
  window.addEventListener("pageshow",event=>record("pageshow",{persisted:!!event.persisted,navigation:performance.getEntriesByType("navigation")[0]?.type||"unknown"}));
  window.addEventListener("beforeunload",()=>record("beforeunload"));
  document.addEventListener("visibilitychange",()=>record("visibilitychange",{visibility:document.visibilityState}));
  lastView=activeView();
  new MutationObserver(()=>{
    const next=activeView();
    if(next===lastView)return;
    const previous=lastView;
    lastView=next;
    record("view-change",{from:previous,to:next});
    if(next==="home")record("home-visible",{from:previous,reason:"Cambio della vista attiva rilevato; origine non determinabile senza alterare la navigazione."});
  }).observe(document.querySelector("main"),{subtree:true,attributes:true,attributeFilter:["class"]});
})();
