"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8"),auth=fs.readFileSync(path.join(__dirname,"../auth-client.js"),"utf8");
test("Home Segreteria apre Altre funzioni con lo stesso collegamento Turni",()=>{const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8"),home=html.split('id="secretaryHome"')[1].split("</section>")[0],section=html.split('id="secretaryMenu"')[1].split("</section>")[0];assert.match(home,/id="secretaryOtherFunctions"/);assert.match(home,/ALTRE FUNZIONI/);assert.match(section,/https:\/\/www\.ilportaledellautomobilista\.it\/gms\/turni\/45/);assert.match(section,/rel="noopener noreferrer"/);assert.match(section,/TURNI OPERATIVI ESAMINATORI/)});
test("cambio identità non attiva il vault del Registro per Segreteria",async()=>{
 let activated=0;const context=vm.createContext({currentUser:{id:"fake",role:"SEGRETERIA"},window:{RegisterLocalVault:{activate:async()=>activated++}}});
 vm.runInContext(auth.slice(auth.indexOf("  async function activateRegisterVault()"),auth.indexOf("  async function api(")),context);
 await context.activateRegisterVault();assert.equal(activated,0);
 context.currentUser.role="ISTRUTTORE";await context.activateRegisterVault();assert.equal(activated,1);
});
test("capacità Segreteria consentono consultazione e patente ma negano operazioni e ruoli non validi",()=>{
 const expression=auth.match(/    can: (.*),\r?\n/)[1],context=vm.createContext({currentUser:{role:"SEGRETERIA"}});vm.runInContext('can=('+expression+')',context);
 for(const action of ["consult","import","share","archive","trash","license","documents","report"])assert.equal(context.can(action),true);
 for(const action of ["operate","users","audit","register"])assert.equal(context.can(action),false);
 for(const role of ["USER_MANAGER","INVALID",null]){context.currentUser={role};assert.equal(context.can("operate"),false)}
 for(const role of ["ISTRUTTORE","ADMIN"]){context.currentUser={role};assert.equal(context.can("operate"),true)}
});
test("chiamate dirette a modifica allievi guide esami e cataloghi sono negate prima di modificare dati",async()=>{
 const alerts=[],context=vm.createContext({window:{AgendaAuth:{can:()=>false}},alert:value=>alerts.push(value)});
 for(const name of ["newStudent","editStudent","saveStudent","newLesson","openLesson","deleteLesson","startGps","newExam","openExam","saveExam","deleteExam","addChecklist","renameChecklist","removeChecklist","newExaminer","saveExaminer","manageStudentSites"]){
  const line=source.split(/\r?\n/).find(line=>new RegExp('^(?:async )?function '+name+'\\(').test(line));assert.ok(line,name);vm.runInContext(line,context);const before=alerts.length;await context[name]();assert.equal(alerts.length,before+1,name);
 }
 assert.ok(alerts.every(value=>/non consentita/.test(value)));
});

for(const central of [false,true])test('navigazione Segreteria '+(central?'centrale':'ordinaria')+': HOME mantiene sessione, ESCI solo in Home e dati locali conservati',async()=>{
 const {chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({headless:true});let page;try{
  page=await browser.newPage({viewport:{width:390,height:844}});const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  await page.route('**/*',route=>route.request().url()==='https://synthetic.local/'?route.fulfill({contentType:'text/html; charset=utf-8',body:html}):route.abort());
  await page.goto('https://synthetic.local/');await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'../style.css'),'utf8')});
  await page.evaluate(central=>{
   document.getElementById('appShell').classList.remove('hidden');document.getElementById('loginScreen').classList.add('hidden');window.syntheticUser={id:'account-sintetico',role:'SEGRETERIA',central};window.syntheticRequests=[];window.syntheticLoginCalls=0;window.syntheticLocks=[];localStorage.setItem('archivio-sintetico','DA CONSERVARE');
   window.$=id=>document.getElementById(id);window.updatePageTitle=()=>{};window.setNeutralHome=()=>{};window.scrollTo=()=>{};window.lockReservedArea=async()=>syntheticLocks.push('reserved');window.lockRegisterVault=async()=>syntheticLocks.push('vault');window.sessionRetry=null;window.api=async(url,options)=>syntheticRequests.push({url,method:options.method});window.applyUser=user=>{window.syntheticUser=user};window.showLogin=()=>{syntheticLoginCalls++;document.getElementById('appShell').classList.add('hidden');document.getElementById('loginScreen').classList.remove('hidden')};
  },central);
  const showLine=source.split(/\r?\n/).find(line=>line.startsWith('function show(')),logoutLine=source.split(/\r?\n/).find(line=>line.startsWith('function logout('));
  const authLogout=auth.slice(auth.indexOf('  async function logout('),auth.indexOf('  function updateAccountSummary(')).replace('async function logout(','async function secretaryAuthLogout(');
  await page.addScriptTag({content:authLogout+'\nwindow.AgendaAuth={currentUser:()=>syntheticUser,logout:secretaryAuthLogout};\n'+showLine+'\n'+logoutLine+'\n'+source.split(/\r?\n/).find(line=>line.startsWith('$("secretaryOtherFunctions").onclick'))+'\n'+source.split(/\r?\n/).find(line=>line.startsWith('$("secretaryMenuHome").onclick'))+'\n'+source.split(/\r?\n/).find(line=>line.startsWith('document.querySelectorAll("[data-secretary-command]")'))+'\n$("logoutHome").onclick=logout;show("secretaryHome");'});
  assert.equal(await page.locator('#secretaryHome [data-secretary-command="logoutHome"]').count(),1);assert.equal(await page.locator('#secretaryMenu [data-secretary-command="logoutHome"]').count(),0);assert.equal(await page.locator('#home #logoutHome').count(),1);assert.equal(await page.locator('#otherFunctions #logout').count(),1);
  await page.locator('#secretaryOtherFunctions').click();assert.equal(await page.locator('#secretaryMenu').evaluate(n=>n.classList.contains('active')),true);await page.locator('#secretaryMenuHome').click();assert.equal(await page.locator('#secretaryHome').evaluate(n=>n.classList.contains('active')),true);assert.equal(await page.evaluate(()=>syntheticUser.id),'account-sintetico');assert.equal(await page.evaluate(()=>syntheticRequests.length),0);
  const button=page.locator('#secretaryHome [data-secretary-command="logoutHome"]');const metrics=await button.evaluate(n=>({height:n.getBoundingClientRect().height,icon:n.querySelector('svg').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth+1}));assert.ok(metrics.height>=44);assert.ok(metrics.icon<=32);assert.equal(metrics.overflow,false);
  await button.click();await page.waitForFunction(()=>syntheticLoginCalls===1);assert.equal(await page.evaluate(()=>syntheticUser),null);assert.equal(await page.evaluate(()=>localStorage.getItem('archivio-sintetico')),'DA CONSERVARE');assert.deepEqual(await page.evaluate(()=>syntheticRequests),[{url:'/api/auth/logout',method:'POST'}]);assert.deepEqual(await page.evaluate(()=>syntheticLocks),['reserved','vault']);
 }finally{await page?.close();await browser.close()}
});
