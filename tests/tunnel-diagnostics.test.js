"use strict";
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),T=require('../tunnel-reconstruction.js');
const baseline=cp.execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show','37e497e07a2c0e2708b71093265387934a43088b:tunnel-reconstruction.js'],{cwd:root,encoding:'utf8'}),ctx={};vm.runInNewContext(baseline,ctx);const old=ctx.TunnelReconstruction,clone=x=>JSON.parse(JSON.stringify(x));
const point=(m,time,br=false)=>({lat:44,lng:9+m/(111195*Math.cos(44*Math.PI/180)),accuracy:3,time,breakBefore:br});
function fixture(){return{data:{version:1,id:'SYNTHETIC-NOT-PERSONAL',license:'ODbL-1.0',timestamp:'2026-10-28T00:00:00Z',nodes:[[44,9],[44,9.00375]],edges:[[0,1,350,101,0]],tunnels:[{id:'SYNTHETIC-TUNNEL',wayIds:[101],entry:0,exit:1,geometry:[[44,9],[44,9.0006],[44.0005,9.0019],[44,9.0031],[44,9.00375]],metres:350,branch:false}]},route:[-60,-30,0,300,330,360].map((m,i)=>point(m,100000+(i<3?i:32+i-3)*1000,i===3))}}
function replay(T,data,route){let clock=0;const raw=[],found=[],session=T.createSession({data,route:raw,now:()=>clock,isVisible:()=>true});for(let i=0;i<3;i++){raw.push(route[i]);found.push(...session.scan(raw));clock+=1000}for(let i=0;i<30;i++){clock+=1000;session.heartbeat()}for(let i=3;i<route.length;i++){clock+=1000;raw.push(route[i]);found.push(...session.scan(raw))}return{raw,found,session,clock}}
function balanced(s){a.equal(s.candidates,s.evaluated+s.pending+s.abandoned);a.equal(s.evaluated,s.accepted+s.rejected+s.errors);a.equal(s.rejected,Object.values(s.reasons).reduce((s,n)=>s+n,0))}
test('same decisions, recorded points and reconstruction geometry as fixed baseline for accepted/refused cases',()=>{
 const cases=[f=>f,f=>{f.data=null;return f},f=>{f.route[3].accuracy=50;return f},f=>{f.route[1].accuracy=50;return f},f=>{f.data.tunnels[0].branch=true;return f},f=>{f.data.edges.push([0,1,800,102,0]);return f},f=>{f.data.edges.push([0,1,800,102,1]);return f},f=>{f.data.tunnels.push({...clone(f.data.tunnels[0]),id:'second'});return f}];
 for(const modify of cases){const f=modify(fixture()),before=clone(f.route);a.equal(JSON.stringify(T.match(f.data,f.route,3,true)),JSON.stringify(old.match(f.data,f.route,3,true)));const current=replay(T,f.data,f.route),previous=replay(old,f.data,f.route);a.equal(JSON.stringify(current.found),JSON.stringify(previous.found));a.deepEqual(current.raw,before);a.deepEqual(f.route,before);balanced(current.session.diagnostics())}
});
test('one candidate, pending then exactly one evaluation; accepted and stop counters',()=>{
 const f=fixture(),r=replay(T,f.data,f.route.slice(0,4));let s=r.session.diagnostics();a.equal(s.detected,1);a.equal(s.candidates,1);a.equal(s.pending,1);a.equal(s.evaluated,0);balanced(s);r.session.stop();s=r.session.diagnostics();a.equal(s.pending,0);a.equal(s.abandoned,1);balanced(s);
 const accepted=replay(T,f.data,f.route);s=accepted.session.diagnostics();a.equal(s.accepted,1);a.equal(s.evaluated,1);a.equal(s.pending,0);balanced(s);a.equal(T.visible(f.route,accepted.found).length,1);
});
test('missing package and non-retryable refused first window have explicit reasons',()=>{
 const f=fixture();let r=replay(T,null,f.route);a.equal(r.session.diagnostics().reasons.package_unavailable,1);
 f.route[3].accuracy=50;r=replay(T,f.data,f.route);a.equal(r.session.diagnostics().reasons.after_window,1);const count=r.session.diagnostics().evaluated;r.raw.push(point(390,136000));r.session.scan(r.raw);a.equal(r.session.diagnostics().evaluated,count);a.equal(r.found.length,0);
});
test('algorithm exception remains an exception, category only is counted',()=>{
 const f=fixture();f.data.tunnels[0].geometry=[];let clock=0;const raw=[],session=T.createSession({data:f.data,route:raw,now:()=>clock,isVisible:()=>true});for(let i=0;i<3;i++){raw.push(f.route[i]);session.scan(raw);clock+=1000}for(let i=0;i<30;i++){clock+=1000;session.heartbeat()}raw.push(...f.route.slice(3));a.throws(()=>session.scan(raw));const s=session.diagnostics();a.equal(s.errors,1);a.equal(s.errorNames.TypeError,1);balanced(s);a.doesNotMatch(JSON.stringify(s),/SYNTHETIC-TUNNEL|lat|lng/);
});
const app=read('app.js'),fn=name=>app.split(/\r?\n/).find(l=>l.startsWith('function '+name+'('));
test('copy integration: current/historical separation and privacy; no coordinates, timestamps or gallery names',()=>{
 const f=fixture(),replayed=replay(T,f.data,f.route),d={received:6,accepted:6,discarded:0,started:0,ended:null,reasons:{},errors:{}};
 const context={state:{gpsDiagnostic:d,tempRoute:f.route,watch:1,liveFollow:true},window:{TunnelReconstruction:T,TunnelMapData:f.data,TunnelLoadStatus:{module:'ready',package:'ready',error:'unsafe-secret-message'}},document:{hidden:false},navigator:{geolocation:{}},performance:{now:()=>40000},Date,console};context.tunnelSession=replayed.session;context.tunnelDiagnosticOwner=d;context.tunnelLastDiagnostic=null;vm.createContext(context);vm.runInContext(fn('tunnelDiagnosisLines')+'\n'+fn('gpsDiagnosisText')+'\nthis.text=gpsDiagnosisText()',context);
 a.match(context.text,/ricostruzioni accettate: 1/);a.match(context.text,/errori elaborazione: 0/);a.doesNotMatch(context.text,/44\.0|9\.00|SYNTHETIC|unsafe-secret|2026-10-28|lat:|lng:/);
 context.state.gpsDiagnostic=null;vm.runInContext('this.text=gpsDiagnosisText()',context);a.match(context.text,/non disponibile per questa guida o sessione/);a.match(context.text,/ricostruzioni accettate: non disponibile/);
});
test('loading state is sanitized; map package and GPS filtering code untouched',()=>{
 a.ok(read('auth-client.js').includes('RESOURCE_LOAD_FAILED'));a.ok(read('auth-client.js').includes('tunnel-map-data.js?v=1'));
 const gps=cp.execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show','37e497e07a2c0e2708b71093265387934a43088b:lesson-gps.js'],{cwd:root});a.equal(read('lesson-gps.js').replaceAll('\r\n','\n'),gps.toString('utf8').replaceAll('\r\n','\n'));const map=cp.execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show','37e497e07a2c0e2708b71093265387934a43088b:tunnel-map-data.js'],{cwd:root,maxBuffer:20000000,encoding:'utf8'});a.equal(read('tunnel-map-data.js').replaceAll('\r\n','\n'),map.replaceAll('\r\n','\n'));
});
