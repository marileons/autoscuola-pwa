"use strict";
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8'),out=path.resolve(process.env.GPS_REVIEW_OUTPUT||path.join(require('node:os').tmpdir(),'agenda-gps-identity-review'));let browser;
test.before(async()=>{browser=await chromium.launch({executablePath:fs.existsSync(chromium.executablePath())?chromium.executablePath():'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});fs.mkdirSync(out,{recursive:true})});test.after(async()=>browser?.close());
async function page(width,height){
 const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='local.test')return route.abort();if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')});const file=path.resolve(root,'.'+u.pathname);if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&/\.(css|svg|png|webp|js)$/.test(file))return route.fulfill({path:file});return route.abort()});
 await p.goto('https://local.test');await p.clock.install({time:new Date('2026-10-27T10:00:00Z')});
 await p.evaluate(()=>{
  window.AgendaAuth={currentUser:()=>({id:'synthetic-user',name:'ISTRUTTORE FITTIZIO',role:'ADMIN',active:true,capabilities:{managePrivilegedUsers:true}}),can:()=>true,applicationReady:(show,login)=>{window.syntheticShow=show;window.syntheticLogin=login}};
  window.HomeSections={mount(){},sync(){},refresh:async()=>{},requirePath:()=>true};
  window.syntheticGps={watches:0,clears:0,callback:null,error:null};Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition(cb,error){syntheticGps.watches++;syntheticGps.callback=cb;syntheticGps.error=error;return syntheticGps.watches},clearWatch(){syntheticGps.clears++}}});
  const handler=()=>({enabled:true,enable(){this.enabled=true},disable(){this.enabled=false}});window.mapActivity={pan:0,fit:0};
  window.L={map(id){return{center:{lat:44,lng:9},zoom:13,dragging:handler(),keyboard:handler(),boxZoom:handler(),doubleClickZoom:handler(),touchZoom:handler(),scrollWheelZoom:handler(),on(){return this},off(){return this},setView(p,z){this.center={lat:p[0],lng:p[1]};this.zoom=z;return this},panTo(p){mapActivity.pan++;this.center={lat:p.lat??p[0],lng:p.lng??p[1]};return this},getCenter(){return this.center},getZoom(){return this.zoom},getContainer(){return document.getElementById(id)},invalidateSize(){},removeLayer(){},fitBounds(){mapActivity.fit++;return this}}},tileLayer(){return{addTo(){return this},on(){return this}}},polyline(points){return{points}},marker(point){return{point,addTo(){return this},bindPopup(){return this}}},featureGroup(layers){return{layers,addTo(){return this},getBounds(){return{isValid:()=>layers.length>0}}}}};
 });
 for(const name of ['student-license.js','student-license-store.js','student-archive-store.js','lesson-drafts.js','lesson-activities.js','lesson-secretary-transfer.js','student-multi-import.js','driving-errors.js','student-multi-actions.js','examiner-routes.js','exams.js','lesson-gps.js','app.js'])await p.addScriptTag({content:read(name)});
 await p.evaluate(async()=>{await AgendaAppReady;syntheticShow();state.students=[{id:'a',firstName:'NOME DIMOSTRATIVO MOLTO LUNGO',lastName:'COGNOME COMPOSTO SINTETICO PER PROVA',category:'auto',checklist:[],lessons:[],archived:false},{id:'b',firstName:'SECONDO',lastName:'ALLIEVO FITTIZIO',category:'auto',checklist:[],lessons:[],archived:false}];await studentArchiveStore.replaceAll(state.students);committedStudents=structuredClone(state.students);openStudent('a')});
 await p.evaluate(()=>document.fonts.ready);await p.clock.runFor(100);return{p,errors,ctx,close:()=>ctx.close()};
}
async function visibleIdentity(p){return p.evaluate(()=>{const bar=activeStudentIdentity,r=bar.getBoundingClientRect(),brand=document.querySelector('.home-brand').getBoundingClientRect();return{visible:!bar.hidden&&r.top>=0&&r.bottom<=innerHeight,name:activeStudentName.textContent,noSideOverflow:document.documentElement.scrollWidth<=innerWidth+1,belowBrand:r.top>=brand.bottom-1}})}
for(const[name,w,height]of [['iphone',390,844],['tablet',1180,820]])test('nome fisso '+name+': scheda, GPS, cambio allievo e schermate non pertinenti',async()=>{
 const h=await page(w,height);try{
  let info=await visibleIdentity(h.p);a.equal(info.visible,true);a.match(info.name,/COGNOME COMPOSTO/);a.equal(info.noSideOverflow,true);a.equal(info.belowBrand,true);
  await h.p.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await h.p.clock.runFor(100);info=await visibleIdentity(h.p);a.equal(info.visible,true);a.equal(info.noSideOverflow,true);
  await h.p.screenshot({path:path.join(out,name+'-scheda.png')});
  await h.p.evaluate(()=>openStudent('b'));a.equal((await visibleIdentity(h.p)).name,'ALLIEVO FITTIZIO SECONDO');
  await h.p.evaluate(()=>{openStudent('a');newLesson()});await h.p.waitForFunction(()=>lessonDraftReady);await h.p.evaluate(()=>startGps());
  await h.p.clock.runFor(1000);await h.p.evaluate(()=>syntheticGps.callback({coords:{latitude:44,longitude:9,accuracy:5,speed:4},timestamp:Date.now()}));
  await h.p.locator('.gps-card').scrollIntoViewIfNeeded();await h.p.evaluate(()=>scrollBy(0,160));await h.p.clock.runFor(100);
  info=await visibleIdentity(h.p);a.equal(info.visible,true);a.match(info.name,/COGNOME COMPOSTO/);a.equal(info.noSideOverflow,true);a.equal(await h.p.evaluate(()=>syntheticGps.watches),1);
  const stateBefore=await h.p.evaluate(()=>({zoom:state.liveMap.getZoom(),follow:state.liveFollow,elapsed:LessonDrafts.elapsed({startedAt:lessonStartedAt})}));await h.p.evaluate(()=>{state.liveMap.zoom=16;resumeGpsFollow();resumeGpsFollow()});await h.p.clock.runFor(2000);await h.p.evaluate(()=>syntheticGps.callback({coords:{latitude:44.0001,longitude:9.0001,accuracy:5,speed:4},timestamp:Date.now()}));
  a.equal(await h.p.evaluate(()=>state.liveMap.getZoom()),16);a.equal(await h.p.evaluate(()=>state.liveFollow),stateBefore.follow);a.ok(await h.p.evaluate(()=>LessonDrafts.elapsed({startedAt:lessonStartedAt}))>=stateBefore.elapsed+2000);a.equal(await h.p.evaluate(()=>syntheticGps.clears),0);
  await h.p.screenshot({path:path.join(out,name+'-lezione-gps.png')});
  await h.p.evaluate(()=>{show('home')});a.equal(await h.p.locator('#activeStudentIdentity').isVisible(),false);a.equal(await h.p.locator('#activeStudentName').textContent(),'');
  await h.p.evaluate(()=>show('otherFunctions'));a.equal(await h.p.locator('#activeStudentIdentity').isVisible(),false);a.deepEqual(h.errors,[]);
 }finally{await h.close()}
});
test('salvataggio e riapertura reali su archivio isolato: stessa geometria e diagnostica storica veritiera',async()=>{
 const h=await page(820,1180);try{
  await h.p.evaluate(()=>newLesson());await h.p.waitForFunction(()=>lessonDraftReady);await h.p.evaluate(()=>startGps());
  for(const[x,y,t]of [[0,0,1000],[10,0,1000],[20,5,1000],[22,15,1000],[500,200,25000],[515,210,1000]]){
   await h.p.clock.runFor(t);await h.p.evaluate(({x,y})=>syntheticGps.callback({coords:{latitude:44+x/111195,longitude:9+y/(111195*Math.cos(44*Math.PI/180)),accuracy:5,speed:4},timestamp:Date.now()}),{x,y});
  }
  const before=await h.p.evaluate(()=>JSON.stringify(state.tempRoute));await h.p.evaluate(()=>saveLesson());await h.p.waitForFunction(()=>document.getElementById('student').classList.contains('active'));
  const id=await h.p.evaluate(async()=>{const people=await studentArchiveStore.snapshot(),person=people.find(s=>s.id==='a');return person.lessons[0].id});
  a.equal(await h.p.evaluate(async id=>JSON.stringify((await studentArchiveStore.snapshot()).find(s=>s.id==='a').lessons.find(l=>l.id===id).route),id),before);
  await h.p.evaluate(id=>openLesson(id),id);await h.p.waitForFunction(()=>lessonDraftReady);
  a.equal(await h.p.evaluate(()=>JSON.stringify(state.tempRoute)),before);a.equal(await h.p.evaluate(()=>routeSegments(state.tempRoute).length),2);
  const text=await h.p.evaluate(()=>gpsDiagnosisText());a.match(text,/traccia storica riaperta/);a.match(text,/Campioni ricevuti: non disponibile/);a.doesNotMatch(text,/COGNOME|DIMOSTRATIVO|synthetic-user/);a.deepEqual(h.errors,[]);
 }finally{await h.close()}
});
