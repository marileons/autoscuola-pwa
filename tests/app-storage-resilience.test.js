"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
test("chiave assente e archivio malformato restano distinti",()=>{
  assert.match(source,/if\(raw===null\)return\[\]/);
  assert.match(source,/archiveReadErrors\.set/);
  assert.match(source,/Nessun dato verrà sovrascritto/);
});
test("archivi illeggibili bloccano ogni scrittura e il salvataggio automatico",()=>{
  assert.match(source,/requireWritableArchive\(KEY\)/);
  assert.match(source,/requireWritableArchive\(EXAMINERS_KEY\)/);
  assert.match(source,/if\(!archiveReadErrors\.has\(KEY\)\)save\(\)/);
  assert.match(source,/saveLists\(\);if\(!archiveReadErrors\.has\(KEY\)\)save\(\)/);
});
test("errore di recupero viene mostrato senza sostituire i valori originali",()=>{assert.match(source,/showArchiveRecoveryError/);assert.doesNotMatch(source,/function load\(\)\{try[\s\S]*catch\{return\[\]\}/)});
