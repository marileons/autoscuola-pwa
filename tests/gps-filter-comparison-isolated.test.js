"use strict";
// Isolated comparison only. No application files, archives or external services are used.
const test=require('node:test'),assert=require('node:assert/strict'),cp=require('node:child_process'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),GIT=['-c','safe.directory='+ROOT.replaceAll('\\','/')];
const HISTORICAL='b420d60f581ed0afcee1eed7b3b22e891b49d82f',CURRENT='f998c130ecfd0854dc4dae1bf5a2fee5597fc436';
const git=(...args)=>cp.execFileSync('git',[...GIT,...args],{cwd:ROOT,encoding:'utf8'});
const source=(ref,file)=>git('show',ref+':'+file),sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const BASE=Date.UTC(2026,0,1),R=6371000,DEG=Math.PI/180,SCALE=R*DEG;
const locate=({x,y})=>({lat:44+y/SCALE,lng:9+x/(SCALE*Math.cos(44*DEG))});
const planar=p=>({x:(p.lng-9)*SCALE*Math.cos(44*DEG),y:(p.lat-44)*SCALE});
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function truth(t){
 if(t<=12)return{x:5*t,y:0,speed:5};
 if(t<=24){const angle=(t-12)*Math.PI/24;return{x:60+30*Math.sin(angle),y:30-30*Math.cos(angle),speed:30*Math.PI/24}}
 return{x:90,y:30+5*(t-24),speed:5};
}
const knownPath=Array.from({length:721},(_,i)=>truth(i/20)); // Fixed independently of either filter.
const baseSamples=()=>Array.from({length:37},(_,i)=>{const q=truth(i);return{t:i*1000,x:q.x,y:q.y,accuracy:5,speed:q.speed}});
function inaccurate(samples,accuracy,offset){return samples.map(s=>{
 if(s.t<12000||s.t>=24000)return s;
 const angle=(s.t/1000-12)*Math.PI/24,sign=(s.t/1000)%2===0?1:-1;
 return{...s,accuracy,x:s.x+sign*offset*Math.sin(angle),y:s.y-sign*offset*Math.cos(angle)};
})}
// Six requested scenarios; three paired controls distinguish uncertainty, sensor speed and gross jumps.
const fixtures=[
 {id:'regolare_curva',label:'Regolare con curva',samples:baseSamples()},
 {id:'precisione_recupero',label:'Precisione 5 → 60 → 5 m, coordinate corrette',samples:baseSamples().map(s=>({...s,accuracy:s.t>=12000&&s.t<=24000?60:5}))},
 {id:'speed_assente',label:'Velocità assente, precisione 24 m',samples:baseSamples().map(s=>({...s,accuracy:s.t===0?5:24,speed:null}))},
 {id:'speed_presente_controllo',label:'Controllo: stessa precisione 24 m, velocità presente',samples:baseSamples().map(s=>({...s,accuracy:s.t===0?5:24}))},
 {id:'salto_isolato',label:'Salto isolato di 90 m, precisione dichiarata 50 m',samples:baseSamples().map(s=>s.t===18000?{...s,x:s.x+90/Math.sqrt(2),y:s.y-90/Math.sqrt(2),accuracy:50}:s)},
 {id:'salto_grande_controllo',label:'Controllo: salto 150 m, precisione dichiarata 5 m',samples:baseSamples().map(s=>s.t===18000?{...s,x:s.x+150/Math.sqrt(2),y:s.y-150/Math.sqrt(2)}:s)},
 {id:'sequenza_imprecisa',label:'Sequenza ±60 m, precisione dichiarata 120 m',samples:inaccurate(baseSamples(),120,60)},
 {id:'sequenza_entro_soglia_controllo',label:'Controllo: sequenza ±30 m, precisione dichiarata 60 m',samples:inaccurate(baseSamples(),60,30)},
 {id:'pausa_ripresa',label:'19 s fra ricezioni; ritorno a 24 m, senza errore API',samples:baseSamples().filter(s=>s.t<=10000||s.t>=29000).map(s=>({...s,accuracy:[29000,30000].includes(s.t)?24:5})),gaps:[{last:10000,first:29000}]},
 {id:'pausa_errore_controllo',label:'Controllo: stessa pausa, anche timeout API',samples:baseSamples().filter(s=>s.t<=10000||s.t>=29000).map(s=>({...s,accuracy:[29000,30000].includes(s.t)?24:5})),gaps:[{last:10000,first:29000}],errors:[{t:20000,code:3}]}
];
function getFunction(app,name){const line=app.split(/\r?\n/).find(l=>l.startsWith('function '+name+'('));assert.ok(line,'Missing '+name);return line}
function replay(ref,fixture,filterSource=null){
 const app=source(ref,'app.js');let clock=BASE,callback,onerror,watchCalls=0,evaluatorCalls=0,draws=0;
 const state={watch:null,tempRoute:[],gpsNeedsBreak:false},output={textContent:''},insertedAt=new Map();
 const sandbox={state,Date:{now:()=>clock},window:{AgendaAuth:{can:()=>true}},navigator:{geolocation:{watchPosition(cb,err,options){watchCalls++;assert.deepEqual(JSON.parse(JSON.stringify(options)),{enableHighAccuracy:true,maximumAge:0,timeout:20000});callback=cb;onerror=err;return 1},clearWatch(){}}},$:()=>output,drawLive(){draws++},persistLessonSession(){},updateGpsUi(){},recordGpsDiagnostic(){},gpsErrorMessage:()=> 'Synthetic error',alert(){throw Error('Unexpected manual action')}};
 const context=vm.createContext(sandbox);
 if(ref===HISTORICAL){
  for(const name of ['distance','evaluateGpsPoint'])vm.runInContext(getFunction(app,name),context);
  const original=context.evaluateGpsPoint;context.evaluateGpsPoint=(...args)=>{evaluatorCalls++;return original(...args)};
  assert.match(getFunction(app,'startGps'),/decision=evaluateGpsPoint\(/);
 }else{
  const module={exports:{}};vm.runInNewContext(filterSource||source(ref,'lesson-gps.js'),{module,Date:{now:()=>clock}});sandbox.window.LessonGps=module.exports;
  // Intentionally do not load the obsolete evaluator: current recording must not call it.
  context.evaluateGpsPoint=()=>{throw Error('Unused legacy evaluator was unexpectedly called')};
  assert.match(getFunction(app,'startGps'),/gpsAnalysis\.observe/);assert.match(getFunction(app,'startGps'),/accept:observed\.accept/);
  vm.runInContext(getFunction(app,'validRoutePoints'),context);
 }
 for(const name of ['startGps','stopGps','routeSegments'])vm.runInContext(getFunction(app,name),context);
 context.startGps();assert.equal(state.watch,1);assert.equal(watchCalls,1);
 const initial=JSON.stringify(fixture.samples),events=[...fixture.samples.map(sample=>({t:sample.t,sample})),...(fixture.errors||[])].sort((a,b)=>a.t-b.t);
 let admittedAtReceipt=0;
 for(const event of events){
  clock=BASE+event.t;
  if(event.sample){const s=event.sample,position=locate(s),before=state.tempRoute.length;callback({coords:{latitude:position.lat,longitude:position.lng,accuracy:s.accuracy,speed:s.speed},timestamp:BASE+s.t});if(state.tempRoute.length>before)admittedAtReceipt++;
   for(const p of state.tempRoute)if(!insertedAt.has(p.time))insertedAt.set(p.time,event.t);
  }else onerror({code:event.code});
 }
 context.stopGps();assert.equal(JSON.stringify(fixture.samples),initial,'Fixture changed');
 const route=JSON.parse(JSON.stringify(state.tempRoute)),byTime=new Map(fixture.samples.map(s=>[BASE+s.t,s]));
 assert.equal(new Set(route.map(p=>p.time)).size,route.length,'Duplicate recorded fix');
 for(let i=0;i<route.length;i++){const p=route[i],input=byTime.get(p.time);assert.ok(input,'Fabricated timestamp');const raw=locate(input);assert.equal(p.lat,raw.lat);assert.equal(p.lng,raw.lng);assert.equal(p.accuracy,input.accuracy);if(i)assert.ok(p.time>route[i-1].time)}
 assert.equal(JSON.stringify(context.routeSegments(route)),JSON.stringify(context.routeSegments(JSON.parse(JSON.stringify(route)))),'Geometry differs after serialization');
 if(ref===HISTORICAL)assert.ok(evaluatorCalls>0);else assert.equal(evaluatorCalls,0);
 return{route,insertedAt,admittedAtReceipt,draws};
}
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)}
function nearest(p,points,edges){let best=Infinity;for(const[a,b]of edges)best=Math.min(best,segmentDistance(p,a,b));if(!edges.length)for(const q of points)best=Math.min(best,length(p,q));return Number.isFinite(best)?best:null}
const truthEdges=knownPath.slice(1).map((p,i)=>[knownPath[i],p]);
const rounded=x=>Number.isFinite(x)?Math.round(x*100)/100:null;
function measure(fixture,result){
 const points=result.route.map(planar),edges=[];let bridges=0;
 for(let i=1;i<result.route.length;i++)if(!result.route[i].breakBefore){edges.push([points[i-1],points[i]]);for(const gap of fixture.gaps||[])if(result.route[i-1].time-BASE<=gap.last&&result.route[i].time-BASE>=gap.first)bridges++}
 const pointErrors=result.route.map(p=>length(planar(p),truth((p.time-BASE)/1000)));
 const rendered=[];for(const[a,b]of edges){const steps=Math.max(1,Math.ceil(length(a,b)));for(let i=0;i<=steps;i++)rendered.push({x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps})}
 const lineErrors=rendered.map(p=>nearest(p,knownPath,truthEdges));
 const curveInputs=fixture.samples.filter(s=>s.t>=12000&&s.t<=24000),curveKept=result.route.filter(p=>p.time-BASE>=12000&&p.time-BASE<=24000);
 const isVisible=t=>!(fixture.gaps||[]).some(g=>t>g.last&&t<g.first);
 const curveTruth=knownPath.filter((p,i)=>i/20>=12&&i/20<=24&&isVisible(i/20*1000));
 const curveErrors=curveTruth.map(p=>nearest(p,points,edges)).filter(v=>v!==null);
 const recovery=(fixture.gaps||[]).map(g=>{const p=result.route.find(p=>p.time-BASE>=g.first);return p?{firstSampleKeptAtSeconds:(p.time-BASE)/1000,confirmationDelaySeconds:(result.insertedAt.get(p.time)-g.first)/1000}:null});
 return{received:fixture.samples.length,accepted:result.route.length,discarded:fixture.samples.length-result.route.length,acceptedCallbacks:result.admittedAtReceipt,recoveredAfterBuffer:result.route.length-result.admittedAtReceipt,maxPointErrorM:rounded(Math.max(...pointErrors)),meanPointErrorM:rounded(pointErrors.reduce((a,b)=>a+b,0)/pointErrors.length),maxRenderedDeviationM:lineErrors.length?rounded(Math.max(...lineErrors)):null,curveKept:curveKept.length,curveReceived:curveInputs.length,maxCurveOmissionM:curveErrors.length?rounded(Math.max(...curveErrors)):null,segments:result.route.length?1+result.route.slice(1).filter(p=>p.breakBefore).length:0,bridgesAcrossKnownGaps:bridges,recovery};
}
test('confronto isolato dei controller storici e attuali sugli stessi campioni sintetici',()=>{
 assert.equal(git('rev-parse','b420d60^{commit}').trim(),HISTORICAL);assert.equal(git('rev-parse',CURRENT+'^{commit}').trim(),CURRENT);assert.equal(git('rev-parse','HEAD').trim(),CURRENT);assert.equal(git('branch','--show-current').trim(),'auth-users-cloudflare-dev');
 const before=git('status','--porcelain','--untracked-files=all');
 console.log('REFS',JSON.stringify({historical:HISTORICAL,current:CURRENT,historicalAppSha256:sha(source(HISTORICAL,'app.js')),currentAppSha256:sha(source(CURRENT,'app.js')),currentFilterSha256:sha(source(CURRENT,'lesson-gps.js'))}));
 const results=[];
 for(const fixture of fixtures){
  const historical=measure(fixture,replay(HISTORICAL,fixture)),current=measure(fixture,replay(CURRENT,fixture));results.push({id:fixture.id,label:fixture.label,historical,current});
  assert.equal(historical.accepted+historical.discarded,fixture.samples.length);assert.equal(current.accepted+current.discarded,fixture.samples.length);
 }
 console.log('RESULTS_JSON',JSON.stringify(results));
 console.table(results.map(r=>({caso:r.id,ricevuti:r.current.received,agosto_A_S:r.historical.accepted+'/'+r.historical.discarded,attuale_A_S:r.current.accepted+'/'+r.current.discarded,deviazione_linea_m:r.historical.maxRenderedDeviationM+' / '+r.current.maxRenderedDeviationM,curva_conservata:r.historical.curveKept+'/'+r.historical.curveReceived+' / '+r.current.curveKept+'/'+r.current.curveReceived,taglio_curva_m:r.historical.maxCurveOmissionM+' / '+r.current.maxCurveOmissionM,ponti_su_gap:r.historical.bridgesAcrossKnownGaps+' / '+r.current.bridgesAcrossKnownGaps})));
 assert.equal(git('status','--porcelain','--untracked-files=all'),before,'Test modified files');
});

// Reuse the exact pinned-controller harness; default comparisons remain unchanged.
module.exports={CURRENT,HISTORICAL,fixtures,replay,measure,baseSamples,truth,planar};
