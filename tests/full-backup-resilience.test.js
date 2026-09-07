"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","full-backup.js"),"utf8");

test("il ripristino valida interamente prima di scrivere",()=>{
  const restore=source.match(/async function restoreSelectedBackup\(file\)\{[\s\S]*?\n  \}/)?.[0]||"";
  assert.ok(restore.indexOf("await readBackupFile(file)")<restore.indexOf("await applyValidatedBackup(validated)"));
  assert.match(source,/MAX_BACKUP_FILE_BYTES=128\*1024\*1024/);
  assert.match(source,/JSON\.parse/);
  assert.match(source,/validateAppData/);
});

test("doppi listener e ripristini concorrenti sono impediti",()=>{
  assert.match(source,/window\.__agendaFullBackupInitialized/);
  assert.match(source,/if\(restoreInProgress\)/);
  assert.match(source,/restoreFullBackup"\)\.disabled=true/);
  assert.match(source,/restoreReloadScheduled=true/);
  assert.equal((source.match(/fullBackupFile"\)\.addEventListener\("change"/g)||[]).length,1);
});

test("errore di applicazione ripristina lo stato precedente",()=>{
  const apply=source.match(/async function applyValidatedBackup\(validated\)\{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(apply,/createSafetySnapshot/);
  assert.match(apply,/writeSafetyCopy/);
  assert.match(apply,/restoreSafetySnapshot/);
  assert.match(apply,/verifyRestoredData/);
  assert.match(source,/location\.replace\(location\.href\)/);
  assert.doesNotMatch(source,/location\.reload\(.*location\.reload/);
});

test("la copia preventiva evita duplicazioni Base64 dei documenti",()=>{
  const safety=source.match(/async function createSafetySnapshot\(\)\{[\s\S]*?\n  \}/)?.[0]||"";
  assert.match(safety,/documents:await readDocuments\(\)/);
  assert.doesNotMatch(safety,/arrayBufferToBase64|createBackupPayload/);
});

test("backup vecchi restano supportati e il Registro economico resta separato",()=>{
  assert.match(source,/SUPPORTED_FORMAT_VERSIONS=new Set\(\[1,2,3,4\]\)/);
  assert.doesNotMatch(source,/RegisterLocalVault|RegisterLedger|register-economic|\.airb/);
  assert.match(source,/examinerRoutes/);
  assert.match(source,/drivingErrorCatalog/);
});
