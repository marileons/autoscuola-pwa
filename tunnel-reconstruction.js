"use strict";
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.TunnelReconstruction=api;})(typeof window!=='undefined'?window:globalThis,function(){
 const METHOD='unique-directed-tunnel-window-v1',TIME_MS=12000,SPACE_M=120,MAX_POINTS=32;
 const LEGACY_METHOD='unique-directed-tunnel-v1';
 // Build-time recording policy only. Both readers MUST remain enabled.
 // Safe fallback: change ONLY this assignment to LEGACY_METHOD, then version assets.
 const RECORDING_METHOD=METHOD;
 const VERSION=1,caption='Tratto ricostruito in galleria';
 const distance=(a,b)=>{const r=Math.PI/180,h=Math.sin((b[0]-a[0])*r/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin((b[1]-a[1])*r/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(h)))};
 const coord=p=>[p.lat,p.lng],angle=(a,b)=>Math.atan2((b[1]-a[1])*Math.cos((a[0]+b[0])*Math.PI/360),b[0]-a[0])*180/Math.PI;
 const difference=(a,b)=>Math.abs((a-b+540)%360-180);
 const signature=(route,indices)=>JSON.stringify(indices.map(i=>{const p=route[i];return p?[i,p.lat,p.lng,p.accuracy,p.time,!!p.breakBefore]:null}));
 function validate(records){const ids=new Set();if(!Array.isArray(records)||records.length>500)throw Error('Ricostruzioni galleria non valide.');for(const r of records){if(!r||ids.has(r.id)||r.version!==VERSION||r.kind!=='estimated-tunnel'||typeof r.id!=='string'||r.id.length>200||typeof r.source?.dataset!=='string'||r.source.dataset.length>200||r.source.license!=='ODbL-1.0'||!Array.isArray(r.source.wayIds)||r.source.wayIds.some(x=>!Number.isSafeInteger(x)||x<=0)||!r.source.wayIds.length||typeof r.source.timestamp!=='string'||!Number.isFinite(Date.parse(r.source.timestamp))||!Array.isArray(r.anchors)||r.anchors.length!==6||r.anchors.some(i=>!Number.isSafeInteger(i)||i<0)||typeof r.anchorSignature!=='string'||r.anchorSignature.length>6000||!Array.isArray(r.geometry)||r.geometry.length<2||r.geometry.length>20000||r.geometry.some(p=>!Array.isArray(p)||p.length!==2||!Number.isFinite(p[0])||Math.abs(p[0])>90||!Number.isFinite(p[1])||Math.abs(p[1])>180)||!['unique-directed-tunnel-v1',METHOD].includes(r.evidence?.method)||r.evidence?.continuousForeground!==true||!Number.isFinite(r.evidence?.observedGapSeconds)||r.evidence.observedGapSeconds<=15||r.evidence.observedGapSeconds>240)throw Error('Provenienza o geometria della galleria non valida.');if(r.evidence.method===METHOD&&!validEvidence(r))throw Error("Finestra degli ancoraggi non valida.");ids.add(r.id);}return records;}
 function visible(route,records=[]){try{return validate(records).filter(r=>signature(route,r.anchors)===r.anchorSignature&&(r.evidence.method!==METHOD||validRouteEvidence(route,r)))}catch{return[]}}
 const cache=new WeakMap();
 function prepare(data){if(!data||data.version!==1||!Array.isArray(data.nodes)||!Array.isArray(data.edges)||!Array.isArray(data.tunnels))return null;if(cache.has(data))return cache.get(data);const adj=Array.from({length:data.nodes.length},()=>[]);for(const e of data.edges)if(adj[e[0]]&&adj[e[1]])adj[e[0]].push(e);const result={data,adj};cache.set(data,result);return result;}
 function alternative(graph,tunnel,budget){const blocked=new Set(tunnel.wayIds),best=new Map([[tunnel.entry,0]]),heap=[[0,tunnel.entry]];let visited=0;
  const push=x=>{heap.push(x);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=x[0])break;heap[i]=heap[p];i=p}heap[i]=x};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(last[0]<=heap[c][0])break;heap[i]=heap[c];i=c}heap[i]=last}return top};
  while(heap.length){const[cost,node]=pop();if(cost!==best.get(node))continue;if(cost>budget)break;if(++visited>5000)return'unknown';if(node===tunnel.exit)return'yes';for(const e of graph.adj[node]){if(blocked.has(e[3]))continue;const next=cost+e[2];if(next>budget)continue;if(e[4])return'unknown';if(next<(best.get(e[1])??Infinity)){best.set(e[1],next);push([next,e[1]])}}}return'no';
 }
 function validWindow(points){return points.length===3&&points.every(p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lng)&&Number.isFinite(p?.time)&&Number.isFinite(p?.accuracy)&&p.accuracy>=0&&p.accuracy<=25)&&points.slice(1).every((p,i)=>p.time>points[i].time&&p.time-points[i].time<=15000&&!p.breakBefore)&&distance(coord(points[0]),coord(points[2]))>=Math.max(15,2*Math.max(...points.map(p=>p.accuracy)))&&difference(angle(coord(points[0]),coord(points[1])),angle(coord(points[1]),coord(points[2])))<=45;}
 function windowFailure(points){if(points.length!==3)return'invalid_data';for(const p of points){if(!Number.isFinite(p?.lat)||!Number.isFinite(p?.lng)||!Number.isFinite(p?.time)||!Number.isFinite(p?.accuracy))return'invalid_data';if(p.accuracy<0||p.accuracy>25)return'accuracy'}for(let i=1;i<points.length;i++){const p=points[i],previous=points[i-1];if(!(p.time>previous.time))return'time_order';if(!(p.time-previous.time<=15000))return'interval';if(p.breakBefore)return'segment'}if(!(distance(coord(points[0]),coord(points[2]))>=Math.max(15,2*Math.max(...points.map(p=>p.accuracy)))))return'distance';if(!(difference(angle(coord(points[0]),coord(points[1])),angle(coord(points[1]),coord(points[2])))<=45))return'direction';return null;}
 function durationFailure(elapsed){return!Number.isFinite(elapsed)||elapsed<=0?'invalid':elapsed<=15?'short':elapsed>240?'long':null;}
 function match(data,route,gap,continuous,report=()=>{},windows=null){const reject=(reason,detail=null)=>{report(reason,detail);return null};const graph=prepare(data);if(!graph)return reject('package_unavailable');if(!continuous)return reject('continuity');if(gap<3||gap+2>=route.length)return reject('anchors_missing');if(!route[gap]?.breakBefore)return reject('not_segment_break');const before=windows?windows.before:route.slice(gap-3,gap),after=windows?windows.after:route.slice(gap,gap+3);if(!validWindow(before))return reject('before_window',windowFailure(before));if(!validWindow(after))return reject('after_window',windowFailure(after));const elapsed=(route[gap].time-route[gap-1].time)/1000;if(!Number.isFinite(elapsed)||elapsed<=15||elapsed>240)return reject('gap_duration',durationFailure(elapsed));
  const incoming=angle(coord(before[0]),coord(before[2])),outgoing=angle(coord(after[0]),coord(after[2]));
  const candidates=data.tunnels.filter(t=>!t.branch&&distance(coord(before[2]),t.geometry[0])<=Math.max(20,before[2].accuracy)&&distance(coord(after[0]),t.geometry.at(-1))<=Math.max(20,after[0].accuracy)&&difference(incoming,angle(t.geometry[0],t.geometry[Math.min(2,t.geometry.length-1)]))<=30&&difference(outgoing,angle(t.geometry[Math.max(0,t.geometry.length-3)],t.geometry.at(-1)))<=30&&t.metres<=65*elapsed);
  if(candidates.length!==1)return reject(candidates.length?'multiple_candidates':'no_compatible_portals_direction');const t=candidates[0],alt=alternative(graph,t,65*elapsed+before[2].accuracy+after[0].accuracy);if(alt!=='no')return reject(alt==='yes'?'alternative_route':'alternative_unknown');
  const anchors=windows?[...windows.beforeIndices,...windows.afterIndices]:[gap-3,gap-2,gap-1,gap,gap+1,gap+2];const record={version:VERSION,kind:'estimated-tunnel',id:t.id+'@'+gap,anchors,anchorSignature:signature(route,anchors),geometry:t.geometry.map(p=>[...p]),source:{dataset:data.id,license:data.license,timestamp:data.timestamp,wayIds:[...t.wayIds]},evidence:{method:windows?METHOD:'unique-directed-tunnel-v1',continuousForeground:true,observedGapSeconds:elapsed,...(windows?{windowTimeLimitMs:TIME_MS,windowSpaceLimitM:SPACE_M,windowPointLimit:MAX_POINTS,gapBoundaryIndices:[gap-1,gap]}:{})}};report('accepted');return record;
 }
 const good=p=>p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lng)&&Math.abs(p.lng)<=180&&Number.isFinite(p.time)&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&p.accuracy<=25;
