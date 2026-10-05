"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path"),root=path.join(__dirname,"..");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8"),road=fs.readFileSync(path.join(root,"r10-features.js"),"utf8");
function functions(context,names){for(const name of names)vm.runInContext(app.split(/\r?\n/).find(line=>line.startsWith(`function ${name}(`)),context)}
test("GPS: dopo la ripresa un solo break, linea continua sui punti successivi e nessun duplicato",()=>{
 let callback,persisted=0;const state={watch:null,tempRoute:[],gpsNeedsBreak:false},context=vm.createContext({state,window:{LessonGps:require("../lesson-gps.js"),AgendaAuth:{can:()=>true}},navigator:{geolocation:{watchPosition(fn){callback=fn;return 1}}},drawLive(){},persistLessonSession(){persisted++},updateGpsUi(){},alert(){throw Error("unexpected")}});
 functions(context,["distance","bearing","bearingDelta","evaluateGpsPoint","startGps"]);context.startGps();
 const point=(latitude,timestamp,accuracy=5)=>callback({coords:{latitude,longitude:8.9,accuracy},timestamp});
 point(44.4,1000);point(44.4001,5000);state.gpsNeedsBreak=true;point(44.4002,100000);point(44.4003,105000);point(44.4003,105000);
 assert.equal(state.tempRoute.length,3);assert.deepEqual(state.tempRoute.map(p=>p.breakBefore),[false,false,true]);assert.equal(persisted,3);
 point(44.4004,110000,150);assert.equal(state.tempRoute.length,3);point(44.4004,115000);assert.equal(state.tempRoute.length,3);point(44.4005,120000);assert.equal(state.tempRoute.at(-1).breakBefore,true);assert.equal(state.gpsNeedsBreak,false);
 point(44.4006,125000);assert.equal(state.tempRoute.at(-1).breakBefore,false);assert.equal(state.tempRoute.length,5);
});
test("coordinate invalide separano i segmenti senza inventare punti; zero e un punto validi",()=>{
 const c=vm.createContext({});functions(c,["validRoutePoints","routeSegments"]);
 assert.equal(c.validRoutePoints(null).length,0);assert.equal(c.routeSegments([{lat:44,lng:8}]).length,1);
 const points=[{lat:44,lng:8},{lat:91,lng:8},{lat:44.1,lng:8.1},{lat:44.2,lng:8.2}],copy=JSON.stringify(points),segments=c.routeSegments(points);
 assert.equal(segments.length,2);assert.equal(segments[1].length,2);assert.equal(JSON.stringify(points),copy);
});
test("report strada conserva dettaglio e interruzioni entro il limite senza richieste esterne",()=>{
 const c=vm.createContext({MAX_ROAD_REQUESTS:26,ROAD_SAMPLE_MIN_METRES:15}),start=road.indexOf("  function sampleRoute("),end=road.indexOf("\n  function ",start+5);vm.runInContext(road.slice(start,end),c);
 const route=Array.from({length:120},(_,i)=>({lat:44.4+i*.00012,lng:8.9+(i%4)*.00015,breakBefore:i===55})),saved=JSON.stringify(route),samples=c.sampleRoute(route);
 assert.ok(samples.length>5);assert.ok(samples.length<=26);assert.ok(samples.some(p=>p.breakBefore));assert.equal(JSON.stringify(route),saved);
 const invalid=c.sampleRoute([{lat:44,lng:8},{lat:NaN,lng:8},{lat:44.001,lng:8.001}]);assert.equal(invalid.at(-1).breakBefore,true);
});
