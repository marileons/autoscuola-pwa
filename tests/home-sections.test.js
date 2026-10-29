"use strict";
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,root}=require('./shared-calendar-support.js');
const read=n=>fs.readFileSync(path.join(root,n),'utf8'),ids=['auto','moto','quad-leggero','quad-pesante','corso-moto','guida-accompagnata','perfezionamento','esame-revisione','esame-esperimento'];
const call=(f,who,body,options)=>f.worker.fetch(f.request(who,'/api/home-sections',body,options),f.env);
async function run(fn){const f=await fixture();try{return await fn(f)}finally{f.close()}}
async function ok(response){a.equal(response.status,200,await response.clone().text());return response.json()}
const oldTables=f=>f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'app_home_sections' ORDER BY name").all().map(r=>r.name);
const snapshot=f=>JSON.stringify(oldTables(f).map(n=>[n,f.db.prepare('SELECT * FROM '+n).all()]));
test('migrazione locale additiva: applicazione su dati fittizi, schema e integrità invariati',()=>run(async f=>{
 f.db.exec('DROP TABLE app_home_sections');const before=snapshot(f),schema=f.db.prepare("SELECT sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
 f.db.exec(read('migrations/0021_app_home_sections.sql'));a.equal(snapshot(f),before);a.deepEqual(f.db.prepare("SELECT sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name<>'app_home_sections' ORDER BY name").all(),schema);
 a.equal(f.db.prepare('SELECT count(*) AS n FROM app_home_sections').get().n,0);a.equal(f.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');a.deepEqual(f.db.prepare('PRAGMA foreign_key_check').all(),[]);
}));
test('configurazione assente: default AUTO/MOTO senza scritture; lettura consentita ai profili previsti',()=>run(async f=>{const before=snapshot(f);for(const who of ['principal','admin','i1','secretary'])a.deepEqual(await ok(await call(f,who)),{enabled:['auto','moto'],version:0,configured:false});a.equal(f.db.prepare('SELECT count(*) n FROM app_home_sections').get().n,0);a.equal(snapshot(f),before)}));
test('solo principale può salvare: altri ruoli, anonimo, password provvisoria, revoca e origine',()=>run(async f=>{
 for(const who of ['admin','i1','secretary','manager','blocked','invalid',null]){const r=await call(f,who,{enabled:ids,version:0});a.ok([401,403].includes(r.status),who)}
 a.equal((await call(f,'manager')).status,403);a.equal((await call(f,'principal',{enabled:ids,version:0},{purpose:'PASSWORD_CHANGE'})).status,403);
 a.equal((await call(f,'principal',{enabled:ids,version:0},{origin:'https://foreign.test'})).status,403);
 f.db.exec("UPDATE users SET is_primary_admin=0 WHERE id='principal'");a.equal((await call(f,'principal',{enabled:ids,version:0})).status,403);a.equal(f.db.prepare('SELECT count(*) n FROM app_home_sections').get().n,0);
}));
test('persistenza condivisa, nascondere e riattivare senza modificare dati preesistenti',()=>run(async f=>{
 const before=snapshot(f);a.equal((await ok(await call(f,'principal',{enabled:['quad-leggero','auto'],version:0}))).version,1);
 for(const who of ['i1','admin','secretary'])a.deepEqual((await ok(await call(f,who))).enabled,['auto','quad-leggero']);
 await ok(await call(f,'principal',{enabled:[],version:1}));a.deepEqual((await ok(await call(f,'i1'))).enabled,[]);
 await ok(await call(f,'principal',{enabled:ids,version:2}));a.deepEqual((await ok(await call(f,'i1'))).enabled,ids);a.equal(snapshot(f),before);
}));
test('concorrenza e validazione: un solo aggiornamento per versione, nessuna scrittura invalida',()=>run(async f=>{
 const responses=await Promise.all([call(f,'principal',{enabled:['auto'],version:0}),call(f,'principal',{enabled:['moto'],version:0})]);a.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
 const before=f.db.prepare('SELECT * FROM app_home_sections').get();
 for(const body of [{enabled:['x'],version:1},{enabled:['auto','auto'],version:1},{enabled:['auto'],version:-1},{enabled:['auto'],version:1,role:'ADMIN'},{enabled:'auto',version:1}])a.equal((await call(f,'principal',body)).status,400);
 a.deepEqual(f.db.prepare('SELECT * FROM app_home_sections').get(),before);
}));
test('tabella mancante, dati non validi o guasto storage sono errori 503, mai default',()=>run(async f=>{
 f.db.exec('DROP TABLE app_home_sections');for(const body of [undefined,{enabled:['auto'],version:0}]){const r=await call(f,'principal',body);a.equal(r.status,503);a.equal((await r.json()).code,'HOME_SECTIONS_STORAGE_UNAVAILABLE')}
 f.db.exec(read('migrations/0021_app_home_sections.sql'));f.db.prepare('INSERT INTO app_home_sections VALUES(1,?,1,NULL,?)').run('["sconosciuto"]','2099-01-01');a.equal((await call(f,'i1')).status,503);
}));
test('modulo server escluso dagli asset; modulo UI resta protetto e accessibile ai profili previsti',()=>run(async f=>{
 a.ok(read('.assetsignore').includes('home-sections-api.js'));a.ok(read('.assetsignore').includes('migrations'));a.ok(read('.assetsignore').includes('tests/'));
 a.equal((await f.worker.fetch(f.request(null,'/home-sections-api.js'),f.env)).status,404);a.equal((await f.worker.fetch(f.request(null,'/home-sections.js'),f.env)).status,401);
 a.equal((await f.worker.fetch(f.request('secretary','/home-sections.js'),f.env)).status,200);
 const auth=read('auth-client.js');a.ok(auth.indexOf('"home-sections.js?v=users-2"')<auth.indexOf('"app.js?v=home-users-tunnel-diagnostics-2"'));
}));

const {chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let browser;const out=path.resolve(process.env.HOME_SECTIONS_OUTPUT||path.join(process.env.TEMP||require('node:os').tmpdir(),'agenda-home-sections-review'));
test.before(async()=>{browser=await chromium.launch({executablePath:fs.existsSync(chromium.executablePath())?chromium.executablePath():'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});fs.mkdirSync(out,{recursive:true})});test.after(async()=>browser?.close());
async function ui(who='principal',width=390,height=844){
 const f=await fixture(),ctx=await browser.newContext({viewport:{width,height}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 let readFail=false,saveFail=false,posts=0,requests=0,hold=false,release;
 await p.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.hostname!=='local.test')return route.abort();
  if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')});
  if(u.pathname==='/api/home-sections'||u.pathname.startsWith('/api/home-sections/')){
   requests++;const post=req.method()==='POST';if(post)posts++;
   if(hold&&!post)await new Promise(r=>release=r);
   if(readFail&&!post||saveFail&&post)return route.fulfill({status:503,json:{error:'ERRORE STORAGE SIMULATO',code:'HOME_SECTIONS_STORAGE_UNAVAILABLE'}});
   const r=await f.worker.fetch(f.request(who,u.pathname,post?JSON.parse(req.postData()):undefined),f.env);return route.fulfill({status:r.status,json:await r.json()});
  }
  const file=path.resolve(root,'.'+u.pathname);if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&/\.(css|svg|png|webp)$/.test(file))return route.fulfill({path:file});return route.abort();
 });
 await p.goto('https://local.test/');
 await p.evaluate(who=>{
  document.getElementById('loginScreen').classList.add('hidden');document.getElementById('appShell').classList.remove('hidden');document.getElementById('homeBrandUser').textContent='Ciao, Utente Fittizio';
  window.syntheticUser={id:who,role:who==='i1'?'ISTRUTTORE':who==='secretary'?'SEGRETERIA':who==='manager'?'USER_MANAGER':'ADMIN',active:true,capabilities:{managePrivilegedUsers:who==='principal'}};window.AgendaAuth={currentUser:()=>syntheticUser,can:()=>true};
  window.UNCLASSIFIED_CATEGORY='da-classificare';window.$=id=>document.getElementById(id);window.state={students:[],sites:[],filter:null,studentListMode:'hidden'};window.updatePageTitle=()=>{};window.renderStudents=()=>{};window.alerts=[];window.alert=s=>alerts.push(s);
  for(const source of document.querySelectorAll('#home .categories [data-f]'))document.getElementById('secretaryCategories').append(source.cloneNode(true));
  window.show=id=>{document.querySelectorAll('.view').forEach(n=>n.classList.toggle('active',n.id===id))};
 },who);
 await p.addScriptTag({content:read('student-archive-store.js')});
 const app=read('app.js'),block=app.slice(app.indexOf('// Home counters are derived'),app.indexOf('function studentsForCategorySearch(')),select=app.split(/\r?\n/).find(l=>l.startsWith('function selectStudentSection('));
 await p.addScriptTag({content:'let homeStudentCountsReady=true;\n'+block+'\n'+select+'\n'+app.split(/\r?\n/).find(l=>l.startsWith('document.querySelectorAll(".categories button[data-f]")'))});
 await p.evaluate(async()=>{
  window.AgendaStudentArchiveStore=StudentArchiveStore.createStore({indexedDB,legacyStorage:localStorage});await AgendaStudentArchiveStore.initialize();
  const people=['auto','moto','quad-leggero'].flatMap((category,k)=>Array.from({length:k+2},(_,i)=>({id:'fittizio-'+category+'-'+i,category,firstName:'ALLIEVO',lastName:'SINTETICO',archived:i===0,siteId:'site-'+i%2,siteName:'Sede '+(i%2+1),lessons:[{id:'guida-'+i,notes:'NOTA FITTIZIA',checklist:[]}],checklist:[]})));
  await AgendaStudentArchiveStore.replaceAll(people);state.students=await AgendaStudentArchiveStore.snapshot();renderHomeStudentCounts();
  document.querySelectorAll('#category option').forEach(n=>n.dataset.original=n.textContent);
 });
 await p.addScriptTag({content:read('home-sections.js')});await p.evaluate(async()=>{HomeSections.mount();await HomeSections.refresh()});await p.evaluate(()=>document.fonts.ready);
 return {p,f,errors,ctx,get posts(){return posts},get requests(){return requests},failRead:v=>readFail=v,failSave:v=>saveFail=v,hold:()=>hold=true,release:()=>{hold=false;release?.()},async close(){await ctx.close();f.close()}};
}
const visible=p=>p.locator('#home .categories [data-f]:visible').evaluateAll(ns=>ns.map(n=>n.dataset.f));
test('UI: SALVA, ANNULLA, persistenza condivisa, errore salvataggio e doppio tocco',async()=>{
 const h=await ui();try{
  a.deepEqual(await visible(h.p),['auto','moto']);await h.p.evaluate(()=>show('otherFunctions'));
  await h.p.locator('#manageHomeSections').click();await h.p.locator('#homeSectionsUser option[value="global:"]').waitFor({state:'attached'});await h.p.locator('#homeSectionsUser').selectOption('global:');await h.p.waitForFunction(()=>document.querySelectorAll('#homeSectionsList input').length===9);await h.p.waitForFunction(()=>document.querySelectorAll('#homeSectionsList input').length===9);a.equal(await h.p.locator('#homeSectionsList input').count(),9);
  await h.p.locator('#homeSectionsList input[value="quad-leggero"]').check();await h.p.locator('#homeSectionsCancel').click();a.equal(h.posts,0);a.deepEqual(await visible(h.p),[]);
  await h.p.locator('#manageHomeSections').click();await h.p.locator('#homeSectionsUser option[value="global:"]').waitFor({state:'attached'});await h.p.locator('#homeSectionsUser').selectOption('global:');await h.p.waitForFunction(()=>document.querySelectorAll('#homeSectionsList input').length===9);a.equal(await h.p.locator('#homeSectionsList input[value="quad-leggero"]').isChecked(),false);
  await h.p.locator('#homeSectionsList input[value="quad-leggero"]').check();h.failSave(true);await h.p.locator('#homeSectionsSave').click();await h.p.getByText('ERRORE STORAGE SIMULATO',{exact:true}).waitFor();a.equal(await h.p.locator('#homeSectionsDialog').evaluate(n=>n.open),true);a.deepEqual((await ok(await call(h.f,'i1'))).enabled,['auto','moto']);
  h.failSave(false);await h.p.evaluate(()=>{homeSectionsSave.click();homeSectionsSave.click()});await h.p.waitForFunction(()=>!homeSectionsDialog.open);a.equal(h.posts,2);
  a.deepEqual((await ok(await call(h.f,'i1'))).enabled,['auto','moto','quad-leggero']);await h.p.evaluate(()=>show('home'));a.deepEqual(await visible(h.p),['auto','moto','quad-leggero']);a.deepEqual(h.errors,[]);
 }finally{await h.close()}
});
test('UI: offline/errore distinti da assenza; ultima configurazione conservata e reset fra account',async()=>{
 const h=await ui('i1');try{
  await h.p.evaluate(()=>show('otherFunctions'));a.equal(await h.p.locator('#manageHomeSections').isVisible(),false);await h.p.evaluate(()=>show('home'));h.failRead(true);await h.p.evaluate(()=>HomeSections.refresh());a.deepEqual(await visible(h.p),['auto','moto']);a.match(await h.p.locator('#homeSectionsStatus').textContent(),/ultime impostazioni/);
  await h.p.evaluate(()=>HomeSections.reset());await h.p.evaluate(()=>HomeSections.refresh());a.deepEqual(await visible(h.p),[]);a.equal(await h.p.evaluate(()=>HomeSections.isEnabled('auto')),false);
  await h.p.evaluate(()=>Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true}));await h.p.evaluate(()=>HomeSections.refresh());a.match(await h.p.locator('#homeSectionsStatus').textContent(),/Nessuna connessione/);
  h.failRead(false);await h.p.evaluate(()=>Object.defineProperty(navigator,'onLine',{get:()=>true,configurable:true}));await h.p.evaluate(()=>HomeSections.refresh());
  h.hold();const pending=h.p.evaluate(()=>HomeSections.refresh());await h.p.waitForTimeout(30);await h.p.evaluate(()=>{syntheticUser={id:'altro-account',role:'ISTRUTTORE',active:true};HomeSections.reset()});h.release();await pending;a.deepEqual(await visible(h.p),[]);a.deepEqual(h.errors,[]);
 }finally{await h.close()}
});
test('UI: sezioni nascoste e riattivate, scelte operative, dati IndexedDB e consultazione invariati',async()=>{
 const h=await ui();try{
  const before=await h.p.evaluate(async()=>JSON.stringify(await AgendaStudentArchiveStore.snapshot()));
  await h.p.evaluate(()=>selectStudentSection('quad-leggero'));a.equal(await h.p.evaluate(()=>state.filter),null);a.equal(await h.p.locator('#category option[value="quad-leggero"]').evaluate(n=>n.disabled),true);
  await h.p.evaluate(()=>{studentForm.dataset.existingPath='quad-leggero';HomeSections.sync()});a.equal(await h.p.locator('#category option[value="quad-leggero"]').evaluate(n=>n.disabled),false);
  await ok(await call(h.f,'principal',{enabled:ids,version:0}));await h.p.evaluate(()=>HomeSections.refresh());a.equal((await visible(h.p)).length,9);await h.p.evaluate(()=>selectStudentSection('quad-leggero'));a.equal(await h.p.evaluate(()=>state.filter),'quad-leggero');
  a.equal(await h.p.evaluate(async()=>JSON.stringify(await AgendaStudentArchiveStore.snapshot())),before);a.deepEqual(h.errors,[]);
 }finally{await h.close()}
});
for(const [name,w,height]of [['iphone',390,844],['tablet-verticale',820,1180],['tablet-orizzontale',1180,820]])test('rendering mirato '+name+': due percorsi, riattivazione e pannello',async()=>{
 const h=await ui('principal',w,height);try{
  for(const [label,paths]of [['auto-moto',['auto','moto']],['tre-percorsi',['auto','moto','quad-leggero']],['tutti',ids],['nessuno',[]]]){
   const config=await ok(await call(h.f,'principal'));await ok(await call(h.f,'principal',{enabled:paths,version:config.version}));await h.p.evaluate(()=>HomeSections.refresh());
   a.equal((await visible(h.p)).length,paths.length);const layout=await h.p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,small:[...document.querySelectorAll('#home .categories button:not([hidden])')].some(b=>b.getBoundingClientRect().height<44)}));a.deepEqual(layout,{overflow:false,small:false});
   if(label==='auto-moto')await h.p.screenshot({path:path.join(out,name+'-home.png'),fullPage:true});
  }
  await h.p.evaluate(()=>show('otherFunctions'));await h.p.locator('#manageHomeSections').click();await h.p.locator('#homeSectionsUser option[value="global:"]').waitFor({state:'attached'});await h.p.locator('#homeSectionsUser').selectOption('global:');await h.p.waitForFunction(()=>document.querySelectorAll('#homeSectionsList input').length===9);await h.p.screenshot({path:path.join(out,name+'-sezioni.png'),fullPage:true});a.equal(await h.p.locator('#homeSectionsDialog').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
  a.deepEqual(h.errors,[]);
 }finally{await h.close()}
});
test('backup completo reale: percorsi nascosti, lezioni e documento conservati dopo ripristino vuoto',async()=>{
 // Reuse just the existing fixture builder, without registering or repeating its tests.
 const base=read('tests/backup-first-use.test.js'),source=base.slice(base.indexOf('async function page('),base.indexOf("for(const mode of ['fresh'"));
 const make=new Function('browser','read',source+';return page;')(browser,read),p=await make();
 try{
  await p.addScriptTag({content:read('home-sections.js')});
  const result=await p.evaluate(async()=>{
   const people=['auto','moto','quad-leggero','quad-pesante','corso-moto','guida-accompagnata','perfezionamento','esame-revisione','esame-esperimento'].map((category,i)=>({id:'fittizio-'+i,firstName:'ALLIEVO',lastName:'SINTETICO',category,archived:i%2===0,checklist:[],lessons:[{id:'guida-'+i,createdAt:1,duration:'1 ora',notes:'NOTA FITTIZIA',route:[],checklist:[],errors:[]}]}));
   await AgendaStudentArchiveStore.replaceArchive(people,[]);
   const db=await B.openDocumentDatabase();await new Promise((resolve,reject)=>{const t=db.transaction('documents','readwrite');t.objectStore('documents').put({id:'doc-fittizio',title:'DOCUMENTO FITTIZIO',originalName:'fittizio.pdf',mimeType:'application/pdf',section:'quad-leggero',blob:new Blob(['PDF FITTIZIO'],{type:'application/pdf'}),createdAt:1,updatedAt:1});t.oncomplete=resolve;t.onabort=()=>reject(t.error)});db.close();
   const before=JSON.stringify(await AgendaStudentArchiveStore.snapshot()),payload=await B.createBackupPayload(),file=await B.createBackupFile(payload,'fittizio.agendabackup'),valid=await B.readBackupFile(file);
   await AgendaStudentArchiveStore.replaceArchive([],[]);await B.applyValidatedBackup(valid);const after=JSON.stringify(await AgendaStudentArchiveStore.snapshot());
   const reopened=await B.openDocumentDatabase(),doc=await new Promise((resolve,reject)=>{const t=reopened.transaction('documents'),q=t.objectStore('documents').get('doc-fittizio');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});reopened.close();return{same:before===after,count:(await AgendaStudentArchiveStore.snapshot()).length,doc:{id:doc.id,section:doc.section,text:await doc.blob.text()}};
  });
  a.deepEqual(result,{same:true,count:9,doc:{id:'doc-fittizio',section:'quad-leggero',text:'PDF FITTIZIO'}});
 }finally{await p.context().close()}
});

test('pannello gestione pronto: controlli e anteprime con interruttori caricati, telefono/tablet',async()=>{
 for(const[name,w,height]of [['iphone',390,844],['tablet-verticale',820,1180],['tablet-orizzontale',1180,820]]){
  const h=await ui('principal',w,height);try{
   await h.p.evaluate(()=>show('otherFunctions'));await h.p.locator('#manageHomeSections').click();await h.p.locator('#homeSectionsUser option[value="global:"]').waitFor({state:'attached'});await h.p.locator('#homeSectionsUser').selectOption('global:');await h.p.waitForFunction(()=>document.querySelectorAll('#homeSectionsList input').length===9);await h.p.waitForFunction(()=>document.querySelectorAll('#homeSectionsList input').length===9);
   a.equal(await h.p.locator('#homeSectionsDialog').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
   a.equal(await h.p.locator('#homeSectionsList input').evaluateAll(ns=>ns.some(n=>n.getBoundingClientRect().width<44||n.getBoundingClientRect().height<44)),false);
   await h.p.screenshot({path:path.join(out,name+'-sezioni.png'),fullPage:true});a.deepEqual(h.errors,[]);
  }finally{await h.close()}
 }
});
test('integrazione avvio app reale: Home, funzioni comuni, riapertura e nessun duplicato',async()=>{
 const f=await fixture(),ctx=await browser.newContext({viewport:{width:820,height:1180},serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));let reads=0;
 try{
  await p.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='integration.test')return route.abort();
   if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')});
   if(u.pathname==='/api/home-sections'||u.pathname.startsWith('/api/home-sections/')){reads++;const response=await f.worker.fetch(f.request('principal',u.pathname),f.env);return route.fulfill({status:response.status,json:await response.json()})}
   const file=path.resolve(root,'.'+u.pathname);if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&/\.(css|svg|png|webp|js)$/.test(file))return route.fulfill({path:file});return route.abort();
  });
  await p.goto('https://integration.test');await p.evaluate(()=>{window.AgendaAuth={currentUser:()=>({id:'principal',name:'AMMINISTRATORE FITTIZIO',role:'ADMIN',active:true,capabilities:{managePrivilegedUsers:true}}),can:()=>true,applicationReady:(show,login)=>{window.integrationShow=show;window.integrationLogout=login}}});
  for(const name of ['student-license.js','student-license-store.js','student-archive-store.js','lesson-drafts.js','lesson-activities.js','lesson-secretary-transfer.js','student-multi-import.js','driving-errors.js','student-multi-actions.js','examiner-routes.js','exams.js','home-sections.js','app.js'])await p.addScriptTag({content:read(name)});
  await p.evaluate(async()=>{await AgendaAppReady;integrationShow();await HomeSections.refresh()});
  a.deepEqual(await visible(p),['auto','moto']);a.equal(await p.locator('#openOtherFunctions').isVisible(),true);
  await p.locator('#openOtherFunctions').click();a.equal(await p.locator('#openRegister').isVisible(),true);a.equal(await p.locator('#manageHomeSections').isVisible(),true);
  await p.locator('#otherFunctionsHome').click();await p.evaluate(()=>HomeSections.refresh());a.ok(reads>=2);a.equal(await p.locator('#manageHomeSections').count(),1);
  await p.locator('#home [data-f="auto"]').click();a.equal(await p.locator('#categoryHub').isVisible(),true);a.deepEqual(errors,[]);
 }finally{await ctx.close();f.close()}
});

