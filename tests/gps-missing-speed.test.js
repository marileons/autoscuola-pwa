"use strict";
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const {CURRENT,fixtures,replay,measure,planar}=require('./gps-filter-comparison-isolated.test.js');
const root=path.resolve(__dirname,'..'),working=fs.readFileSync(path.join(root,'lesson-gps.js'),'utf8');
const published=cp.execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show',CURRENT+':lesson-gps.js'],{cwd:root,encoding:'utf8'});
const run=(fixture,corrected)=>replay(CURRENT,fixture,corrected?working:published);
const p=(t,x,y=0,accuracy=24,speed=null)=>({t:t*1000,x,y,accuracy,speed});
const clone=x=>JSON.parse(JSON.stringify(x));
function movementFixture(stoppedSpeed=null){const samples=[];for(let t=0;t<=70;t++){let x=t<=15?t*5:t<45?75:75+(t-45)*5,y=0;if(t>15&&t<45){x+=6*Math.sin(t*1.7);y=6*Math.cos(t*.7)}samples.push({...p(t,x,y,t===0?5:24),speed:t>15&&t<45?stoppedSpeed:null})}return{id:'arresto_ripartenza',samples}}
function summary(fixture,before,after){return {caso:fixture.id,ricevuti:fixture.samples.length,prima:before.route.length,dopo:after.route.length,scartati_prima:fixture.samples.length-before.route.length,scartati_dopo:fixture.samples.length-after.route.length}}
test('velocità assente: confronto prima/dopo e altre cinque situazioni invariate',()=>{
 const rows=[];
 for(const f of fixtures){const before=measure(f,run(f,false)),after=measure(f,run(f,true));rows.push({caso:f.id,prima:before.accepted,dopo:after.accepted,curva_prima:before.curveKept,curva_dopo:after.curveKept,deviazione_prima_m:before.maxRenderedDeviationM,deviazione_dopo_m:after.maxRenderedDeviationM,ponti_prima:before.bridgesAcrossKnownGaps,ponti_dopo:after.bridgesAcrossKnownGaps});
 if(f.id==='speed_assente'){a.ok(after.curveKept>before.curveKept);a.ok(after.maxCurveOmissionM<before.maxCurveOmissionM)}else a.deepEqual(after,before,f.id+' changed outside missing-speed correction');
 }
 console.table(rows);
});
test('velocità assente: curve indipendenti, frequenze e precisioni diverse',()=>{
 const rows=[];
 for(const [radius,seconds,interval,accuracy]of [[20,16,1,12],[30,12,1,24],[45,18,.5,24],[40,14,.25,30]]){
  const samples=[];for(let t=0;t<=seconds+.0001;t+=interval){const q=t/seconds*Math.PI/2;samples.push(p(t,radius*Math.sin(q),radius*(1-Math.cos(q)),t===0?5:accuracy))}
  const f={id:'curva-'+[radius,seconds,interval,accuracy].join('-'),samples},before=run(f,false),after=run(f,true);a.ok(after.route.length>=before.route.length,f.id);rows.push(summary(f,before,after));
 }
 console.table(rows);
});
test('velocità assente: fermo con jitter oscillante, casuale e deriva correlata entro incertezza',()=>{
 const rows=[];
 for(const mode of ['small','oscillating','sweep','random']){
  let seed=17;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
  const samples=Array.from({length:241},(_,t)=>{
   if(t===0)return p(t,0,0,mode==='small'?8:24);
   let x,y;if(mode==='small'){x=2*Math.sin(t);y=2*Math.cos(t)}else if(mode==='oscillating'){x=t%2?10:-10;y=3*Math.sin(t)}else if(mode==='sweep'){x=18*Math.sin(t/12);y=3*Math.sin(t/15)}else{x=(random()-.5)*16;y=(random()-.5)*16}
   return p(t,x,y,mode==='small'?8:24);
  });
  const f={id:'fermo-'+mode,samples},before=run(f,false),after=run(f,true);a.equal(after.route.length,before.route.length,f.id+' introduced stationary fixes');a.deepEqual(after.route,before.route,f.id+' changed stationary geometry');rows.push(summary(f,before,after));
 }
 console.table(rows);
});
test('velocità assente: zero valido distinto da null, arresto e ripartenza',()=>{
 const source=fixtures.find(f=>f.id==='speed_assente'),zero={id:'zero-valido',samples:source.samples.map(s=>({...s,speed:0}))};
 const z0=run(zero,false),z1=run(zero,true);a.deepEqual(z1.route,z0.route);console.table([summary(zero,z0,z1)]);
 for(const speed of [null,0]){const f=movementFixture(speed),before=run(f,false),after=run(f,true),stationary=route=>route.filter(p=>p.time-Date.UTC(2026,0,1)>15000&&p.time-Date.UTC(2026,0,1)<45000);
  console.table([{...summary(f,before,after),speed_fermo:String(speed),punti_fermo_prima:stationary(before.route).length,punti_fermo_dopo:stationary(after.route).length}]);
  a.ok(stationary(after.route).length<=stationary(before.route).length,'stop jitter increased');a.ok(after.route.some(p=>p.time-Date.UTC(2026,0,1)>45000),'restart lost');
 }
});
test('velocità assente: pausa e nuova sessione non ereditano il movimento precedente',()=>{
 const samples=[];for(let t=0;t<=15;t++)samples.push(p(t,t*5,0,t===0?5:24));samples.push(p(40,200),p(41,205));for(let t=42;t<=90;t++)samples.push(p(t,205+5*Math.sin(t),5*Math.cos(t)));
 const f={id:'pausa-senza-speed',samples},before=run(f,false),after=run(f,true),post=route=>route.filter(p=>p.time-Date.UTC(2026,0,1)>=40000);
 a.deepEqual(post(after.route),post(before.route),'pre-gap movement leaked into reacquisition');a.equal(post(after.route)[0].breakBefore,true);
 const fresh={id:'nuova-sessione-ferma',samples:Array.from({length:60},(_,t)=>p(t,205+5*Math.sin(t),5*Math.cos(t),t===0?5:24))};a.deepEqual(run(fresh,true).route,run(fresh,false).route);
 console.table([summary(f,before,after),summary(fresh,run(fresh,false),run(fresh,true))]);
});
test('velocità assente: invalidi ed esplicita interruzione cancellano la finestra, soglie salti immutate',()=>{
 const make=(source)=>{const module={exports:{}};vm.runInNewContext(source,{module});return module.exports.create({initialAcquisition:true,now:()=>clock})};
 let clock=100000;const f=make(working),point=(x)=>({lat:44,lng:9+x/(111195*Math.cos(44*Math.PI/180)),accuracy:24,time:clock});
 for(let i=0;i<15;i++){clock+=1000;f.observe({...point(i*5),accuracy:i===0?5:24},null)}
 f.interrupt();clock+=30000;f.observe(point(100),null);clock+=1000;const r=f.observe(point(105),null);a.ok(r.accept&&r.breakBefore);a.ok(r.points.every(p=>p.time>=clock-1000));
 f.observe(null,null);clock+=1000;const next=f.observe(point(106),null);a.equal(next.accept,false);clock+=1000;const recovered=f.observe(point(107),null);a.ok(recovered.accept);a.ok(recovered.points.every(p=>p.time>=clock-1000));
 const jump=s=>s.slice(s.indexOf('const dt=(point.time-accepted.time)'),s.indexOf('    }else{',s.indexOf('const dt=(point.time-accepted.time)'))).replace(/resetUnknownMotion\(\);/g,'').replaceAll('\r\n','\n');a.equal(jump(working),jump(published));
});

test('velocità assente: non recupera retroattivamente jitter di una sosta iniziale',()=>{
 const samples=Array.from({length:51},(_,t)=>t<=10?p(t,t===0?0:7*Math.sin(t*1.3),t===0?0:7*Math.cos(t*1.9),t===0?5:24):p(t,(t-10)*5));
 const f={id:'sosta-iniziale-ripartenza',samples},before=run(f,false),after=run(f,true),parked=route=>route.filter(p=>p.time-Date.UTC(2026,0,1)>0&&p.time-Date.UTC(2026,0,1)<=10000);
 console.table([{...summary(f,before,after),fermo_prima:parked(before.route).length,fermo_dopo:parked(after.route).length}]);a.equal(parked(after.route).length,parked(before.route).length);
});
