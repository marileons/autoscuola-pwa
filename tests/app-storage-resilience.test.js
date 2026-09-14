"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const vm=require("node:vm");
test("chiave assente e archivio malformato restano distinti",()=>{
  assert.match(source,/if\(raw===null\)return\[\]/);
  assert.match(source,/archiveReadErrors\.set/);
  assert.match(source,/Nessun dato verrà sovrascritto/);
});
test("archivi illeggibili bloccano ogni scrittura e non esiste salvataggio automatico all'avvio",()=>{
  assert.match(source,/requireWritableArchive\(KEY\)/);
  assert.match(source,/requireWritableArchive\(EXAMINERS_KEY\)/);
  assert.doesNotMatch(source,/saveLists\(\);if\(!archiveReadErrors\.has\(KEY\)\)save\(\)/);
  assert.match(source,/saveLists\(\);if\("serviceWorker" in navigator\)/);
});
test("un errore quota ripristina lo stato confermato e mostra un messaggio italiano",()=>{assert.match(source,/committedStudents/);assert.match(source,/catch\(error\)\{state\.students=JSON\.parse\(JSON\.stringify\(committedStudents\)\)/);assert.match(source,/Spazio locale insufficiente:[^\n]+dati precedenti sono rimasti invariati/)});
test("errore di recupero viene mostrato senza sostituire i valori originali",()=>{assert.match(source,/showArchiveRecoveryError/);assert.doesNotMatch(source,/function load\(\)\{try[\s\S]*catch\{return\[\]\}/)});
test("quota esaurita lascia invariati creazione modifica e guida nello stato osservabile",()=>{const extract=name=>source.match(new RegExp(`function ${name}\\([^\\n]+\\n`))?.[0]||source.match(new RegExp(`function ${name}\\([^}]+\\}`))?.[0]||"";const code=["storageStudents","friendlyStudentSaveError","save"].map(extract).join("\n"),previous=[{id:"a",firstName:"ANNA",lessons:[{id:"g1",notes:"prima"}],photo:"data:image/png;base64,AAAA"}],alerts=[],sandbox={state:{students:JSON.parse(JSON.stringify(previous))},committedStudents:JSON.parse(JSON.stringify(previous)),normalizeStudent:value=>JSON.parse(JSON.stringify(value)),requireWritableArchive:()=>{},KEY:"autoscuola_v3_completa",alert:value=>alerts.push(value),localStorage:{setItem(){throw Object.assign(Error("quota"),{name:"QuotaExceededError"})}}};vm.runInNewContext(`${code};globalThis.run=save`,sandbox);for(const mutation of [students=>students.push({id:"b",lessons:[]}),students=>students[0].firstName="CAMBIATA",students=>students[0].lessons[0].notes="dopo"]){sandbox.state.students=JSON.parse(JSON.stringify(previous));mutation(sandbox.state.students);assert.throws(()=>sandbox.run(),/Spazio locale insufficiente/);assert.equal(JSON.stringify(sandbox.state.students),JSON.stringify(previous))}assert.ok(alerts.every(message=>/dati precedenti sono rimasti invariati/.test(message)))});