function triple(route,indices){if(indices.length<3)return null;const first=indices[0],last=indices.at(-1),mid=(route[first].time+route[last].time)/2;const middle=indices.slice(1,-1).reduce((best,i)=>Math.abs(route[i].time-mid)<Math.abs(route[best].time-mid)?i:best,indices[1]);return[first,middle,last]}
function beforeTriple(route,indices){for(let k=indices.length-3;k>=0;k--){const candidate=triple(route,indices.slice(k)),points=candidate.map(i=>route[i]);if(distance(coord(points[0]),coord(points[2]))>=Math.max(15,2*Math.max(...points.map(p=>p.accuracy))))return candidate}return triple(route,indices)}
function gateDetail(data,route,gap,w){
 if(!data||!Array.isArray(data.tunnels))return'package_unavailable';
 const boundary=[route[gap-1],route[gap]],bbox=data.bbox;
 if(bbox&&boundary.some(p=>p.lat<bbox[0]||p.lng<bbox[1]||p.lat>bbox[2]||p.lng>bbox[3]))return'outside_package_bbox';
 const portals=data.tunnels.filter(t=>distance(coord(boundary[0]),t.geometry[0])<=Math.max(20,boundary[0].accuracy)&&distance(coord(boundary[1]),t.geometry.at(-1))<=Math.max(20,boundary[1].accuracy));
 if(!portals.length)return'no_compatible_portals';
 const unbranched=portals.filter(t=>!t.branch);if(!unbranched.length)return'portal_compatible_chains_excluded';
 const before=w.before,after=w.after,incoming=angle(coord(before[0]),coord(before[2])),outgoing=angle(coord(after[0]),coord(after[2]));
 const directed=unbranched.filter(t=>difference(incoming,angle(t.geometry[0],t.geometry[Math.min(2,t.geometry.length-1)]))<=30&&difference(outgoing,angle(t.geometry[Math.max(0,t.geometry.length-3)],t.geometry.at(-1)))<=30);
 if(!directed.length)return'direction_incompatible';
 const elapsed=(route[gap].time-route[gap-1].time)/1000;
 if(!directed.some(t=>t.metres<=65*elapsed))return'length_time_incompatible';
 return'data_or_other_gate';
}

 function validEvidence(r){const e=r.evidence,a=r.anchors,b=e.gapBoundaryIndices;return e.windowTimeLimitMs===TIME_MS&&e.windowSpaceLimitM===SPACE_M&&e.windowPointLimit===MAX_POINTS&&Array.isArray(b)&&b.length===2&&b.every(Number.isSafeInteger)&&b[1]===b[0]+1&&a[2]===b[0]&&a[3]===b[1]&&a.every((v,i)=>!i||v>a[i-1])&&a[2]-a[0]<MAX_POINTS&&a[5]-a[3]<MAX_POINTS;}
 function validRouteEvidence(route,r){if(!validEvidence(r))return false;const a=r.anchors,g=a[3];if(!route[g]?.breakBefore)return false;for(const indices of [a.slice(0,3),a.slice(3)]){const points=indices.map(i=>route[i]);if(!validWindow(points))return false;const boundary=route[indices[0]<g?g-1:g];if(points.some(p=>Math.abs(p.time-boundary.time)>TIME_MS||distance(coord(p),coord(boundary))>SPACE_M))return false;for(let i=indices[0];i<=indices[2];i++)if(!route[i]||i>indices[0]&&route[i].breakBefore)return false;}return r.evidence.observedGapSeconds===(route[g].time-route[g-1].time)/1000;}

 // One terminal decision per candidate; map search is performed only after the
 // deterministic quality/baseline window has closed successfully.
 function createWindowSession({data,route=[],now=()=>performance.now(),isVisible=()=>typeof document==='undefined'||document.visibilityState==='visible'}={}){
  const start=route.length,epochs=new Map(),pending=new Map(),ready=[];
  let currentRoute=route,seen=start,epoch=0,lastBeat=now(),active=true;
  const stats={detected:0,candidates:0,excludedEarly:0,evaluated:0,matches:0,accepted:0,rejected:0,abandoned:0,errors:0,errorNames:{},reasons:{},subreasons:{before_window:{},after_window:{},gap_duration:{}},window:{waits:0,deadline:0,samples:0,extent:0,nextBreak:0},details:{}};
  const count=(bag,key)=>bag[key]=(bag[key]||0)+1;
  function finish(c,reason,detail=null,record=null){
   pending.delete(c.gap);stats.evaluated++;
   if(record){stats.accepted++;ready.push(record)}else{stats.rejected++;count(stats.reasons,reason);if(detail&&stats.subreasons[reason])count(stats.subreasons[reason],detail)}
  }
  function abandon(){stats.abandoned+=pending.size;pending.clear()}
  function beat(){const n=now();if(n-lastBeat>5000||n<lastBeat||!isVisible()){epoch++;abandon()}lastBeat=n}
  function inspect(c){const r=currentRoute,g=c.gap;
   if(c.epoch!==epoch||!isVisible())return finish(c,'continuity');
   if(!good(r[g-1]))return finish(c,'before_window',Number.isFinite(r[g-1]?.accuracy)&&(r[g-1].accuracy<0||r[g-1].accuracy>25)?'accuracy':'invalid_data');
   if(!good(r[g]))return finish(c,'after_window',Number.isFinite(r[g]?.accuracy)&&(r[g].accuracy<0||r[g].accuracy>25)?'accuracy':'invalid_data');
   if(!c.beforeIndices){const before=[];for(let i=g-1;i>=start&&before.length<MAX_POINTS;i--){if(i<g-1&&r[i+1].breakBefore)break;if(epochs.get(i)!==epoch)return finish(c,'continuity');if(r[g-1].time-r[i].time>TIME_MS||distance(coord(r[i]),coord(r[g-1]))>SPACE_M)break;before.unshift(i)}c.beforeIndices=beforeTriple(r,before.filter(i=>good(r[i])))}
   const bi=c.beforeIndices;if(!bi)return finish(c,'before_window','insufficient');
   const before=bi.map(i=>r[i]),why=windowFailure(before);if(why)return finish(c,'before_window',why);
   const after=[];let close=null;for(let i=g;i<seen&&after.length<MAX_POINTS;i++){
    if(i>g&&r[i].breakBefore){close='nextBreak';break}
    if(epochs.get(i)!==epoch)return finish(c,'continuity');
    if(r[i].time-r[g].time>TIME_MS||distance(coord(r[i]),coord(r[g]))>SPACE_M){close='extent';break}
    after.push(i);
   }
   const ai=triple(r,after.filter(i=>good(r[i]))),afterPoints=ai&&ai.map(i=>r[i]);
   const enough=afterPoints&&distance(coord(afterPoints[0]),coord(afterPoints[2]))>=Math.max(15,2*Math.max(...afterPoints.map(p=>p.accuracy)));
   if(now()-c.started>=TIME_MS)close='deadline';else if(after.length>=MAX_POINTS)close='samples';
   if(!enough&&!close){if(!c.waiting){c.waiting=true;stats.window.waits++}return}
   if(close)stats.window[close]++;
   if(!ai)return finish(c,'after_window','insufficient');
   const detail=windowFailure(afterPoints);if(detail)return finish(c,'after_window',detail);
   const windows={before,after:afterPoints,beforeIndices:bi,afterIndices:ai};
   stats.matches++;
   try{let reason,sub;const record=match(data,r,g,true,(a,b)=>{reason=a;sub=b},windows);
    if(reason==='no_compatible_portals_direction')count(stats.details,gateDetail(data,r,g,windows));
    else if(!record&&['multiple_candidates','alternative_route','alternative_unknown','package_unavailable'].includes(reason))count(stats.details,reason);
    finish(c,reason,sub,record);
   }catch(error){pending.delete(g);stats.evaluated++;stats.errors++;count(stats.errorNames,['Error','TypeError','RangeError'].includes(error?.name)?error.name:'TechnicalError');throw error}
  }
  return{
   heartbeat(){if(!active)return;beat();for(const c of [...pending.values()])if(now()-c.started>=TIME_MS)inspect(c)},
   invalidate(){if(active){epoch++;abandon()}},
   stop(){if(!active)return;active=false;abandon();epochs.clear();ready.length=0},
   scan(route){if(!active)return[];currentRoute=route;beat();
    // Expire against the previously observed prefix BEFORE accepting a late
    // arrival. A callback after the deadline cannot extend the window.
    for(const c of [...pending.values()])if(now()-c.started>=TIME_MS)inspect(c);
    const changed=route.length!==seen;
    for(let i=seen;i<route.length;i++){epochs.set(i,epoch);if(route[i].breakBefore){stats.detected++;if(i>=start+3){stats.candidates++;pending.set(i,{gap:i,epoch,started:now()})}else stats.excludedEarly++}}
    seen=route.length;
    if(changed)for(const c of [...pending.values()])inspect(c);
    for(const i of epochs.keys())if(i<seen-64)epochs.delete(i);
    return ready.splice(0);
   },
   deadlineDelay(){return active&&pending.size?Math.max(0,Math.min(...[...pending.values()].map(c=>c.started+TIME_MS-now()))):null},
   drain(){return active?ready.splice(0):[]},
   diagnostics(){return{...stats,reasons:{...stats.reasons},errorNames:{...stats.errorNames},window:{...stats.window},details:{...stats.details},subreasons:Object.fromEntries(Object.entries(stats.subreasons).map(([k,v])=>[k,{...v}])),pending:pending.size,active}}
  };
 }

 function createLegacySession({data,route=[],now=()=>performance.now(),isVisible=()=>typeof document==='undefined'||document.visibilityState==='visible'}={}){const start=route.length,epochs=new Map(),pending=new Set();let seen=start,epoch=0,lastHeartbeat=now(),active=true;const stats={detected:0,candidates:0,excludedEarly:0,evaluated:0,accepted:0,rejected:0,abandoned:0,errors:0,errorNames:{},reasons:{},subreasons:{before_window:{},after_window:{},gap_duration:{}}};return{
  diagnostics(){return{...stats,reasons:{...stats.reasons},errorNames:{...stats.errorNames},subreasons:{before_window:{...stats.subreasons.before_window},after_window:{...stats.subreasons.after_window},gap_duration:{...stats.subreasons.gap_duration}},pending:pending.size,active}},
  heartbeat(){const n=now();if(n-lastHeartbeat>5000||n<lastHeartbeat||!isVisible())epoch++;lastHeartbeat=n},
  invalidate(){epoch++},stop(){active=false;stats.abandoned+=pending.size;pending.clear();epochs.clear()},
  scan(route){if(!active)return[];this.heartbeat();const found=[];for(let i=seen;i<route.length;i++){epochs.set(i,epoch);if(route[i].breakBefore){stats.detected++;if(i>=start+3){pending.add(i);stats.candidates++}else stats.excludedEarly++}}seen=route.length;for(const gap of pending){if(route.length<gap+3)continue;pending.delete(gap);const indices=[gap-3,gap-2,gap-1,gap,gap+1,gap+2],continuous=indices.every(i=>epochs.get(i)===epoch)&&isVisible();stats.evaluated++;let r;try{r=match(data,route,gap,continuous,(reason,detail)=>{if(reason==='accepted')stats.accepted++;else{stats.rejected++;stats.reasons[reason]=(stats.reasons[reason]||0)+1;if(detail&&Object.hasOwn(stats.subreasons,reason)){const counts=stats.subreasons[reason];counts[detail]=(counts[detail]||0)+1}}})}catch(error){stats.errors++;const name=['TypeError','RangeError','Error'].includes(error?.name)?error.name:'TechnicalError';stats.errorNames[name]=(stats.errorNames[name]||0)+1;throw error}if(r)found.push(r)}for(const i of epochs.keys())if(i<route.length-32&&!Array.from(pending).some(g=>i>=g-3))epochs.delete(i);return found}
 }};

 // Recording policy does not participate in validate(), visible() or backup.
 function createSession(options){
  let session;
  if(RECORDING_METHOD===METHOD)session=createWindowSession(options);
  else if(RECORDING_METHOD===LEGACY_METHOD)session=createLegacySession(options);
  else throw Error('Metodo di registrazione gallerie non supportato.');
  const diagnostics=session.diagnostics.bind(session);
  session.diagnostics=()=>({...diagnostics(),method:RECORDING_METHOD});
  // Legacy sessions use the exact previous acquisition/decision lifecycle;
  // they never arm the bounded-window deadline or enqueue deferred geometry.
  if(RECORDING_METHOD===LEGACY_METHOD){session.drain=()=>[];session.deadlineDelay=()=>null;}
  return session;
 }

 function layers(L,route,records){return visible(route,records).map(r=>L.polyline(r.geometry,{color:'#d70015',weight:5,dashArray:'8 8',opacity:.9}).bindPopup(caption+' · stima sperimentale, non rilevazione GPS. Dati © OpenStreetMap contributors, ODbL 1.0.'))}
 return{VERSION,METHOD,LEGACY_METHOD,RECORDING_METHOD,caption,validate,visible,match,createSession,layers,distance};
});