test('scelte operative documenti: sezioni e destinazioni nascoste, comuni e riattivazione',async()=>{
 const h=await ui();try{
  await h.p.addScriptTag({content:read('documents.js')});await h.p.evaluate(()=>show('otherFunctions'));await h.p.locator('#openDocuments').click();await h.p.waitForFunction(()=>document.querySelectorAll('#documentSections [data-section]').length===10);
  a.deepEqual(await h.p.locator('#documentSections [data-section]:visible').evaluateAll(ns=>ns.map(n=>n.dataset.section)),['auto','moto','common']);
  await h.p.locator('#documentSections [data-section="quad-leggero"]').evaluate(n=>n.click());a.equal(await h.p.locator('#documentSectionContent').isVisible(),false);
  await h.p.evaluate(()=>{documentMoveSection.replaceChildren(...['auto','moto','quad-leggero','common'].map(id=>{const o=document.createElement('option');o.value=id;o.textContent=id;return o}));HomeSections.sync()});
  a.equal(await h.p.locator('#documentMoveSection option[value="quad-leggero"]').evaluate(n=>n.disabled),true);a.equal(await h.p.locator('#documentMoveSection option[value="common"]').evaluate(n=>n.disabled),false);
  await ok(await call(h.f,'principal',{enabled:['auto','moto','quad-leggero'],version:0}));await h.p.evaluate(()=>HomeSections.refresh());await h.p.locator('#documentSections [data-section="quad-leggero"]').click();a.equal(await h.p.locator('#documentSectionContent').isVisible(),true);a.deepEqual(h.errors,[]);
 }finally{await h.close()}
});

