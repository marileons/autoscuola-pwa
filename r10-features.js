"use strict";

/* Funzioni aggiuntive r10: Wake Lock, report strade manuale e report PDF allievo. */
(()=>{
  const ROAD_CACHE_KEY="agenda_road_report_cache_r10";
  const ROAD_ENDPOINT="https://nominatim.openstreetmap.org/reverse";
  const MAX_ROAD_REQUESTS=10;
  const REQUEST_INTERVAL_MS=1100;
  const diagnosticCheckpoint=(event,details={})=>{if(typeof window.roadReportDiagnosticCheckpoint==="function")window.roadReportDiagnosticCheckpoint(event,details)};
  let wakeLock=null;
  let wakeLockGeneration=0;
  let wakeRetryTimer=null;

  const wakeStatus=message=>{
    const element=$("wakeLockStatus");
    if(element)element.textContent=message;
  };

  async function requestGpsWakeLock(){
    if(state.watch===null)return;
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
      if(state.watch===null||document.visibilityState!=="visible"||generation!==wakeLockGeneration){
        try{await sentinel.release()}catch{}
        return;
      }
      wakeLock=sentinel;
      wakeStatus("Schermo mantenuto attivo durante la registrazione GPS.");
      sentinel.addEventListener("release",()=>{
        if(generation!==wakeLockGeneration)return;
        wakeLock=null;
        wakeStatus(state.watch===null?"Schermo attivo rilasciato.":"Mantenimento schermo temporaneamente sospeso.");
        clearTimeout(wakeRetryTimer);
        if(state.watch!==null&&document.visibilityState==="visible")wakeRetryTimer=setTimeout(requestGpsWakeLock,500);
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
    if(document.visibilityState==="visible"&&state.watch!==null)requestGpsWakeLock();
    else if(document.visibilityState!=="visible"&&state.watch!==null)wakeStatus("Schermo attivo sospeso mentre l’app è in background.");
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
    diagnosticCheckpoint("representative-scan-start",{routePoints:source.length,limit});
    if(!limit||!source.length){diagnosticCheckpoint("representative-scan-end",{validPoints:0,segments:0,representativeCount:0});return[]}
    let validCount=0,segmentStarts=0;
    for(let index=0;index<source.length;index++){
      const point=source[index];
      if(!Number.isFinite(point?.lat)||!Number.isFinite(point?.lng))continue;
      if(validCount>0&&point.breakBefore===true)segmentStarts++;
      validCount++;
    }
    diagnosticCheckpoint("representative-count-end",{validPoints:validCount,segments:segmentStarts});
    if(!validCount){diagnosticCheckpoint("representative-scan-end",{validPoints:0,segments:0,representativeCount:0});return[]}
    if(validCount<=limit){
      const all=[];
      for(let index=0;index<source.length;index++){const point=source[index];if(Number.isFinite(point?.lat)&&Number.isFinite(point?.lng))all.push({lat:point.lat,lng:point.lng})}
      diagnosticCheckpoint("representative-scan-end",{validPoints:validCount,segments:segmentStarts,representativeCount:all.length});
      return all;
    }
    const selectedIndexes=new Set(),segmentRanks=new Set();
    let firstIndex=-1,lastIndex=-1;
    for(let index=0;index<source.length;index++){const point=source[index];if(!Number.isFinite(point?.lat)||!Number.isFinite(point?.lng))continue;if(firstIndex<0)firstIndex=index;lastIndex=index}
    selectedIndexes.add(firstIndex);selectedIndexes.add(lastIndex);
    const segmentSlots=Math.min(Math.max(0,limit-selectedIndexes.size),segmentStarts);
    if(segmentSlots===1)segmentRanks.add(1);
    else for(let slot=0;slot<segmentSlots;slot++)segmentRanks.add(1+Math.round(slot*(segmentStarts-1)/(segmentSlots-1)));
    let validOrdinal=0,segmentOrdinal=0;
    for(let index=0;index<source.length&&selectedIndexes.size<limit;index++){
      const point=source[index];
      if(!Number.isFinite(point?.lat)||!Number.isFinite(point?.lng))continue;
      if(validOrdinal>0&&point.breakBefore===true){segmentOrdinal++;if(segmentRanks.has(segmentOrdinal))selectedIndexes.add(index)}
      validOrdinal++;
    }
    const remaining=Math.max(0,limit-selectedIndexes.size),uniformRanks=new Set();
    for(let slot=1;slot<=remaining;slot++)uniformRanks.add(Math.round(slot*(validCount-1)/(remaining+1)));
    validOrdinal=0;
    for(let index=0;index<source.length&&selectedIndexes.size<limit;index++){
      const point=source[index];
      if(!Number.isFinite(point?.lat)||!Number.isFinite(point?.lng))continue;
      if(uniformRanks.has(validOrdinal))selectedIndexes.add(index);
      validOrdinal++;
    }
    const samples=[];
    for(let index=0;index<source.length;index++)if(selectedIndexes.has(index)){const point=source[index];samples.push({lat:point.lat,lng:point.lng})}
    diagnosticCheckpoint("representative-scan-end",{validPoints:validCount,segments:segmentStarts,representativeCount:samples.length});
    return samples;
  }

  function loadRoadCache(){
    diagnosticCheckpoint("road-cache-read-start");
    try{const raw=localStorage.getItem(ROAD_CACHE_KEY)||"{}";diagnosticCheckpoint("road-cache-parse-start",{characters:raw.length});const value=JSON.parse(raw),cache=value&&typeof value==="object"?value:{};diagnosticCheckpoint("road-cache-read-end",{entries:Object.keys(cache).length});return cache}catch(error){diagnosticCheckpoint("road-cache-read-failure",{name:String(error?.name||"Error"),message:String(error?.message||error)});return{}}
  }

  function saveRoadCache(cache){
    diagnosticCheckpoint("road-cache-write-start",{entries:Object.keys(cache||{}).length});
    try{
      const entries=Object.entries(cache).sort((a,b)=>(b[1].savedAt||0)-(a[1].savedAt||0)).slice(0,500);
      localStorage.setItem(ROAD_CACHE_KEY,JSON.stringify(Object.fromEntries(entries)));
      diagnosticCheckpoint("road-cache-write-end",{entries:entries.length});
    }catch(error){diagnosticCheckpoint("road-cache-write-failure",{name:String(error?.name||"Error"),message:String(error?.message||error)})}
  }

  function roadCacheKey(point){return`${point.lat.toFixed(4)},${point.lng.toFixed(4)}`}

  function roadNameFromResponse(data){
    const address=data&&data.address||{};
    return address.road||address.pedestrian||address.motorway||address.trunk||address.cycleway||address.path||address.footway||data&&data.name||"";
  }

  async function reverseRoad(point,cache,index){
    diagnosticCheckpoint("geocode-start",{index:index+1});
    const key=roadCacheKey(point),cached=cache[key];
    diagnosticCheckpoint("geocode-cache-checked",{index:index+1,cacheHit:!!(cached&&typeof cached.name==="string")});
    if(cached&&typeof cached.name==="string"){diagnosticCheckpoint("geocode-end",{index:index+1,cached:true});return{name:cached.name,cached:true}}
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
    try{
      diagnosticCheckpoint("geocode-url-build-start",{index:index+1});
      const url=new URL(ROAD_ENDPOINT);
      url.searchParams.set("format","jsonv2");
      url.searchParams.set("lat",String(point.lat));
      url.searchParams.set("lon",String(point.lng));
      url.searchParams.set("zoom","17");
      url.searchParams.set("addressdetails","1");
      url.searchParams.set("layer","address");
      url.searchParams.set("accept-language","it");
      diagnosticCheckpoint("geocode-fetch",{index:index+1});
      const response=await fetch(url,{headers:{Accept:"application/json"},signal:controller.signal});
      diagnosticCheckpoint("geocode-response",{index:index+1,ok:response.ok,status:response.status});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      diagnosticCheckpoint("geocode-json-start",{index:index+1});
      const data=await response.json();
      diagnosticCheckpoint("geocode-json-end",{index:index+1});
      const name=roadNameFromResponse(data);
      cache[key]={name,savedAt:Date.now()};
      saveRoadCache(cache);
      diagnosticCheckpoint("geocode-end",{index:index+1,cached:false,nameAvailable:!!name});
      return{name,cached:false};
    }catch(error){diagnosticCheckpoint("geocode-failure",{index:index+1,name:String(error?.name||"Error"),message:String(error?.message||error)});throw error}
    finally{clearTimeout(timeout);diagnosticCheckpoint("geocode-finally",{index:index+1})}
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
    diagnosticCheckpoint("report-enter");
    const currentLesson=lesson(),currentStudent=student(),button=$("generateRoadReport");
    diagnosticCheckpoint("report-context-read",{lessonFound:!!currentLesson,studentFound:!!currentStudent,buttonFound:!!button,routePoints:Array.isArray(currentLesson?.route)?currentLesson.route.length:0});
    if(!currentLesson||!Array.isArray(currentLesson.route)||currentLesson.route.length<2){
      diagnosticCheckpoint("report-abort-no-route");
      $("roadReportStatus").textContent="Percorso GPS non disponibile.";
      return;
    }
    if(!navigator.onLine){
      diagnosticCheckpoint("report-abort-offline");
      $("roadReportStatus").textContent="Connessione assente: il report strade non può essere generato. I punti GPS restano invariati.";
      return;
    }
    diagnosticCheckpoint("route-copy-start",{routePoints:currentLesson.route.length});
    const route=currentLesson.route.map(point=>({lat:point.lat,lng:point.lng,time:point.time,accuracy:point.accuracy,breakBefore:!!point.breakBefore}));
    diagnosticCheckpoint("route-copy-end",{routePoints:route.length});
    diagnosticCheckpoint("representative-points-start",{routePoints:route.length,maxRequests:MAX_ROAD_REQUESTS});
    const samples=sampleRoute(route);
    diagnosticCheckpoint("representative-points-end",{routePoints:route.length,representativeCount:samples.length});
    const cache=loadRoadCache(),results=[];
    diagnosticCheckpoint("report-ui-start",{samples:samples.length});
    button.disabled=true;
    $("roadReportStatus").textContent=`Analisi manuale in corso: 0/${samples.length} punti rappresentativi…`;
    diagnosticCheckpoint("report-ui-end",{samples:samples.length});
    try{
      for(let index=0;index<samples.length;index++){
        diagnosticCheckpoint("before-geocode",{index:index+1,total:samples.length});
        let result;
        try{result=await reverseRoad(samples[index],cache,index)}catch(error){diagnosticCheckpoint("geocode-result-neutralized",{index:index+1,name:String(error?.name||"Error")});result={name:"",cached:false,error:true}}
        results.push(result);
        diagnosticCheckpoint("geocode-result-added",{index:index+1,cached:!!result.cached,error:!!result.error});
        $("roadReportStatus").textContent=`Analisi manuale in corso: ${index+1}/${samples.length} punti rappresentativi…`;
        if(index<samples.length-1&&!result.cached){diagnosticCheckpoint("geocode-delay-start",{index:index+1,milliseconds:REQUEST_INTERVAL_MS});await new Promise(resolve=>setTimeout(resolve,REQUEST_INTERVAL_MS));diagnosticCheckpoint("geocode-delay-end",{index:index+1})}
      }
      diagnosticCheckpoint("report-render-start",{results:results.length});
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
      diagnosticCheckpoint("report-render-end",{results:results.length,unidentified});
    }finally{button.disabled=false;diagnosticCheckpoint("report-finally")}
  }

  function toggleRoadReport(){
    const panel=$("roadReportPanel"),show=panel.classList.contains("hidden");
    panel.classList.toggle("hidden",!show);
    $("toggleRoadReport").setAttribute("aria-expanded",String(show));
    $("toggleRoadReport").textContent=show?"NASCONDI REPORT":"MOSTRA REPORT";
  }

  function statusLabel(status){return status==="good"?"Acquisito":status==="repeat"?"Da ripetere":"Non valutato"}

  function studentReportHtmlBase(current){
    const generated=new Date(),checklistRows="";
    const lessons=[...(current.lessons||[])].sort((a,b)=>a.createdAt-b.createdAt).map((item,index)=>{
      const selected=(item.checklist||[]).filter(entry=>entry.status!=="none").map(entry=>`<li>${esc(entry.label)} — ${statusLabel(entry.status)}</li>`).join("")||"<li>Nessuna valutazione registrata</li>";
      const date=new Date(item.createdAt),metres=routeDistance(item.route||[]),gpsDuration=routeDuration(item.route||[]),timing=lessonTiming(item),duration=item.duration||(timing.source==="gps"?`${formatDuration(timing.elapsed)} (GPS)`:"Non disponibile");
      return`<section class="lesson"><h3>Guida ${index+1}</h3><p><strong>${formatLessonDate(date)}</strong><br>${lessonTimeRange(item)}</p><dl><div><dt>Durata</dt><dd>${esc(duration)}</dd></div><div><dt>Durata GPS</dt><dd>${formatDuration(gpsDuration)}</dd></div><div><dt>Distanza GPS</dt><dd>${item.route&&item.route.length>1?formatDistance(metres):"GPS non usato"}</dd></div></dl><p><strong>Note:</strong> ${esc(item.notes||"Nessuna nota")}</p><ul>${selected}</ul></section>`;
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
