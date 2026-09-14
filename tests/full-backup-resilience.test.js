"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"..","full-backup.js"),"utf8");
test("il backup completo valida e canonizza la patente conseguita",()=>{assert.match(source,/drivingLicense/);assert.match(source,/StudentLicense/)});

test("il ripristino valida interamente prima di scrivere",()=>{
  const restore=source.match(/async function restoreSelectedBackup\(file\)\{[\s\S]*?\n  \}/)?.[0]||"";
  assert.ok(restore.indexOf("await readBackupFile(file)")<restore.indexOf("await applyValidatedBackup(validated)"));
  assert.doesNotMatch(source,/MAX_BACKUP_FILE_BYTES|128\*1024\*1024/);
  assert.doesNotMatch(restore,/file\.text\(\)|readAsText|arrayBuffer\(\)/);
  assert.match(source,/AgendaFullBackupStream\.parseLegacyBackup/);
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
  assert.doesNotMatch(safety,/documents:await readDocuments\(\)|getAll\(\)/);
  assert.match(source,/SAFETY_DOCUMENT_STORE/);
  assert.match(source,/putStoreRecord\(openSafetyDatabase/);
  assert.doesNotMatch(safety,/arrayBufferToBase64|createBackupPayload/);
});

test("staging, spazio reale, avanzamento e annullamento sono espliciti",()=>{
  assert.match(source,/STAGING_DOCUMENT_STORE/);
  assert.match(source,/navigator\.storage/);
  assert.match(source,/Spazio fisico insufficiente/);
  assert.match(source,/fullBackupProgress/);
  assert.match(source,/AbortController/);
  assert.match(source,/QuotaExceededError/);
  assert.match(source,/STAGING_CHUNK_STORE/);
  assert.match(source,/putStagingChunk/);
  assert.match(source,/finishStagingDocument/);
  assert.match(source,/sha256Blob/);
});

test("lettura interrotta viene rilevata al riavvio senza applicare dati",()=>{
  assert.match(source,/INTERRUPTED_RESTORE_KEY/);
  assert.match(source,/La lettura del backup è stata interrotta dal browser prima dell.anteprima/);
  assert.ok(source.indexOf("localStorage.setItem(INTERRUPTED_RESTORE_KEY")<source.indexOf("await readBackupFile(file)"));
  assert.ok(source.indexOf("await readBackupFile(file)")<source.indexOf("await applyValidatedBackup(validated)"));
});

test("backup vecchi restano supportati e il Registro economico resta separato",()=>{
  assert.match(source,/SUPPORTED_FORMAT_VERSIONS=new Set\(\[1,2,3,4\]\)/);
  assert.doesNotMatch(source,/RegisterLocalVault|RegisterLedger|register-economic|\.airb/);
  assert.match(source,/examinerRoutes/);
  assert.match(source,/drivingErrorCatalog/);
});

test("verifica backup usa lo stesso archivio ESAMI canonico indipendente dall'ordine",()=>{
  assert.match(source,/AgendaExams\.canonicalArchive/);
  assert.match(source,/currentCanonical=canonicalAppData/);
  assert.doesNotMatch(source,/JSON\.stringify\(currentExams\)!==JSON\.stringify/);
  assert.match(source,/SUPPORTED_FORMAT_VERSIONS=new Set\(\[1,2,3,4\]\)/);
  assert.match(source,/createSafetySnapshot[\s\S]*?examData\.exams[\s\S]*?examData\.locations/);
  assert.match(source,/restoreSafetySnapshot/);
});

test("backup completo conserva i nuovi campi ESAMI senza cambiare formato",()=>{
  assert.match(source,/AgendaExamStore\.snapshot/);
  assert.match(source,/AgendaExams\.canonicalArchive/);
  assert.match(source,/SUPPORTED_FORMAT_VERSIONS=new Set\(\[1,2,3,4\]\)/);
  const model=fs.readFileSync(path.join(__dirname,"..","exams.js"),"utf8");
  assert.match(model,/examinerId:clean\(raw\?\.examinerId\)/);
  assert.match(model,/examinerName:clean\(raw\?\.examinerName\)/);
});

test("patenti separate vengono reidratate e verificate canonicalmente nel backup",()=>{
  assert.match(source,/students:await storedStudentsWithDrivingLicenses\(\)/);
  assert.match(source,/studentsWithoutDrivingLicenses\(appData\.students\)/);
  assert.match(source,/AgendaStudentLicenseStore\.replaceAll\(drivingLicenseRecords\(appData\.students\)\)/);
  assert.match(source,/currentCanonical=canonicalAppData/);
  assert.match(source,/expectedCanonical=canonicalAppData/);
});

test("un errore durante il ripristino compensa anche patenti ed esami",()=>{
  assert.match(source,/previousLicenses=.*AgendaStudentLicenseStore/);
  assert.match(source,/previousExamArchive=await window\.AgendaExamStore\.snapshot\(\)/);
  assert.match(source,/AgendaStudentLicenseStore\)await window\.AgendaStudentLicenseStore\.replaceAll\(previousLicenses\)/);
  assert.match(source,/AgendaExamStore\.replaceAll\(previousExamArchive\.exams,previousExamArchive\.locations\)/);
});
