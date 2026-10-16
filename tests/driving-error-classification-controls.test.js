'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
// Optional existing browser runtime, with no installation or new dependency.
const chromium=process.env.LOCAL_PLAYWRIGHT_MODULE?require(process.env.LOCAL_PLAYWRIGHT_MODULE).chromium:null;
const check=(name,fn)=>test(name,{skip:!chromium},fn);let browser;
test.after(async()=>{await browser?.close()});
async function fixture(width=390,height=844){
 if(!browser)browser=await chromium.launch({headless:true,...(process.env.LOCAL_CHROME_EXECUTABLE?{executablePath:process.env.LOCAL_CHROME_EXECUTABLE}:{})});
 const p=await browser.newPage({viewport:{width,height}});await p.route('**/*',r=>r.abort());
 await p.setContent('<!doctype html><html lang="it"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="appShell"><main><section id="lesson" class="view active"><details id="drivingErrorsPanel" class="card driving-errors-panel" open><summary id="drivingErrorsSummary"></summary><p id="drivingErrorsPending" class="driving-errors-pending"></p><p id="drivingErrorCount"></p><p id="drivingErrorsEmpty"></p><div id="drivingErrorsList"></div><div id="drivingErrorCatalogList"></div></details></section></main></div></body></html>');
 await p.addStyleTag({content:read('style.css')});await p.addScriptTag({content:read('driving-errors.js')});
 await p.evaluate(()=>{window.catalog=DrivingErrors.defaultCatalog();catalog.categories.push({id:'custom',label:'Categoria personale À',enabled:true,order:50,items:[{id:'custom-item',label:'Descrizione personalizzata normale',enabled:true,order:1}]});window.state={tempErrors:[DrivingErrors.createError({id:'pending',now:1}),DrivingErrors.normalizeError({id:'classified',occurredAt:2,category:'custom',categoryLabelSnapshot:'Categoria personale À',specificErrors:[{id:'custom-item',label:'Descrizione personalizzata normale'}],note:'Nota immutata',status:'completed'},0,catalog)],editingErrorId:null};window.DRIVING_ERRORS=DrivingErrors;window.$=id=>document.getElementById(id);window.esc=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');window.AgendaAuth={can:()=>true};window.drivingErrorCatalog=()=>catalog;window.drawDrivingErrorMarkers=()=>{};window.deleteDrivingError=()=>{window.deleteClicks=(window.deleteClicks||0)+1};window.beforeCatalog=JSON.stringify(catalog);window.beforeErrors=JSON.stringify(state.tempErrors);window.persistDrivingErrorDraft=()=>{};});
 const app=read('app.js'),names=['renderDrivingErrors','renderDrivingErrorSpecificChoices','updateDrivingErrorFromCard','saveDrivingErrorEdit','drivingErrorLocationLabel','catalogButton','renderDrivingErrorCatalogManager'];
 await p.addScriptTag({content:names.map(n=>app.split('\n').find(l=>l.startsWith('function '+n+'('))).join('\n')});await p.evaluate(()=>renderDrivingErrors());return p;
}
for(const [w,h]of [[390,844],[1024,768]])check(`classificazione ${w}x${h}: entrambi i controlli, separazione ELIMINA e nessun overflow`,async()=>{
 const p=await fixture(w,h);try{
  const first=p.locator('.driving-error-classify'),del=p.locator('.delete-error').first();assert.equal(await first.count(),1);assert.equal(await first.innerText(),'DA CLASSIFICARE');const a=await first.boundingBox(),b=await del.boundingBox();assert.ok(a.height>=48);const gap=b.y>=a.y+a.height?b.y-a.y-a.height:b.x-a.x-a.width;assert.ok(gap>=16);assert.notEqual(await first.evaluate(e=>getComputedStyle(e).backgroundColor),await del.evaluate(e=>getComputedStyle(e).backgroundColor));
  await first.click();assert.equal(await p.evaluate(()=>window.deleteClicks||0),0);const select=p.locator('.driving-error-category');assert.equal(await select.count(),1);assert.equal(await select.inputValue(),'unclassified');assert.ok((await select.boundingBox()).height>=48);
  const info=await select.evaluate(e=>{const s=getComputedStyle(e);return{center:s.textAlignLast,color:s.color,bg:s.backgroundColor,font:parseFloat(s.fontSize)}});assert.equal(info.center,'center');assert.equal(info.color,'rgb(255, 227, 160)');assert.equal(info.bg,'rgb(73, 55, 15)');assert.ok(info.font>=18);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.ERROR_CLASSIFY_SCREENSHOTS){fs.mkdirSync(process.env.ERROR_CLASSIFY_SCREENSHOTS,{recursive:true});await p.screenshot({path:path.join(process.env.ERROR_CLASSIFY_SCREENSHOTS,`${w}x${h}.png`),fullPage:true})}
 }finally{await p.close()}
});
check('categorie standard, storiche e personalizzate in maiuscolo; dati e descrizioni invariati',async()=>{
 const p=await fixture();try{
  await p.evaluate(()=>renderDrivingErrorCatalogManager());const headings=await p.locator('.driving-error-catalog-card>.driving-error-category-heading').evaluateAll(es=>es.map(e=>({original:e.textContent,css:getComputedStyle(e).textTransform})));assert.ok(headings.length>=12);assert.ok(headings.every(x=>x.css==='uppercase'));assert.ok(headings.some(x=>x.original==='Categoria personale À'));
  const label=p.locator('.driving-error-specific-list li');assert.equal(await label.innerText(),'Descrizione personalizzata normale');assert.equal(await label.evaluate(e=>getComputedStyle(e).textTransform),'none');
  await p.locator('.driving-error-classify').click();const options=await p.locator('.driving-error-category option').evaluateAll(es=>es.map(e=>({label:e.textContent,value:e.value})));assert.ok(options.every(x=>x.label===x.label.toLocaleUpperCase('it-IT')));assert.equal(options.find(x=>x.value==='custom').label,'CATEGORIA PERSONALE À');
  assert.deepEqual(await p.evaluate(()=>[JSON.stringify(catalog)===beforeCatalog,JSON.stringify(state.tempErrors)===beforeErrors]),[true,true]);
 }finally{await p.close()}
});
check('selettore interno mantiene classificazione e azione originali senza comandi duplicati',async()=>{
 const p=await fixture();try{await p.locator('.driving-error-classify').click();await p.locator('.driving-error-category').selectOption('custom');assert.equal(await p.evaluate(()=>state.tempErrors[0].category),'custom');assert.equal(await p.evaluate(()=>state.tempErrors[0].categoryLabelSnapshot),'Categoria personale À');assert.equal(await p.locator('.driving-error-specific-option').innerText(),'Descrizione personalizzata normale');assert.equal(await p.locator('.driving-error-category').count(),1);assert.equal(await p.locator('.driving-error-classify').count(),0);assert.equal(await p.evaluate(()=>window.deleteClicks||0),0);await p.locator('.save-error').click();assert.equal(await p.locator('.driving-error-category').count(),0)}finally{await p.close()}
});
