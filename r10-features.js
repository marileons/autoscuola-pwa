"use strict";

/* Funzioni aggiuntive r10: Wake Lock, report strade manuale e report PDF allievo. */
(()=>{
  const ROAD_CACHE_KEY="agenda_road_report_cache_r10";
  const ROAD_ENDPOINT="https://nominatim.openstreetmap.org/reverse";
  const MAX_ROAD_REQUESTS=26;
  const ROAD_SAMPLE_MIN_METRES=15;
  const REQUEST_INTERVAL_MS=1100;
  let wakeLock=null;
  let wakeLockGeneration=0;
  let wakeRetryTimer=null;

  const wakeStatus=message=>{
    const element=$("wakeLockStatus");
    if(element)element.textContent=message;
  };

  const gpsRecordingActive=()=>state.watch!==null||!!window.ExaminerRoutesUI?.isRecording?.();

  async function requestGpsWakeLock(){
    if(!gpsRecordingActive())return;
    if(!("wakeLock" in navigator)){
      wakeStatus("Schermo attivo non disponibile su questo browser; il GPS continua normalmente.");
      return;
    }
    if(document.visibilityState!=="visible"){
      wakeStatus("Schermo attivo sospeso mentre l’app è in background.");
      return;
    }
    if(wakeLock)return;
    const generation=++wakeLockGeneration;
    try{
      const sentinel=await navigator.wakeLock.request("screen");
      if(!gpsRecordingActive()||document.visibilityState!=="visible"||generation!==wakeLockGeneration){
        try{await sentinel.release()}catch{}
        return;
      }
      wakeLock=sentinel;
      wakeStatus("Schermo mantenuto attivo durante la registrazione GPS.");
      sentinel.addEventListener("release",()=>{
        if(generation!==wakeLockGeneration)return;
        wakeLock=null;
        wakeStatus(!gpsRecordingActive()?"Schermo attivo rilasciato.":"Mantenimento schermo temporaneamente sospeso.");
        clearTimeout(wakeRetryTimer);
        if(gpsRecordingActive()&&document.visibilityState==="visible")wakeRetryTimer=setTimeout(requestGpsWakeLock,500);
      },{once:true});
    }catch(error){
      if(generation===wakeLockGeneration){
        wakeLock=null;
        wakeStatus("Impossibile mantenere acceso lo schermo; il GPS continua normalmente.");
      }
    }
  }

  async function releaseGpsWakeLock(){
    clearTimeout(wakeRetryTimer);
    wakeRetryTimer=null;
    wakeLockGeneration++;
    const sentinel=wakeLock;
    wakeLock=null;
    wakeStatus("Schermo attivo rilasciato.");
    if(sentinel)try{await sentinel.release()}catch{}
  }

  window.requestGpsWakeLock=requestGpsWakeLock;
  window.releaseGpsWakeLock=releaseGpsWakeLock;
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&gpsRecordingActive())requestGpsWakeLock();
    else if(document.visibilityState!=="visible"&&gpsRecordingActive())wakeStatus("Schermo attivo sospeso mentre l’app è in background.");
  });
  window.addEventListener("pagehide",releaseGpsWakeLock);

  function routeDistance(route){
    let metres=0;
    for(let index=1;index<route.length;index++)if(!route[index].breakBefore)metres+=distance(route[index-1],route[index]);
    return metres;
  }

  function routeDuration(route){
    const first=route.find(point=>Number.isFinite(point.time)),last=[...route].reverse().find(point=>Number.isFinite(point.time));
    return first&&last&&last.time>first.time?last.time-first.time:0;
  }

  function formatDistance(metres){
    return metres>=1000?`${(metres/1000).toFixed(1).replace(".",",")} km`:`${Math.round(metres)} m`;
  }

  function formatDuration(milliseconds){
    if(!milliseconds)return"Non disponibile";
    const minutes=Math.max(1,Math.round(milliseconds/60000)),hours=Math.floor(minutes/60),rest=minutes%60;
    return hours?`${hours} h ${rest} min`:`${minutes} min`;
  }

  function sampleRoute(route,maxRequests=MAX_ROAD_REQUESTS){
    const source=Array.isArray(route)?route:[],limit=Math.max(0,Math.floor(Number(maxRequests)||0));
    if(!limit||!source.length)return[];
    const metres=(a,b)=>{
      const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLng=(b.lng-a.lng)*rad;
      const value=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLng/2)**2;
      return 12742000*Math.asin(Math.sqrt(Math.min(1,value)));
    };
    const bearing=(a,b)=>Math.atan2(Math.sin((b.lng-a.lng)*Math.PI/180)*Math.cos(b.lat*Math.PI/180),Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lng-a.lng)*Math.PI/180))*180/Math.PI;
    const valid=[];
    for(let index=0;index<source.length;index++){
      const point=source[index];
      if(Number.isFinite(point?.lat)&&Number.isFinite(point?.lng))valid.push({lat:point.lat,lng:point.lng,index,breakBefore:point.breakBefore===true});
    }
    if(!valid.length)return[];
    const candidates=[valid[0]];
    for(let index=1;index<valid.length-1;index++){
      const point=valid[index],previous=candidates[candidates.length-1];
      if(point.breakBefore||metres(previous,point)>=ROAD_SAMPLE_MIN_METRES)candidates.push(point);
    }
    const last=valid[valid.length-1];
    if(last.index!==candidates[candidates.length-1].index){
      const previous=candidates[candidates.length-1];
      if(candidates.length>1&&!last.breakBefore&&metres(previous,last)<ROAD_SAMPLE_MIN_METRES)candidates[candidates.length-1]=last;
      else candidates.push(last);
    }
    if(candidates.length<=limit)return candidates.map(({lat,lng})=>({lat,lng}));

    let travelled=0;
    candidates[0].travelled=0;
    for(let index=1;index<candidates.length;index++){
      if(!candidates[index].breakBefore)travelled+=metres(candidates[index-1],candidates[index]);
      candidates[index].travelled=travelled;
    }
    const selected=new Set([0,candidates.length-1]);
    const canSelect=index=>!selected.has(index)&&[...selected].every(chosen=>metres(candidates[index],candidates[chosen])>=ROAD_SAMPLE_MIN_METRES);
    for(let index=1;index<candidates.length-1&&selected.size<limit;index++)if(candidates[index].breakBefore&&canSelect(index))selected.add(index);

    const turns=[];
    for(let index=1;index<candidates.length-1;index++){
      if(candidates[index].breakBefore||candidates[index+1].breakBefore)continue;
      let angle=Math.abs(bearing(candidates[index-1],candidates[index])-bearing(candidates[index],candidates[index+1]));
      angle=Math.min(angle,360-angle);
      if(angle>=20)turns.push({index,angle});
    }
    turns.sort((a,b)=>b.angle-a.angle);
    const turnTarget=Math.min(turns.length,Math.floor(limit*.4));
    let turnCount=0;
    for(const turn of turns)if(selected.size<limit&&turnCount<turnTarget&&canSelect(turn.index)){selected.add(turn.index);turnCount++}

    for(let slot=1;slot<limit&&selected.size<limit;slot++){
      const target=travelled*slot/limit;
      let best=-1,bestDelta=Infinity;
      for(let index=1;index<candidates.length-1;index++)if(canSelect(index)){
        const delta=Math.abs(candidates[index].travelled-target);
        if(delta<bestDelta){best=index;bestDelta=delta}
      }
      if(best>=0)selected.add(best);
    }
    return [...selected].sort((a,b)=>a-b).map(index=>({lat:candidates[index].lat,lng:candidates[index].lng}));
  }

  function loadRoadCache(){
    try{const value=JSON.parse(localStorage.getItem(ROAD_CACHE_KEY)||"{}");return value&&typeof value==="object"?value:{}}catch{return{}}
  }

  function saveRoadCache(cache){
    try{
      const entries=Object.entries(cache).sort((a,b)=>(b[1].savedAt||0)-(a[1].savedAt||0)).slice(0,500);
      localStorage.setItem(ROAD_CACHE_KEY,JSON.stringify(Object.fromEntries(entries)));
    }catch{}
  }

  function roadCacheKey(point){return`${point.lat.toFixed(4)},${point.lng.toFixed(4)}`}

  function roadNameFromResponse(data){
    const address=data&&data.address||{};
    return address.road||address.pedestrian||address.motorway||address.trunk||address.cycleway||address.path||address.footway||data&&data.name||"";
  }

  async function reverseRoad(point,cache){
    const key=roadCacheKey(point),cached=cache[key];
    if(cached&&typeof cached.name==="string")return{name:cached.name,cached:true};
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      const url=new URL(ROAD_ENDPOINT);
      url.searchParams.set("format","jsonv2");
      url.searchParams.set("lat",String(point.lat));
      url.searchParams.set("lon",String(point.lng));
      url.searchParams.set("zoom","17");
      url.searchParams.set("addressdetails","1");
      url.searchParams.set("layer","address");
      url.searchParams.set("accept-language","it");
      const response=await fetch(url,{headers:{Accept:"application/json"},signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json(),name=roadNameFromResponse(data);
      cache[key]={name,savedAt:Date.now()};
      saveRoadCache(cache);
      return{name,cached:false};
    }finally{clearTimeout(timeout)}
  }

  function resetRoadReport(){
    $("roadReportPanel").classList.add("hidden");
    $("roadReportPanel").replaceChildren();
    $("toggleRoadReport").classList.add("hidden");
    $("toggleRoadReport").setAttribute("aria-expanded","true");
    $("toggleRoadReport").textContent="NASCONDI REPORT";
    $("roadReportStatus").textContent="Il report viene creato solo su richiesta e richiede una connessione Internet.";
    $("generateRoadReport").disabled=false;
  }

  function reportItemLabel(value){return value||"Tratto non identificato"}

  async function generateRoadReport(){
    const currentLesson=lesson(),currentStudent=student(),button=$("generateRoadReport");
    if(!currentLesson||!Array.isArray(currentLesson.route)||currentLesson.route.length<2){
      $("roadReportStatus").textContent="Percorso GPS non disponibile.";
      return;
    }
    if(!navigator.onLine){
      $("roadReportStatus").textContent="Connessione assente: il report strade non può essere generato. I punti GPS restano invariati.";
      return;
    }
    window.AgendaRoadReportCoordinator=window.AgendaRoadReportCoordinator||{owner:null,acquire(owner){if(this.owner&&this.owner!==owner)return false;this.owner=owner;return true},release(owner){if(this.owner===owner)this.owner=null}};
    if(!window.AgendaRoadReportCoordinator.acquire("lesson")){
      $("roadReportStatus").textContent="Un altro report delle vie è già in elaborazione su questo dispositivo.";
      return;
    }
    const route=currentLesson.route.map(point=>({lat:point.lat,lng:point.lng,time:point.time,accuracy:point.accuracy,breakBefore:!!point.breakBefore}));
    const samples=sampleRoute(route);
    const cache=loadRoadCache(),results=[];
    button.disabled=true;
    $("roadReportStatus").textContent=`Analisi manuale in corso: 0/${samples.length} punti rappresentativi…`;
    try{
      for(let index=0;index<samples.length;index++){
        let result;
        try{result=await reverseRoad(samples[index],cache)}catch{result={name:"",cached:false,error:true}}
        results.push(result);
        $("roadReportStatus").textContent=`Analisi manuale in corso: ${index+1}/${samples.length} punti rappresentativi…`;
        if(index<samples.length-1&&!result.cached)await new Promise(resolve=>setTimeout(resolve,REQUEST_INTERVAL_MS));
      }
      const ordered=[];
      results.forEach(result=>{const name=reportItemLabel(result.name);if(name!==ordered.at(-1))ordered.push(name)});
      const generated=new Date(),date=new Date(currentLesson.createdAt),metres=routeDistance(route),duration=routeDuration(route);
      const list=ordered.map((name,index)=>`<li><span>${index+1}</span><strong>${esc(name)}</strong></li>`).join("");
      $("roadReportPanel").innerHTML=`<div class="road-report-heading"><div><span class="report-kicker">REPORT STRADE</span><h2>${esc(nameOf(currentStudent)||"Allievo")}</h2></div><span>${date.toLocaleDateString("it-IT")}</span></div><div class="road-report-meta"><span><strong>Distanza</strong>${formatDistance(metres)}</span><span><strong>Durata</strong>${formatDuration(duration)}</span><span><strong>Campioni</strong>${samples.length}</span></div><div class="road-endpoint"><small>PARTENZA</small><strong>${esc(reportItemLabel(results[0]&&results[0].name))}</strong></div><ol class="road-list">${list}</ol><div class="road-endpoint arrival"><small>ARRIVO</small><strong>${esc(reportItemLabel(results.at(-1)&&results.at(-1).name))}</strong></div><p class="road-attribution">Generato ${generated.toLocaleString("it-IT")} · Dati © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>, ODbL.</p>`;
      $("roadReportPanel").classList.remove("hidden");
      $("toggleRoadReport").classList.remove("hidden");
      $("toggleRoadReport").setAttribute("aria-expanded","true");
      $("toggleRoadReport").textContent="NASCONDI REPORT";
      const unidentified=results.filter(result=>!result.name).length;
      $("roadReportStatus").textContent=unidentified?`Report completato con ${unidentified} tratti non identificati.`:"Report strade completato.";
    }finally{button.disabled=false;window.AgendaRoadReportCoordinator.release("lesson")}
  }

  function toggleRoadReport(){
    const panel=$("roadReportPanel"),show=panel.classList.contains("hidden");
    panel.classList.toggle("hidden",!show);
    $("toggleRoadReport").setAttribute("aria-expanded",String(show));
    $("toggleRoadReport").textContent=show?"NASCONDI REPORT":"MOSTRA REPORT";
  }

  function statusLabel(status){return status==="good"?"Acquisito":status==="repeat"?"Da ripetere":"Non valutato"}

  function drivingErrorsReportHtml(item){
    const errors=window.DrivingErrors.normalizeErrors(item&&item.errors);
    if(!errors.length)return'<h4>Errori segnalati</h4><p>Nessun errore segnalato.</p>';
    const rows=errors.map((error,index)=>`<tr><td>${index+1}</td><td>${new Date(error.occurredAt).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</td><td>${esc(window.DrivingErrors.categoryLabel(error.category))}</td><td>${esc(error.note||"—")}</td><td>${error.locationStatus==="available"?"GPS presente":"GPS non disponibile"}</td></tr>`).join("");
    return`<h4>Errori segnalati (${errors.length})</h4><table><thead><tr><th>N.</th><th>Ora</th><th>Categoria</th><th>Nota</th><th>Posizione</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function studentReportHtmlBase(current){
    const generated=new Date(),checklistRows="";
    const lessons=[...(current.lessons||[])].sort((a,b)=>a.createdAt-b.createdAt).map((item,index)=>{
      const selected=(item.checklist||[]).filter(entry=>entry.status!=="none").map(entry=>`<li>${esc(entry.label)} — ${statusLabel(entry.status)}</li>`).join("")||"<li>Nessuna valutazione registrata</li>";
      const date=new Date(item.createdAt),metres=routeDistance(item.route||[]),gpsDuration=routeDuration(item.route||[]),timing=lessonTiming(item),duration=item.duration||(timing.source==="gps"?`${formatDuration(timing.elapsed)} (GPS)`:"Non disponibile");
      return`<section class="lesson"><h3>Guida ${index+1}</h3><p><strong>${formatLessonDate(date)}</strong><br>${lessonTimeRange(item)}</p><dl><div><dt>Durata</dt><dd>${esc(duration)}</dd></div><div><dt>Durata GPS</dt><dd>${formatDuration(gpsDuration)}</dd></div><div><dt>Distanza GPS</dt><dd>${item.route&&item.route.length>1?formatDistance(metres):"GPS non usato"}</dd></div></dl><p><strong>Note:</strong> ${esc(item.notes||"Nessuna nota")}</p><ul>${selected}</ul>${drivingErrorsReportHtml(item)}</section>`;
    }).join("")||'<p class="empty-report">Nessuna guida registrata.</p>';
    return`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Report allievo - ${esc(nameOf(current)||"Allievo")}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#17242d;background:#eef2f3}.toolbar{position:sticky;top:0;display:flex;gap:8px;padding:10px;background:#0d1b24;color:#fff}.toolbar button{border:0;border-radius:10px;padding:10px 14px;background:#1687e8;color:#fff;font-weight:800}.toolbar button.secondary{background:#344955}.sheet{width:min(100%,210mm);min-height:297mm;margin:14px auto;padding:16mm;background:#fff;box-shadow:0 10px 28px #0002}.brand{border-bottom:3px solid #1687e8;padding-bottom:10px}.brand h1{margin:0;font-size:24px}.brand p{margin:2px 0 0;color:#526772}.title{margin:24px 0 14px;color:#12616c}.data-grid,dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.data-grid div,dl div{padding:9px;border:1px solid #d7e0e4;border-radius:8px}.data-grid strong,dt{display:block;color:#526772;font-size:11px;text-transform:uppercase}.data-grid span,dd{margin:2px 0 0;font-weight:700}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #d7e0e4;text-align:left}.lesson{break-inside:avoid;margin:14px 0;padding:12px;border:1px solid #d7e0e4;border-left:4px solid #d63c49;border-radius:8px}.lesson h3{margin:0 0 8px}.lesson ul{margin-bottom:0}.empty-report{padding:14px;background:#f2f5f6}.footer{margin-top:24px;padding-top:10px;border-top:1px solid #ccd7dc;text-align:center;color:#667983;font-size:12px}.hint{margin-left:auto;align-self:center;color:#c9d4da;font-size:12px}@media(max-width:650px){.sheet{margin:0;min-height:0;padding:18px}.data-grid,dl{grid-template-columns:1fr}.hint{display:none}}@media print{body{background:#fff}.toolbar{display:none}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}}</style></head><body><div class="toolbar"><button onclick="window.print()">STAMPA / SALVA PDF</button><button class="secondary" onclick="window.close()">CHIUDI</button><span class="hint">Su iPhone/Android usa il pannello di stampa per salvare o condividere il PDF.</span></div><article class="sheet"><header class="brand"><h1>AGENDA ISTRUTTORI</h1><p>Report Allievo</p></header><h2 class="title">${esc(nameOf(current)||"Allievo")}</h2><div class="data-grid"><div><strong>Categoria</strong><span>${esc(sectionLabel(current.category))}</span></div><div><strong>Patente</strong><span>${esc(current.license||"Non indicata")}</span></div><div><strong>Telefono</strong><span>${esc(current.phone||"Non indicato")}</span></div><div><strong>Stato</strong><span>${current.archived?"Archiviato":"Attivo"}</span></div><div><strong>Foglio rosa</strong><span>${formatStoredDate(current.pinkSlipIssueDate)}</span></div><div><strong>Generato</strong><span>${generated.toLocaleString("it-IT")}</span></div></div><h2>Note</h2><p>${esc(current.notes||"Nessuna nota")}</p><h2>Percorso didattico</h2><table><thead><tr><th>Voce</th><th>Stato</th></tr></thead><tbody>${checklistRows}</tbody></table><h2>Storico guide (${current.lessons.length})</h2>${lessons}<footer class="footer">© 2026 Mario Leoni — Tutti i diritti riservati.</footer></article></body></html>`;
  }

  function studentReportHtml(current){
    const base=studentReportHtmlBase(current);
    const notes=base.match(/<h2>Note<\/h2><p>[\s\S]*?<\/p>/)?.[0]||"";
    let report=base
      .replace(notes,"")
      .replace(/<h2>Percorso didattico<\/h2><table>[\s\S]*?<\/table>/,"")
      .replace("<h2>Storico guide (","<h2>STORICO GUIDE (")
      .replace('<footer class="footer">',`${notes}<footer class="footer">`);
    if(typeof current.photo==="string"&&/^data:image\/(?:jpeg|png|webp);base64,/i.test(current.photo)){
      report=report
        .replace("</head>",'<style>.report-identity{display:grid;grid-template-columns:minmax(0,1fr) 105px;gap:16px;align-items:center}.report-photo{width:100px;height:120px;border-radius:12px;object-fit:cover;border:1px solid #ccd7dc}@media(max-width:650px){.report-identity{grid-template-columns:minmax(0,1fr) 82px}.report-photo{width:78px;height:96px}}</style></head>')
        .replace(/<h2 class="title">([\s\S]*?)<\/h2><div class="data-grid">/,`<div class="report-identity"><h2 class="title">$1</h2><img class="report-photo" src="${current.photo}" alt="Foto allievo"></div><div class="data-grid">`);
    }
    return report;
  }

  function exportStudentPdf(){
    const current=student();
    if(!current)return;
    const reportWindow=window.open("","_blank");
    if(!reportWindow){alert("Consenti l’apertura della finestra del report PDF e riprova.");return}
    reportWindow.document.open();
    reportWindow.document.write(studentReportHtml(JSON.parse(JSON.stringify(current))));
    reportWindow.document.close();
  }

  $("generateRoadReport").addEventListener("click",generateRoadReport);
  $("toggleRoadReport").addEventListener("click",toggleRoadReport);
  $("openSavedRoute").addEventListener("click",resetRoadReport);
  $("exportStudentPdf").addEventListener("click",exportStudentPdf);
  resetRoadReport();

  window.__agendaR10Test={sampleRoute,routeDistance,routeDuration,roadNameFromResponse,studentReportHtml};
})();