test('nome visualizzato e manifest: identità, URL, versione e dati tecnici invariati',()=>{
 const before=JSON.parse(require('node:child_process').execFileSync('git',['-c','safe.directory='+root.replace(/\\/g,'/'),'show','HEAD:manifest.json'],{cwd:root,encoding:'utf8'})),now=JSON.parse(read('manifest.json'));
 a.equal(now.name,'Agenda Istruttori di Guida');a.equal(now.short_name,'Agenda Guida');delete before.name;delete before.short_name;delete now.name;delete now.short_name;a.deepEqual(now,before);
 a.match(read('index.html'),/<title>Agenda Istruttori di Guida<\/title>/);a.match(read('index.html'),/v1\.21/);a.match(read('app.js'),/const APP_NAME="Agenda Istruttore"/);
});
test('nome visualizzato: leggibilità Home telefono/tablet anche con saluto lungo',async()=>{
 const h=await ui();try{
  for(const[name,w,height]of [['iphone',390,844],['tablet-verticale',820,1180],['tablet-orizzontale',1180,820]]){
   await h.p.setViewportSize({width:w,height});await h.p.evaluate(()=>{homeBrandUser.textContent='Ciao, Istruttore con nominativo dimostrativo molto lungo'});await h.p.evaluate(()=>document.fonts.ready);
   a.equal(await h.p.title(),'Agenda Istruttori di Guida');a.equal(await h.p.locator('.home-wordmark').textContent(),'Agenda Istruttori di Guida');
   const layout=await h.p.evaluate(()=>{const title=document.querySelector('.home-wordmark'),name=document.getElementById('homeBrandUser'),logo=document.querySelector('.home-brand>img'),r=title.getBoundingClientRect(),n=name.getBoundingClientRect(),l=logo.getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth+1,overlap:r.right>n.left+1&&r.left<n.right-1&&r.bottom>n.top+1&&r.top<n.bottom-1,overLogo:r.left<l.right-1,titleOverflow:title.scrollWidth>title.clientWidth+1}});
   a.deepEqual(layout,{overflow:false,overlap:false,overLogo:false,titleOverflow:false});await h.p.screenshot({path:path.join(out,name+'-nome-home.png'),fullPage:true});
  }
 }finally{await h.close()}
});
