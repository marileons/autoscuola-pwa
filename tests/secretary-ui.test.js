"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../app.js"),"utf8"),auth=fs.readFileSync(path.join(__dirname,"../auth-client.js"),"utf8");
test("Home Segreteria espone lo stesso collegamento Turni senza nuove integrazioni",()=>{const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8"),section=html.split('id="secretaryHome"')[1].split("</section>")[0];assert.match(section,/https:\/\/www\.ilportaledellautomobilista\.it\/gms\/turni\/45/);assert.match(section,/rel="noopener noreferrer"/);assert.match(section,/TURNI OPERATIVI ESAMINATORI/)});
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
