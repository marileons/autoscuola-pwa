"use strict";
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),cp=require('node:child_process'),gps=require('../lesson-gps.js');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'app.js'),'utf8'),fn=n=>app.split(/\r?\n/).find(l=>l.startsWith('function '+n+'('));
const base=1000000000000,point=(x,t,accuracy=5,y=0)=>({lat:44+x/111195,lng:9+y/(111195*Math.cos(44*Math.PI/180)),accuracy,time:base+t});
function harness(){let clock=base,callback,onerror;const watches=[],clears=[],outputs={},state={watch:null,tempRoute:[],tempErrors:[],gpsNeedsBreak:false,liveFollow:true,studentId:'PRIVATE-STUDENT-ID',notes:'PRIVATE-NOTE',gpsState:'inactive'},c=vm.createContext({state,Date:{now:()=>clock},performance:{now:()=>clock-base},window:{isSecureContext:true,AgendaAuth:{can:()=>true},LessonGps:{create:o=>gps.create({...o,now:()=>clock})}},document:{hidden:false},navigator:{geolocation:{watchPosition(cb,err,options){callback=cb;onerror=err;watches.push({cb,options});return watches.length},clearWatch:id=>clears.push(id)}},$:id=>outputs[id]||(outputs[id]={textContent:''}),drawLive(){},persistLessonSession(){},updateGpsUi(){},gpsErrorMessage:()=> 'Errore simulato',alert(){throw Error('Nessuna richiesta manuale prevista')}});
 for(const n of ['recordGpsDiagnostic','gpsDiagnosisText','startGps','stopGps','validRoutePoints','routeSegments'])vm.runInContext(fn(n),c);
 return{c,state,outputs,watches,clears,now:t=>clock=base+t,start:()=>c.startGps(),stop:()=>c.stopGps(),error:code=>onerror({code}),raw:pos=>callback(pos),send(x,t,accuracy=5,y=0,stamp=t){clock=base+t;const p=point(x,stamp,accuracy,y);callback({coords:{latitude:p.lat,longitude:p.lng,accuracy:p.accuracy,speed:4},timestamp:p.time})}};
}
test('difetto riprodotto nella revisione pubblicata: null non deve diventare una coordinata zero',()=>{
 const previous=cp.execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show','9f77e7241c362a0f45c3ee2853f377437c6c8f7d:app.js'],{cwd:root,encoding:'utf8'});
 const old=harness();vm.runInContext(previous.split(/\r?\n/).find(l=>l.startsWith('function startGps(')),old.c);old.start();old.raw({coords:{latitude:null,longitude:null,accuracy:null},timestamp:base});a.equal(old.state.tempRoute.length,1);a.equal(old.state.tempRoute[0].lat,0);
 const h=harness();h.start();for(const coords of [{latitude:null,longitude:null,accuracy:null},{latitude:'44',longitude:9,accuracy:5},{latitude:44,longitude:9,accuracy:-1},{latitude:91,longitude:9,accuracy:5}])h.raw({coords,timestamp:base});
 a.equal(h.state.tempRoute.length,0);a.equal(h.state.gpsDiagnostic.reasons.invalid,4);h.send(0,1000);a.equal(h.state.tempRoute.length,1);a.equal(h.state.tempRoute[0].lat,44);
});
test('marcia regolare e curva: geometria reale preservata fra acquisizione e rendering',()=>{
 const h=harness();h.start();const route=[[0,0,0],[10,1000,0],[20,2000,4],[24,3000,12],[24,4000,22]];for(const[x,t,y]of route)h.send(x,t,5,y);
 a.equal(h.state.tempRoute.length,5);for(let i=0;i<route.length;i++){a.equal(h.state.tempRoute[i].lat,point(route[i][0],route[i][1]).lat);a.equal(h.state.tempRoute[i].lng,point(0,0,5,route[i][2]).lng)}
 const segments=h.c.routeSegments(h.state.tempRoute);a.equal(segments.length,1);a.equal(segments[0].length,5);a.equal(h.state.gpsDiagnostic.receiveIntervals.max,1000);a.equal(h.state.gpsDiagnostic.recorded,5);
});
test('galleria e riacquisizione automatiche: nessun ponte, intervalli e precisioni di tutta la sessione',()=>{
 const h=harness();h.start();h.send(0,0);h.send(20,1000);h.error(3);h.send(500,30000,24);h.send(520,31000,20);a.equal(h.state.tempRoute.length,4);a.equal(h.state.tempRoute[2].breakBefore,true);a.equal(h.state.tempRoute[3].breakBefore,false);a.equal(h.c.routeSegments(h.state.tempRoute).length,2);
 const d=h.state.gpsDiagnostic;a.equal(d.received,4);a.equal(d.accepted,3);a.equal(d.discarded,1);a.equal(d.recorded,4);a.equal(d.recovered,1);a.equal(d.errors.timeout,1);a.equal(d.gaps,1);a.equal(d.segments,2);a.equal(d.receiveIntervals.max,29000);a.equal(d.precision.min,5);a.equal(d.precision.max,24);a.equal(d.precision.total,54);a.equal(d.precision.count,4);a.equal(h.watches.length,1);
 h.stop();a.equal(h.clears.length,1);h.now(40000);a.match(h.c.gpsDiagnosisText(),/Durata osservata della sessione \(s\): 31/);
});
test('campioni vecchi, duplicati e fuori ordine esclusi senza alterare la traccia accettata',()=>{
 const h=harness();h.start();h.send(0,0);h.send(10,1000);h.send(800,2000,5,0,0);h.send(900,3000,5,0,1000);h.send(900,15000,5,0,2000);h.send(20,16000);
 a.equal(h.state.tempRoute.length,3);a.equal(h.state.gpsDiagnostic.reasons.stale,3);a.equal(h.state.tempRoute.at(-1).lat,point(20,16000).lat);a.equal(h.state.tempRoute.at(-1).breakBefore,false);
});
test('salto isolato respinto, callback tardive ignorate, seguito separato dalla registrazione',()=>{
 const h=harness();h.start();h.send(0,0);h.send(5000,1000);h.state.liveFollow=false;h.send(20,2000);a.equal(h.state.tempRoute.length,2);a.equal(h.state.gpsDiagnostic.reasons.pending,1);a.equal(h.state.gpsDiagnostic.jumps,1);
 const old=h.watches[0].cb;h.stop();const before=JSON.stringify(h.state.tempRoute);old({coords:{latitude:44.5,longitude:9,accuracy:5},timestamp:base+3000});a.equal(JSON.stringify(h.state.tempRoute),before);
});
test('diagnosi: età calcolata alla copia, conteggi motivati, memoria costante e assenza di dati personali',()=>{
 const h=harness();h.start();h.send(0,0,5);h.send(20,1000,24);h.send(9000,2000,7);h.now(21000);const before=JSON.stringify(h.state),text=h.c.gpsDiagnosisText();
 a.match(text,/Età ultima posizione ricevuta al momento della copia \(s\): 19/);a.match(text,/Età ultima posizione accettata al momento della copia \(s\): 20/);a.match(text,/salto in verifica: 1/);a.match(text,/Precisioni ricevute min \/ media \/ max \(m\): 5 \/ 12 \/ 24/);a.match(text,/Pausa senza ricezioni attualmente oltre 15 s: sì/);a.doesNotMatch(text,/PRIVATE-|1000000000000|44\.0|9\.0/);a.equal(JSON.stringify(h.state),before);
 h.state.gpsDiagnostic.reasons['PRIVATE-NAME']=100;h.state.gpsDiagnostic.errors['PRIVATE-NOTE']=100;a.doesNotMatch(h.c.gpsDiagnosisText(),/PRIVATE-/);
 a.equal(Object.values(h.state.gpsDiagnostic).some(Array.isArray),false);
 const out=path.resolve(process.env.GPS_REVIEW_OUTPUT||path.join(require('node:os').tmpdir(),'agenda-gps-identity-review'));fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'diagnosi-fittizia.txt'),text);
});
test('traccia storica: nessuna attribuzione delle statistiche di ricezione, nessuna riscrittura dei punti',()=>{
 const h=harness();h.state.lessonId='PRIVATE-LESSON';h.state.tempRoute=[point(0,0),point(10,1000),{...point(500,30000),breakBefore:true},point(520,31000,20)];h.state.gpsDiagnostic=null;
 const before=JSON.stringify(h.state),text=h.c.gpsDiagnosisText();a.match(text,/Contesto: traccia storica riaperta/);a.match(text,/Campioni ricevuti: non disponibile/);a.match(text,/Motivi degli scarti o attese: non disponibile/);a.match(text,/Durata osservata della sessione \(s\): non disponibile/);a.match(text,/Punti presenti nella traccia: 4/);a.match(text,/Segmenti presenti nella traccia: 2/);a.equal(JSON.stringify(h.state),before);
 for(const name of ['newLesson','openLesson'])a.ok(fn(name).includes('state.gpsDiagnostic=null;'));
});
